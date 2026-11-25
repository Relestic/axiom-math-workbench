import json

import httpx
import pytest

from app.adapters import llm
from app.api.companion import spoken_math


@pytest.mark.parametrize("text,expected", [
    (r"\forall\varepsilon>0", "对于任意大于零的伊普西隆"),
    ("∃δ>0", "存在大于零的德尔塔"),
    (r"\int_{a}^{b} f(x)", "从 a 到 b 的积分 f(x)"),
    (r"\frac{1}{2}", "（2）分之（1）"),
])
def test_spoken_math(text, expected):
    assert spoken_math(text) == expected


def test_companion_uses_personal_proxy_and_validates_reply(app, client, monkeypatch):
    app.config["AXIOM"].local_mode = True
    question = {"question":"解释这一步", "context":{"page":"proof","concept_id":"uniform"}}
    assert client.post("/api/v1/ai/companion", json=question).status_code == 503
    assert client.put("/api/v1/ai/key", json={"api_key":"test-local-companion", "model":"deepseek-chat"}).status_code == 200
    answer = {"display_markdown":r"固定 $\forall\varepsilon>0$。", "spoken_text":"∀ε>0",
              "actions":[{"type":"highlight_proof_step","ref":"uniform:1"}, {"type":"unsupported"}]}
    captured = []

    def fixture(url, **kwargs):
        captured.append(kwargs["json"])
        return httpx.Response(200, json={"choices":[{"message":{"content":json.dumps(answer)}}]})

    monkeypatch.setattr(llm.httpx, "post", fixture)
    response = client.post("/api/v1/ai/companion", json=question)
    assert response.status_code == 200
    assert response.json == {**answer, "spoken_text":"对于任意大于零的伊普西隆","actions":answer["actions"][:1]}
    assert captured[0]["response_format"] == {"type":"json_object"}
    assert json.loads(captured[0]["messages"][-1]["content"]) == question
    answer["display_markdown"] = ""
    assert client.post("/api/v1/ai/companion", json=question).status_code == 502
