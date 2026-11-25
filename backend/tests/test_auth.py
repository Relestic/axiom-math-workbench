from __future__ import annotations


def test_demo_console_is_served(client):
    response = client.get("/demo")
    assert response.status_code == 200
    html = response.get_data(as_text=True)
    assert "后端试用台" in html
    assert "/api/v1/auth/login" in html
    assert "/api/v1/catalog" in html
    assert client.get("/api/console").status_code == 200


def test_health_version_and_docs(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.get_json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["ai"]["provider"] == "mock"
    assert client.get("/api/version").status_code == 200
    spec = client.get("/api/openapi.json")
    assert spec.status_code == 200
    payload = spec.get_json()
    assert payload["openapi"].startswith("3.")
    assert "/api/v1/concepts/{concept_id}" in payload["paths"]
    assert "Scene" in payload["components"]["schemas"]
    assert "CurveModel" in payload["components"]["schemas"]
    assert "components/schemas/CurveModel" in str(
        payload["components"]["schemas"]["Scene"]["properties"]
    )
    docs = client.get("/api/docs")
    assert docs.status_code == 200
    assert b"Axiom" in docs.data


def test_login_me_and_update(client, student_headers):
    me = client.get("/api/v1/auth/me", headers=student_headers)
    assert me.status_code == 200
    assert me.get_json()["email"] == "demo@axiom.local"
    assert me.get_json()["role"] == "student"
    updated = client.patch(
        "/api/v1/auth/me",
        headers=student_headers,
        json={"display_name": "新名字", "week": 8, "daily_goal": 5},
    )
    assert updated.status_code == 200
    assert updated.get_json()["display_name"] == "新名字"
    assert updated.get_json()["progress"]["week"] == 8
    assert updated.get_json()["progress"]["daily_goal"] == 5
    bad = client.patch(
        "/api/v1/auth/me", headers=student_headers, json={"week": 99}
    )
    assert bad.status_code == 422


def test_login_failures_are_generic(client):
    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "wrong-password"},
    )
    assert wrong.status_code == 401
    assert "邮箱或密码" in wrong.get_json()["error"]["message"]
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@axiom.local", "password": "wrong-password"},
    )
    assert unknown.status_code == 401


def test_refresh_rotation_and_reuse_detection(client):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    refresh = login.get_json()["refresh_token"]
    rotated = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert rotated.status_code == 200
    new_refresh = rotated.get_json()["refresh_token"]
    assert new_refresh != refresh
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert reused.status_code == 401
    # Reuse revokes the whole rotation family, including the new token.
    after = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert after.status_code == 401


def test_register_with_invite_and_single_use(client):
    payload = {
        "invite_code": "AXIOM-TEST-INVITE",
        "email": "new@axiom.local",
        "password": "new-student-2026",
        "display_name": "新同学",
    }
    created = client.post("/api/v1/auth/register", json=payload)
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["user"]["email"] == "new@axiom.local"
    assert created.get_json()["access_token"]
    reused = client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "another@axiom.local"},
    )
    assert reused.status_code == 403
    duplicate = client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "third@axiom.local", "invite_code": "UNKNOWN"},
    )
    assert duplicate.status_code == 403


def test_password_change_revokes_refresh_tokens(client, student_headers):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    refresh = login.get_json()["refresh_token"]
    changed = client.post(
        "/api/v1/auth/password",
        headers=student_headers,
        json={"current_password": "axiom-demo-2026", "new_password": "brand-new-pass-2026"},
    )
    assert changed.status_code == 200
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code
        == 401
    )
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "brand-new-pass-2026"},
    )
    assert new_login.status_code == 200


def test_student_cannot_use_admin_endpoints(client, student_headers):
    assert client.get("/api/v1/admin/stats", headers=student_headers).status_code == 403
    assert client.get("/api/v1/admin/jobs", headers=student_headers).status_code == 403


def test_missing_and_invalid_token(client):
    missing = client.get("/api/v1/catalog")
    assert missing.status_code == 401
    assert missing.headers.get("WWW-Authenticate") == "Bearer"
    invalid = client.get(
        "/api/v1/catalog", headers={"Authorization": "Bearer not-a-jwt"}
    )
    assert invalid.status_code == 401


def test_logout_does_not_revoke_other_sessions(client):
    first = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    ).get_json()
    second = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    ).get_json()
    logged_out = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {first['access_token']}"},
        json={"refresh_token": first["refresh_token"]},
    )
    assert logged_out.status_code == 200
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
        ).status_code
        == 401
    )
    still_valid = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]}
    )
    assert still_valid.status_code == 200


def test_cors_preflight_and_request_id(client):
    preflight = client.options(
        "/api/v1/catalog",
        headers={
            "Origin": "http://127.0.0.1:5174",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.status_code == 204
    assert preflight.headers["Access-Control-Allow-Origin"] == "http://127.0.0.1:5174"
    health = client.get("/api/health", headers={"X-Request-ID": "req-test-12345"})
    assert health.headers["X-Request-ID"] == "req-test-12345"
    blocked = client.options(
        "/api/v1/catalog",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert blocked.headers.get("Access-Control-Allow-Origin") is None


def test_login_rate_limit(client):
    for _ in range(10):
        client.post(
            "/api/v1/auth/login",
            json={"email": "ratelimit@axiom.local", "password": "wrong-password"},
        )
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": "ratelimit@axiom.local", "password": "wrong-password"},
    )
    assert blocked.status_code == 429
    assert blocked.headers.get("Retry-After")
