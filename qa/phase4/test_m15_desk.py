"""Exercise the book and card controls in the portable desk without a model key."""
from playwright.sync_api import expect


def test_book_and_card_navigation(page, server):
    def card(card_id, page_start, book_id="book-a"):
        return {"id": card_id, "title": card_id, "textbook_id": book_id, "definition": "卡片正文",
                "conditions": [], "theorem": "", "proof": [], "page_start": page_start, "page_end": page_start}

    # The bootstrap endpoint returns cards in creation order. Two titles share page 1.
    catalog = {"textbooks": [
        {"id": "book-a", "title": "极限", "page_count": 3, "pages": []},
        {"id": "book-b", "title": "级数", "page_count": 1, "pages": []},
        {"id": "book-c", "title": "无卡教材", "page_count": 1, "pages": []},
    ], "cards": [card("later-page", 3), card("series", 1, "book-b"),
                 card("first-created", 1), card("second-created", 1)],
        "exercises": [], "attempts": []}
    page.route("**/local/bootstrap-extras", lambda route: route.fulfill(json=catalog))
    page.goto(server.url + "/#desk/textbook")
    books = page.get_by_role("combobox", name="选择课程或教材")
    cards = page.get_by_role("combobox", name="选择章节知识点")
    prev = page.get_by_role("button", name="上一张卡片", exact=True)
    next_card = page.get_by_role("button", name="下一张卡片", exact=True)
    expect(books.locator("option")).to_have_text([
        "示例讲义 · 数学分析（8 讲）", "《极限》（3 张卡片）", "《级数》（1 张卡片）", "《无卡教材》（0 张卡片）",
    ])
    expect(books.locator("option").last).to_be_disabled()
    expect(cards.locator("option")).to_have_count(8)
    books.select_option(label="《极限》（3 张卡片）")
    expect(cards).to_have_value("first-created")
    expect(cards.locator("option")).to_have_text(["first-created", "second-created", "later-page"])
    expect(page.get_by_text("1 / 3", exact=True)).to_be_visible()
    expect(prev).to_be_disabled()
    page.keyboard.press("Alt+ArrowLeft")
    expect(cards).to_have_value("first-created")
    next_card.click()
    expect(cards).to_have_value("second-created")
    page.get_by_role("tab", name="证明思路").click()
    page.keyboard.press("Alt+ArrowRight")
    expect(cards).to_have_value("later-page")
    expect(page.get_by_role("tab", name="证明思路")).to_have_attribute("aria-selected", "true")
    expect(next_card).to_be_disabled()
    page.keyboard.press("Alt+ArrowRight")
    expect(cards).to_have_value("later-page")
    prev.click()
    expect(cards).to_have_value("second-created")
    page.reload()
    expect(cards).to_have_value("second-created")
    page.keyboard.press("Alt+ArrowLeft")
    expect(cards).to_have_value("first-created")
    books.select_option(label="示例讲义 · 数学分析（8 讲）")
    expect(cards).to_have_value("continuous")
    step = page.locator("[data-proof-step-ref]").first
    title = step.locator(".proof-step-copy > span").bounding_box()
    subtitle = step.locator("small").bounding_box()
    assert subtitle["y"] >= title["y"] + title["height"]
    cards.select_option("integral")
    expect(next_card).to_be_disabled()
    books.select_option(label="《级数》（1 张卡片）")
    expect(cards).to_have_value("series")
    expect(next_card).to_be_disabled()
    expect(prev).to_be_disabled()
    books.select_option(label="《极限》（3 张卡片）")
    expect(cards).to_have_value("first-created")
