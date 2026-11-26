import re

import pytest
from playwright.sync_api import expect


LEGACY = {
    "dashboard": "dashboard",
    "textbook": "desk/textbook",
    "explore": "desk/explore",
    "examples": "desk/textbook",
    "desk/examples": "desk/textbook",
    "proof": "desk/proof",
    "exercises": "desk/exercises",
    "review": "desk/review",
    "surface": "desk/surface",
    "knowledge-map": "atlas/knowledge-map",
    "practice-map": "atlas/practice-map",
    "diagnostic": "atlas/diagnostic",
    "notes": "shelf/notes",
}


def expect_route(page, destination):
    expect(page).to_have_url(re.compile("#" + re.escape(destination) + "$"))


def choose(page, label):
    button = page.get_by_role("button", name=label, exact=True)
    tab = page.get_by_role("tab", name=label, exact=True)
    button.or_(tab).click()


def test_four_primary_destinations(page, server):
    page.goto(server.url)
    nav = page.get_by_role("navigation", name="主导航")
    controls = nav.locator("button, a")
    expect(controls).to_have_count(4)
    assert [el.get_attribute("aria-label") or el.inner_text()
            for el in controls.all()] == ["学习主页", "学习书桌", "知识星图", "书架与笔记"]
    rail = nav.locator("xpath=ancestor::aside")
    expect(rail).not_to_contain_text("当前课程")
    expect(rail.get_by_role("button", name="个人设置")).to_have_count(0)
    expect(page.locator("body")).not_to_contain_text("服务端掌握度")
    expect(page.locator("body")).not_to_contain_text("服务端作答")


@pytest.mark.parametrize("old,destination", LEGACY.items(), ids=LEGACY)
def test_old_hash_back_forward_and_cold_start(page, server, old, destination):
    # Back must skip the obsolete fragment. Forward must land directly on the new one.
    before = "shelf/notes" if old == "diagnostic" else "atlas/diagnostic"
    page.goto(server.url + "/#" + before)
    expect_route(page, before)
    page.get_by_role("navigation", name="主导航").wait_for()
    page.evaluate("""() => {
        const original = history.replaceState;
        window.replaced = [];
        history.replaceState = function (...args) {
            window.replaced.push(String(args[2]));
            return original.apply(this, args);
        };
    }""")
    page.evaluate("old => { location.hash = old }", old)
    expect_route(page, destination)
    if old != destination:
        replacements = page.evaluate("window.replaced")
        assert sum(url.endswith("#" + destination) for url in replacements) == 1, replacements
    page.go_back()
    expect_route(page, before)
    page.go_forward()
    expect_route(page, destination)
    page.wait_for_function("route => localStorage.getItem('axiom-last-page') === route", arg=destination)

    # Open the bare URL the Windows launcher supplies. Cover old archives and
    # already-migrated storage independently of the hash in the former tab.
    for saved in dict.fromkeys((old, destination)):
        page.evaluate("saved => localStorage.setItem('axiom-last-page', saved)", saved)
        page.goto("about:blank")
        page.goto(server.url)
        expect_route(page, destination)


LEFT = [("证明思路", "proof"), ("练习与复盘", "exercises"),
        ("讲义定义", "textbook")]


def test_left_steps_preserve_plotly_and_surface_scene(page, server):
    page.goto(server.url + "/#desk/textbook")
    plot = page.locator(".fw-plot-canvas")
    expect(plot.locator(".plot-container")).to_be_visible(timeout=15000)
    expression = page.get_by_role("textbox", name="函数 1 表达式")
    study_box = page.locator("#desk-study").bounding_box()
    board_box = page.locator("#desk-board").bounding_box()
    assert study_box["x"] + study_box["width"] <= board_box["x"] + 1
    expression.fill("a*x^2")
    choose(page, "应用公式与范围")
    parameter = page.get_by_role("slider", name="参数 a")
    parameter.press("ArrowRight")
    original_parameter = parameter.input_value()
    plot.evaluate("element => { window.originalPlot = element }")
    for label, pane in LEFT:
        choose(page, label)
        expect_route(page, "desk/" + pane)
        expect(plot.locator(".plot-container")).to_be_visible()
        assert plot.evaluate("element => element === window.originalPlot")
        expect(parameter).to_have_value(original_parameter)
    choose(page, "3D 曲面")
    surface = page.get_by_role("img", name=re.compile("三维曲面"))
    density = page.get_by_role("slider", name=re.compile("网格密度"))
    density.press("ArrowRight")
    original_density = density.input_value()
    surface.evaluate("element => { window.originalSurface = element }")
    for label, pane in LEFT:
        choose(page, label)
        expect_route(page, "desk/" + pane)
        expect(surface).to_be_visible()
        assert surface.evaluate("element => element === window.originalSurface")
        expect(density).to_have_value(original_density)
    choose(page, "收起黑板")
    expect(surface).to_be_hidden()
    choose(page, "展开黑板")
    expect(surface).to_be_visible()
    assert surface.evaluate("element => element === window.originalSurface")


def test_narrow_switch_preserves_unsubmitted_drafts_on_both_sides(page, server):
    page.set_viewport_size({"width": 900, "height": 850})
    page.goto(server.url + "/#desk/exercises")
    draft = page.locator("#desk-pane-exercises textarea").first
    draft.fill("保留未提交的证明，并继续查看图像。")
    switch = page.get_by_role("group", name="书桌视图")
    switch.get_by_role("button", name="黑板", exact=True).click()
    expect(draft).to_be_hidden()
    formula = page.get_by_role("textbox", name="函数 1 表达式", include_hidden=True)
    formula.fill("sin(x)+0.37")
    formula.evaluate("node => { window.narrowFormula = node }")
    switch.get_by_role("button", name="学习内容", exact=True).click()
    expect(formula).to_be_hidden()
    expect(draft).to_have_value("保留未提交的证明，并继续查看图像。")
    switch.get_by_role("button", name="黑板", exact=True).click()
    expect(formula).to_have_value("sin(x)+0.37")
    assert formula.evaluate("node => node === window.narrowFormula")


def test_long_local_conversation_only_scrolls_the_transcript(page, server):
    page.goto(server.url + "/#desk/proof")
    stage = page.locator(".companion-stage")
    canvas = stage.locator("canvas")
    expect(canvas).to_be_visible(timeout=15000)
    canvas.evaluate("element => { window.originalStage = element }")
    field = page.get_by_role("textbox", name="向 Hiyori 提问")
    transcript = page.locator(".companion-transcript")
    transcript.get_by_text(re.compile("本地讲义")).first.wait_for()
    stage_before = stage.bounding_box()
    field_before = field.bounding_box()
    prompt = page.locator(".companion-quick").get_by_text("解释这一步", exact=True)
    for index in range(9):
        prompt.click()
        expect(transcript.locator("article.assistant")).to_have_count(index + 1)
    assert transcript.evaluate("el => el.scrollHeight > el.clientHeight && el.scrollTop > 0")
    transcript.evaluate("el => { el.scrollTop = 0 }")
    assert transcript.evaluate("el => el.scrollTop") == 0
    assert canvas.evaluate("element => element === window.originalStage")
    for item, original in [(stage, stage_before), (field, field_before)]:
        box = item.bounding_box()
        assert abs(box["y"] - original["y"]) <= 2, (original, box)
        assert 0 <= box["y"] < box["y"] + box["height"] <= page.viewport_size["height"]
    expect(page.locator(".companion-dock").get_by_text("待命", exact=True)).to_be_visible()
    symbols = page.locator(".companion-compose").get_by_role("button", name="数学符号", exact=True)
    expect(symbols).to_have_attribute("aria-expanded", "false")
    field.focus()
    expect(symbols).to_have_attribute("aria-expanded", "true")


def test_active_pane_prompts_context_and_queued_actions(page, server):
    # Only the model transport is replaced. The production workspace registry,
    # request construction, action validator, navigation and UI all stay live.
    page.route("**/api/v1/ai/key/status", lambda route: route.fulfill(json={
        "configured": True, "state": "ready", "model": "deepseek-chat"}))
    contexts = []
    def model(route):
        context = route.request.post_data_json["context"]
        contexts.append(context)
        actions = []
        if context["page"] == "textbook":
            actions = [{"type": "highlight_proof_step", "ref": context["concept_id"] + ":1"}]
        elif context["page"] == "explore":
            actions = [{"type": "set_scene_param", "name": "a", "value": 2}]
        route.fulfill(json={"display_markdown": "检验当前步骤", "spoken_text": "检验当前步骤", "actions": actions})
    page.route("**/api/v1/ai/companion", model)
    page.goto(server.url + "/#desk/textbook")
    expect(page.locator(".companion-intro")).to_contain_text("可以问我当前")
    expect(page.locator("#desk-pane-textbook .textbook-page")).to_be_visible()
    prompts = page.locator(".companion-quick")
    def ask(label, active):
        with page.expect_response("**/api/v1/ai/companion"):
            prompts.get_by_text(label, exact=True).click()
        assert contexts[-1]["page"] == active

    ask("解释当前定义", "textbook")
    expect_route(page, "desk/proof")
    proof_ref = contexts[-1]["concept_id"] + ":1"
    expect(page.locator('[aria-current="step"]')).to_have_attribute("data-proof-step-ref", proof_ref)
    ask("解释这一步", "proof")
    assert contexts[-1]["proof"]["current_step"]["ref"] == proof_ref
    assert "steps" not in contexts[-1]["proof"]
    assert contexts[-1]["function_scene"]["mode"]

    choose(page, "练习与复盘")
    draft = page.locator("#desk-pane-exercises textarea").first
    draft.fill("先取任意正数，再选择邻域。")
    ask("给点提示", "exercises")
    assert contexts[-1]["exercise"]["draft_answer"] == draft.input_value()

    choose(page, "2D 函数")
    expression = page.get_by_role("textbox", name="函数 1 表达式")
    expression.fill("a*x^2")
    choose(page, "应用公式与范围")
    ask("解释当前图像", "explore")
    assert contexts[-1]["function_scene"]["active_expression"] == "a*x^2"
    expect(page.get_by_role("slider", name="参数 a")).to_have_value("2")
    choose(page, "3D 曲面")
    expect(page.get_by_role("img", name=re.compile("三维曲面"))).to_be_visible()
    ask("解释当前曲面", "surface")
    assert contexts[-1]["surface_scene"]["expression"]
