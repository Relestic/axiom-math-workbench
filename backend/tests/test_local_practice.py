import json
import re
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from sqlalchemy import select

from app.adapters import llm
from app.db import session_scope
from app.models import Attempt, User

BASE = "/api/v1/local"
ANSWER = "取 δ=ε/x，故对所有点成立。"
REVIEW = {
    "summary": "检查 δ 的依赖关系",
    "steps": [{"step": "选择 δ", "assessment": "需要补充", "suggestion": "说明 δ 的选择对整个区间适用"}],
    "error_focus": "量词顺序",
}
VARIANT = {
    "title": "比较两种 δ 选择",
    "statement": "证明 f(x)=4x 在实轴上一致连续并说明 δ 的取法。",
    "domain": "实轴",
    "type": "proof",
    "hint": "先写出函数值之差",
    "checks": ["核对量词"],
    "common_errors": ["让 δ 依赖于 x"],
    "solution_steps": [{"title": "取 δ", "text": "令 δ=ε/4。"}],
}


@pytest.fixture()
def local(app, client, monkeypatch):
    monkeypatch.setattr(app.config["AXIOM"], "local_mode", True)
    return client


def submit(local, exercise="uniform-3", answer=ANSWER, key="proof-a"):
    return local.post(
        BASE + "/attempts", json={"exercise_id": exercise, "answer_text": answer, "idempotency_key": key}
    )


def configure(local):
    local.put("/api/v1/ai/key", json={"api_key": "sk-m9-fixture", "model": "deepseek-flash"})


def test_offline_scoring_rating_retry_and_ownership(local):
    response = submit(local)
    assert response.status_code == 201, response.json
    attempt = response.json
    assert attempt["ai_review"] is None and attempt["feedback"]["needs_review"] is True
    assert attempt["feedback"]["criteria"] and isinstance(attempt["score"], int)
    assert submit(local).json["id"] == attempt["id"]
    assert submit(local, answer="另一次完全不同的答案").status_code == 409
    numeric = submit(local, "primitive-2", "exp(2*x)", "numeric").json
    assert numeric["score"] == 0 and numeric["feedback"]["correct"] is False
    assert (
        local.patch(f"{BASE}/attempts/{attempt['id']}/self-rating", json={"self_rating": "revisit"}).json[
            "self_rating"
        ]
        == "revisit"
    )
    extras = local.get(BASE + "/bootstrap-extras").json
    assert {a["id"] for a in extras["attempts"]} == {attempt["id"], numeric["id"]}
    missing = local.post(BASE + "/exercises/variant", json={"attempt_id": attempt["id"]})
    assert (
        missing.status_code == 503 and missing.json["error"]["message"] == "请先在顶部配置个人 DeepSeek Key"
    )
    with session_scope() as session:
        record = session.get(Attempt, attempt["id"])
        record.user_id = session.scalar(select(User).where(User.email == "second@axiom.test")).id
    assert local.post(BASE + "/exercises/variant", json={"attempt_id": attempt["id"]}).status_code == 404
    assert (
        local.patch(
            f"{BASE}/attempts/{attempt['id']}/self-rating", json={"self_rating": "pending"}
        ).status_code
        == 404
    )


def test_review_and_targeted_variant_persist_with_student_evidence(local, monkeypatch):
    configure(local)
    prompts = []

    def post(url, **kwargs):
        system, payload = kwargs["json"]["messages"]
        source = json.loads(payload["content"])
        assert source["student_answer"] == ANSWER and source["missing_steps"]
        assert any(ref["slug"] == "eps-delta" for ref in source["allowed_refs"])
        prompts.append(source)
        result = VARIANT if "target_error" in source else REVIEW
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(result)}}]})

    monkeypatch.setattr(llm.httpx, "post", post)
    attempt = submit(local).json
    assert attempt["ai_review"] == REVIEW
    assert submit(local).json["ai_review"] == REVIEW and len(prompts) == 1
    new = local.post(BASE + "/exercises/variant", json={"attempt_id": attempt["id"]})
    assert new.status_code == 201, new.json
    variant = new.json
    assert re.fullmatch("variant-[a-f0-9]{32}", variant["id"]) and variant["code"] == variant["id"]
    assert variant["source"] == "ai-variant" and variant["provenance"]["parent_attempt_id"] == attempt["id"]
    assert variant["provenance"]["target_error"] == REVIEW["error_focus"] == prompts[-1]["target_error"]
    assert (
        variant["solution_steps"] == VARIANT["solution_steps"]
        and variant["provenance"]["model"] == "deepseek-flash"
    )
    assert (
        local.post(BASE + "/exercises/variant", json={"attempt_id": attempt["id"]}).json["id"]
        == variant["id"]
    )
    assert len(prompts) == 2
    extras = local.get(BASE + "/bootstrap-extras").json
    assert extras["exercises"] == [variant] and extras["attempts"][0]["ai_review"] == REVIEW
    local.delete("/api/v1/ai/key")
    graded = submit(
        local, variant["id"], "任给 ε>0，取 δ=ε/4，由线性关系得到所需不等式，故结论成立。", "variant-proof"
    ).json
    assert graded["feedback"]["needs_review"] is True
    labels = [item["label"] for item in graded["feedback"]["criteria"]]
    assert not any("不一致连续" in label or "x²" in label for label in labels)


def test_invalid_model_output_preserves_grade_and_rejects_unusable_variants(local, monkeypatch):
    configure(local)
    result = {"summary": "缺步骤"}

    def post(url, **kwargs):
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(result)}}]})

    monkeypatch.setattr(llm.httpx, "post", post)
    response = submit(local)
    assert response.status_code == 201
    attempt = response.json
    assert attempt["ai_review"] is None and attempt["feedback"]["ai_review_notice"]
    assert local.get(BASE + "/bootstrap-extras").json["attempts"][0]["score"] == attempt["score"]
    result = {
        **VARIANT,
        "type": "computation",
        "answer_check": {"kind": "expression", "expected": "not a formula"},
    }
    failure = local.post(BASE + "/exercises/variant", json={"attempt_id": attempt["id"]})
    assert failure.status_code == 502
    assert local.get(BASE + "/bootstrap-extras").json["exercises"] == []


def test_concurrent_variant_requests_share_one_generation_and_keep_an_executable_reference(
    local, app, monkeypatch
):
    original = submit(local, "primitive-2", "exp(3*x)", "calc").json
    configure(local)
    generated = {
        **VARIANT,
        "type": "computation",
        "title": "求和",
        "statement": "化简 3x + 4x。",
        "answer_check": {"kind": "expression", "expected": "7*x"},
        "solution_steps": [{"title": "合并同类项", "text": "3x+4x=7x"}],
    }
    calls = []

    def post(url, **kwargs):
        calls.append(kwargs["json"]["messages"])
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(generated)}}]})

    monkeypatch.setattr(llm.httpx, "post", post)

    def request_variant(_):
        return (
            app.test_client()
            .post(BASE + "/exercises/variant", json={"attempt_id": original["id"]})
            .json["id"]
        )

    with ThreadPoolExecutor(max_workers=3) as pool:
        ids = list(pool.map(request_variant, range(3)))
    assert len(calls) == 1 and len(set(ids)) == 1
    local.delete("/api/v1/ai/key")
    assert submit(local, ids[0], "7*x", "answer-new").json["score"] == 100
    with session_scope() as session:
        attempt = session.get(Attempt, original["id"])
        attempt.user_id = session.scalar(select(User).where(User.email == "second@axiom.test")).id
    assert submit(local, ids[0], "7*x", "foreign").status_code == 404
