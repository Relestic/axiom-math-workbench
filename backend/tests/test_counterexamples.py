import pytest
from pydantic import ValidationError

from app.modules.counterexamples import Candidate, check_candidate


URL = "/api/v1/local/counterexamples/check"


def payload(expression="1/x", *, a=0, b=1, left=False, right=False, model=False):
    return {"expression": expression, "interval": {"a": a, "b": b, "left_closed": left, "right_closed": right},
            "include_model": model}


def by_basis(result, basis):
    return "\n".join(row["text"] for row in result["findings"] if row["verdict_basis"] == basis)


@pytest.mark.parametrize(("left", "right", "notation"), [
    (False, False, "(0, 1)"), (True, True, "[0, 1]"), (True, False, "[0, 1)"), (False, True, "(0, 1]"),
])
def test_reciprocal_preserves_interval_membership(left, right, notation):
    checked = check_candidate(Candidate.model_validate(payload(left=left, right=right)))
    symbolic = by_basis(checked, "symbolic")
    assert checked["interval"] == notation
    assert ("原式在该点未定义" in symbolic) == left
    assert ("处处有定义且连续" in symbolic) != left
    assert "+∞" in symbolic and "无界" in symbolic
    assert "有限采样不能证明" in by_basis(checked, "numeric-sample")


def test_holes_survive_simplification_and_nonreal_parts_are_excluded_from_samples():
    hole = check_candidate(Candidate.model_validate(payload("(x-1)/(x-1)", right=True)))
    assert "x = 1" in by_basis(hole, "symbolic") and "未定义" in by_basis(hole, "symbolic")
    assert "无界" not in by_basis(hole, "symbolic")
    square = check_candidate(Candidate.model_validate(payload("sqrt(x)^2", a=-1, left=True, right=True)))
    assert "[0, 1]" in by_basis(square, "symbolic")
    assert "129 个网格点" in by_basis(square, "numeric-sample")


@pytest.mark.parametrize("expression", ["Dirichlet(x)", "sin(1/x)", "x*sin(1/x)"])
def test_dense_and_oscillating_cases_do_not_turn_grid_values_into_evidence(expression):
    result = check_candidate(Candidate.model_validate(payload(expression)))
    assert {row["verdict_basis"] for row in result["findings"]} == {"definition-only"}
    if expression == "Dirichlet(x)":
        assert "有理点" in result["findings"][0]["text"] and "无理点" in result["findings"][0]["text"]


def test_regular_sine_away_from_the_pole_and_piecewise_can_use_numeric_grid():
    for expression in ["sin(1/x)", "x < 1.5 ? 0 : 1", "0"]:
        result = check_candidate(Candidate.model_validate(payload(expression, a=1, b=2)))
        assert by_basis(result, "numeric-sample")
        assert not by_basis(result, "definition-only")


@pytest.mark.parametrize(("a", "b"), [(1, 1), (2, 1), (0, float("inf")), (float("nan"), 1)])
def test_interval_must_be_finite_and_increasing(a, b):
    with pytest.raises(ValidationError):
        Candidate.model_validate(payload(a=a, b=b))


def test_local_counterexample_route_and_optional_no_key_feedback(app, client, monkeypatch):
    assert client.post(URL, json=payload()).status_code == 404
    monkeypatch.setattr(app.config["AXIOM"], "local_mode", True)
    assert client.post(URL, json=payload(), headers={"Origin": "https://example.test"}).status_code == 403
    invalid = client.post(URL, json=payload("unknownFunction(x)"))
    assert invalid.status_code == 422 and "表达式不被允许" in invalid.json["error"]["message"]
    checked = client.post(URL, json=payload(model=True))
    assert checked.status_code == 200
    assert checked.json["model_status"] == "请先在顶部配置个人 DeepSeek Key"
    assert by_basis(checked.json, "symbolic") and not by_basis(checked.json, "model-explanation")


def test_model_explanation_is_appended_with_its_own_evidence_type(app, client, monkeypatch):
    from app.adapters.llm import LLMResult
    from app.api import local_counterexamples

    monkeypatch.setattr(app.config["AXIOM"], "local_mode", True)
    monkeypatch.setattr(local_counterexamples, "use_local_ai", lambda: None)
    def explain(session, messages, **kwargs):
        assert kwargs["purpose"] == "counterexample_explanation" and kwargs["user_id"]
        assert "numeric-sample" in messages[-1]["content"]
        return LLMResult("端点不属于开区间，仍可讨论右极限。", "mock", "test"), None
    monkeypatch.setattr(local_counterexamples, "chat", explain)
    original = client.post(URL, json=payload()).json
    with_model = client.post(URL, json=payload(model=True)).json
    assert original["findings"] == with_model["findings"][:-1]
    assert with_model["findings"][-1]["verdict_basis"] == "model-explanation"
