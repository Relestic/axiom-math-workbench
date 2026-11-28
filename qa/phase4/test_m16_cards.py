"""Exercise the shelf and desk against the workstation API contract in Chrome."""
from playwright.sync_api import expect


def test_complete_import_and_generate_again_in_desk(page, server):
    book = {"id": "lecture", "title": "极限讲义", "page_count": 1, "pages": [
        {"page": 1, "char_count": 50, "needs_ocr": False}]}
    card = {"id": "limits", "title": "极限", "definition": "用邻域控制误差", "theorem": "", "proof": [],
            "conditions": ["同一邻域"], "textbook_id": book["id"], "page_start": 1, "page_end": 1}
    card["formula"] = r"$u_t-ku_{xx}+Vu_x=0$。"
    steps = [{"n": 1, "title": "固定精度", "formula": r"设 $u_1,u_2$ 为解，令 $w=u_1-u_2$。", "text": "先给定任意正精度。",
              "why": "半径取决于所给精度。", "uses": [], "conditions": ["精度为正"]}]
    catalog = {"textbooks": [book], "cards": [], "exercises": []}
    calls = []
    key = {"configured": True, "state": "ready", "model": "deepseek-flash"}
    page.route("**/ai/key/status", lambda route: route.fulfill(json=key))
    page.route("**/local/bootstrap-extras", lambda route: route.fulfill(json=catalog))

    def extract(route):
        calls.append("extract")
        catalog["cards"].append(card)
        route.fulfill(json={"cards": [card]}, status=201)

    def prove(route):
        calls.append("proof")
        card.update(proof_steps=steps, proof_status="ai_elaboration", proof=[steps[0]["text"]])
        route.fulfill(json={**card, "card_id": card["id"]})

    def practice(route):
        calls.append("exercises")
        index = len(catalog["exercises"]) + 1
        code = f"card-ex-{index:032x}"
        exercise = {"id": code, "code": code, "title": f"条件题 {index}", "statement": f"写出第 {index} 个条件。",
                    "topic_id": card["id"], "source": "textbook-exercise", "checks": ["范围", "量词"],
                    "hint": "先写条件。", "solution_steps": ["取正精度。"], "type": "proof"}
        catalog["exercises"].append(exercise)
        route.fulfill(json={"exercises": [exercise]}, status=201)

    page.route("**/extract-cards", extract)
    page.route("**/cards/limits/proof", prove)
    page.route("**/cards/limits/exercises", practice)
    def draw(route):
        calls.append("visual")
        card["visual"] = {"board": "diagram", "diagramScene": {
            "version": 1, "title": "邻域", "caption": "", "nodes": [],
            "viewBox": {"xMin": -1, "xMax": 1, "yMin": -1, "yMax": 1}}}
        route.fulfill(json={"visual": card["visual"]})

    page.route("**/cards/limits/visual", draw)
    page.goto(server.url + "/#shelf/books")
    shelf = page.get_by_role("article", name=book["title"])
    shelf.get_by_role("button", name="快速建书").click()
    expect(shelf.get_by_role("status")).to_contain_text("已生成 1 张学习卡片")
    assert calls == ["extract"]
    shelf.get_by_role("button", name="查看学习卡片").click()
    expect(page.get_by_text("✓ 本卡证明 · 练习 · 配图已配齐")).to_be_visible()
    assert calls == ["extract", "proof", "exercises", "visual"]
    page.get_by_label("翻到卡片自动精配").uncheck()
    lecture = page.locator("#desk-pane-textbook")
    expect(lecture.locator(".local-formula-showcase .katex-display")).to_be_visible()
    expect(lecture.locator(".local-step-formula .katex")).to_have_count(2)
    expect(lecture.locator(".katex-error, .math-fallback")).to_have_count(0)
    page.get_by_role("tab", name="证明思路").click()
    proof = page.locator("#desk-pane-proof")
    expect(proof).to_contain_text("以下分步推导由 AI 根据本卡定义与条件补充拆解，非教材逐字原文")
    expect(proof.get_by_role("heading", name="固定精度")).to_be_visible()
    expect(proof.locator(".proof-why")).to_contain_text(steps[0]["why"])
    formula = proof.locator(".proof-formula")
    expect(formula.locator(".katex")).to_have_count(2)
    expect(formula).to_contain_text("为解，令")
    assert "$" not in formula.inner_text()
    with page.expect_response("**/cards/limits/proof"):
        proof.get_by_role("button", name="AI 生成分步推导思路").click()
    page.get_by_role("tab", name="练习与复盘").click()
    selection = page.get_by_role("combobox", name="选择练习题")
    expect(selection).to_have_value(catalog["exercises"][0]["code"])
    page.get_by_role("button", name="+ AI 再出一道题", exact=True).click()
    expect(page.locator(".exercise-question")).to_contain_text("写出第 2 个条件")
    expect(selection).to_have_value(catalog["exercises"][1]["code"])
    page.reload()
    expect(selection).to_have_value(catalog["exercises"][1]["code"])
    selection.select_option(catalog["exercises"][0]["code"])
    expect(page.locator(".exercise-question")).to_contain_text("写出第 1 个条件")

    # Simulate an older extraction with no companion problems, first without a key.
    catalog["exercises"].clear()
    key.update(configured=False, state="unset")
    page.reload()
    generate = page.get_by_role("button", name="AI 生成本卡配套练习题", exact=True)
    expect(generate).to_be_disabled()
    expect(page.locator("#desk-pane-exercises")).to_contain_text("请先在顶部配置本机 Codex、DeepSeek Key 或 OpenAI Key")
    key.update(configured=True, state="ready")
    page.reload()
    generate.click()
    expect(page.locator(".exercise-question")).to_contain_text("写出第 1 个条件")


def test_stop_after_extraction_retains_all_cards(page, server):
    book = {"id": "b", "title": "区间讲义", "page_count": 200, "pages": [
        {"page": i, "char_count": 60, "needs_ocr": False} for i in range(1, 201)]}
    catalog = {"textbooks": [book], "cards": [], "exercises": []}
    pending = []
    page.route("**/local/bootstrap-extras", lambda route: route.fulfill(json=catalog))
    requests = []
    page.route("**/local/cards/*/*", lambda route: requests.append(route.request.url))

    def extract(route):
        pending.append(route)
        assert route.request.post_data_json == {"page_start": 1, "page_end": 10}
        catalog["cards"] = [
            {"id": str(i), "title": title, "definition": title, "theorem": "", "conditions": [], "proof": [],
             "textbook_id": "b", "page_start": 1, "page_end": 9}
            for i, title in enumerate(["开区间", "闭区间"])
        ]

    page.route("**/extract-cards", extract)
    page.goto(server.url + "/#shelf/books")
    shelf = page.get_by_role("article", name=book["title"])
    shelf.get_by_role("button", name="选整本书").click()
    with page.expect_request("**/extract-cards"):
        shelf.get_by_role("button", name="快速建书").click()
    expect(shelf.get_by_role("status")).to_contain_text("第 1–10 / 200 页")
    nav = page.get_by_role("navigation", name="主导航")
    nav.get_by_role("button", name="学习书桌").click()
    nav.get_by_role("button", name="书架与笔记").click()
    expect(shelf.get_by_role("status")).to_contain_text("第 1–10 / 200 页")
    shelf.get_by_role("button", name="停止后续生成").click()
    pending[0].fulfill(status=201, json={"cards": catalog["cards"]})
    expect(shelf.get_by_role("status")).to_contain_text("已生成 2 张学习卡片 · 已停止后续生成")
    expect(shelf.get_by_role("alert")).to_have_count(0)
    shelf.get_by_role("button", name="接续未提页码").click()
    expect(shelf.get_by_label("起始页")).to_have_value("10")
    expect(shelf.get_by_label("结束页")).to_have_value("200")
    assert requests == []
    assert len(pending) == 1
    shelf.get_by_role("button", name="查看学习卡片").click()
    expect(page.get_by_role("combobox", name="选择章节知识点").locator("option")).to_have_text(["开区间", "闭区间"])
