from __future__ import annotations

import json

from app.adapters.llm import LLMResult


def _login(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@axiom.local", "password": "axiom-demo-2026"},
    )
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_discussion_is_real_time_and_does_not_create_attempt(
    client, monkeypatch
):
    headers = _login(client)
    before = client.get("/api/v1/attempts", headers=headers).get_json()["items"]
    captured = {}

    def fake_post(messages, **kwargs):
        captured["messages"] = messages
        return LLMResult(
            text=json.dumps(
                {"message": "你已经写出 ε 的任意性；下一步请把 δ 与 ε 的关系写清楚。"},
                ensure_ascii=False,
            ),
            provider="deepseek",
            model="deepseek-chat",
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    response = client.post(
        "/api/v1/ai/exercises/discuss",
        headers=headers,
        json={
            "exercise_id": "uniform-2",
            "answer_text": "任给 ε>0，我还没想好 δ。",
            "message": "我卡在选 δ。",
            "history": [
                {"role": "user", "content": "我想先处理闭区间。"},
                {"role": "assistant", "content": "先写出 |x²−y²| 的估计。"},
            ],
        },
    )
    assert response.status_code == 200, response.get_json()
    assert "δ" in response.get_json()["message"]
    assert response.get_json()["provider"] == "deepseek"
    assert captured["messages"]
    assert any("uniform-2" in str(item) for item in captured["messages"])
    after = client.get("/api/v1/attempts", headers=headers).get_json()["items"]
    assert len(after) == len(before)


def test_submit_uses_ai_grade_and_records_attempt(client, monkeypatch):
    headers = _login(client)
    before = client.get("/api/v1/attempts", headers=headers).get_json()["items"]

    def fake_post(messages, **kwargs):
        return LLMResult(
            text=json.dumps(
                {
                    "score": 82,
                    "verdict": "partial",
                    "summary": "主要估计正确，但闭区间条件的说明还可以更具体。",
                    "strengths": ["写清了 ε 的任意性", "给出了差商估计"],
                    "gaps": ["没有明确写出 δ 的选取"],
                    "next_steps": ["补上 δ=ε/(2k) 的推导"],
                },
                ensure_ascii=False,
            ),
            provider="deepseek",
            model="deepseek-chat",
            latency_ms=20,
        )

    monkeypatch.setattr("app.adapters.llm._post_chat", fake_post)
    response = client.post(
        "/api/v1/ai/exercises/submit",
        headers=headers,
        json={
            "exercise_id": "uniform-2",
            "answer_text": "任给 ε>0，取 δ=ε/4，则 |x²−y²|≤4|x−y|<ε，故在 [0,1] 上一致连续。",
            "history": [{"role": "assistant", "content": "试着先估计 |x+y|。"}],
            "hints_used": 1,
            "solution_viewed": False,
        },
    )
    assert response.status_code == 201, response.get_json()
    data = response.get_json()
    assert data["status"] == "ai_reviewed"
    assert data["score"] == 82
    assert data["feedback"]["grading_scope"] == "ai"
    assert data["feedback"]["ai"]["verdict"] == "partial"
    assert data["feedback"]["ai"]["strengths"]
    after = client.get("/api/v1/attempts", headers=headers).get_json()["items"]
    assert len(after) == len(before) + 1
    assert after[0]["id"] == data["id"]

    empty = client.post(
        "/api/v1/ai/exercises/submit",
        headers=headers,
        json={"exercise_id": "uniform-2", "answer_text": ""},
    )
    assert empty.status_code == 422
