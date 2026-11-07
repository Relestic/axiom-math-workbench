from __future__ import annotations

from copy import deepcopy


def _scene(client, headers):
    templates = client.get(
        "/api/v1/visualizations/templates", headers=headers
    ).get_json()["items"]
    return templates, deepcopy(templates[0]["scene"])


def test_templates_and_3d_metadata(client, student_headers):
    response = client.get("/api/v1/visualizations/templates", headers=student_headers)
    assert response.status_code == 200
    items = response.get_json()["items"]
    assert len(items) == 8
    surface = next(item for item in items if item["slug"] == "surface-3d")
    assert surface["meta"]["dimension"] == "3d"
    assert surface["meta"]["surface"] == "x^2 + y^2"
    detail = client.get(
        "/api/v1/visualizations/templates/eps-delta-square", headers=student_headers
    )
    assert detail.status_code == 200
    assert detail.get_json()["proof_step_ref"].startswith("proof-heine-cantor")


def test_scene_validation_and_parameter_inference(client, student_headers):
    _, scene = _scene(client, student_headers)
    scene["curves"][0]["expression"] = "sin(a*x)"
    response = client.post(
        "/api/v1/visualizations/validate",
        headers=student_headers,
        json={"scene": scene},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["analysis"]["derivative"]
    assert any(parameter["name"] == "a" for parameter in data["scene"]["parameters"])
    assert data["numeric_only"] is True
    bad_expression = deepcopy(scene)
    bad_expression["curves"][0]["expression"] = "__import__('os')"
    rejected = client.post(
        "/api/v1/visualizations/validate",
        headers=student_headers,
        json={"scene": bad_expression},
    )
    assert rejected.status_code == 422
    bad_range = deepcopy(scene)
    bad_range["xMax"] = bad_range["xMin"]
    assert (
        client.post(
            "/api/v1/visualizations/validate",
            headers=student_headers,
            json={"scene": bad_range},
        ).status_code
        == 422
    )


def test_server_analysis_is_explicitly_numeric(client, student_headers):
    response = client.get(
        "/api/v1/visualizations/analyze?expression=x^2&x0=0.6&epsilon=0.08&delta=0.06&x_min=0&x_max=1",
        headers=student_headers,
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["derivative"] == "2*x"
    assert data["epsilon_delta"]["status"] == "passed_numeric"
    assert data["epsilon_delta"]["proof"] is False
    assert data["slope_envelope"]["max_abs_derivative_numeric"] > 1
    assert data["taylor"]["available"] is True
    assert data["riemann"]["proof"] is False
    assert "不构成" in data["disclaimer"]
    invalid = client.get(
        "/api/v1/visualizations/analyze?expression=1/x&x0=0&x_min=-1&x_max=1",
        headers=student_headers,
    )
    assert invalid.status_code == 200
    assert invalid.get_json()["epsilon_delta"]["status"] != "passed_numeric"


def test_scene_versioning_conflict_undo_and_observations(client, student_headers):
    templates, scene = _scene(client, student_headers)
    created = client.post(
        "/api/v1/visualizations/scenes",
        headers=student_headers,
        json={"title": "ε–δ 场景", "template_slug": templates[0]["slug"], "scene": scene},
    )
    assert created.status_code == 201
    scene_id = created.get_json()["id"]
    assert created.get_json()["version"] == 1
    updated_scene = deepcopy(scene)
    updated_scene["epsilon"] = 0.02
    updated = client.patch(
        f"/api/v1/visualizations/scenes/{scene_id}",
        headers=student_headers,
        json={"scene": updated_scene, "expected_version": 1},
    )
    assert updated.status_code == 200
    assert updated.get_json()["version"] == 2
    assert updated.get_json()["scene"]["epsilon"] == 0.02
    stale = client.patch(
        f"/api/v1/visualizations/scenes/{scene_id}",
        headers=student_headers,
        json={"scene": scene, "expected_version": 1},
    )
    assert stale.status_code == 409
    assert stale.get_json()["error"]["details"]["current_version"] == 2
    undone = client.post(
        f"/api/v1/visualizations/scenes/{scene_id}/undo", headers=student_headers
    )
    assert undone.status_code == 200
    assert undone.get_json()["restored_from"] == 1
    assert undone.get_json()["version"] == 3
    observation = client.post(
        f"/api/v1/visualizations/scenes/{scene_id}/observations",
        headers=student_headers,
        json={"text": "δ 缩小后余量变少", "tags": ["delta"]},
    )
    assert observation.status_code == 201
    listed = client.get(
        f"/api/v1/visualizations/scenes/{scene_id}/observations",
        headers=student_headers,
    ).get_json()
    assert listed["total"] == 1
    detail = client.get(
        f"/api/v1/visualizations/scenes/{scene_id}", headers=student_headers
    ).get_json()
    assert len(detail["versions"]) == 3


def test_create_scene_from_template_without_scene_body(client, student_headers):
    created = client.post(
        "/api/v1/visualizations/scenes",
        headers=student_headers,
        json={"title": "模板场景", "template_slug": "taylor-exp"},
    )
    assert created.status_code == 201
    assert created.get_json()["scene"]["curves"][0]["expression"] == "exp(x)"
    missing = client.post(
        "/api/v1/visualizations/scenes",
        headers=student_headers,
        json={"title": "空场景"},
    )
    assert missing.status_code == 422


def test_scene_ownership_is_enforced(
    client, student_headers, second_headers
):
    templates, scene = _scene(client, student_headers)
    created = client.post(
        "/api/v1/visualizations/scenes",
        headers=student_headers,
        json={"title": "私有场景", "scene": scene},
    )
    scene_id = created.get_json()["id"]
    assert (
        client.get(
            f"/api/v1/visualizations/scenes/{scene_id}", headers=second_headers
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/visualizations/scenes/{scene_id}",
            headers=second_headers,
            json={"scene": scene},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/v1/visualizations/scenes/{scene_id}", headers=second_headers
        ).status_code
        == 404
    )
