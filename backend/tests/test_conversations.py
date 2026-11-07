from __future__ import annotations

from copy import deepcopy


def _setup_scene(client, headers):
    template = client.get(
        "/api/v1/visualizations/templates", headers=headers
    ).get_json()["items"][0]
    scene = deepcopy(template["scene"])
    created = client.post(
        "/api/v1/visualizations/scenes",
        headers=headers,
        json={"title": "对话场景", "scene": scene},
    )
    return created.get_json(), scene


def test_conversation_actions_and_undo(client, student_headers):
    scene_row, scene = _setup_scene(client, student_headers)
    conversation = client.post(
        "/api/v1/visualizations/conversations",
        headers=student_headers,
        json={"title": "学习对话", "scene_id": scene_row["id"]},
    )
    assert conversation.status_code == 201
    conversation_id = conversation.get_json()["id"]
    focus = client.post(
        f"/api/v1/visualizations/conversations/{conversation_id}/actions",
        headers=student_headers,
        json={"action": "focus_concept", "params": {"concept_id": "uniform"}},
    )
    assert focus.status_code == 200
    assert focus.get_json()["result"]["id"] == "uniform"
    source = client.post(
        f"/api/v1/visualizations/conversations/{conversation_id}/actions",
        headers=student_headers,
        json={"action": "open_source", "params": {"concept_id": "uniform"}},
    )
    assert source.status_code == 200
    assert source.get_json()["result"]["page_start"] == 128
    relations = client.post(
        f"/api/v1/visualizations/conversations/{conversation_id}/actions",
        headers=student_headers,
        json={"action": "expand_relations", "params": {"node_id": "uniform"}},
    )
    assert relations.status_code == 200
    new_scene = deepcopy(scene)
    new_scene["epsilon"] = 0.02
    updated = client.post(
        f"/api/v1/visualizations/conversations/{conversation_id}/actions",
        headers=student_headers,
        json={
            "action": "update_visualization",
            "params": {"scene_id": scene_row["id"], "scene": new_scene, "expected_version": 1},
        },
    )
    assert updated.status_code == 200
    assert updated.get_json()["state_version"] == 2
    undone = client.post(
        f"/api/v1/visualizations/conversations/{conversation_id}/actions",
        headers=student_headers,
        json={"action": "undo_action", "params": {"scene_id": scene_row["id"]}},
    )
    assert undone.status_code == 200
    assert undone.get_json()["result"]["restored_from"] == 1
    detail = client.get(
        f"/api/v1/visualizations/conversations/{conversation_id}",
        headers=student_headers,
    ).get_json()
    assert len(detail["messages"]) == 5
    invalid = client.post(
        f"/api/v1/visualizations/conversations/{conversation_id}/actions",
        headers=student_headers,
        json={"action": "arbitrary_code", "params": {}},
    )
    assert invalid.status_code == 422


def test_conversation_ownership(client, student_headers, second_headers):
    scene_row, _scene = _setup_scene(client, student_headers)
    conversation = client.post(
        "/api/v1/visualizations/conversations",
        headers=student_headers,
        json={"title": "私有对话", "scene_id": scene_row["id"]},
    ).get_json()
    assert (
        client.get(
            f"/api/v1/visualizations/conversations/{conversation['id']}",
            headers=second_headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/visualizations/conversations/{conversation['id']}/actions",
            headers=second_headers,
            json={"action": "focus_concept", "params": {"concept_id": "uniform"}},
        ).status_code
        == 404
    )
