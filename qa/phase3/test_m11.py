"""Chrome accepts desk actions through the real portable API and a disposable upstream."""
import json
import re

import pytest
from playwright.sync_api import expect

from fake_deepseek import DUMMY_KEY


COMPANION = "**/api/v1/ai/companion"
FUNCTION = "axiom-function-scene"
SURFACE = "axiom-surface-scene"


def saved(page, key):
    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", key)


def configure(page, server, replies):
    # Only match the current user question. Earlier turns remain in the real
    # upstream history and must not accidentally choose an older fixture.
    rules = [{
        "question": question,
        "reply": {"display_markdown": answer, "spoken_text": answer, "actions": actions},
    } for question, answer, actions in replies]
    server.use_mock_deepseek(rules)
    key = page.request.put(server.url + "/api/v1/ai/key",
                           data={"api_key": DUMMY_KEY, "model": "deepseek-chat"})
    assert key.ok and key.json()["configured"]


def send(page, question):
    page.get_by_role("textbox", name="向 Hiyori 提问").fill(question)
    page.locator(".companion-compose").get_by_role("button", name="发送", exact=True).click()


def ask(page, question, answer):
    with page.expect_response(COMPANION) as event:
        send(page, question)
    response = event.value
    assert response.ok, response.text()
    expect(page.get_by_role("log", name="伴学对话记录")).to_contain_text(answer)
    return response.request.post_data_json["context"]


def lecture(page):
    page.get_by_role("tab", name="讲义定义", exact=True).click()
    expect(page.locator("#desk-pane-textbook .textbook-page")).to_be_visible()


def test_offline_lecture_classics_and_manual_editors(page, server):
    assert not page.request.get(server.url + "/api/v1/ai/key/status").json()["configured"]
    remote_questions = []
    page.on("request", lambda req: remote_questions.append(req.url) if req.url.endswith("/ai/companion") else None)
    page.goto(server.url + "/#desk/textbook")
    expect(page.get_by_role("tablist", name="学习步骤").get_by_role("tab")).to_have_text(
        ["讲义定义", "证明思路", "练习与复盘"])
    field = page.get_by_role("textbox", name="函数 1 表达式")
    field.wait_for()
    lecture(page)
    transcript = page.get_by_role("log", name="伴学对话记录")
    send(page, "解释当前定义")
    expect(transcript.locator("article.assistant").last).to_contain_text("一致连续")
    send(page, "请解释一致连续的经典反例")
    reply = transcript.locator("article.assistant").last
    expect(reply).to_contain_text("Hiyori · 本地讲义")
    expect(reply).to_contain_text("1/x")
    assert remote_questions == []

    initial = saved(page, FUNCTION)
    field.fill("a*x^2")
    page.get_by_role("button", name="应用公式与范围").click()
    slider = page.get_by_role("slider", name="参数 a")
    slider.press("ArrowRight")
    assert saved(page, FUNCTION)["parameters"][0]["value"] > 1
    undo = page.get_by_role("button", name="撤销修改", exact=True)
    undo.click()
    expect(slider).to_have_value("1")
    undo.click()
    assert saved(page, FUNCTION) == initial
    page.get_by_role("tab", name="3D 曲面").click()
    surface = page.locator("#surface-expression")
    original = surface.input_value()
    surface.fill("sin(x)*cos(y)")
    page.get_by_role("button", name="应用曲面").click()
    height = page.get_by_role("slider", name=re.compile("高度缩放"))
    height.press("ArrowRight")
    assert saved(page, SURFACE)["view"]["heightScale"] > 1
    undo_surface = page.get_by_role("button", name="撤销", exact=True)
    undo_surface.click()
    assert saved(page, SURFACE)["view"]["heightScale"] == 1
    expect(surface).to_have_value("sin(x)*cos(y)")
    undo_surface.click()
    expect(surface).to_have_value(original)
    board = page.locator("#desk-board")
    expect(board.locator(".fw-chat, .surface-chat, .surface-composer, .fw-composer")).to_have_count(0)
    expect(board.locator("textarea")).to_have_count(1)


def test_pdf_collapsed_mixed_proof_and_plot_then_one_undo(page, server, capture):
    question = "请标出证明第二步，同时改为正弦函数，在负二到四之间观察导数。"
    answer = "一起看证明第二步和正弦函数的切线。"
    configure(page, server, [(question, answer, [
        {"type": "highlight_proof_step", "ref": "uniform:1"},
        {"type": "set_curve", "expression": "sin(x)"},
        {"type": "set_range", "xMin": -2, "xMax": 4},
        {"type": "set_mode", "mode": "derivative"},
    ])])
    page.goto(server.url + "/#desk/textbook")
    expect(page.locator(".companion-intro")).to_contain_text("可以问")
    plot = page.locator(".fw-plot-canvas .plot-container")
    expect(plot).to_be_visible(timeout=15000)
    before = saved(page, FUNCTION)
    page.get_by_role("tab", name="课本原文").click()
    page.get_by_role("button", name="收起黑板").click()
    lecture(page)
    expect(page.locator("#desk-board")).to_be_hidden()
    context = ask(page, question, answer)
    assert context["page"] == "textbook" and context["lecture"]["conditions"]
    assert context["board"] == {"tab": "pdf", "mounted": False, "collapsed": True}
    assert "function_scene" not in context and "surface_scene" not in context
    expect(page.locator('[aria-current="step"]')).to_have_attribute("data-proof-step-ref", "uniform:1")
    expect(page.get_by_role("tab", name="2D 函数")).to_have_attribute("aria-selected", "true")
    expect(plot).to_be_visible()
    expect(page.get_by_role("textbox", name="函数 1 表达式")).to_have_value("sin(x)")
    scene = saved(page, FUNCTION)
    assert (scene["xMin"], scene["xMax"], scene["mode"]) == (-2, 4, "derivative")
    expect(page.locator(".fw-chart-heading")).to_contain_text("导数与切线")
    capture(page, "m11-2d.png")
    page.get_by_role("button", name="撤销修改", exact=True).click()
    assert saved(page, FUNCTION) == before


def test_joint_context_focus_switch_surface_reveal_and_one_undo(page, server, capture):
    question = "请把曲面改为马鞍并旋转视角。"
    answer = "从新的角度观察马鞍面的两个截面。"
    confirm = "描述讲义和右栏曲面当前的范围。"
    confirm_answer = "两个方向分别向上和向下弯曲。"
    configure(page, server, [(question, answer, [
        {"type": "set_surface_expression", "expression": "x^2-y^2"},
        {"type": "set_surface_range", "xMin": -3, "xMax": 2},
        {"type": "set_surface_view", "azimuth": 73, "elevation": 39, "heightScale": 1.4},
    ]), (confirm, confirm_answer, [])])
    page.goto(server.url + "/#desk/surface")
    page.locator("#surface-expression").fill("sin(x)+cos(y)")
    page.get_by_role("button", name="应用曲面").click()
    before = saved(page, SURFACE)
    # A full reload clears visited panes while preserving the user's manual scene.
    page.goto(server.url + "/#desk/textbook")
    page.reload()
    expect(page.locator("#surface-expression")).to_have_count(0)
    expect(page.locator(".companion-intro")).to_contain_text("可以问")
    fn = page.get_by_role("textbox", name="函数 1 表达式")
    fn.fill("a*x^2")
    page.get_by_role("button", name="应用公式与范围").click()
    function = saved(page, FUNCTION)
    lecture(page)

    # Hold the real POST in Chrome, change focus, then forward the exact request
    # to Flask. No timing assumptions about model latency.
    held = []
    page.route(COMPANION, lambda route: held.append(route), times=1)
    with page.expect_request(COMPANION):
        send(page, question)
    expect(page.get_by_role("button", name="取消提问")).to_be_visible()
    fn.click()
    expect(page.locator(".desk-workbench")).to_have_attribute("data-side", "board")
    expect(page.get_by_role("button", name="取消提问")).to_be_visible()
    with page.expect_response(COMPANION) as event:
        held[0].continue_()
    assert event.value.ok, event.value.text()
    context = event.value.request.post_data_json["context"]
    assert context["page"] == "textbook" and context["lecture"]["conditions"]
    assert context["function_scene"]["active_expression"] == "a*x^2"
    scene = context["function_scene"]
    assert scene["mode"] == function["mode"] and scene["parameters"] == function["parameters"]
    assert scene["range"] == {key: function[key] for key in ("xMin", "xMax", "yMin", "yMax")}
    assert scene["controls"]
    assert scene["curves"] == [{key: curve[key] for key in ("id", "label", "expression", "domainMin", "domainMax")}
                               for curve in function["curves"]]
    assert "available_scene_controls" not in context
    expect(page.get_by_role("log", name="伴学对话记录")).to_contain_text(answer)
    expect(page.get_by_role("tab", name="3D 曲面")).to_have_attribute("aria-selected", "true")
    expect(page.get_by_role("img", name=re.compile("三维曲面"))).to_be_visible()
    changed = saved(page, SURFACE)
    assert changed["expression"] == "x^2-y^2" and (changed["xMin"], changed["xMax"]) == (-3, 2)
    assert changed["view"] == {**before["view"], "azimuth": 73, "elevation": 39, "heightScale": 1.4}
    capture(page, "m11-3d.png")
    lecture(page)
    surface_context = ask(page, confirm, confirm_answer)["surface_scene"]
    assert surface_context == {"expression": changed["expression"], "view": changed["view"],
                               "range": {key: changed[key] for key in ("xMin", "xMax", "yMin", "yMax")}}
    page.get_by_role("button", name="撤销", exact=True).click()
    assert saved(page, SURFACE) == before
    assert len(server.model_requests()) == 2


def test_invalid_batches_keep_the_drawing_and_explain_the_rejection(page, server):
    invalid, too_many, too_narrow = "试画一个无法识别的函数。", "增加四条对比曲线。", "将曲面的范围设在一处。"
    a, b, c = "先检查公式。", "先检查曲线数量。", "先检查区间宽度。"
    configure(page, server, [
        (invalid, a, [{"type": "set_mode", "mode": "integral"},
                      {"type": "set_curve", "expression": "unknownfn(x)"}]),
        (too_many, b, [{"type": "add_curve", "expression": f"x+{i}"} for i in range(1, 5)]),
        (too_narrow, c, [{"type": "set_surface_view", "azimuth": 91},
                         {"type": "set_surface_range", "yMin": 1, "yMax": 1.1}]),
    ])
    page.goto(server.url + "/#desk/textbook")
    expect(page.locator(".companion-intro")).to_contain_text("可以问")
    expect(page.locator(".fw-plot-canvas .plot-container")).to_be_visible(timeout=15000)
    before = saved(page, FUNCTION)
    notice = page.locator(".companion-notice").last
    for question, answer, reason in [(invalid, a, "表达式|公式"), (too_many, b, "4|四")]:
        ask(page, question, answer)
        expect(notice).to_contain_text(re.compile(reason))
        assert re.search(r"[\u4e00-\u9fff]", notice.inner_text())
        assert saved(page, FUNCTION) == before
        expect(page.get_by_role("button", name="撤销修改", exact=True)).to_be_disabled()
    page.get_by_role("tab", name="3D 曲面").click()
    page.locator("#surface-expression").fill("x+y")
    page.get_by_role("button", name="应用曲面").click()
    before = saved(page, SURFACE)
    ask(page, too_narrow, c)
    expect(notice).to_contain_text(re.compile("跨度|区间|范围"))
    assert saved(page, SURFACE) == before


def test_classic_controls_and_hiyori_return_to_the_free_plot(page, server):
    question = "请在黑板上改画余弦函数。"
    answer = "现在可以比较余弦函数和刚才示例的形状。"
    configure(page, server, [(question, answer, [{"type": "set_curve", "expression": "cos(x)"}])])
    page.goto(server.url + "/#desk/explore")
    expect(page.locator(".companion-intro")).to_contain_text("可以问")
    field = page.get_by_role("textbox", name="函数 1 表达式")
    field.fill("x^3")
    page.get_by_role("button", name="应用公式与范围").click()
    original = saved(page, FUNCTION)
    page.get_by_role("button", name="经典教学与三维示例").click()
    epsilon = page.get_by_role("slider", name="ε（输出精度）")
    value = epsilon.input_value()
    expect(page.locator("#desk-board .ex-chat, #desk-board textarea")).to_have_count(0)
    epsilon.press("ArrowRight")
    expect(epsilon).not_to_have_value(value)
    page.locator("#desk-board").get_by_role("button", name=re.compile("撤销")).click()
    expect(epsilon).to_have_value(value)
    ask(page, question, answer)
    expect(field).to_have_value("cos(x)")
    expect(page.locator(".fw-plot-canvas .plot-container")).to_be_visible()
    page.get_by_role("button", name="撤销修改", exact=True).click()
    assert saved(page, FUNCTION) == original


@pytest.mark.parametrize("old,kind", [("examples", "zip"), ("desk/examples", "json")])
def test_imports_removed_page_and_both_legacy_chats(page, server, tmp_path, old, kind):
    chats = {"axiom-function-chat": [{"role": "user", "content": "以前的函数探究"}],
             "axiom-surface-chat": [{"role": "assistant", "content": "以前的曲面解释"}]}
    snapshot = {key: json.dumps(value, ensure_ascii=False) for key, value in chats.items()}
    snapshot["axiom-last-page"] = old
    archive = tmp_path / ("phase2." + kind)
    if kind == "zip":
        result = page.request.post(server.url + "/api/v1/archive/export", data={"storage": snapshot})
        assert result.ok, result.text() if not result.ok else ""
        archive.write_bytes(result.body())
    else:
        archive.write_text(json.dumps({"format": "axiom-learning-browser", "version": 1, "storage": snapshot}),
                           encoding="utf-8")
    page.goto(server.url + "/#shelf/archive")
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator(".learning-archive-settings input[type=file]").set_input_files(archive)
    expect(page).to_have_url(re.compile("#desk/textbook$"))
    expect(page.get_by_role("tab", name="讲义定义")).to_have_attribute("aria-selected", "true")
    page.get_by_role("tab", name="3D 曲面").click()
    expect(page.locator("#surface-expression")).to_be_visible()
    for key, history in chats.items():
        assert saved(page, key) == history
        expect(page.locator("body")).not_to_contain_text(history[0]["content"])
