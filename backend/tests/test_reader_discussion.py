from __future__ import annotations

import json

from app.adapters.llm import LLMResult


def _login(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_reader_question_is_grounded_in_current_page(client, monkeypatch):
    headers = _login(client)
    captured = {}

    def fake_post(messages, **kwargs):
        captured["messages"] = messages
        return LLMResult(
            text=json.dumps({"message": "这一页只讨论当前页的 ε-δ 定义。"}, ensure_ascii=False),
            provider="mock",
            model="mock",
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    response = client.post(
        "/api/v1/ai/reader/discuss",
        headers=headers,
        json={
            "document_name": "测试讲义.pdf",
            "page_index": 1,
            "page_count": 7,
            "page_text": "设 f 在 x0 连续。对任意 ε>0 存在 δ>0，使得 |x-x0|<δ 时 |f(x)-f(x0)|<ε。",
            "selected_text": "对任意 ε>0，存在 δ>0",
            "question": "这里的 δ 能依赖 x0 吗？",
            "history": [],
        },
    )
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert data["page_text_available"] is True
    assert "这一页" in data["message"]
    assert captured["messages"]
    serialized = json.dumps(captured["messages"], ensure_ascii=False)
    assert "对任意 ε>0" in serialized
    assert "这里的 δ 能依赖 x0 吗" in serialized
    assert "page_number" in serialized


def test_reader_without_extractable_text_does_not_claim_it_read_pdf(
    client, monkeypatch
):
    headers = _login(client)
    captured = {}

    def fake_post(messages, **kwargs):
        captured["messages"] = messages
        return LLMResult(
            text=json.dumps(
                {"message": "这一页没有可提取文字，请贴出片段。"}, ensure_ascii=False
            ),
            provider="mock",
            model="mock",
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    response = client.post(
        "/api/v1/ai/reader/discuss",
        headers=headers,
        json={
            "document_name": "扫描页.pdf",
            "page_index": 3,
            "page_count": 5,
            "page_text": "",
            "selected_text": "",
            "question": "这一页说了什么？",
            "history": [],
        },
    )
    assert response.status_code == 200, response.get_json()
    assert response.get_json()["page_text_available"] is False
    serialized = json.dumps(captured["messages"], ensure_ascii=False)
    assert "page_text_available" in serialized
