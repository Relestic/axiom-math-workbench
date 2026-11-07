from __future__ import annotations


def test_dashboard_and_summary(client, student_headers):
    dashboard = client.get("/api/v1/dashboard", headers=student_headers)
    assert dashboard.status_code == 200
    data = dashboard.get_json()
    assert data["user"]["email"] == "demo@axiom.local"
    assert data["summary"]["practice"]["attempts_total"] == 8
    assert data["summary"]["mastery"]["overall"] > 0
    assert data["summary"]["current"]["concept"]["id"] == "uniform"
    assert data["suggestions"][0]["type"] == "continue"
    summary = client.get("/api/v1/progress/summary", headers=student_headers).get_json()
    assert summary["review"]["count"] >= 1
    assert summary["graph"]["gaps"] >= 0
    assert summary["notice"]


def test_practice_map_reflects_real_aggregates(client, student_headers):
    response = client.get("/api/v1/progress/practice-map", headers=student_headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["totals"]["concepts"] == 8
    assert data["totals"]["cells"] == 40
    assert data["totals"]["covered_cells"] == 8
    assert data["totals"]["blank_cells"] == 32
    assert data["totals"]["exercises"] == 32
    assert len(data["skills"]) == 5
    uniform = next(row for row in data["rows"] if row["topic_id"] == "uniform")
    cell = next(item for item in uniform["cells"] if item["skill"] == "条件辨析")
    assert cell["exercise_count"] == 4
    assert cell["attempt_count"] >= 1
    assert data["recommendations"]
    assert data["blank_cells"]


def test_heatmap_and_review_queue(client, student_headers):
    heatmap = client.get(
        "/api/v1/progress/heatmap?days=30", headers=student_headers
    ).get_json()
    assert len(heatmap["cells"]) == 30
    assert sum(cell["attempts"] for cell in heatmap["cells"]) >= 8
    queue = client.get(
        "/api/v1/progress/review-queue", headers=student_headers
    ).get_json()
    assert queue["total"] >= 1
    assert all(item["recommended_action"] for item in queue["items"])


def test_diagnostic_flow(client, student_headers):
    questions = client.get("/api/v1/diagnostic", headers=student_headers).get_json()
    assert len(questions["questions"]) == 3
    assert all("correct_index" not in item for item in questions["questions"])
    first = client.post(
        "/api/v1/diagnostic",
        headers=student_headers,
        json={"answers": {"0": 0, "1": 1, "2": 2}},
    )
    assert first.status_code == 201
    assert first.get_json()["correct_count"] == 3
    wrong = client.post(
        "/api/v1/diagnostic",
        headers=student_headers,
        json={"answers": {"0": 1, "1": 0, "2": 0}},
    )
    assert wrong.status_code == 201
    assert wrong.get_json()["correct_count"] == 0
    assert wrong.get_json()["recommendations"]
    incomplete = client.post(
        "/api/v1/diagnostic", headers=student_headers, json={"answers": {"0": 0}}
    )
    assert incomplete.status_code == 422


def test_notes_crud_export_and_ownership(client, student_headers, second_headers):
    created = client.post(
        "/api/v1/notes",
        headers=student_headers,
        json={"text": "一致连续的关键是统一 δ。", "concept_id": "uniform", "tags": ["量词"]},
    )
    assert created.status_code == 201
    note_id = created.get_json()["id"]
    listed = client.get("/api/v1/notes?q=统一", headers=student_headers).get_json()
    assert listed["total"] >= 1
    updated = client.patch(
        f"/api/v1/notes/{note_id}",
        headers=student_headers,
        json={"text": "更新后的笔记", "tags": ["复习"]},
    )
    assert updated.status_code == 200
    assert updated.get_json()["text"] == "更新后的笔记"
    assert (
        client.patch(
            f"/api/v1/notes/{note_id}",
            headers=second_headers,
            json={"text": "越权"},
        ).status_code
        == 404
    )
    export = client.get("/api/v1/notes/export", headers=student_headers)
    assert export.status_code == 200
    assert "attachment" in export.headers["Content-Disposition"]
    assert "一致连续" in export.get_data(as_text=True)
    deleted = client.delete(f"/api/v1/notes/{note_id}", headers=student_headers)
    assert deleted.status_code == 200
    assert (
        client.delete(f"/api/v1/notes/{note_id}", headers=student_headers).status_code
        == 404
    )


def test_bookmarks_are_idempotent(client, student_headers, second_headers):
    payload = {"target_type": "concept", "target_id": "uniform"}
    first = client.post("/api/v1/bookmarks", headers=student_headers, json=payload)
    second = client.post("/api/v1/bookmarks", headers=student_headers, json=payload)
    assert first.status_code in {200, 201}
    assert second.status_code == 200
    assert first.get_json()["id"] == second.get_json()["id"]
    listed = client.get("/api/v1/bookmarks", headers=student_headers).get_json()
    assert listed["total"] == 1
    assert (
        client.delete(
            "/api/v1/bookmarks/concept/uniform", headers=second_headers
        ).status_code
        == 404
    )


def test_reports_and_admin_resolution(client, student_headers, admin_headers):
    created = client.post(
        "/api/v1/reports",
        headers=student_headers,
        json={
            "target_type": "exercise",
            "target_id": "uniform-2",
            "kind": "wrong_answer",
            "message": "解答中的 δ 选择似乎少了一个系数，请核对。",
        },
    )
    assert created.status_code == 201
    report_id = created.get_json()["id"]
    mine = client.get("/api/v1/reports", headers=student_headers).get_json()
    assert mine["total"] >= 1
    admin_list = client.get("/api/v1/admin/reports", headers=admin_headers).get_json()
    assert admin_list["total"] >= 1
    resolved = client.patch(
        f"/api/v1/admin/reports/{report_id}",
        headers=admin_headers,
        json={"status": "resolved", "admin_note": "已核对并修订"},
    )
    assert resolved.status_code == 200
    assert resolved.get_json()["status"] == "resolved"
    assert resolved.get_json()["admin_note"] == "已核对并修订"
