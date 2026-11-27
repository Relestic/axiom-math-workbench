import hashlib
import re
import zipfile

from playwright.sync_api import expect

from fake_deepseek import DUMMY_KEY
from workstation import (SOURCE_A, SOURCE_B, TITLE, bootstrap, check_inline_navigation,
                         drag_pdf, export_zip, restore_into_clean_workstation, select_range)


def test_local_pdf_shelf_persists_without_login(page, server, sample_pdf):
    page.goto(server.url + "/#shelf/books")
    assert bootstrap(page, server)["textbooks"] == []
    book = drag_pdf(page, sample_pdf)
    file_url = f"{server.url}/api/v1/local/textbooks/{book['id']}/file"
    assert book["page_count"] == 3
    assert [p["needs_ocr"] for p in book["pages"]] == [False, False, True]
    assert 60 <= book["pages"][1]["char_count"] <= len(SOURCE_B)
    assert book["pages"][2]["char_count"] == 0
    entry = page.get_by_role("article", name=book["title"], exact=True)
    expect(entry).to_contain_text(re.compile("扫描|OCR"))
    select_range(entry, 3, 3)
    entry.get_by_role("button", name="生成学习卡片").click()
    expect(entry.get_by_role("alert")).to_contain_text(re.compile("第 3 页.*扫描"))
    entry.get_by_role("button", name="重命名").click()
    entry.get_by_role("textbox", name="教材名称").fill("重命名后的数学讲义")
    entry.get_by_role("button", name="保存名称").click()
    entry = page.get_by_role("article", name="重命名后的数学讲义", exact=True)
    expect(entry).to_be_visible()
    select_range(entry, 1, 1)
    entry.get_by_role("button", name="生成学习卡片").click()
    expect(page.get_by_text("请先在顶部配置个人 DeepSeek Key", exact=False).first).to_be_visible()
    server.restart()
    page.reload()
    expect(entry).to_be_visible()
    saved = bootstrap(page, server)["textbooks"]
    assert len(saved) == 1 and saved[0]["title"] == "重命名后的数学讲义"
    assert saved[0]["pages"] == book["pages"]
    with page.expect_response(file_url) as loaded:
        entry.get_by_role("button", name="在书桌阅读").click()
    check_inline_navigation(loaded.value, file_url)
    frame = page.locator("iframe[title='课本原文 PDF']")
    expect(frame).to_be_visible()
    expect(frame).to_have_attribute("src", re.compile(r"/file#page=1$"))
    assert page.request.get(file_url).body() == sample_pdf
    page.goto(server.url + "/#shelf/books")
    entry.get_by_role("button", name="删除", exact=True).click()
    entry.get_by_role("button", name="确认删除", exact=True).click()
    expect(entry).to_have_count(0)
    assert bootstrap(page, server)["textbooks"] == []
    assert page.request.get(file_url).status == 404


def test_real_card_extraction_reader_anchor_and_clean_archive(page, server, sample_pdf, tmp_path, extraction_only):
    result = {"cards": [{"title": TITLE, "definition": "一致连续的尺度适用于区间中任意两点。",
                         "formula": "|x-y|<δ", "conditions": ["区间为紧区间", "函数在区间上连续"],
                         "theorem": "紧区间上的连续函数一致连续。", "proof": ["由紧性取收敛子列。", "在同一点利用连续性。"],
                         "page_start": 2, "page_end": 2}]}
    server.use_mock_deepseek([{"contains": [SOURCE_B], "reply": result}])
    saved_key = page.request.put(server.url + "/api/v1/ai/key", data={
        "api_key": DUMMY_KEY, "model": "deepseek-flash"}, headers={"Origin": server.url})
    assert saved_key.ok and saved_key.json()["configured"]
    page.goto(server.url + "/#shelf/books")
    summary = drag_pdf(page, sample_pdf)
    book = page.get_by_role("article", name=summary["title"], exact=True)
    select_range(book, 2, 2)
    with page.expect_response(re.compile(r"/extract-cards$")) as event:
        book.get_by_role("button", name="生成学习卡片").click()
    assert event.value.ok, event.value.text()
    assert "authorization" not in event.value.request.all_headers()
    card = event.value.json()["cards"][0]
    assert (card["title"], card["textbook_id"], card["page_start"], card["page_end"]) == (TITLE, summary["id"], 2, 2)
    sent = server.model_requests()
    assert len(sent) == 1 and sent[0]["model"] == "deepseek-flash"
    messages = "\n".join(msg["content"] for msg in sent[0]["messages"])
    assert SOURCE_B in messages and SOURCE_A not in messages

    server.restart()
    page.goto(server.url + "/#desk/textbook")
    page.reload()
    page.get_by_role("combobox", name="选择课程或教材").select_option(summary["id"])
    selector = page.get_by_role("combobox", name="选择章节知识点")
    expect(selector.locator("option").filter(has_text=TITLE)).to_have_count(1)
    selector.select_option(card["id"])
    page.reload()
    expect(selector).to_have_value(card["id"])
    citation = page.get_by_role("button", name=re.compile("查看课本原文.*第 2 页"))
    expect(citation).to_be_visible()
    file_url = f"{server.url}/api/v1/local/textbooks/{summary['id']}/file"
    with page.expect_response(file_url) as loaded:
        citation.click()
    check_inline_navigation(loaded.value, file_url)
    expect(page.locator("iframe[title='课本原文 PDF']")).to_have_attribute("src", re.compile("/file#page=2$"))

    archive_path = tmp_path / "m8-workstation.zip"
    export_zip(page, server, archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.read("files/" + hashlib.sha256(sample_pdf).hexdigest() + ".pdf") == sample_pdf
    restore_into_clean_workstation(page, server, archive_path)
    restored_extras = bootstrap(page, server)
    assert restored_extras["cards"] == [card]
    assert restored_extras["textbooks"] == [summary]
    assert page.request.get(file_url).body() == sample_pdf
    assert not page.request.get(server.url + "/api/v1/ai/key/status").json()["configured"]
