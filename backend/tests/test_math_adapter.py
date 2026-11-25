from __future__ import annotations

import pytest

from app.adapters.math import (
    MathError,
    analyze_expression,
    check_answer,
    compile_expression,
    required_parameters,
    validate_and_normalize_scene,
)


@pytest.mark.parametrize(
    "expression",
    [
        "x^2",
        "sin(a*x)",
        "exp(-x^2)",
        "x<0 ? -x : x^2",
        "abs(x)",
        "floor(x)",
        "min(x, 1/x)",
        "sqrt(x)",
        "1/(1+x^2)",
    ],
)
def test_supported_expressions_compile(expression):
    compiled = compile_expression(expression, ["a"])
    assert compiled.expression is not None


def test_ternary_and_parameter_evaluation():
    compiled = compile_expression("x<0 ? -a*x : a*x", ["a"])
    assert compiled.evaluate(2, {"a": 3}) == 6
    assert compiled.evaluate(-2, {"a": 3}) == 6
    assert compiled.free_symbols == ["a", "x"]


def test_required_parameters_detects_single_letter_symbols():
    assert required_parameters("sin(a*x)+b") == ["a", "b"]
    assert required_parameters("exp(-x^2)") == []
    assert required_parameters("x<0 ? -x : x^2") == []


@pytest.mark.parametrize(
    "expression",
    [
        "__import__('os').system('whoami')",
        "lambda x: x",
        "open('secret')",
        "x[0]",
        "x; y",
        "x.__class__",
        "integrate(x)",
        "y*x",
        "sin(",
        "",
        "x" * 301,
    ],
)
def test_unsafe_or_invalid_expressions_are_rejected(expression):
    with pytest.raises(MathError):
        compile_expression(expression)


def test_missing_parameter_and_non_real_values():
    compiled = compile_expression("a*x", ["a"])
    with pytest.raises(MathError):
        compiled.evaluate(1, {})
    assert compiled.evaluate(1, {"a": 2}) == 2
    sqrt = compile_expression("sqrt(x)")
    assert sqrt.evaluate(-1) is None
    reciprocal = compile_expression("1/x")
    assert reciprocal.evaluate(0) is None


def test_scene_normalization_adds_and_filters_parameters():
    scene = {
        "curves": [
            {"id": "f", "expression": "sin(a*x)", "label": "f", "visible": True,
             "domainMin": None, "domainMax": None, "leftOpen": False, "rightOpen": False}
        ],
        "activeId": "f",
        "parameters": [{"name": "b", "value": 1, "min": -2, "max": 2}],
        "mode": "graph",
        "xMin": -3, "xMax": 3, "yMin": -2, "yMax": 2,
        "x0": 0, "epsilon": 0.3, "delta": 0.2, "h": 0.25,
        "integralStart": 0, "integralEnd": 1, "subdivisions": 20, "order": 3,
    }
    normalized = validate_and_normalize_scene(scene)
    names = [item["name"] for item in normalized["parameters"]]
    assert names == ["a"]
    assert normalized["parameters"][0]["value"] == 1
    assert isinstance(normalized["_compiled"][0]["warnings"], list)


def test_analysis_marks_numeric_evidence_as_non_proof():
    analysis = analyze_expression(
        "x^2", x0=0.6, epsilon=0.08, delta=0.06, x_min=0, x_max=1, subdivisions=20
    )
    assert analysis["epsilon_delta"]["proof"] is False
    assert analysis["epsilon_delta"]["status"] == "passed_numeric"
    assert analysis["slope_envelope"]["max_abs_derivative_numeric"] == pytest.approx(1.32)
    assert analysis["taylor"]["available"] is True
    assert analysis["riemann"]["proof"] is False
    assert "不构成" in analysis["disclaimer"]
    assert analysis["checks"]["numeric_only"] is True


def test_analysis_detects_undefined_point():
    analysis = analyze_expression("1/x", x0=0, x_min=-1, x_max=1)
    assert analysis["value_at_x0"] is None
    assert analysis["epsilon_delta"]["status"] == "failed_or_undefined_numeric"
    assert "未定义" in analysis["continuity_note"]


def test_check_answer_is_conservative():
    ok = check_answer("x^2", "x^2", "expression")
    assert ok["equivalent"] is True
    integral = check_answer("x*exp(2*x)", "exp(2*x)*(2*x-1)/4 + C", "integral")
    assert integral["equivalent"] is True
    mismatch = check_answer("x^2", "x^3", "expression")
    assert mismatch["equivalent"] is False
    prose = check_answer("x^2", "由定义可知该表达式为 x^2", "expression")
    assert prose["equivalent"] is None
    assert prose["method"] == "parse_failed"
