from __future__ import annotations

import io
from copy import deepcopy


def _scene(client, headers):
    return deepcopy(
        client.get("/api/v1/visualizations/templates", headers=headers).get_json()["items"][0][
            "scene"
        ]
    )


def test_admin_invite_lifecycle_and_user_admin(client, admin_headers):
    created = client.post(
        "/api/v1/admin/invites",
        headers=admin_headers,
        json={"role": "student", "note": "给同学", "expires_in_days": 7},
    )
    assert created.status_code == 201
    code = created.get_json()["code"]
    assert code.startswith("AXIOM-")
    listed = client.get("/api/v1/admin/invites", headers=admin_headers).get_json()
    assert any(item["prefix"] == code[:10] for item in listed["items"])
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "invite_code": code,
            "email": "invited@axiom.test",
            "password": "invited-pass-2026",
            "display_name": "受邀学生",
        },
    )
    assert registered.status_code == 201
    users = client.get("/api/v1/admin/users", headers=admin_headers).get_json()
    target = next(item for item in users["items"] if item["email"] == "invited@axiom.test")
    deactivated = client.patch(
        f"/api/v1/admin/users/{target['id']}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "invited@axiom.test", "password": "invited-pass-2026"},
        ).status_code
        == 403
    )


def test_content_authoring_publish_gate_and_revision(client, admin_headers, student_headers):
    draft = client.post(
        "/api/v1/admin/concepts",
        headers=admin_headers,
        json={
            "id": "admin-concept",
            "chapter_id": "ch-4",
            "name": "管理员知识点",
            "definition": "一个待审核的定义。",
            "conditions": [{"text": "条件", "why": "理由"}],
        },
    )
    assert draft.status_code == 201
    blocked = client.post(
        "/api/v1/admin/content/concept/admin-concept/publish",
        headers=admin_headers,
        json={"status": "published"},
    )
    assert blocked.status_code == 422
    proof = client.post(
        "/api/v1/admin/concepts/admin-concept/proofs",
        headers=admin_headers,
        json={"title": "证明", "steps": [{"n": 1, "text": "步骤"}]},
    )
    assert proof.status_code == 201
    published = client.post(
        "/api/v1/admin/content/concept/admin-concept/publish",
        headers=admin_headers,
        json={"status": "published", "note": "审核通过"},
    )
    assert published.status_code == 200
    assert published.get_json()["review_status"] == "reviewed"
    student_view = client.get(
        "/api/v1/concepts/admin-concept", headers=student_headers
    )
    assert student_view.status_code == 200
    revisions = client.get(
        "/api/v1/admin/content/concept/admin-concept/revisions", headers=admin_headers
    ).get_json()
    assert revisions["items"]
    assert revisions["items"][0]["status"] == "published"
    withdrawn = client.post(
        "/api/v1/admin/content/concept/admin-concept/publish",
        headers=admin_headers,
        json={"status": "withdrawn", "note": "撤回"},
    )
    assert withdrawn.status_code == 200
    assert client.get(
        "/api/v1/concepts/admin-concept", headers=student_headers
    ).status_code == 404


def test_exercise_authoring_requires_solution(client, admin_headers):
    no_solution = client.post(
        "/api/v1/admin/exercises",
        headers=admin_headers,
        json={
            "topic_id": "uniform",
            "code": "admin-no-solution",
            "title": "缺解答的题",
            "solution_steps": [],
        },
    )
    assert no_solution.status_code == 201
    blocked = client.post(
        "/api/v1/admin/content/exercise/admin-no-solution/publish",
        headers=admin_headers,
        json={"status": "published"},
    )
    assert blocked.status_code == 422
    good = client.post(
        "/api/v1/admin/exercises",
        headers=admin_headers,
        json={
            "topic_id": "uniform",
            "code": "admin-good",
            "title": "完整题",
            "solution_steps": [{"title": "解", "text": "完整步骤"}],
            "hint": "提示",
            "skill": "条件辨析",
        },
    )
    assert good.status_code == 201
    published = client.post(
        "/api/v1/admin/content/exercise/admin-good/publish",
        headers=admin_headers,
        json={"status": "published"},
    )
    assert published.status_code == 200
    # Publish by code resolves the generated UUID.
    detail = client.get("/api/v1/exercises/admin-good", headers=admin_headers)
    assert detail.status_code == 200


def test_graph_authoring_and_duplicate_edge(client, admin_headers, student_headers):
    node = client.post(
        "/api/v1/admin/graph/nodes",
        headers=admin_headers,
        json={
            "id": "admin-node",
            "name": "管理员节点",
            "kind": "concept",
            "scope": "mvp_core",
            "description": "由管理员添加",
        },
    )
    assert node.status_code == 201
    edge = client.post(
        "/api/v1/admin/graph/edges",
        headers=admin_headers,
        json={
            "from_node_id": "uniform",
            "to_node_id": "admin-node",
            "relation": "prerequisite_for",
            "evidence": "管理员核对",
        },
    )
    assert edge.status_code == 201
    duplicate = client.post(
        "/api/v1/admin/graph/edges",
        headers=admin_headers,
        json={
            "from_node_id": "uniform",
            "to_node_id": "admin-node",
            "relation": "prerequisite_for",
        },
    )
    assert duplicate.status_code == 409
    missing = client.post(
        "/api/v1/admin/graph/edges",
        headers=admin_headers,
        json={
            "from_node_id": "nope",
            "to_node_id": "uniform",
            "relation": "prerequisite_for",
        },
    )
    assert missing.status_code == 404
    graph = client.get("/api/v1/graph", headers=student_headers).get_json()
    assert "admin-node" in {item["id"] for item in graph["nodes"]}


def test_textbook_upload_parse_and_text_import(client, admin_headers, student_headers):
    pdf = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
    uploaded = client.post(
        "/api/v1/admin/textbooks",
        headers=admin_headers,
        data={
            "title": "测试教材",
            "edition": "第 1 版",
            "author": "测试作者",
            "parse": "true",
            "file": (io.BytesIO(pdf), "test.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 201, uploaded.get_json()
    body = uploaded.get_json()
    assert body["asset"]["size_bytes"] == len(pdf)
    assert body["job"]["type"] == "textbook.parse"
    assert body["job"]["status"] == "succeeded"
    assert body["textbook"]["parse_state"] in {"needs_text_import", "needs_review"}
    textbook_id = body["textbook"]["id"]
    assert (
        client.get(
            f"/api/v1/textbooks/{textbook_id}/file", headers=student_headers
        ).status_code
        == 404
    )
    published = client.post(
        f"/api/v1/admin/content/textbook/{textbook_id}/publish",
        headers=admin_headers,
        json={"status": "published", "note": "教材审核通过"},
    )
    assert published.status_code == 200
    readable = client.get(
        f"/api/v1/textbooks/{textbook_id}/file", headers=student_headers
    )
    assert readable.status_code == 200
    assert readable.data.startswith(b"%PDF-")
    slug = body["textbook"]["slug"]
    imported = client.post(
        "/api/v1/admin/import/text",
        headers=admin_headers,
        json={
            "textbook_slug": slug,
            "chapters": [
                {
                    "number": 1,
                    "title": "第一章",
                    "summary": "测试章节",
                    "sections": [
                        {"title": "1.1 测试", "page_start": 1, "page_end": 2, "text": "内容"}
                    ],
                }
            ],
        },
    )
    assert imported.status_code == 200
    assert imported.get_json()["chapters_created"] == 1
    assert imported.get_json()["sections_created"] == 1
    invalid_pdf = client.post(
        "/api/v1/admin/textbooks",
        headers=admin_headers,
        data={"title": "坏文件", "file": (io.BytesIO(b"not a pdf"), "bad.pdf")},
        content_type="multipart/form-data",
    )
    assert invalid_pdf.status_code == 415


def test_ai_plot_interpret_feedback_jobs_and_usage(client, student_headers):
    scene = _scene(client, student_headers)
    plot = client.post(
        "/api/v1/ai/plot",
        headers=student_headers,
        json={"message": "换成 sin(x)", "scene": scene, "history": []},
    )
    assert plot.status_code == 200
    data = plot.get_json()
    assert data["provider"] == "mock"
    assert data["scene"]["curves"][0]["expression"] == "sin(x)"
    assert data["usage"]["latency_ms"] >= 0
    interpret = client.post(
        "/api/v1/ai/interpret",
        headers=student_headers,
        json={"scene": scene, "question": "这张图说明了什么？"},
    )
    assert interpret.status_code == 200
    assert interpret.get_json()["message"]
    assert interpret.get_json()["analysis"]["epsilon_delta"]["proof"] is False
    status = client.get("/api/v1/ai/status", headers=student_headers).get_json()
    assert status["active"] is True
    assert status["daily_calls"] >= 2
    attempt = client.post(
        "/api/v1/attempts",
        headers=student_headers,
        json={"exercise_id": "uniform-2", "answer_text": "任给 ε>0，取 δ=ε，验证结论。"},
    )
    feedback_job = client.post(
        "/api/v1/ai/feedback/" + attempt.get_json()["id"],
        headers=student_headers,
    )
    assert feedback_job.status_code == 202
    job = feedback_job.get_json()["job"]
    assert job["type"] == "attempt.feedback"
    assert job["status"] == "succeeded"
    detail = client.get(
        "/api/v1/attempts/" + attempt.get_json()["id"], headers=student_headers
    ).get_json()
    assert detail["feedback"]["ai"]["needs_review"] is True
    generated = client.post(
        "/api/v1/ai/exercises",
        headers=student_headers,
        json={"topic_id": "uniform", "count": 2},
    )
    assert generated.status_code == 202
    assert generated.get_json()["job"]["status"] == "succeeded"
    usage = client.get("/api/v1/admin/usage", headers=student_headers)
    assert usage.status_code == 403


def test_legacy_ai_contract_and_origin(client, student_headers):
    status = client.get("/api/ai/status")
    assert status.status_code == 200
    assert status.get_json()["configured"] is True
    assert status.get_json()["mode"] == "mock"
    scene = _scene(client, student_headers)
    plot = client.post(
        "/api/ai/plot",
        json={"message": "把 epsilon 调小", "scene": scene, "history": []},
    )
    assert plot.status_code == 200
    body = plot.get_json()
    assert set(body) == {"message", "scene"}
    assert body["scene"]["epsilon"] <= 0.02
    bad_origin = client.post(
        "/api/ai/plot",
        headers={"Origin": "https://evil.example"},
        json={"message": "换成 sin(x)", "scene": scene},
    )
    assert bad_origin.status_code == 403
    good_origin = client.post(
        "/api/ai/plot",
        headers={"Origin": "http://127.0.0.1:5174"},
        json={"message": "换成 sin(x)", "scene": scene},
    )
    assert good_origin.status_code == 200


def test_admin_review_queue_jobs_usage_and_audit(client, admin_headers):
    review = client.get("/api/v1/admin/review-queue", headers=admin_headers)
    assert review.status_code == 200
    assert "counts" in review.get_json()
    usage = client.get("/api/v1/admin/usage", headers=admin_headers)
    assert usage.status_code == 200
    audit = client.get("/api/v1/admin/audit", headers=admin_headers)
    assert audit.status_code == 200
    stats = client.get("/api/v1/admin/stats", headers=admin_headers).get_json()
    assert stats["concepts"] == 8
    assert stats["graph_nodes"] == 20
    jobs = client.get("/api/v1/admin/jobs", headers=admin_headers)
    assert jobs.status_code == 200
