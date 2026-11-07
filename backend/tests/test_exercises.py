from __future__ import annotations


def test_exercise_list_and_filters(client, student_headers):
    response = client.get("/api/v1/exercises", headers=student_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["total"] == 32
    assert len(data["items"]) == 20
    uniform = client.get(
        "/api/v1/exercises?topic=uniform", headers=student_headers
    ).get_json()
    assert uniform["total"] == 4
    assert {item["skill"] for item in uniform["items"]} == {"条件辨析"}
    alias = client.get(
        "/api/v1/exercises?topic=taylor&skill=综合迁移", headers=student_headers
    ).get_json()
    assert alias["total"] == 4
    hard = client.get(
        "/api/v1/exercises?difficulty=4", headers=student_headers
    ).get_json()
    assert all(item["difficulty"] == 4 for item in hard["items"])


def test_exercise_detail_hint_and_solution(client, student_headers):
    detail = client.get("/api/v1/exercises/uniform-2", headers=student_headers)
    assert detail.status_code == 200
    assert "solution_steps" not in detail.get_json()
    assert detail.get_json()["hint"]
    assert detail.get_json()["concept"]["id"] == "uniform"
    hint = client.get("/api/v1/exercises/uniform-2/hint", headers=student_headers)
    assert hint.status_code == 200
    assert "δ" in hint.get_json()["hint"]
    solution = client.get("/api/v1/exercises/uniform-2/solution", headers=student_headers)
    assert solution.status_code == 200
    assert len(solution.get_json()["steps"]) == 5
    assert solution.get_json()["notice"].startswith("参考解答")
    assert (
        client.get("/api/v1/exercises/nope", headers=student_headers).status_code == 404
    )


def _answer():
    return (
        "任给 ε>0，取 δ=ε/4。若 |x−y|<δ，则 |x²−y²|≤4|x−y|<ε，"
        "因此函数在 [0,1] 上一致连续。在 ℝ 上取 xₙ=n，yₙ=n+1/n，"
        "函数值差大于 2，所以不一致连续。"
    )


def test_attempt_records_assistance_and_events(client, student_headers):
    client.get("/api/v1/exercises/uniform-3/hint", headers=student_headers)
    client.get("/api/v1/exercises/uniform-3/solution", headers=student_headers)
    response = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={
            "exercise_id": "uniform-3",
            "answer_text": _answer(),
            "hints_used": 0,
            "solution_viewed": False,
        },
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["status"] == "needs_review"
    assert data["assistance"]["hints_used"] == 1
    assert data["assistance"]["solution_viewed"] is True
    assert data["feedback"]["needs_review"] is True
    assert data["feedback"]["uniqueness_note"]
    detail = client.get(f"/api/v1/attempts/{data['id']}", headers=student_headers)
    assert detail.status_code == 200
    event_types = {event["type"] for event in detail.get_json()["events"]}
    assert {"hint_view", "solution_view", "submit"} <= event_types


def test_attempt_idempotency(client, student_headers):
    payload = {
        "exercise_id": "riemann-2",
        "answer_text": _answer(),
        "idempotency_key": "test-key-riemann",
    }
    first = client.post("/api/v1/attempts", headers=student_headers, json=payload)
    second = client.post("/api/v1/attempts", headers=student_headers, json=payload)
    assert first.status_code == second.status_code == 201
    assert first.get_json()["id"] == second.get_json()["id"]
    listed = client.get(
        "/api/v1/attempts?topic=riemann", headers=student_headers
    ).get_json()
    own = [item for item in listed["items"] if item["exercise_id"] == "riemann-2"]
    assert len(own) == 1


def test_symbolic_answer_check_and_rating(client, student_headers):
    response = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={
            "exercise_id": "primitive-2",
            "answer_text": "exp(2*x)*(2*x-1)/4 + C",
        },
    )
    assert response.status_code == 201
    assert response.get_json()["status"] == "auto_checked"
    assert response.get_json()["score"] == 100
    attempt_id = response.get_json()["id"]
    rated = client.patch(
        f"/api/v1/attempts/{attempt_id}",
        headers=student_headers,
        json={"self_rating": "understood"},
    )
    assert rated.status_code == 200
    assert rated.get_json()["self_rating"] == "understood"


def test_attempt_ownership_and_validation(client, student_headers, second_headers):
    submitted = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={"exercise_id": "integral-2", "answer_text": _answer()},
    )
    attempt_id = submitted.get_json()["id"]
    assert (
        client.get(f"/api/v1/attempts/{attempt_id}", headers=second_headers).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/attempts/{attempt_id}",
            headers=second_headers,
            json={"self_rating": "understood"},
        ).status_code
        == 404
    )
    empty = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={"exercise_id": "integral-2", "answer_text": "   "},
    )
    assert empty.status_code == 422


def test_generated_variants_are_idempotent_and_reviewed(client, student_headers):
    response = client.post(
        "/api/v1/exercises/generate",
        headers=student_headers,
        json={"topic_id": "uniform", "skill": "条件辨析", "count": 2},
    )
    assert response.status_code == 201
    data = response.get_json()
    assert data["generation"]["mode"] == "template"
    assert all(item["review_status"] == "auto_checked" for item in data["reused"])
    assert len(data["reused"]) == 2
    again = client.post(
        "/api/v1/exercises/generate",
        headers=student_headers,
        json={"topic_id": "uniform", "count": 2},
    )
    assert again.status_code == 201
    assert again.get_json()["created"] == []
    assert len(again.get_json()["reused"]) == 2
    unknown = client.post(
        "/api/v1/exercises/generate",
        headers=student_headers,
        json={"topic_id": "nope", "count": 1},
    )
    assert unknown.status_code == 404
