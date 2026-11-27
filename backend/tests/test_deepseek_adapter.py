from __future__ import annotations

import json

import pytest

from app.adapters import llm
from app.config import Config, load_config


class FakeResponse:
    def __init__(self, status_code=200, payload=None, content=b"{}"):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content

    def json(self):
        return self._payload


def _ok_response(content: str):
    payload = {
        "model": "deepseek-flash",
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 8},
    }
    return FakeResponse(payload=payload, content=json.dumps(payload).encode())


def _configure(app, *, model: str):
    config = app.config["AXIOM"]
    config.ai_provider = "deepseek"
    config.ai_base_url = "https://api.deepseek.com"
    config.ai_model = model
    config.ai_api_key = "sk-test"
    config.ai_json_mode = True
    return config


def test_deepseek_flash_payload_and_provider(app, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _ok_response('{"message":"ok","scene":null}')

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    with app.app_context():
        _configure(app, model="deepseek-flash")
        result = llm._post_chat(
            [{"role": "user", "content": "输出 JSON"}],
            purpose="plot",
            json_mode=True,
            timeout=10,
            max_tokens=200,
        )
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-test"
    assert captured["json"]["model"] == "deepseek-flash"
    assert captured["json"]["temperature"] == 0.2
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert result.provider == "deepseek"
    assert result.model == "deepseek-flash"
    assert result.input_tokens == 12
    assert result.output_tokens == 8


@pytest.mark.parametrize("purpose", [
    "companion", "connection_test", "plot", "plot_change", "surface_plot", "diagram", "card_visual",
])
def test_realtime_deepseek_calls_disable_thinking(purpose, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(json)
        return _ok_response('{"message":"ok"}')

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    config = Config(ai_provider="deepseek", ai_base_url="https://api.deepseek.com",
                    ai_model="deepseek-v4-pro", ai_api_key="fixture")
    llm._post_chat([{"role": "user", "content": "输出 JSON"}], purpose=purpose,
                   json_mode=purpose != "connection_test", timeout=10, max_tokens=200, config=config)
    assert captured["thinking"] == {"type": "disabled"}
    assert ("response_format" in captured) == (purpose != "connection_test")


@pytest.mark.parametrize("provider,purpose", [("openai", "plot"), ("deepseek", "exercise_generation")])
def test_other_requests_preserve_provider_thinking_default(provider, purpose, monkeypatch):
    def post(url, headers, json, timeout):
        assert "thinking" not in json
        return _ok_response("ok")

    monkeypatch.setattr(llm.httpx, "post", post)
    config = Config(ai_provider=provider, ai_base_url="https://example.test",
                    ai_model="model", ai_api_key="fixture")
    llm._post_chat([], config=config, purpose=purpose, json_mode=False, timeout=10, max_tokens=32)


@pytest.mark.parametrize("provider,previous,current", [
    ("deepseek", "", "deepseek-flash"),
    ("none", "", "deepseek-flash"),
    ("deepseek", "deepseek-chat", "deepseek-flash"),
    ("none", "deepseek-reasoner", "deepseek-v4-pro"),
])
def test_deepseek_environment_defaults_and_aliases(monkeypatch, provider, previous, current):
    monkeypatch.setenv("AI_BASE_URL", "https://api.deepseek.com")
    monkeypatch.setenv("AXIOM_AI_PROVIDER", provider)
    monkeypatch.setenv("AI_MODEL", previous)
    assert load_config().ai_model == current


def test_deepseek_insufficient_balance_is_actionable(app, monkeypatch):
    monkeypatch.setattr(
        llm.httpx,
        "post",
        lambda *args, **kwargs: FakeResponse(
            status_code=402,
            payload={"error": {"message": "Insufficient Balance"}},
            content=b"{}",
        ),
    )
    with app.app_context():
        _configure(app, model="deepseek-flash")
        with pytest.raises(llm.LLMError) as exc:
            llm._post_chat(
                [{"role": "user", "content": "ping"}],
                purpose="connection_test",
                json_mode=False,
                timeout=10,
                max_tokens=32,
            )
    assert exc.value.kind == "billing"
    assert "余额不足" in exc.value.message
