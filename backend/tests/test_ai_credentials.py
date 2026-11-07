from __future__ import annotations

from app.adapters.llm import LLMResult
from app.db import get_session
from app.models import UserAICredential


def _headers(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_user_can_save_use_and_remove_own_deepseek_key(
    client, app, monkeypatch
):
    headers = _headers(client)
    before = client.get("/api/v1/ai/status", headers=headers).get_json()
    assert before["using_user_key"] is False

    saved = client.put(
        "/api/v1/ai/credentials",
        headers=headers,
        json={"api_key": "sk-test-user-key-1234567890", "model": "deepseek-chat"},
    )
    assert saved.status_code == 200, saved.get_json()
    body = saved.get_json()
    assert body["configured"] is True
    assert body["source"] == "user"
    assert body["using_user_key"] is True
    assert body["key_hint"].endswith("7890")
    assert "api_key" not in body
    assert "encrypted_api_key" not in body

    with app.app_context():
        row = get_session().query(UserAICredential).one()
        assert row.encrypted_api_key != "sk-test-user-key-1234567890"
        assert "sk-test" not in row.encrypted_api_key

    captured = {}

    def fake_post(messages, **kwargs):
        captured.update(kwargs)
        return LLMResult(
            text="OK",
            provider="deepseek",
            model="deepseek-chat",
            latency_ms=12,
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    tested = client.post("/api/v1/ai/test", headers=headers, json={})
    assert tested.status_code == 200, tested.get_json()
    assert tested.get_json()["source"] == "user"
    assert tested.get_json()["model"] == "deepseek-chat"
    assert captured["credentials"].api_key == "sk-test-user-key-1234567890"
    assert captured["credentials"].source == "user"

    removed = client.delete("/api/v1/ai/credentials", headers=headers)
    assert removed.status_code == 200
    assert removed.get_json()["using_user_key"] is False


def test_credential_validation_and_user_isolation(client):
    headers = _headers(client)
    bad_prefix = client.put(
        "/api/v1/ai/credentials",
        headers=headers,
        json={"api_key": "not-a-deepseek-key", "model": "deepseek-chat"},
    )
    assert bad_prefix.status_code in {400, 422}
    bad_model = client.put(
        "/api/v1/ai/credentials",
        headers=headers,
        json={"api_key": "sk-test-user-key-1234567890", "model": "gpt-4"},
    )
    assert bad_model.status_code in {400, 422}

    first = client.put(
        "/api/v1/ai/credentials",
        headers=headers,
        json={"api_key": "sk-test-user-key-1234567890", "model": "deepseek-chat"},
    )
    assert first.status_code == 200
    second_headers = {
        "Authorization": "Bearer "
        + client.post(
            "/api/v1/auth/login",
            json={"email": "second@axiom.test", "password": "second-password-2026"},
        ).get_json()["access_token"]
    }
    second = client.get("/api/v1/ai/status", headers=second_headers).get_json()
    assert second["using_user_key"] is False
    assert second["source"] == "system"
