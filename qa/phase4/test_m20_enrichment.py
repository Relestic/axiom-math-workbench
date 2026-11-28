"""Count per-card AI requests while advancing the desk's dwell timer in Chrome."""
from playwright.sync_api import expect


def test_dwell_navigation_partial_failure_and_manual_retry(page, server):
    book = {"id": "b", "title": "实分析", "page_count": 3, "pages": []}
    cards = [{"id": name, "title": name, "definition": name, "theorem": "", "proof": ["原书概述"],
              "conditions": [], "textbook_id": "b", "page_start": i, "page_end": i}
             for i, name in enumerate(["A", "B", "C"], 1)]
    # C already has its own figure, but exercises on another card cannot satisfy C.
    cards[2]["visual"] = {"board": "diagram", "diagramScene": {
        "version": 1, "title": "示意图", "caption": "", "nodes": [],
        "viewBox": {"xMin": -1, "xMax": 1, "yMin": -1, "yMax": 1}}}
    exercises = [{"id": "a", "code": "a", "topic_id": "A", "title": "A 题", "source": "textbook-exercise"}]
    catalog = {"textbooks": [book], "cards": cards, "exercises": exercises}
    calls = []
    key = {"configured": False, "state": "unset", "model": "deepseek-flash"}
    page.route("**/local/bootstrap-extras", lambda r: r.fulfill(json=catalog))
    page.route("**/ai/key/status", lambda r: r.fulfill(json=key))

    def generate(route):
        card, part = route.request.url.split("/")[-2:]
        calls.append((card, part))
        if part == "proof":
            if calls.count((card, part)) == 1:
                route.fulfill(status=502)
                return
            cards[2]["proof_steps"] = [{"n": 1, "title": "条件", "formula": "", "text": "证明",
                                         "why": "依据", "uses": [], "conditions": []}]
            route.fulfill(json=cards[2])
        else:
            exercises.append(dict(exercises[0], topic_id=card, id=card, code=card))
            route.fulfill(json={"exercises": exercises[-1:]})

    page.route("**/local/cards/*/*", generate)
    page.goto(server.url + "/#desk/textbook")
    books = page.get_by_label("选择课程或教材")
    selected = page.get_by_label("选择章节知识点")
    toggle = page.get_by_label("翻到卡片自动精配")
    expect(books).to_be_visible()
    expect(toggle).to_have_count(0)
    page.clock.install(time="2026-01-01T00:00:00Z")
    page.clock.pause_at("2026-01-01T00:00:01Z")
    books.select_option("b")
    expect(toggle).to_be_checked()
    retry = page.get_by_role("button", name="一键精配本卡")
    expect(retry).to_be_disabled()
    page.clock.fast_forward(2000)
    assert calls == []
    key.update(configured=True, state="ready")
    page.reload()
    expect(retry).to_be_enabled()
    page.clock.fast_forward(1000)
    page.keyboard.press("Alt+ArrowRight")
    expect(selected).to_have_value("B")
    page.clock.fast_forward(1000)
    page.evaluate("document.activeElement.blur()")
    page.keyboard.press("ArrowRight")
    expect(selected).to_have_value("C")
    page.clock.fast_forward(1499)
    assert calls == []
    with page.expect_request("**/local/cards/C/proof"):
        page.clock.fast_forward(1)
    expect(page.locator("#desk-study").get_by_role("alert")).to_contain_text("证明")
    expect(retry).to_be_enabled()
    assert calls == [("C", "proof"), ("C", "exercises")]
    nav = page.get_by_role("navigation", name="主导航")
    nav.get_by_role("button", name="书架与笔记").click()
    page.clock.run_for(400)
    expect(toggle).to_be_hidden()
    nav.get_by_role("button", name="学习书桌").click()
    expect(selected).to_have_value("C")
    page.clock.fast_forward(3000)
    assert calls == [("C", "proof"), ("C", "exercises")]
    toggle.uncheck()
    retry.click()
    expect(page.get_by_text("✓ 本卡证明 · 练习 · 配图已配齐")).to_be_visible()
    assert calls == [("C", "proof"), ("C", "exercises"), ("C", "proof")]
    page.reload()
    expect(toggle).not_to_be_checked()
    page.keyboard.press("Alt+ArrowLeft")
    expect(selected).to_have_value("B")
    page.clock.fast_forward(2000)
    assert len(calls) == 3
    toggle.check()
    nav.get_by_role("button", name="书架与笔记").click()
    page.clock.run_for(400)
    expect(toggle).to_be_hidden()
    page.clock.fast_forward(2000)
    assert len(calls) == 3
