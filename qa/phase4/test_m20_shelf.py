"""Build a 203-page PDF through the portable server, substituting only the model."""
import json
from urllib.parse import urlsplit

from playwright.sync_api import expect

from fake_deepseek import DUMMY_KEY
from workstation import bootstrap, drag_pdf, select_range


def test_whole_book_mixed_ocr_and_empty_batches(page, server, make_pdf):
    pages = [f"Mathematical lecture page {i}." for i in range(1, 204)]
    for i in [1, 2, 3, 4, 11]:
        pages[i - 1] = None
    card = {"title": "集合的上界", "definition": "不小于集合中每个元素的数。", "page_start": 203, "page_end": 203}
    server.use_mock_deepseek([
        {"contains": ["PDF 第 1 页"], "reply": {"pages": [{"page": i, "text": ""} for i in [1, 2, 3]]}},
        {"contains": ["PDF 第 4 页"], "reply": {"pages": [{"page": 4, "text": "公式 $x^2$"}]}},
        {"contains": ["PDF 第 11 页"], "reply": {"pages": [{"page": 11, "text": "扫描正文"}]}},
        {"contains": [pages[-1]], "reply": {"cards": [card]}},
        {"contains": ["根据提供的教材原文"], "reply": {"cards": []}},
    ])
    assert page.request.put(server.url + "/api/v1/ai/key", data={"api_key": DUMMY_KEY, "model": "deepseek-flash"}).ok
    page.goto(server.url + "/#shelf/books")
    book = drag_pdf(page, make_pdf(pages))
    entry = page.get_by_role("article", name=book["title"])
    entry.get_by_role("button", name="选整本书").click()
    expect(entry.get_by_label("结束页")).to_have_value("203")
    expect(entry).to_contain_text("含 5 页待识别扫描页")
    reads = []
    def record_file(request):
        if urlsplit(request.url).path.endswith("/file") and "range" not in request.headers:
            reads.append(request.url)
    page.on("request", record_file)
    pending = []
    page.route("**/ocr-pages", lambda route: pending.append(route), times=1)
    with page.expect_request("**/ocr-pages"):
        entry.get_by_role("button", name="快速建书").click()
    expect(entry.get_by_role("status")).to_have_text("正在识别扫描页：第 1–3 / 203 页…")
    entry.get_by_role("button", name="停止后续生成").click()
    pending[0].continue_()
    expect(entry.get_by_role("status")).to_contain_text("已停止后续生成")
    cached = bootstrap(page, server)["textbooks"][0]["pages"]
    assert all(p.get("ocr_done") and not p["char_count"] for p in cached[:3])
    assert cached[3]["needs_ocr"] and len(server.model_requests()) == 1
    assert not any("pdf.worker" in worker.url for worker in page.workers)
    reads.clear()
    entry.get_by_role("button", name="快速建书").click()
    expect(entry.get_by_role("status")).to_have_text("已生成 1 张学习卡片", timeout=30000)
    assert len(reads) == 1
    calls = server.model_requests()
    ocr = []
    extracts = []
    for call in calls:
        content = call["messages"][-1]["content"]
        if isinstance(content, list):
            assert all(part["image_url"]["url"].startswith("data:image/jpeg;base64,") for part in content[1::2])
            ocr.append([part["text"] for part in content[::2]])
        else:
            extracts.append(json.loads(content))
    assert ocr == [["PDF 第 1 页", "PDF 第 2 页", "PDF 第 3 页"], ["PDF 第 4 页"], ["PDF 第 11 页"]]
    assert len(extracts) == 21
    assert [row["page"] for batch in extracts for row in batch] == list(range(4, 204))
    assert [(batch[0]["page"], batch[-1]["page"]) for batch in extracts] == [
        (4, 10), *[(start, start + 9) for start in range(11, 201, 10)], (201, 203)]
    assert extracts[0][0]["text"] == "公式 $x^2$"
    catalog = bootstrap(page, server)
    assert [c["title"] for c in catalog["cards"]] == [card["title"]]
    assert all(p["needs_ocr"] is False for p in catalog["textbooks"][0]["pages"])
    entry.get_by_role("button", name="接续未提页码").click()
    expect(entry.get_by_label("起始页")).to_have_value("203")
    select_range(entry, 1, 3)
    entry.get_by_role("button", name="快速建书").click()
    expect(entry.get_by_role("status")).to_have_text("所选页码范围未发现可提取的定义或定理")
    assert len(server.model_requests()) == len(calls)
