import json

import httpx
import pytest

from app.adapters import llm, local_key
from app.api.companion import parse_answer


BOX = {"xMin": -1, "xMax": 1, "yMin": -1, "yMax": 1}
POINT = {"id": "p", "kind": "point", "x": 0.2, "y": 0}
SCENE = {"version": 1, "title": "邻域", "caption": "取区间内一点。", "viewBox": BOX, "nodes": [POINT]}


def test_local_diagram_checks_model_output_and_uses_personal_settings(app, client, monkeypatch):
    app.config["AXIOM"].local_mode = True
    path = "/api/v1/ai/local-diagram"
    assert client.post(path, json={"message": "邻域"}).status_code == 503
    monkeypatch.setattr(local_key, "_windows_dpapi", lambda raw, *, protect: raw)
    assert client.put("/api/v1/ai/key", json={"api_key": "local-diagram-test", "model": "deepseek-flash"}).status_code == 200
    output = dict(SCENE)

    def model(url, **options):
        assert options["json"]["thinking"] == {"type": "disabled"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(output)}}]})

    monkeypatch.setattr(llm.httpx, "post", model)
    response = client.post(path, json={"message": "画出邻域"})
    assert response.status_code == 200 and response.json["scene"]["title"] == SCENE["title"]
    output["nodes"] = [dict(POINT, kind="image", href="https://example.com/")]
    assert client.post(path, json={"message": "画出邻域"}).status_code == 502
    assert client.post(path, json={"message": "邻域"}, headers={"Via": "proxy"}).status_code == 403


@pytest.mark.parametrize("invalid", [
    {"type": "set_diagram", "scene": dict(SCENE, nodes=[])},
    {"type": "set_diagram", "scene": dict(SCENE, nodes=[dict(POINT, id=str(i)) for i in range(17)])},
    {"type": "set_diagram", "scene": dict(SCENE, nodes=[POINT, POINT])},
    {"type": "upsert_diagram_node", "node": dict(POINT, tone="url(foo)")},
    {"type": "remove_diagram_node", "id": "x/y"},
    {"type": "set_diagram_view", "viewBox": dict(BOX, xMax=-2)},
])
def test_companion_keeps_valid_diagram_actions_in_order(invalid):
    actions = [{"type": "set_diagram", "scene": SCENE}, {"type": "upsert_diagram_node", "node": POINT},
               {"type": "set_diagram_view", "viewBox": BOX}, {"type": "remove_diagram_node", "id": "p"}]
    answer = parse_answer(json.dumps({"display_markdown": "观察邻域", "actions": [invalid, *actions]}))
    assert answer["actions"] == actions and [d["index"] for d in answer["dropped"]] == [0]
