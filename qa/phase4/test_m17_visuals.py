"""Follow real desk selections and Hiyori batches across independent card editors."""
from playwright.sync_api import expect
from fake_deepseek import DUMMY_KEY
from workstation import bootstrap, drag_pdf, export_zip, restore_into_clean_workstation


def test_builtin_card_boards_independent_memory_pdf_and_reset(page, server):
    page.goto(server.url + "/#desk/textbook")
    cards = page.get_by_role("combobox", name="选择章节知识点")
    field = page.get_by_role("textbox", name="函数 1 表达式")
    cards.select_option("continuous")
    expect(field).to_have_value("2*x + 1")
    field.fill("2*x + 3")
    page.get_by_role("button", name="应用公式与范围").click()
    cards.select_option("riemann")
    diagram = page.get_by_role("tab", name="文字图解", exact=True)
    expect(diagram).to_have_attribute("aria-selected", "true")
    figure = page.locator(".diagram-figure")
    expect(figure).to_contain_text("Darboux")
    page.get_by_role("button", name="Thomae 函数").click()
    expect(figure).to_contain_text("既约分数")
    assert figure.locator('[data-node-id="stems"] circle').count() > 10
    cards.select_option("taylor")
    expect(field).to_have_value("exp(x)")
    cards.select_option("continuous")
    expect(field).to_have_value("2*x + 3")
    cards.select_option("riemann")
    expect(figure).to_contain_text("Thomae")
    page.reload()
    expect(figure).to_contain_text("Thomae")
    page.get_by_role("button", name="重置为本卡默认配图").click()
    expect(figure).to_contain_text("Darboux")
    page.get_by_role("tab", name="课本原文").click()
    cards.select_option("continuous")
    expect(page.get_by_role("tab", name="课本原文")).to_have_attribute("aria-selected", "true")
    page.get_by_role("tab", name="2D 函数").click()
    expect(field).to_have_value("2*x + 3")
    page.get_by_role("button", name="重置为本卡默认配图").click()
    expect(field).to_have_value("2*x + 1")


def test_legacy_card_backfill_companion_reveal_and_single_undo(page, server):
    book = {"id": "b", "title": "实分析", "page_count": 1, "pages": []}
    card = {"id": "old", "title": "图解旧卡", "definition": "抽象构造", "conditions": [], "proof": [],
            "theorem": "", "textbook_id": "b", "page_start": 1, "page_end": 1}
    box = {"xMin": -1, "xMax": 1, "yMin": -2, "yMax": 2}
    point = {"id": "p", "kind": "point", "x": 0, "y": 0, "label": "$x_0$"}
    scene = {"title": "区间内的一点", "caption": "示意邻域。", "version": 1, "viewBox": box, "nodes": [point]}
    key = {"configured": True, "state": "ready", "model": "deepseek-flash"}
    page.route("**/ai/key/status", lambda r: r.fulfill(json=key))
    page.route("**/local/bootstrap-extras", lambda r: r.fulfill(json={"textbooks": [book], "cards": [card], "exercises": []}))

    def backfill(route):
        card["visual"] = {"board": "diagram", "diagramScene": scene}
        route.fulfill(json={"visual": card["visual"]})

    page.route("**/local/cards/old/visual", backfill)
    page.goto(server.url + "/#desk/diagram")
    expect(page.get_by_role("tab", name="文字图解", exact=True)).to_have_attribute("aria-selected", "true")
    page.get_by_role("combobox", name="选择课程或教材").select_option("b")
    page.get_by_role("button", name="AI 生成本卡配套图像").click()
    figure = page.locator(".diagram-figure")
    expect(figure).to_contain_text(scene["title"])
    expect(figure.locator(".katex")).to_be_visible()
    page.get_by_role("tab", name="课本原文").click()
    page.get_by_role("button", name="收起黑板").click()
    actions = [
        {"type": "set_diagram", "scene": dict(scene, title="辅助构造")},
        {"type": "upsert_diagram_node", "node": dict(point, id="q", x=10000, hollow=True)},
        {"type": "remove_diagram_node", "id": "p"},
        {"type": "set_diagram_view", "viewBox": dict(box, yMax=3)},
    ]
    page.route("**/ai/companion", lambda r: r.fulfill(json={"display_markdown": "观察辅助点", "spoken_text": "观察辅助点", "actions": actions}))
    page.get_by_role("textbox", name="向 Hiyori 提问").fill("请绘制辅助图解")
    page.get_by_role("button", name="发送", exact=True).click()
    expect(figure).to_be_visible()
    expect(figure).to_contain_text("辅助构造")
    expect(figure.locator('[data-node-id="q"] circle')).to_have_attribute("cx", "555")
    expect(figure.locator('[data-node-id="p"]')).to_have_count(0)
    undo = page.get_by_role("button", name="撤销修改", exact=True)
    undo.click()
    expect(figure).to_contain_text(scene["title"])
    expect(undo).to_be_disabled()

    page.route("**/ai/local-diagram", lambda r: r.fulfill(json={"scene": dict(scene, title="模型生成的图解")}))
    page.get_by_role("textbox", name="用一句话描述图解").fill("在区间内标出一点")
    page.get_by_role("button", name="生成图解", exact=True).click()
    expect(figure).to_contain_text("模型生成的图解")
    page.reload()
    expect(figure).to_contain_text("模型生成的图解")


def test_imported_card_surface_and_hiyori_diagram_survive_full_archive(page, server, make_pdf, tmp_path):
    card = {"title": "二元函数的图像", "definition": "把每个点映到它的函数高度。", "formula": "z=x*y",
            "conditions": ["定义域为平面"], "theorem": "", "page_start": 1, "page_end": 1}
    diagram = {"version": 1, "title": "水平截面", "caption": "取高度为零的截面。",
               "viewBox": {"xMin": -2, "xMax": 2, "yMin": -2, "yMax": 2},
               "nodes": [{"id": "axis", "kind": "segment", "from": [-2, 0], "to": [2, 0], "arrow": True}]}
    question = "请画出水平截面的概念图"
    server.use_mock_deepseek([
        {"contains": ["根据提供的教材原文生成中文知识卡片"], "reply": {"cards": [card]}},
        {"contains": ["选择一种教学配图"], "reply": {"board": "surface", "surfaceScene": {"expression": "x*y"}}},
        {"question": question, "reply": {"display_markdown": "观察高度为零时的截面。", "spoken_text": "观察截面。",
                                       "actions": [{"type": "set_diagram", "scene": diagram}]}},
    ])
    assert page.request.put(server.url + "/api/v1/ai/key", data={"api_key": DUMMY_KEY, "model": "deepseek-flash"}).ok
    # A failed enrichment must not block the subsequent visual step.
    page.route("**/api/v1/local/cards/*/proof", lambda r: r.fulfill(status=502))
    page.route("**/api/v1/local/cards/*/exercises", lambda r: r.fulfill(status=502))
    page.goto(server.url + "/#shelf/books")
    book = drag_pdf(page, make_pdf(["Consider the graph of the real surface z = x times y."]))
    entry = page.get_by_role("article", name=book["title"])
    entry.get_by_role("button", name="生成学习卡片").click()
    expect(entry.get_by_role("status")).to_contain_text("已生成 1 张学习卡片")
    saved = bootstrap(page, server)["cards"][0]
    assert saved["visual"]["surfaceScene"]["expression"] == "x*y"
    entry.get_by_role("button", name="查看学习卡片").click()
    expect(page.get_by_role("tab", name="3D 曲面")).to_have_attribute("aria-selected", "true")
    expect(page.locator("#surface-expression")).to_have_value("x*y")
    page.get_by_role("textbox", name="向 Hiyori 提问").fill(question)
    page.get_by_role("button", name="发送", exact=True).click()
    expect(page.locator(".diagram-figure")).to_contain_text(diagram["title"])
    archive = tmp_path / "visuals.zip"
    export_zip(page, server, archive)
    restore_into_clean_workstation(page, server, archive)
    expect(page.get_by_role("button", name="导出学习存档")).to_be_visible()
    assert bootstrap(page, server)["cards"][0]["visual"] == saved["visual"]
    page.goto(server.url + "/#desk/diagram")
    expect(page.locator(".diagram-figure")).to_contain_text(diagram["title"])
    page.get_by_role("button", name="重置为本卡默认配图").click()
    expect(page.locator("#surface-expression")).to_have_value("x*y")
