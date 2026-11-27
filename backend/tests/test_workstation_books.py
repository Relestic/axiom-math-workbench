import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import select

from app.adapters import llm, local_key
from app.db import session_scope
from app.models import Asset, Attempt, Concept, Exercise, ModelCall, Proof, Textbook, User, VisualScene
from app.modules.local_textbooks import normalize_title

ROOT = "/api/v1/local"


def textbook_pdf(page_text=b"Uniform continuity on compact intervals."):
    writer = PdfWriter()
    page = writer.add_blank_page(width=360, height=480)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
    )
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 30 400 Td (" + page_text + b") Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    writer.add_blank_page(width=360, height=480)
    writer.add_outline_item("Continuity", 0)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.fixture()
def local(app, client, monkeypatch):
    monkeypatch.setattr(app.config["AXIOM"], "local_mode", True)
    return client


def upload(client, data=None):
    return client.post(
        ROOT + "/textbooks", data={"file": (io.BytesIO(data or textbook_pdf()), "数学讲义.pdf")}
    )


def test_shelf_file_metadata_dedup_and_deletion(local):
    data = textbook_pdf()
    response = upload(local, data)
    assert response.status_code == 201, response.json
    book = response.json
    assert book["title"] == "数学讲义" and book["page_count"] == 2
    assert book["pages"][0]["char_count"] >= 30
    assert book["pages"][1] == {"page": 2, "char_count": 0, "needs_ocr": True}
    assert book["outline"] == [{"title": "Continuity", "page": 1}]
    assert upload(local, data).json["id"] == book["id"]
    url = ROOT + "/textbooks/" + book["id"]
    with session_scope() as session:
        asset = session.scalars(select(Asset)).one()
        assert Path(asset.storage_path).read_bytes() == data
        assert session.get(Textbook, book["id"]).parse_meta["pages"][0]["text"].startswith("Uniform")
    assert local.patch(url, json={"title": "新版数学"}).json["title"] == "新版数学"
    assert local.get(ROOT + "/bootstrap-extras").json["textbooks"][0]["title"] == "新版数学"
    response = local.get(
        url + "/file", headers={"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "iframe"}
    )
    assert response.status_code == 200 and response.data == data
    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"
    assert response.headers["Content-Disposition"].startswith("inline")
    response.close()
    assert local.get(url + "/file", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert local.delete(url).status_code == 204
    assert local.get(url + "/file").status_code == 404
    assert local.get(ROOT + "/bootstrap-extras").json == {"textbooks": [], "cards": [], "exercises": [], "attempts": []}


def test_books_reject_invalid_files_and_protect_nonlocal_owners(app, client, local, monkeypatch):
    assert upload(local, b"not pdf").status_code == 415
    assert upload(local, b"%PDF-1.7\ninvalid").status_code == 422
    book = upload(local).json
    with session_scope() as session:
        asset = session.scalars(select(Asset)).one()
        asset.owner_id = session.scalar(select(User).where(User.email == "second@axiom.test")).id
    url = ROOT + "/textbooks/" + book["id"]
    assert local.get(ROOT + "/bootstrap-extras").json["textbooks"] == []
    assert local.get(url + "/file").status_code == 404
    assert local.patch(url, json={"title": "越权"}).status_code == 404
    assert local.delete(url).status_code == 404
    assert (
        local.get(ROOT + "/bootstrap-extras", headers={"Origin": "https://outside.invalid"}).status_code
        == 403
    )
    monkeypatch.setattr(app.config["AXIOM"], "local_mode", False)
    assert client.get(ROOT + "/bootstrap-extras").status_code == 404


def test_numeric_text_is_readable_and_shared_files_survive_book_removal(local, app, monkeypatch):
    monkeypatch.setattr(app.config["AXIOM"], "max_upload_mb", 1)
    assert upload(local, b"%PDF-" + bytes(1024**2)).status_code == 413
    book = upload(local, textbook_pdf(b"12 23 34 45 56")).json
    assert book["pages"][0]["needs_ocr"] is False
    with session_scope() as session:
        asset = session.scalars(select(Asset)).one()
        location = Path(asset.storage_path)
        session.add(
            Textbook(
                title="共享附件教材",
                slug="shared-test",
                data_origin="admin",
                parse_meta={"asset_id": asset.id},
            )
        )
    assert local.delete(ROOT + "/textbooks/" + book["id"]).status_code == 204
    with session_scope() as session:
        assert session.scalars(select(Asset)).one().storage_path == str(location)
        assert location.is_file()


def test_concurrent_duplicate_uploads_and_foreign_card_reference(local, app):
    data = textbook_pdf()

    def upload_again(_):
        return upload(app.test_client(), data).json["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = list(pool.map(upload_again, range(4)))
    assert len(set(ids)) == 1
    assert len(local.get(ROOT + "/bootstrap-extras").json["textbooks"]) == 1
    with session_scope() as session:
        book = session.get(Textbook, ids[0])
        session.add(Concept(chapter_id=book.chapters[0].id, name="共享的教学内容", data_origin="admin"))
    assert local.delete(ROOT + "/textbooks/" + ids[0]).status_code == 409
    assert local.get(ROOT + "/textbooks/" + ids[0] + "/file").status_code == 200


def test_card_generation_is_grounded_persistent_and_private(local, second_headers, monkeypatch):
    book = upload(local).json
    url = ROOT + "/textbooks/" + book["id"]
    selection = {"page_start": 1, "page_end": 1}
    missing = local.post(url + "/extract-cards", json=selection)
    assert (
        missing.status_code == 503 and missing.json["error"]["message"] == "请先在顶部配置个人 DeepSeek Key"
    )
    local.put("/api/v1/ai/key", json={"api_key": "sk-workstation-fixture", "model": "deepseek-flash"})
    card = {
        "title": "局部抽卡检验",
        "definition": "一致连续的定义",
        "conditions": ["闭区间", "连续"],
        "theorem": "闭区间上连续函数一致连续",
        "proof": ["取收敛子列", "得到矛盾"],
        **selection,
    }
    calls = []

    def provider(url, **kwargs):
        calls.append(kwargs["json"]["messages"][-1]["content"])
        return httpx.Response(
            200, json={"choices": [{"message": {"content": json.dumps({"cards": [card]})}}]}
        )

    monkeypatch.setattr(llm.httpx, "post", provider)
    for pages in [(0, 1), (2, 1), (1, 17), (2, 2), (1, 2)]:
        rejected = local.post(url + "/extract-cards", json={"page_start": pages[0], "page_end": pages[1]})
        assert rejected.status_code == 422
    assert not calls
    result = local.post(url + "/extract-cards", json=selection)
    assert result.status_code == 201, result.json
    assert len(calls) == 1 and "Uniform continuity" in calls[0]
    saved = result.json["cards"][0]
    assert saved == {**card, "id": saved["id"], "textbook_id": book["id"], "formula": "", "prerequisites": [],
                     "proof_steps": [], "proof_status": "auto_checked"}
    assert local.get(ROOT + "/bootstrap-extras").json["cards"] == [saved]
    with session_scope() as session:
        item = session.get(Concept, saved["id"])
        proof = session.scalar(select(Proof).where(Proof.concept_id == item.id))
        assert item.status == "published" and item.data_origin == "user" and proof.status == "published"
        proof_id = proof.id
    for route in ["/concepts/" + saved["id"], "/proofs/" + proof_id, "/textbooks/" + book["id"] + "/file"]:
        assert local.get("/api/v1" + route, headers=second_headers).status_code == 404
    assert not local.get("/api/v1/search?q=局部抽卡检验", headers=second_headers).json["items"]
    card["page_end"] = 2
    assert local.post(url + "/extract-cards", json=selection).status_code >= 400
    assert local.get(ROOT + "/bootstrap-extras").json["cards"] == [saved]
    assert local.delete(url).status_code == 204
    assert local.get(ROOT + "/bootstrap-extras").json["cards"] == []


def test_definition_cards_and_direct_prerequisites_across_batches(local, monkeypatch):
    book = upload(local).json["id"]
    other_book = upload(local, textbook_pdf(b"A different book on sequences and other topics.")).json["id"]
    with session_scope() as session:
        owned = session.get(Textbook, book)
        other = session.get(Textbook, other_book)
        owner_id = owned.parse_meta["owner_id"]
        foreign_user = session.scalar(select(User).where(User.email == "second@axiom.test")).id
        foreign_cards = [
            Concept(chapter_id=owned.chapters[0].id, name="未发布标题", status="draft", created_by_id=owner_id),
            Concept(chapter_id=owned.chapters[0].id, name="他人私有标题", status="published", created_by_id=foreign_user),
            Concept(chapter_id=other.chapters[0].id, name="跨书标题", status="published", created_by_id=owner_id),
        ]
        for item in foreign_cards:
            item.data_origin = "user"
            session.add(item)
        session.flush()
        excluded_ids = [item.id for item in foreign_cards]

    pages = {"page_start": 1, "page_end": 1}
    def definition(title, **override):
        return {**pages, "title": title, "definition": "在指定区间中的每个点满足局部条件。", **override}

    local.put("/api/v1/ai/key", json={"api_key": "sk-fixture-graph", "model": "deepseek-flash"})
    replies, prompts = [], []
    def provider(url, **kwargs):
        prompts.append(kwargs["json"]["messages"][0]["content"])
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"cards": replies})}}]})
    monkeypatch.setattr(llm.httpx, "post", provider)
    url = ROOT + "/textbooks/" + book + "/extract-cards"

    replies[:] = [
        definition("连续", prerequisites=["一致连续"]),
        definition("Ｌｉｍｉｔ（Ａ）", theorem="", proof=[]),
        definition("区间", theorem=None, proof=""),
        definition("界"),
        definition("同名"),
        definition("同-名"),
    ]
    response = local.post(url, json=pages)
    assert response.status_code == 201, response.json
    prior = response.json["cards"]
    assert all(item["proof"] == [] and item["theorem"] == "" and item["prerequisites"] == [] for item in prior)
    with session_scope() as session:
        assert not session.scalars(select(Proof).where(Proof.concept_id.in_([item["id"] for item in prior]))).all()

    replies[:] = [
        definition("一致连续", prerequisites=[
            0, {}, None, "", "!", "长" * 161, "同 名", "未发布标题", "他人私有标题", "跨书标题", "一-致-连-续",
            "以后才有", "连， 续", "连续", "LiMit a", "区间", "界",
        ]),
        definition("局部估计", prerequisites=["一致连续", "以后才有", "局部估计"]),
        definition("以后才有", prerequisites=["局部估计"]),
        definition("未给出精确引用", prerequisites=["续", "一致", "连续性"]),
        definition("错误的可选字段", prerequisites={"name": "连续"}),
    ]
    response = local.post(url, json=pages)
    assert response.status_code == 201, response.json
    current = response.json["cards"]
    assert [item["prerequisites"] for item in current] == [
        [item["id"] for item in prior[:3]], [current[0]["id"]], [current[1]["id"]], [], [],
    ]
    assert all(title not in prompts[-1] for title in ["他人私有标题", "未发布标题", "跨书标题"])
    assert '{"title":"连续","page_start":1}' in prompts[-1]
    assert '"proof":[]' in prompts[-1] and "只有定义" in prompts[-1]
    with session_scope() as session:
        assert session.get(Concept, current[1]["id"]).prerequisites == [current[0]["id"]]
        # Archives created before validation can contain dangling, duplicate or foreign IDs.
        item = session.get(Concept, current[2]["id"])
        item.prerequisites = [*excluded_ids, "missing-id", item.id, current[1]["id"], current[1]["id"]]
    stored = {item["id"]: item for item in local.get(ROOT + "/bootstrap-extras").json["cards"]}
    assert stored[current[2]["id"]]["prerequisites"] == [current[1]["id"]]
    assert stored[current[0]["id"]]["prerequisites"] == [item["id"] for item in prior[:3]]

    replies[:] = [definition("不可是一张空卡", definition=" ")]
    assert local.post(url, json=pages).status_code == 502
    assert len(local.get(ROOT + "/bootstrap-extras").json["cards"]) == len(stored)


def test_title_matching_preserves_case_sensitive_mathematical_symbols():
    assert normalize_title(" Ｌｉｍｉｔ（Ａ），Σ ") == "limitaΣ"
    assert normalize_title("方差 σ") != normalize_title("方差 Σ")


@pytest.fixture
def card_model(local, monkeypatch):
    reply, prompts = {}, []

    def provider(url, **kwargs):
        prompts.append(json.loads(kwargs["json"]["messages"][-1]["content"]))
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}]})
    monkeypatch.setattr(llm.httpx, "post", provider)
    # These route tests use a disposable credential and do not require a Windows user profile.
    monkeypatch.setattr(local_key, "_windows_dpapi", lambda data, *, protect: data)
    assert local.put("/api/v1/ai/key", json={"api_key": "sk-card-test", "model": "deepseek-flash"}).status_code == 200
    return reply, prompts


def extract_one(local, book_id, model, proof):
    pages = {"page_start": 1, "page_end": 1}
    reply, _ = model
    reply.clear()
    reply["cards"] = [{"title": "紧区间", "definition": "闭且有界的区间", "conditions": ["闭区间"],
                       "theorem": "闭区间上的连续函数有界", "proof": proof, **pages}]
    response = local.post(f"{ROOT}/textbooks/{book_id}/extract-cards", json=pages)
    assert response.status_code == 201, response.json
    reply.clear()
    return response.json["cards"][0]["id"]


EXERCISE = {"title": "区间像的界", "statement": "求 f(x)=2x 在 [0,1] 上的最大值。",
            "exercise_type": "calculation", "hint": "先判断单调性。", "solution_steps": ["单调递增，在右端点取 2。"],
            "checks": ["确认端点属于区间", "核对最大值"]}
STEP = {"n": 1, "title": "固定区间", "formula": "I=[a,b]", "text": "从闭区间任取一点。",
        "why": "需要让端点也满足假设。", "uses": ["区间定义"], "conditions": ["含两个端点"]}


@pytest.mark.parametrize("original,source,status", [
    ([], "complete", "ai_elaboration"), (["证明略。"], "sketch", "ai_elaboration"),
    (["取极值点", "由极值给出界"], "complete", "auto_checked"),
])
def test_rich_proof_grounding_replacement_and_attribution(local, card_model, original, source, status):
    book = upload(local).json
    cid = extract_one(local, book["id"], card_model, original)
    reply, prompts = card_model
    url = f"{ROOT}/cards/{cid}/proof"
    reply.update(source_proof=source, steps=[STEP])
    first = local.post(url)
    assert first.status_code == 200, first.json
    assert first.json["proof_status"] == status and first.json["proof"] == [STEP["text"]]
    material = prompts[-1]
    assert material["pages"] == [{"page": 1, "text": "Uniform continuity on compact intervals."}]
    assert material["definition"] and material["theorem"] and material["conditions"] == ["闭区间"]
    assert material.get("extracted_proof", []) == original
    # A later generation must never use its own elaboration as textbook evidence.
    reply.update(source_proof="complete", steps=[{**STEP, "formula": "", "why": "核对假设。"}])
    assert local.post(url).json["proof_status"] == status
    saved = local.get(ROOT + "/bootstrap-extras").json["cards"][0]
    assert saved["proof_steps"] == reply["steps"] and saved["proof_status"] == status
    with session_scope() as session:
        assert session.scalars(select(Proof).where(Proof.concept_id == cid)).one().steps == saved["proof_steps"]
    for bad in [{**STEP, "n": 2}, {**STEP, "why": "  "}, {**STEP, "uses": "定义"}]:
        reply["steps"] = [bad]
        assert local.post(url).status_code == 502
    assert local.get(ROOT + "/bootstrap-extras").json["cards"] == [saved]
    assert local.post(ROOT + "/cards/uniform/proof").status_code == 404


def test_card_visual_validates_updates_round_trips_and_is_removed_with_book(local, card_model):
    book = upload(local).json
    cid = extract_one(local, book["id"], card_model, [])
    reply, prompts = card_model
    path = f"{ROOT}/cards/{cid}/visual"
    assert local.post(path, headers={"Origin": "https://outside.test"}).status_code == 403
    assert local.post(ROOT + "/cards/uniform/visual").status_code == 404
    box = {"xMin": -2, "xMax": 2, "yMin": -1, "yMax": 3}
    diagram = {"version": 1, "title": "割线", "caption": "过两点作直线。", "viewBox": box,
               "nodes": [{"kind": "segment", "id": "s", "from": [0, 0], "to": [1, 1]}]}
    for board, field, scene in [
        ("explore", "functionScene", {**box, "curves": [{"id": "f", "expression": "a*x"}], "activeId": "f"}),
        ("surface", "surfaceScene", {"expression": "x**2+y"}),
        ("diagram", "diagramScene", diagram),
    ]:
        reply.clear()
        reply.update(board=board, summary="本卡配图", **{field: scene})
        response = local.post(path)
        assert response.status_code == 200, response.json
        assert prompts[-1]["conditions"] and prompts[-1]["theorem"] and "formula" in prompts[-1]
        visual = response.json["visual"]
        assert visual["board"] == board
        if board == "explore":
            assert visual[field]["parameters"][0]["name"] == "a"
        if board == "surface":
            assert visual[field]["expression"] == "x^2+y"
        if board == "diagram":
            assert visual[field]["nodes"][0]["from"] == [0, 0]
        assert local.get(ROOT + "/bootstrap-extras").json["cards"][0]["visual"] == visual
    for invalid in [
        {"board": "surface", "surfaceScene": {"expression": "a*x+y"}},
        {"board": "explore", "functionScene": {**box, "curves": [{"id": "f", "expression": "unknown(x)"}], "activeId": "f"}},
        {"board": "diagram", "diagramScene": {**diagram, "nodes": diagram["nodes"] * 2}},
        {"board": "diagram", "diagramScene": {**diagram, "html": "<svg/>"}},
    ]:
        reply.clear()
        reply.update(invalid)
        assert local.post(path).status_code == 502
    assert local.get(ROOT + "/bootstrap-extras").json["cards"][0]["visual"] == visual
    with session_scope() as session:
        row = session.scalars(select(VisualScene).where(VisualScene.title == cid)).one()
        assert row.version == 3 and row.data_origin == "card-preset"
        unrelated = VisualScene(user_id=row.user_id, title=cid, scene={})
        session.add(unrelated)
        session.flush()
        preset_id, user_scene_id = row.id, unrelated.id
    assert local.delete(f"{ROOT}/textbooks/{book['id']}").status_code == 204
    with session_scope() as session:
        assert session.get(VisualScene, preset_id) is None and session.get(VisualScene, user_scene_id)


def test_exercise_generation_and_delete_after_attempt(local, card_model, second_headers):
    book = upload(local).json
    cid = extract_one(local, book["id"], card_model, [])
    reply, prompts = card_model
    reply["exercises"] = [EXERCISE, {**EXERCISE, "exercise_type": "proof", "statement": "证明连续像有界。"}]
    response = local.post(f"{ROOT}/cards/{cid}/exercises", json={"count": 2, "focus": "concept"})
    assert response.status_code == 201, response.json
    assert prompts[-1]["definition"] and [p["page"] for p in prompts[-1]["pages"]] == [1]
    first, other = response.json["exercises"]
    with session_scope() as session:
        row = session.get(Exercise, first["id"])
        assert row.topic_id == cid and row.status == "published" and row.code.startswith("card-ex-")
        assert row.provenance == {"user_id": session.get(Textbook, book["id"]).parse_meta["owner_id"],
                                  "textbook_id": book["id"], "card_id": cid, "model": "deepseek-flash"}
    assert first["source"] == "textbook-exercise" and first["type"] == first["exercise_type"] == "calculation"
    assert first["solution_steps"] == EXERCISE["solution_steps"] and first["hint"] == EXERCISE["hint"]
    assert local.get("/api/v1/exercises/" + first["code"], headers=second_headers).status_code == 404
    assert local.get("/api/v1/exercises?topic=" + cid, headers=second_headers).json["items"] == []
    reply["exercises"] = [EXERCISE]
    builtin = local.post(f"{ROOT}/cards/mean-value/exercises").json["exercises"][0]
    assert builtin["topic_id"] == "mean-value" and builtin["provenance"]["textbook_id"] is None
    assert prompts[-1]["pages"] == [] and prompts[-1]["conditions"]
    exercises = local.get(ROOT + "/bootstrap-extras").json["exercises"]
    assert sorted(item["id"] for item in exercises) == sorted([first["id"], other["id"], builtin["id"]])
    assert exercises[-1] == builtin
    local.delete("/api/v1/ai/key")
    attempt = local.post(ROOT + "/attempts", json={"exercise_id": first["code"], "answer_text": "最大值是 2"})
    assert attempt.status_code == 201 and attempt.json["feedback"]["needs_review"]
    assert local.delete(f"{ROOT}/textbooks/{book['id']}").status_code == 204
    extras = local.get(ROOT + "/bootstrap-extras").json
    assert extras["exercises"] == [builtin] and extras["cards"] == []
    assert extras["attempts"][0]["exercise"]["code"] == first["code"]
    with session_scope() as session:
        assert session.get(Exercise, other["id"]) is None
        assert session.get(Attempt, attempt.json["id"]).exercise.status == "archived"
    assert local.post(ROOT + "/attempts", json={"exercise_id": first["code"], "answer_text": "2"}).status_code == 404


def test_card_exercises_validation_owner_and_quota(local, app, monkeypatch, card_model):
    reply, prompts = card_model
    url = ROOT + "/cards/derivative/exercises"
    for invalid in [{"count": True}, {"count": 3}, {"count": "1"}, {"focus": "other"}]:
        assert local.post(url, json=invalid).status_code == 422
    assert local.post(url, headers={"Origin": "https://example.invalid"}).status_code == 403
    assert local.post(ROOT + "/cards/nonexistent/exercises").status_code == 404
    assert prompts == []
    for bad in [{"title": " "}, {"statement": None}, {"hint": ""}, {"checks": ["一项"]},
                {"solution_steps": []}, {"solution_steps": [{"text": "正文"}]}, {"exercise_type": "unknown"}]:
        reply["exercises"] = [EXERCISE, {**EXERCISE, **bad}]
        assert local.post(url, json={"count": 2}).status_code == 502
    reply["exercises"] = [EXERCISE]
    assert local.post(url, json={"count": 2}).status_code == 502
    assert local.get(ROOT + "/bootstrap-extras").json["exercises"] == []
    monkeypatch.setattr(app.extensions["axiom_limiters"]["legacy_ai"], "hit", lambda *_: pytest.fail("hourly limiter"))
    row = local.post(url, json={"focus": "calculation"}).json["exercises"][0]
    assert prompts[-1]["focus"] == "calculation" and prompts[-1]["count"] == 1
    with session_scope() as session:
        item = session.get(Exercise, row["id"])
        assert session.scalar(select(ModelCall.id).where(ModelCall.purpose == "card_exercises",
                                                         ModelCall.user_id == item.provenance["user_id"]))
        other_id = session.scalar(select(User.id).where(User.email == "second@axiom.test"))
        item.provenance = {**item.provenance, "user_id": other_id}
    assert local.get(ROOT + "/bootstrap-extras").json["exercises"] == []
    assert local.post(ROOT + "/attempts", json={"exercise_id": row["code"], "answer_text": "2"}).status_code == 404
    book = upload(local).json
    cid = extract_one(local, book["id"], card_model, [])
    with session_scope() as session:
        session.get(Concept, cid).created_by_id = other_id
    for action in ("proof", "exercises"):
        assert local.post(f"{ROOT}/cards/{cid}/{action}").status_code == 404
    calls = len(prompts)
    monkeypatch.setattr(app.config["AXIOM"], "ai_daily_call_limit", 1)
    assert local.post(url).status_code == 429 and len(prompts) == calls
    local.delete("/api/v1/ai/key")
    assert local.post(url).status_code == 503 and len(prompts) == calls
