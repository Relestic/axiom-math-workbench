from __future__ import annotations

import json

from app.adapters.llm import LLMResult


def _login(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def _analyze_payload():
    return {
        "document_name": "测试讲义.docx",
        "doc_id": "doc-test",
        "parser_version": "docx-v1",
        "blocks": [
            {
                "block_id": "b1",
                "section_title": "狄利克雷函数",
                "text": "值得注意的是，狄利克雷函数是处处不连续的函数。",
            },
            {
                "block_id": "b2",
                "section_title": "人物介绍",
                "text": "狄利克雷在数论中的贡献十分丰富。",
            },
        ],
        "visualizations": [
            {
                "id": "dirichlet-discontinuity",
                "label": "狄利克雷不连续性",
                "concept_id": "dirichlet_function",
                "case_id": "negative",
                "focus": ["discontinuity"],
            }
        ],
        "max_candidates": 8,
    }


def test_rules_and_examples_are_persisted_and_sent_to_analysis(client, monkeypatch):
    headers = _login(client)
    saved = client.put(
        "/api/v1/reader/rules/recognition",
        headers=headers,
        json={"content": "只链接狄利克雷函数，不链接人物介绍。"},
    )
    assert saved.status_code == 200, saved.get_json()
    assert saved.get_json()["version"] == 1

    example = client.post(
        "/api/v1/reader/examples",
        headers=headers,
        json={
            "task": "recognition",
            "block_text": "狄利克雷函数处处不连续。",
            "exact_text": "狄利克雷函数",
            "target": "dirichlet-discontinuity",
            "visualization_id": "dirichlet-discontinuity",
            "reason": "链接函数而不是人物",
        },
    )
    assert example.status_code == 201, example.get_json()

    settings = client.get("/api/v1/reader/settings", headers=headers)
    assert settings.status_code == 200
    data = settings.get_json()
    assert data["rules"]["recognition"]["custom"] is True
    assert data["examples"]
    assert data["examples"][0]["exact_text"] == "狄利克雷函数"

    captured = {}

    def fake_post(messages, **kwargs):
        captured["messages"] = messages
        return LLMResult(
            text=json.dumps(
                {
                    "candidates": [
                        {
                            "block_id": "b1",
                            "exact_text": "狄利克雷函数",
                            "concept_id": "dirichlet_function",
                            "visualization_id": "dirichlet-discontinuity",
                            "case_id": "negative",
                            "focus": ["discontinuity"],
                            "label": "查看狄利克雷函数",
                            "status": "candidate",
                        },
                        {
                            "block_id": "b2",
                            "exact_text": "狄利克雷函数",
                            "visualization_id": "dirichlet-discontinuity",
                        },
                    ]
                },
                ensure_ascii=False,
            ),
            provider="mock",
            model="mock",
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    response = client.post(
        "/api/v1/ai/reader/analyze",
        headers=headers,
        json=_analyze_payload(),
    )
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["rules_version"] == 1
    assert len(body["candidates"]) == 1
    candidate = body["candidates"][0]
    assert candidate["exact_text"] == "狄利克雷函数"
    assert candidate["start"] == 7
    assert candidate["end"] == 13
    assert body["rejected"]

    serialized = json.dumps(captured["messages"], ensure_ascii=False)
    assert "只链接狄利克雷函数" in serialized
    assert "链接函数而不是人物" in serialized


def test_invalid_or_ambiguous_candidates_are_rejected(client, monkeypatch):
    headers = _login(client)

    def fake_post(messages, **kwargs):
        return LLMResult(
            text=json.dumps(
                {
                    "candidates": [
                        {
                            "block_id": "b1",
                            "exact_text": "原文中没有这句话",
                            "visualization_id": "dirichlet-discontinuity",
                        },
                        {
                            "block_id": "b1",
                            "exact_text": "狄利克雷函数",
                            "visualization_id": "not-a-real-target",
                        },
                    ]
                },
                ensure_ascii=False,
            ),
            provider="mock",
            model="mock",
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    response = client.post(
        "/api/v1/ai/reader/analyze",
        headers=headers,
        json=_analyze_payload(),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["candidates"] == []
    assert len(body["rejected"]) == 2
