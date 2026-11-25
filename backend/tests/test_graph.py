from __future__ import annotations


def test_graph_course_view_and_states(client, student_headers):
    response = client.get("/api/v1/graph", headers=student_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["stats"]["nodes"] == 17
    assert data["stats"]["current_node_id"] == "uniform"
    states = {node["id"]: node["state"] for node in data["nodes"]}
    assert states["uniform"] == "current"
    assert states["continuity"] == "mastered"
    assert states["reciprocal"] == "counterexample"
    assert "extension" not in {node["kind"] for node in data["nodes"]}
    assert data["gaps"]
    assert all(edge["relation"] for edge in data["edges"])


def test_graph_include_extensions_and_relation_filter(client, student_headers):
    expanded = client.get(
        "/api/v1/graph?include_extensions=true", headers=student_headers
    ).get_json()
    assert expanded["stats"]["nodes"] == 20
    assert {node["id"] for node in expanded["nodes"]} >= {"series", "improper", "multi"}
    filtered = client.get(
        "/api/v1/graph?relation=counterexample_to", headers=student_headers
    ).get_json()
    assert filtered["edges"]
    assert all(edge["relation"] == "counterexample_to" for edge in filtered["edges"])


def test_graph_unlocked_only_hides_future_nodes(client, student_headers):
    data = client.get("/api/v1/graph?unlocked_only=true", headers=student_headers).get_json()
    ids = {node["id"] for node in data["nodes"]}
    assert "uniform" in ids
    assert "taylor" not in ids
    assert "mvt" not in ids


def test_node_detail_dependencies_and_gap(client, student_headers):
    response = client.get("/api/v1/graph/nodes/uniform", headers=student_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["name"] == "一致连续"
    assert data["state"] == "current"
    assert data["concept"]["id"] == "uniform"
    incoming = {item["other_id"] for item in data["incoming"]}
    assert {"compact", "reciprocal", "lipschitz"} <= incoming
    assert all("other_mastered" in item for item in data["prerequisites"])
    gap = client.get("/api/v1/graph/gaps", headers=student_headers)
    assert gap.status_code == 200
    assert gap.get_json()["gaps"]


def test_graph_path(client, student_headers):
    response = client.get(
        "/api/v1/graph/path?from_node=real&to_node=uniform", headers=student_headers
    )
    assert response.status_code == 200
    data = response.get_json()
    assert [step["name"] for step in data["steps"]] == [
        "实数完备性",
        "闭区间连续",
        "一致连续",
    ]
    assert all(step["edge"] for step in data["steps"][:-1])
    no_path = client.get(
        "/api/v1/graph/path?from_node=uniform&to_node=real", headers=student_headers
    )
    assert no_path.status_code == 404
    missing = client.get(
        "/api/v1/graph/path?from_node=nope&to_node=uniform", headers=student_headers
    )
    assert missing.status_code == 404
