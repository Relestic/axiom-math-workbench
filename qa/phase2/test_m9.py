import json
import re
import sqlite3
from contextlib import closing

from playwright.sync_api import expect

from conftest import PortableServer, backend_snapshot
from fake_deepseek import DUMMY_KEY
from workstation import check_speech, observe_speech
from workstation import SOURCE_B, bootstrap, drag_pdf, export_zip, restore_into_clean_workstation


WRONG = "给定任意精度 ε，先固定一个横坐标 x，再让 δ 取决于 x，因此得到一致连续。"
FOCUS = "量词顺序与 δ 对 x 的依赖"
REVIEW = {"summary": "需要说明统一尺度如何对所有点同时有效。",
          "steps": [{"step": "选择统一尺度", "assessment": "把横坐标放在尺度之前选择，量词顺序错误。",
                     "suggestion": "先取只依赖精度的尺度，再检验任意两个点。"}],
          "error_focus": FOCUS}
VARIANT = {
    "title": "在单位区间上构造统一尺度", "statement": "对平方函数在单位区间上的任意两点构造统一尺度，并说明取值顺序。",
    "type": "proof", "domain": "[0,1]", "hint": "从差平方公式给出统一界。",
    "solution_steps": [{"title": "估计差值", "text": "在单位区间上，两点之和不超过二。"},
                       {"title": "选择尺度", "text": "给定精度，选择精度的一半作为尺度。"}],
    "checks": ["尺度仅依赖精度。"], "common_errors": ["选择依赖具体点的尺度。"],
}
VARIANT_BUTTON = "针对这个薄弱点再出一道变式题"
EXPLAIN_BUTTON = "让 Hiyori 讲讲错在哪"


def posted(page, path, action):
    with page.expect_response(lambda r: r.url.endswith(path) and r.request.method == "POST") as event:
        action()
    response = event.value
    assert response.ok, response.text()
    assert "authorization" not in response.request.all_headers()
    return response.json()


def submit(page, server, topic, answer):
    page.goto(server.url + "/#desk/exercises")
    page.get_by_role("combobox", name="选择章节知识点").select_option(topic)
    exercise = page.locator("#desk-pane-exercises")
    exercise.locator("#exercise-answer").fill(answer)
    return posted(page, "/local/attempts",
                  exercise.get_by_role("button", name="提交批改", exact=True).click)


def test_offline_proof_structure_and_calculation_grading(page, server):
    proof = submit(page, server, "uniform", WRONG)
    assert proof["ai_review"] is None
    feedback = proof["feedback"]
    assert feedback["grading_scope"] == "structural" and feedback["needs_review"]
    assert feedback["criteria"] and isinstance(feedback["score"], int)
    exercise = page.locator("#desk-pane-exercises")
    expect(exercise.locator(".grading-criteria")).to_be_visible()
    exercise.get_by_role("button", name=VARIANT_BUTTON).click()
    expect(page.get_by_text("请先在顶部配置个人 DeepSeek Key", exact=False).first).to_be_visible()
    calculation = submit(page, server, "primitive", "exp(2*x)*(2*x-1)/4")
    assert calculation["ai_review"] is None
    result = calculation["feedback"]
    assert result["correct"] is True and result["score"] == 100 and result["checker"] == "sympy"
    expect(exercise.get_by_text("自动批改通过", exact=True)).to_be_visible()


# The Phase 2 counterexample editor produced this text for 1/x on [0,1].
# Historical notes still belong in personal records and in a complete ZIP.
LEGACY_NOTE = {
    "id": "phase2-reciprocal", "date": "2026-11-24", "conceptId": "uniform",
    "text": """自拟反例检验 · f(x) = 1/x · [0, 1]
[verdict_basis=symbolic] 符号推导：所选区间内，符号算法得到的实数连续域为 (0, 1]。
[verdict_basis=symbolic] 符号推导：x = 0 属于 [0, 1]，原式在该点未定义。
[verdict_basis=symbolic] 符号推导：在原式有定义的区间内部，f′(x) = -1/x^2。
[verdict_basis=symbolic] 符号推导：0 计入区间，趋近该端点的右极限为 +∞，沿区间内有定义的点，函数值无界。
[verdict_basis=symbolic] 符号推导：1 计入区间，从区间内部趋近该端点的左极限为 1。
[verdict_basis=numeric-sample] 数值辅助检验，非严格证明：在已确认的实数连续域内检验 256 个网格点，其中 256 个得到有限实数值，样本最小值 1、最大值 256。有限采样不能证明连续、有界或可积。""",
}


def test_review_voice_variant_and_complete_workstation_archive(page, server, sample_pdf, tmp_path):
    card = {"title": "归档中的紧区间", "definition": "区间内的连续函数具有统一尺度。", "formula": "|x-y|<δ",
            "conditions": ["区间紧致", "函数连续"], "theorem": "紧区间上的连续函数一致连续。",
            "proof": ["由紧性提取子列。"], "page_start": 2, "page_end": 2}
    server.use_mock_deepseek([
        {"contains": ["逐步逻辑审阅"], "reply": REVIEW},
        {"contains": ["针对薄弱点生成一道变式题"], "reply": VARIANT},
        {"contains": [SOURCE_B], "reply": {"cards": [card]}},
    ])
    key = page.request.put(server.url + "/api/v1/ai/key", data={"api_key": DUMMY_KEY, "model": "deepseek-flash"})
    assert key.ok and key.json()["configured"]
    attempt = submit(page, server, "uniform", WRONG)
    assert attempt["feedback"]["needs_review"] and attempt["ai_review"] == REVIEW
    exercise = page.locator("#desk-pane-exercises")
    expect(exercise).to_contain_text(REVIEW["steps"][0]["suggestion"])
    page.locator(".companion-stage[data-ready]").wait_for()
    page.get_by_role("button", name="开启伴学朗读").click()
    observe_speech(page)
    exercise.get_by_role("button", name=EXPLAIN_BUTTON).click()
    transcript = page.get_by_role("log", name="伴学对话记录")
    expect(transcript).to_contain_text(REVIEW["summary"])
    check_speech(page, "尺度")
    page.get_by_role("button", name="静音只看字幕").click()

    variant = posted(page, "/local/exercises/variant", exercise.get_by_role("button", name=VARIANT_BUTTON).click)
    assert variant["source"] == "ai-variant"
    assert variant["provenance"]["parent_attempt_id"] == attempt["id"]
    assert variant["provenance"]["target_error"] == FOCUS
    assert variant["provenance"]["model"] == "deepseek-flash"
    generated = variant["statement"]
    expect(exercise.locator(".exercise-question")).to_contain_text(generated)
    expect(exercise).to_contain_text(FOCUS)
    prompt = "\n".join(msg["content"] for msg in server.model_requests()[1]["messages"])
    assert WRONG in prompt and FOCUS in prompt
    server.restart()
    page.reload()
    expect(exercise.locator(".exercise-question")).to_contain_text(generated)
    page.goto(server.url + "/#desk/review")
    review = page.locator(".attempt-card").filter(has_text="先固定一个横坐标")
    expect(review).to_be_visible()
    expect(review.get_by_role("button", name=EXPLAIN_BUTTON)).to_be_visible()

    page.evaluate("note => localStorage.setItem('axiom-offline-notes', JSON.stringify([note]))", LEGACY_NOTE)
    page.goto(server.url + "/#shelf/books")
    book = drag_pdf(page, sample_pdf)
    extracted = page.request.post(f"{server.url}/api/v1/local/textbooks/{book['id']}/extract-cards",
                                  data={"page_start": 2, "page_end": 2})
    assert extracted.ok, extracted.text()
    sourced_card = extracted.json()["cards"][0]
    archive_path = tmp_path / "m9-complete.zip"
    export_zip(page, server, archive_path)
    restore_into_clean_workstation(page, server, archive_path)
    extras = bootstrap(page, server)
    assert extras["textbooks"] == [book] and extras["cards"] == [sourced_card]
    assert next(row for row in extras["exercises"] if row["id"] == variant["id"]) == variant
    assert page.request.get(f"{server.url}/api/v1/local/textbooks/{book['id']}/file").body() == sample_pdf
    with closing(sqlite3.connect(server.root / "data" / "axiom.db")) as db:
        stored = db.execute("SELECT ai_review, answer_text FROM attempts WHERE id=?", (attempt["id"],)).fetchone()
    assert json.loads(stored[0]) == REVIEW and stored[1] == WRONG
    page.wait_for_function("""id => JSON.parse(localStorage.getItem('axiom-offline-notes') || '[]')
                          .some(note => note.id === id)""", arg=LEGACY_NOTE["id"])
    assert LEGACY_NOTE in page.evaluate("JSON.parse(localStorage.getItem('axiom-offline-notes'))")
    page.goto(server.url + "/#shelf/notes")
    expect(page.get_by_text(re.compile("verdict_basis=symbolic")).first).to_be_visible()


def test_browser_imports_genuine_phase1_export(page, server, tmp_path):
    revision = "76330def51cedd1e0131330d476d47feb0670ad5"
    old_backend = backend_snapshot(revision, tmp_path / "phase1-source")
    old_root = tmp_path / "phase1-workstation"
    old_root.mkdir()
    old = PortableServer(old_root, server.root / "web", server.python, old_backend)
    try:
        old.start()
        exported = page.request.post(old.url + "/api/v1/archive/export",
                                     data={"storage": {"axiom-last-page": "proof", "axiom-name": "旧存档学习者"}})
        assert exported.ok, exported.text() if not exported.ok else ""
        save = tmp_path / "phase1.zip"
        save.write_bytes(exported.body())
        with closing(sqlite3.connect(old.root / "data" / "axiom.db")) as db:
            assert "ai_review" not in {col[1] for col in db.execute("PRAGMA table_info(attempts)")}
            original = db.execute("SELECT id, answer_text FROM attempts ORDER BY id").fetchall()
            assert original
    finally:
        old.stop()
    page.goto(server.url + "/#shelf/archive")
    page.once("dialog", lambda dialog: dialog.accept())
    with page.expect_response(lambda r: r.url.endswith("/archive/import") and r.request.method == "POST") as imported:
        page.locator(".learning-archive-settings input[type=file]").set_input_files(save)
    assert imported.value.ok, imported.value.text()
    expect(page).to_have_url(re.compile("#desk/proof$"))
    with closing(sqlite3.connect(server.root / "data" / "axiom.db")) as db:
        assert db.execute("SELECT id, answer_text FROM attempts ORDER BY id").fetchall() == original
        assert "ai_review" in {col[1] for col in db.execute("PRAGMA table_info(attempts)")}
