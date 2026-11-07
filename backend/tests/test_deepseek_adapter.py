from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from flask import current_app

from app.adapters import llm


class FakeResponse:
    def __init__(self, status_code=200, payload=None, content=b"{}"):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content

    def json(self):
        return self._payload


def _ok_response(content: str):
    payload = {
        "model": "deepseek-chat",
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


def test_deepseek_chat_payload_and_provider(app, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return _ok_response('{"message":"ok","scene":null}')

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    with app.app_context():
        _configure(app, model="deepseek-chat")
        result = llm._post_chat(
            [{"role": "user", "content": "输出 JSON"}],
            purpose="plot",
            json_mode=True,
            timeout=10,
            max_tokens=200,
        )
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-test"
    assert captured["json"]["model"] == "deepseek-chat"
    assert captured["json"]["temperature"] == 0.2
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert result.provider == "deepseek"
    assert result.model == "deepseek-chat"
    assert result.input_tokens == 12
    assert result.output_tokens == 8


def test_deepseek_reasoner_omits_temperature_and_response_format(app, monkeypatch):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(json)
        return _ok_response('{"message":"ok"}')

    monkeypatch.setattr(llm.httpx, "post", fake_post)
    with app.app_context():
        config = _configure(app, model="deepseek-reasoner")
        assert config.ai_json_effective is False
        assert config.ai_is_reasoner is True
        llm._post_chat(
            [{"role": "user", "content": "输出 JSON"}],
            purpose="plot",
            json_mode=True,
            timeout=10,
            max_tokens=200,
        )
    assert "response_format" not in captured
    assert "temperature" not in captured
    assert captured["max_tokens"] == 200


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
        _configure(app, model="deepseek-chat")
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
