import json

import httpx
import pytest

from app.adapters import llm
from app.api.companion import parse_answer, spoken_math


@pytest.mark.parametrize("text,expected", [
    (r"\forall\varepsilon>0", "对于任意大于零的伊普西隆"),
    ("∃δ>0", "存在大于零的德尔塔"),
    (r"\int_{a}^{b} f(x)", "从 a 到 b 的积分 f(x)"),
    (r"\frac{1}{2}", "（2）分之（1）"),
])
def test_spoken_math(text, expected):
    assert spoken_math(text) == expected


def test_companion_uses_personal_proxy_and_validates_reply(app, client, monkeypatch):
    app.config["AXIOM"].local_mode = True
    question = {"question":"解释这一步", "context":{"page":"proof","concept_id":"uniform"}}
    assert client.post("/api/v1/ai/companion", json=question).status_code == 503
    assert client.put("/api/v1/ai/key", json={"api_key":"test-local-companion", "model":"deepseek-flash"}).status_code == 200
    answer = {"display_markdown":r"固定 $\forall\varepsilon>0$。", "spoken_text":"∀ε>0",
              "actions":[{"type":"highlight_proof_step","ref":"uniform:1"}, {"type":"unsupported"}]}
    captured = []

    def fixture(url, **kwargs):
        captured.append(kwargs["json"])
        return httpx.Response(200, json={"choices":[{"message":{"content":json.dumps(answer)}}]})

    monkeypatch.setattr(llm.httpx, "post", fixture)
    response = client.post("/api/v1/ai/companion", json=question)
    assert response.status_code == 200
    assert response.json == {**answer, "spoken_text":"对于任意大于零的伊普西隆","actions":answer["actions"][:1],
                             "dropped":[{"index":1, "type":"unsupported", "reason":"不支持的操作类型"}]}
    assert captured[0]["response_format"] == {"type":"json_object"}
    assert json.loads(captured[0]["messages"][-1]["content"]) == question
    answer["display_markdown"] = ""
    malformed = client.post("/api/v1/ai/companion", json=question)
    assert malformed.status_code == 502
    assert malformed.json["error"]["code"] == "companion_format"

    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(llm.httpx, "post", unavailable)
    offline = client.post("/api/v1/ai/companion", json=question)
    assert offline.status_code == 502
    assert offline.json["error"]["code"] == "upstream_error"
    assert client.post("/api/v1/ai/companion", json={**question, "context":{"text":"数" * 22000}}).status_code == 422


@pytest.mark.parametrize("action", [
    {"type":"set_curve", "expression":"-x", "label":"左段", "domainMax":0, "rightOpen":True},
    {"type":"add_curve", "expression":"x", "id":"g", "domainMin":0, "leftOpen":False},
    {"type":"remove_curve", "id":"g"},
    {"type":"clear_comparison_curves"},
    {"type":"set_range", "xMin":-2, "yMax":4},
    {"type":"set_mode", "mode":"derivative"},
    {"type":"set_parameter_range", "name":"z", "value":0, "min":-3, "max":3},
    {"type":"set_surface_expression", "expression":"sin(x)*cos(y)"},
    {"type":"set_surface_range", "yMin":-5, "yMax":5},
    {"type":"set_surface_view", "azimuth":60, "elevation":25, "heightScale":1.5},
    {"type":"set_scene_param", "name":"x0", "value":0},
])
def test_companion_preserves_valid_partial_action_fields(action):
    answer = parse_answer(json.dumps({"display_markdown":"讲解", "actions":[action]}))
    assert answer["actions"] == [action]


@pytest.mark.parametrize("invalid", [
    {"type":"set_scene", "scene":{}},
    {"type":"add_curve", "expression":"x", "rightOpen":1},
    {"type":"clear_comparison_curves", "all":True},
    {"type":"set_range", "xMin":"-4px"},
    {"type":"set_range", "yMax":float("inf")},
    {"type":"set_mode", "mode":"surface"},
    *[{"type":"set_parameter_range", "name":name, "value":1, "min":0, "max":2}
      for name in ("x", "y", "e", "A", "aa")],
    {"type":"set_surface_expression", "expression":"s"*301},
    {"type":"set_surface_view", "zoom":1},
])
def test_companion_discards_only_the_invalid_action(invalid):
    action = {"type":"set_curve", "expression":"x"}
    answer = parse_answer(json.dumps({"display_markdown":"讲解", "actions":[invalid,action]}))
    assert answer["actions"] == [action]
    [drop] = answer["dropped"]
    assert (drop["index"], drop["type"]) == (0, invalid["type"])
    assert any("\u4e00" <= char <= "\u9fff" for char in drop["reason"])


def test_companion_normalizes_typed_fields_and_reports_empty_patches_in_original_order():
    inputs = [
        {"type":"set_range", "xMin":None, "yMax":" +.5e1 "},
        {"type":"set_surface_range", "yMin":None},
        {"type":"set_curve", "id":"007", "label":None, "expression":"2", "leftOpen":"true", "rightOpen":"false"},
        {"type":"set_range"},
        None,
    ]
    reply = parse_answer(json.dumps({"display_markdown":"观察常函数", "actions":inputs}))
    assert reply["actions"] == [
        {"type":"set_range", "yMax":5.0},
        {"type":"set_curve", "id":"007", "expression":"2", "leftOpen":True, "rightOpen":False},
    ]
    assert [item["index"] for item in reply["dropped"]] == [1, 3, 4]
    assert all("边界" in item["reason"] for item in reply["dropped"][:2])
    assert reply["spoken_text"] == "观察常函数"
