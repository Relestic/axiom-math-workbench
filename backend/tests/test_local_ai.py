"""Offline integration checks for the personal DeepSeek connection."""

import json
import os
import stat

import httpx
import pytest

from app import create_app
from app.adapters import llm, local_key

ROOT = "/api/v1/ai/key"
FIXTURE_KEY = "sk-m4-fixture-sensitive-token"


@pytest.fixture
def local(tmp_path, monkeypatch):
    monkeypatch.setenv("AXIOM_CODEX_BIN", str(tmp_path / "absent"))
    def start(**overrides):
        return create_app({
            "testing": True,
            "local_mode": True,
            "worker_enabled": False,
            "database_url": f"sqlite:///{tmp_path / 'test.db'}",
            "data_dir": tmp_path,
            **overrides,
        }).test_client()

    return start


def test_status_persistence_model_and_clear(local, tmp_path, caplog):
    client = local()
    assert client.get(f"{ROOT}/status").json == {
        "configured": False, "model": "deepseek-flash", "state": "unset", "codex_detected": False
    }
    assert client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-flash"}).status_code == 200
    status = client.put(ROOT, json={"model": "deepseek-v4-pro"})
    assert status.json == {"configured": True, "model": "deepseek-v4-pro", "state": "ready", "codex_detected": False}
    saved = next(tmp_path.glob("ai-key.*"))
    if os.name == "nt":
        assert FIXTURE_KEY.encode() not in saved.read_bytes()
    else:
        assert stat.S_IMODE(saved.stat().st_mode) == 0o600
    client = local()
    assert client.get(f"{ROOT}/status").json == status.json
    assert client.delete(ROOT).json["state"] == "unset"
    assert not saved.exists()
    assert local().get(f"{ROOT}/status").json["state"] == "unset"
    assert FIXTURE_KEY not in caplog.text


@pytest.mark.parametrize("previous,current", [
    ("deepseek-chat", "deepseek-flash"),
    ("deepseek-reasoner", "deepseek-v4-pro"),
])
def test_saved_legacy_key_is_immediately_usable(local, previous, current, monkeypatch):
    client = local()
    store = client.application.extensions["axiom_local_key"]
    saved = json.dumps({"api_key": FIXTURE_KEY, "model": previous, "revision": "original"}).encode()
    store.path.write_bytes(saved)
    if os.name == "nt":
        # Exercise the persisted JSON contract independently of the Windows profile.
        monkeypatch.setattr(local_key, "_windows_dpapi", lambda data, *, protect: data)
    else:
        store.path.chmod(0o600)

    assert client.get(f"{ROOT}/status").json == {
        "configured": True, "model": current, "state": "ready", "migrated_from": previous, "codex_detected": False,
    }
    assert store.read().revision == "original"
    assert client.get("/api/ai/status").json["json_mode"] is True

    def post(url, **kwargs):
        assert kwargs["json"]["model"] == current
        assert kwargs["headers"]["Authorization"] == f"Bearer {FIXTURE_KEY}"
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

    monkeypatch.setattr(llm.httpx, "post", post)
    assert client.post(f"{ROOT}/test").json == {"ok": True}
    assert client.put(ROOT, json={"model": previous}).status_code == 422
    assert client.put(ROOT, json={"model": current}).json == {
        "configured": True, "model": current, "state": "ready", "codex_detected": False,
    }


@pytest.mark.parametrize("environ,headers", [
    ({"REMOTE_ADDR": "192.0.2.1"}, {}),
    ({}, {"Host": "not-local.test"}),
    ({}, {"Origin": "http://not-local.test"}),
    ({}, {"Origin": "null"}),
    ({}, {"Origin": "http://localhost:15000"}),
    ({}, {"Sec-Fetch-Site": "cross-site"}),
    ({}, {"X-Forwarded-For": "127.0.0.1"}),
    ({}, {"Forwarded": "for=127.0.0.1"}),
])
def test_local_guard(local, environ, headers):
    response = local().get(f"{ROOT}/status", environ_overrides=environ, headers=headers)
    assert response.status_code == 403


def test_explicit_opt_in(local):
    assert local(local_mode=False).get(f"{ROOT}/status").status_code == 404
    assert local(env="production", secret_key="x" * 40, admin_password="y" * 40).get(
        f"{ROOT}/status"
    ).status_code == 404


@pytest.mark.parametrize("upstream,code,status", [
    (401, "invalid_key", 401),
    (402, "insufficient_balance", 402),
    (429, "rate_limited", 429),
    (400, "upstream_error", 502),
    (httpx.ReadTimeout, "timeout", 504),
    (httpx.ConnectError, "network", 502),
])
def test_safe_provider_failure(local, monkeypatch, caplog, upstream, code, status):
    calls = []

    def post(url, **kwargs):
        calls.append(kwargs)
        if isinstance(upstream, type):
            raise upstream(FIXTURE_KEY)
        return httpx.Response(upstream, json={"error": {"message": FIXTURE_KEY}})

    monkeypatch.setattr(llm.httpx, "post", post)
    client = local()
    client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-flash"})
    response = client.post(f"{ROOT}/test")
    assert response.status_code == status
    assert response.json["error"]["code"] == code
    assert len(calls) == 1
    assert FIXTURE_KEY not in response.get_data(as_text=True)
    assert FIXTURE_KEY not in caplog.text
    assert client.get(f"{ROOT}/status").json["state"] == "error"
    assert client.put(ROOT, json={"model": "deepseek-flash"}).json["state"] == "ready"


def test_check_uses_personal_settings_and_returns_only_ok(local, monkeypatch):
    def post(url, **kwargs):
        assert url == "https://api.deepseek.com/chat/completions"
        assert kwargs["headers"]["Authorization"] == f"Bearer {FIXTURE_KEY}"
        assert kwargs["json"]["model"] == "deepseek-v4-pro"
        assert kwargs["json"]["thinking"] == {"type": "disabled"}
        assert "response_format" not in kwargs["json"]
        return httpx.Response(200, json={
            "choices": [{"message": {"content": None, "reasoning_content": "Thinking"}}],
        })

    monkeypatch.setattr(llm.httpx, "post", post)
    client = local(ai_base_url="https://alternate.test", ai_api_key="environment-fixture")
    client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-v4-pro"})
    assert client.post(f"{ROOT}/test").json == {"ok": True}



@pytest.mark.parametrize("endpoint,scene,candidate", [
    (
        "/api/ai/plot",
        {
            "curves": [{"id": "curve", "expression": "x"}], "activeId": "curve",
            "xMin": -2, "xMax": 2, "yMin": -2, "yMax": 2,
        },
        {"curves": [{"id": "curve", "expression": "x^2"}]},
    ),
    (
        "/api/v1/ai/local-surface",
        {
            "expression": "x+y", "xMin": -2, "xMax": 2, "yMin": -2, "yMax": 2,
            "resolution": 16,
            "view": {"azimuth": 45, "elevation": 28, "heightScale": 1, "zoom": 1},
            "display": {"opacity": 0.9, "wireframe": True, "showAxes": True, "palette": "violet"},
        },
        {"expression": "x^2+y^2"},
    ),
])
def test_local_plot_uses_personal_key_and_validates_changes(
    local, monkeypatch, endpoint, scene, candidate,
):
    def post(url, **kwargs):
        assert kwargs["headers"]["Authorization"] == f"Bearer {FIXTURE_KEY}"
        assert kwargs["trust_env"] is False
        assert kwargs["json"]["thinking"] == {"type": "disabled"}
        output = {"message": f"已更新曲线 {FIXTURE_KEY}", "scene": {**scene, **candidate}}
        return httpx.Response(200, json={
            "model": FIXTURE_KEY,
            "choices": [{"message": {"content": json.dumps(output)}}],
        })

    monkeypatch.setattr(llm.httpx, "post", post)
    client = local(ai_provider="mock")
    payload = {"message": "绘制新的函数", "scene": scene}
    assert client.post(endpoint, json=payload).status_code == 503
    client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-flash"})
    response = client.post(endpoint, json=payload)
    assert response.status_code == 200, response.json
    updated = response.json["scene"]
    if "curves" in candidate:
        assert updated["curves"][0]["expression"] == candidate["curves"][0]["expression"]
    else:
        assert updated["expression"] == candidate["expression"]
    assert FIXTURE_KEY not in response.get_data(as_text=True)


def test_corrupt_settings_are_recoverable(local, tmp_path):
    client = local()
    assert client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-flash"}).status_code == 200
    next(tmp_path.glob("ai-key.*")).write_bytes(b"corrupt")
    assert client.get(f"{ROOT}/status").json["state"] == "error"
    assert client.post(f"{ROOT}/test").status_code == 503
    assert client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-v4-pro"}).status_code == 200
    assert client.get(f"{ROOT}/status").json["state"] == "ready"


def test_stale_check_cannot_mark_replacement_key_failed(local, monkeypatch):
    client = local()
    assert client.put(ROOT, json={"api_key": FIXTURE_KEY, "model": "deepseek-flash"}).status_code == 200

    def post(*args, **kwargs):
        assert client.put(ROOT, json={"api_key": "sk-replacement-key", "model": "deepseek-flash"}).status_code == 200
        return httpx.Response(401)

    monkeypatch.setattr(llm.httpx, "post", post)
    assert client.post(f"{ROOT}/test").json["error"]["code"] == "invalid_key"
    assert client.get(f"{ROOT}/status").json["state"] == "ready"


@pytest.mark.parametrize("model,reasoning", [
    ("gpt-4o-mini", False), ("gpt-4o", False), ("gpt-4.1-mini", False), ("gpt-4.1", False),
    ("my.Model_2", False), ("o1-preview", True), ("o3-mini", True), ("o4-mini", True), ("gpt-5-new", True),
])
def test_openai_personal_protocol(local, monkeypatch, model, reasoning):
    client = local()
    status = client.put(ROOT, json={"provider": "openai", "model": model, "api_key": FIXTURE_KEY})
    assert status.json == {"configured": True, "state": "ready", "model": model,
                           "provider": "openai", "base_url": None, "codex_detected": False}

    def post(url, **kwargs):
        assert url == "https://api.openai.com/v1/chat/completions"
        assert kwargs["trust_env"] is True
        payload = kwargs["json"]
        assert "thinking" not in payload and payload["model"] == model
        assert ("max_completion_tokens" in payload) == reasoning
        assert ("max_tokens" in payload) != reasoning
        assert ("temperature" in payload) != reasoning
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

    monkeypatch.setattr(llm.httpx, "post", post)
    assert client.post(f"{ROOT}/test").json == {"ok": True}
    assert local().get(f"{ROOT}/status").json == status.json
    assert client.get("/api/ai/status").json["mode"] == "openai"
    assert client.delete(ROOT).json["state"] == "unset"


def test_personal_custom_endpoint_and_switch(local, monkeypatch):
    monkeypatch.setattr(local_key.socket, "getaddrinfo", lambda *a, **k: [(0, 0, 0, "", ("8.8.8.8", 443))])
    client = local()
    base = "https://example.test/v1"
    settings = {"provider": "openai", "model": "my-model", "api_key": FIXTURE_KEY, "base_url": base + "/"}
    assert client.put(ROOT, json=settings).json["base_url"] == base
    assert client.put(ROOT, json={"provider": "openai", "model": "my-model2"}).json["base_url"] == base
    assert client.put(ROOT, json={"model": "deepseek-flash"}).status_code == 422
    assert client.put(ROOT, json={**settings, "provider": "deepseek"}).status_code == 422
    assert client.put(ROOT, json={**settings, "model": "bad/model"}).status_code == 422
    calls = []

    def post(url, **kwargs):
        calls.append(url)
        return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})

    monkeypatch.setattr(llm.httpx, "post", post)
    assert client.post(f"{ROOT}/test").json == {"ok": True}
    assert calls == [base + "/chat/completions"]
    monkeypatch.setattr(local_key.socket, "getaddrinfo", lambda *a, **k: [(0, 0, 0, "", ("10.2.3.4", 443))])
    assert client.post(f"{ROOT}/test").status_code == 502
    assert len(calls) == 1
    assert client.put(ROOT, json=settings).status_code == 422


@pytest.mark.parametrize("base", [
    "http://example.org", "https://name:secret@example.org/v1", "https://example.org/v1?q=1",
    "https://example.org/v1#x", "https://localhost", "https://service.local", "https://[::1]/v1",
    "https://127.1", "https://169.254.1.3", "https://192.168.1.3", "https://[fd00::2]",
    "https://example.org:65536", "https://example.org\\@localhost", 17,
])
def test_invalid_personal_base_urls(local, base):
    client = local()
    response = client.put(ROOT, json={"provider": "openai", "model": "gpt-4o", "api_key": FIXTURE_KEY,
                                      "base_url": base})
    assert response.status_code == 422 and not client.get(f"{ROOT}/status").json["configured"]
