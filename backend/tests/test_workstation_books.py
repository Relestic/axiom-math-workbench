import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy import select

from app.adapters import llm
from app.db import session_scope
from app.models import Asset, Concept, Proof, Textbook, User

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
    local.put("/api/v1/ai/key", json={"api_key": "sk-workstation-fixture", "model": "deepseek-chat"})
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
    assert saved == {**card, "id": saved["id"], "textbook_id": book["id"], "formula": ""}
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
