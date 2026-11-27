"""Upgrade Phase 2 PDF cards in place, then follow their actual graph in offline Chrome."""
from contextlib import contextmanager
import re

from playwright.sync_api import expect

from conftest import backend_snapshot
from fake_deepseek import DUMMY_KEY
from workstation import bootstrap, drag_pdf, select_range


PAGES = [
    "An interval contains every real number between each two of its elements.",
    "Continuity at a point permits a radius that depends on the point and on the requested accuracy.",
    "Uniform continuity uses a single radius for all points of the interval at each positive accuracy.",
    "Heine-Cantor theorem: a continuous function on a compact real interval is uniformly continuous.",
]
UNIFORM_DEFINITION = "给定任意正精度，可以选择一个半径同时控制区间内的所有点对。"
CARDS = [
    {"title": "区间", "definition": "任意两点之间的数也属于此集合。", "conditions": ["实数集合"],
     "theorem": "区间包含其中任意两点之间的所有数。", "proof": ["使用区间定义。"], "page_start": 1, "page_end": 1},
    {"title": "连续", "definition": "在每一点可选取控制函数误差的邻域。", "conditions": ["在该点有定义"],
     "theorem": "连续点的函数误差可以用邻域控制。", "proof": ["固定点及精度。"], "page_start": 2, "page_end": 2},
    {"title": "一致连续", "definition": UNIFORM_DEFINITION, "conditions": ["半径与点无关"],
     "page_start": 3, "page_end": 3, "prerequisites": [" 连，续 ", "致连续"]},
    {"title": "闭区间上的一致连续定理", "definition": "闭区间上的连续函数一致连续。",
     "conditions": ["区间紧致", "函数连续"], "theorem": "可对全部点统一选取半径。",
     "proof": ["利用紧性将点态控制延拓到整个区间。"], "page_start": 4, "page_end": 4,
     "prerequisites": ["一致，连续", "连续"]},
]


@contextmanager
def phase2_backend(server):
    # Swap only the copied application in this test's TemporaryDirectory. Its
    # seeded database, credential store, PDF paths and browser origin stay put.
    old = backend_snapshot("3805b01", server.root / "phase2-source")
    current = server.root / "backend"
    staged = server.root / "current-backend"
    server.stop()
    current.rename(staged)
    try:
        old.rename(current)
        server.start()
        yield
    finally:
        server.stop()
        if current.exists():
            current.rename(old)
        staged.rename(current)
        server.start()


def extract(book, page, first, last):
    select_range(book, first, last)
    with page.expect_response(re.compile(r"/extract-cards$")) as event:
        book.get_by_role("button", name="生成学习卡片").click()
    response = event.value
    assert response.ok, response.text()
    assert "authorization" not in response.request.all_headers()
    return response.json()["cards"]


def test_upgraded_cards_cross_batch_graph_restart_and_delete(page, server, make_pdf, extraction_only):
    server.use_mock_deepseek([
        {"contains": PAGES[:2], "reply": {"cards": CARDS[:2]}},
        {"contains": [PAGES[2]], "reply": {"cards": [CARDS[2]]}},
        {"contains": [PAGES[3]], "reply": {"cards": [CARDS[3]]}},
    ])
    with phase2_backend(server):
        key = page.request.put(server.url + "/api/v1/ai/key", data={"api_key": DUMMY_KEY, "model": "deepseek-chat"})
        assert key.ok and key.json()["configured"]
        page.goto(server.url + "/#shelf/books")
        summary = drag_pdf(page, make_pdf(PAGES))
        book = page.get_by_role("article", name=summary["title"], exact=True)
        interval, continuous = extract(book, page, 1, 2)
        assert all("prerequisites" not in card for card in [interval, continuous])

    migrated = page.request.get(server.url + "/api/v1/ai/key/status")
    assert migrated.ok and migrated.json()["model"] == "deepseek-flash"
    page.reload()
    page.get_by_role("button", name=re.compile("个人 DeepSeek 接入设置")).click()
    settings = page.get_by_role("dialog", name="个人 DeepSeek 接入设置")
    expect(settings.get_by_role("combobox", name="模型")).to_have_value("deepseek-flash")
    expect(settings).to_contain_text("已将 deepseek-chat 映射为 deepseek-flash")
    settings.get_by_role("button", name="关闭弹窗").click()
    expect(book).to_be_visible()
    [uniform] = extract(book, page, 3, 3)
    [theorem] = extract(book, page, 4, 4)
    assert uniform["prerequisites"] == [continuous["id"]]
    assert uniform["proof"] == [] and not uniform["theorem"]
    assert set(theorem["prerequisites"]) == {uniform["id"], continuous["id"]}
    requests = server.model_requests()
    assert len(requests) == 3
    third_prompt = requests[2]["messages"]
    assert all(title in third_prompt[0]["content"] for title in ("区间", "连续", "一致连续"))
    assert PAGES[3] in third_prompt[-1]["content"] and PAGES[2] not in third_prompt[-1]["content"]

    assert page.request.delete(server.url + "/api/v1/ai/key").ok
    server.restart()
    assert not page.request.get(server.url + "/api/v1/ai/key/status").json()["configured"]
    offline_model_calls = []
    def record_request(request):
        if request.method == "POST" and ("/ai/" in request.url or "/extract-cards" in request.url):
            offline_model_calls.append(request.url)
    page.on("request", record_request)
    stored = {card["id"]: card for card in bootstrap(page, server)["cards"]}
    assert stored[interval["id"]]["prerequisites"] == stored[continuous["id"]]["prerequisites"] == []
    assert stored[uniform["id"]] == uniform and stored[theorem["id"]] == theorem
    page.reload()
    nav = page.get_by_role("navigation", name="主导航")
    nav.get_by_role("button", name="学习书桌").click()
    page.get_by_role("combobox", name="选择课程或教材").select_option(summary["id"])
    page.get_by_role("combobox", name="选择章节知识点").select_option(uniform["id"])
    lecture = page.locator("#desk-pane-textbook")
    expect(lecture).to_contain_text(UNIFORM_DEFINITION)
    expect(lecture.get_by_role("heading", name="定理", exact=True)).to_have_count(0)
    expect(lecture.get_by_role("heading", name="证明思路", exact=True)).to_have_count(0)
    expect(lecture.get_by_role("button", name="逐步读证明")).to_have_count(0)
    page.get_by_role("tab", name="证明思路").click()
    expect(page.locator("#desk-pane-proof")).to_contain_text("这张教材卡片没有收录证明步骤")
    expect(page.locator("[data-proof-step-ref]")).to_have_count(0)

    nav.get_by_role("button", name="知识星图").click()
    nodes = page.locator("[data-node-id]")
    expect(nodes.first).to_be_visible()
    for card in stored.values():
        expect(page.locator(f'[data-node-id="{card["id"]}"]')).to_have_count(1)
    edges = page.locator("[data-edge-type][data-from][data-to]")
    def edge_data():
        return edges.evaluate_all("rows => rows.map(el => [el.dataset.from, el.dataset.to, el.dataset.edgeType])")
    assert {tuple(edge) for edge in edge_data() if edge[0] in stored or edge[1] in stored} == {
        (interval["id"], continuous["id"], "sequence"),
        (continuous["id"], uniform["id"], "prerequisite"),
        (continuous["id"], theorem["id"], "prerequisite"),
        (uniform["id"], theorem["id"], "prerequisite"),
    }
    # Keyboard selection also works when the card starts outside the current pan/zoom.
    page.locator(f'[data-node-id="{uniform["id"]}"]').press("Enter")
    expect(page.locator(".node-detail")).to_contain_text("未练习")
    expect(page.locator(".node-detail")).to_contain_text(UNIFORM_DEFINITION)

    nav.get_by_role("button", name="书架与笔记").click()
    book.get_by_role("button", name="删除", exact=True).click()
    book.get_by_role("button", name="确认删除", exact=True).click()
    expect(book).to_have_count(0)
    nav.get_by_role("button", name="知识星图").click()
    expect(nodes.first).to_be_visible()
    remaining = set(nodes.evaluate_all("rows => rows.map(el => el.dataset.nodeId)"))
    assert remaining and remaining.isdisjoint(stored)
    assert all(a in remaining and b in remaining for a, b, _ in edge_data())
    assert bootstrap(page, server)["cards"] == []
    assert not offline_model_calls
    assert len(server.model_requests()) == 3
