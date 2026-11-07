from __future__ import annotations

import pytest
from sqlalchemy import select

from app.db import session_scope
from app.models import Invite, RefreshToken, User


def test_error_envelope_and_malformed_json(client, student_headers):
    bad = client.post(
        "/api/v1/notes",
        headers={**student_headers, "Content-Type": "application/json"},
        data="{not json",
    )
    assert bad.status_code == 400
    body = bad.get_json()
    assert body["error"]["code"] == "invalid_json"
    assert body["request_id"]
    unsupported = client.post(
        "/api/v1/notes",
        headers={**student_headers, "Content-Type": "text/plain"},
        data="hello",
    )
    assert unsupported.status_code == 415
    extra = client.post(
        "/api/v1/notes",
        headers=student_headers,
        json={"text": "笔记", "unexpected": True},
    )
    assert extra.status_code == 422
    assert extra.get_json()["error"]["details"]


def test_sql_injection_like_input_is_treated_as_text(client, student_headers):
    response = client.get(
        "/api/v1/search?q=%27%20OR%201%3D1%20--", headers=student_headers
    )
    assert response.status_code == 200
    assert response.get_json()["items"] == []


def test_secrets_are_hashed_at_rest(app, client, student_headers):
    with app.app_context():
        with session_scope() as session:
            user = session.scalar(select(User).where(User.email == "demo@axiom.local"))
            assert user.password_hash != "axiom-demo-2026"
            assert "scrypt" in user.password_hash or "pbkdf2" in user.password_hash
            refresh = session.scalar(select(RefreshToken).limit(1))
            assert refresh is not None
            assert len(refresh.token_hash) == 64
            invite = session.scalar(select(Invite).limit(1))
            assert invite is not None
            assert len(invite.code_hash) == 64
            assert "AXIOM-TEST-INVITE" not in invite.code_hash


def test_tampered_token_rejected(client, student_headers):
    token = student_headers["Authorization"].split(" ", 1)[1]
    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    response = client.get(
        "/api/v1/catalog", headers={"Authorization": "Bearer " + tampered}
    )
    assert response.status_code == 401


def test_idor_notes_and_attempts(client, student_headers, second_headers):
    note = client.post(
        "/api/v1/notes", headers=student_headers, json={"text": "私有笔记"}
    ).get_json()
    assert (
        client.get(f"/api/v1/notes/{note['id']}", headers=second_headers).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/notes/{note['id']}", headers=second_headers, json={"text": "改"}
        ).status_code
        == 404
    )


def test_unpublished_content_not_searchable_for_students(
    client, admin_headers, student_headers
):
    client.post(
        "/api/v1/admin/concepts",
        headers=admin_headers,
        json={
            "id": "secret-draft",
            "chapter_id": "ch-4",
            "name": "秘密草稿知识点",
            "definition": "尚未发布",
        },
    )
    student_search = client.get(
        "/api/v1/search?q=秘密草稿", headers=student_headers
    ).get_json()
    assert all(item["id"] != "secret-draft" for item in student_search["items"])
    admin_search = client.get("/api/v1/search?q=秘密草稿", headers=admin_headers).get_json()
    assert any(item["id"] == "secret-draft" for item in admin_search["items"])


def test_scene_rejects_code_in_expression(client, student_headers):
    templates = client.get(
        "/api/v1/visualizations/templates", headers=student_headers
    ).get_json()["items"]
    scene = templates[0]["scene"]
    scene["curves"][0]["expression"] = "x; import os"
    response = client.post(
        "/api/v1/visualizations/validate",
        headers=student_headers,
        json={"scene": scene},
    )
    assert response.status_code == 422
    assert "error" in response.get_json()


def test_request_id_header_is_validated(client):
    response = client.get("/api/health", headers={"X-Request-ID": "<script>"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "<script>"
    assert len(response.headers["X-Request-ID"]) == 32


def test_production_requires_real_secrets():
    from app.config import load_config

    with pytest.raises(RuntimeError):
        load_config(
            {
                "env": "production",
                "secret_key": "short",
                "admin_password": "short",
            }
        )
    with pytest.raises(RuntimeError):
        load_config(
            {
                "env": "production",
                "secret_key": "x" * 40,
                "admin_password": "axiom-admin-2026",
            }
        )
    strong = load_config(
        {
            "env": "production",
            "secret_key": "s" * 48,
            "admin_password": "a-long-production-password",
        }
    )
    assert strong.is_production


def test_admin_cannot_be_reached_by_anonymous(client):
    assert client.get("/api/v1/admin/jobs").status_code == 401
    assert client.post("/api/v1/admin/concepts", json={}).status_code == 401
