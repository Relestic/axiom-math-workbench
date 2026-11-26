import hashlib
import io
import re
from urllib.parse import urlsplit
import zipfile

import pytest
from playwright.sync_api import expect

from fake_deepseek import DUMMY_KEY


SOURCE_A = "Chapter One. Walled gardens are an example of a compact metric space."
SOURCE_B = "Chapter Two. Each continuous function on a compact interval is uniformly continuous."
TITLE = "紧区间上的连续函数"


@pytest.fixture
def sample_pdf():
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    for text in (SOURCE_A, SOURCE_B, None):
        page = writer.add_blank_page(width=560, height=780)
        if text:
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 12 Tf 36 700 Td ({text}) Tj ET".encode("ascii"))
            page.replace_contents(stream)
    data = io.BytesIO()
    writer.write(data)
    reader = PdfReader(io.BytesIO(data.getvalue()))
    assert [p.extract_text().strip() for p in reader.pages] == [SOURCE_A, SOURCE_B, ""]
    return data.getvalue()


def drag_pdf(page, content):
    drop_zone = page.locator(".upload-zone")
    drop_zone.wait_for()
    transfer = page.evaluate_handle("""bytes => {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(bytes)], 'lecture-qa.pdf', {type:'application/pdf'}));
        return data;
    }""", list(content))
    try:
        with page.expect_response(lambda response: response.url.endswith("/local/textbooks")
                                  and response.request.method == "POST") as event:
            drop_zone.dispatch_event("drop", {"dataTransfer": transfer})
    finally:
        transfer.dispose()
    response = event.value
    assert response.ok, response.text()
    assert "authorization" not in response.request.all_headers()
    return response.json()


def bootstrap(page, server):
    result = page.request.get(server.url + "/api/v1/local/bootstrap-extras")
    assert result.ok, result.text()
    return result.json()


def check_inline_navigation(response, source):
    assert response.url == source
    assert response.status in (200, 206)
    assert response.request.is_navigation_request()
    headers = response.all_headers()
    assert headers["content-type"].startswith("application/pdf")
    assert headers["content-disposition"].lower().startswith("inline")
    assert headers.get("x-frame-options", "").lower() != "deny"
    assert "frame-ancestors 'none'" not in headers.get("content-security-policy", "")
    request_headers = response.request.all_headers()
    assert "origin" not in request_headers and "authorization" not in request_headers
    parent = response.request.frame.parent_frame
    assert parent is not None and urlsplit(parent.url).netloc == urlsplit(source).netloc
    assert request_headers.get("sec-fetch-site") in ("same-origin", None)


def select_range(book, start, end):
    book.get_by_role("spinbutton", name="起始页").fill(str(start))
    book.get_by_role("spinbutton", name="结束页").fill(str(end))


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


def test_real_card_extraction_reader_anchor_and_clean_archive(page, server, sample_pdf, tmp_path):
    result = {"cards": [{"title": TITLE, "definition": "一致连续的尺度适用于区间中任意两点。",
                         "formula": "|x-y|<δ", "conditions": ["区间为紧区间", "函数在区间上连续"],
                         "theorem": "紧区间上的连续函数一致连续。", "proof": ["由紧性取收敛子列。", "在同一点利用连续性。"],
                         "page_start": 2, "page_end": 2}]}
    server.use_mock_deepseek([{"contains": [SOURCE_B], "reply": result}])
    saved_key = page.request.put(server.url + "/api/v1/ai/key", data={
        "api_key": DUMMY_KEY, "model": "deepseek-chat"}, headers={"Origin": server.url})
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
    assert len(sent) == 1 and sent[0]["model"] == "deepseek-chat"
    messages = "\n".join(msg["content"] for msg in sent[0]["messages"])
    assert SOURCE_B in messages and SOURCE_A not in messages

    server.restart()
    page.goto(server.url + "/#desk/textbook")
    page.reload()
    selector = page.locator("#desk-study .desk-tools select")
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

    page.goto(server.url + "/#shelf/archive")
    with page.expect_download() as download:
        page.get_by_role("button", name="导出学习存档").click()
    archive_path = tmp_path / "m8-workstation.zip"
    download.value.save_as(archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.read("files/" + hashlib.sha256(sample_pdf).hexdigest() + ".pdf") == sample_pdf

    # The original data directory stays intact. Start a fresh SQLite workstation
    # on the same origin so Chrome exercises the real import and restore dialog.
    server.stop()
    (server.root / "data").rename(server.root / "before-restore")
    server.start()
    page.evaluate("localStorage.clear()")
    page.reload()
    fresh = bootstrap(page, server)
    assert fresh["textbooks"] == [] and fresh["cards"] == []
    page.once("dialog", lambda dialog: dialog.accept())
    with page.expect_response(lambda r: r.url.endswith("/archive/import") and r.request.method == "POST") as restored:
        page.locator(".learning-archive-settings input[type=file]").set_input_files(archive_path)
    assert restored.value.ok, restored.value.text()
    restored_extras = bootstrap(page, server)
    assert restored_extras["cards"] == [card]
    assert restored_extras["textbooks"] == [summary]
    assert page.request.get(file_url).body() == sample_pdf
    assert not page.request.get(server.url + "/api/v1/ai/key/status").json()["configured"]
