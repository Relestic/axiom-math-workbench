"""Restricted real-valued expression parser and analysis adapter.

User and model supplied formulas are never executed as Python. They are
translated from the supported mathjs subset into SymPy expression trees with a
small whitelist, then evaluated through ``lambdify``. Numeric sampling is always
labelled as numeric evidence; it is never reported as a proof of continuity,
differentiability or integrability.
"""

from __future__ import annotations

import ast
import math
import re
from dataclasses import dataclass, field
from typing import Any, Iterable

import numpy as np
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
)

MAX_EXPRESSION_LENGTH = 300
MAX_OPERATIONS = 300
IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
ALLOWED_IDENTIFIERS = {
    "x",
    "pi",
    "e",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "sinh",
    "cosh",
    "tanh",
    "exp",
    "log",
    "sqrt",
    "abs",
    "floor",
    "ceil",
    "round",
    "sign",
    "min",
    "max",
    "and",
    "or",
    "not",
    "Piecewise",
    "Eq",
    "Ne",
    "True",
}
TRANSFORMATIONS = standard_transformations
FORBIDDEN_TOKENS = (
    "__",
    "[",
    "]",
    "{",
    "}",
    "'",
    '"',
    ";",
    "lambda",
    "import",
    "eval",
    "exec",
    "open",
    "sympify",
    "integrate",
    "Integral",
    "Derivative",
    "limit",
    "Sum",
    "Product",
    "Matrix",
)


class MathError(ValueError):
    """User-facing expression error."""


def _is_real(value: Any) -> bool:
    if isinstance(value, (bool, np.bool_)):
        return False
    try:
        number = complex(value)
    except (TypeError, ValueError):
        return False
    return abs(number.imag) < 1e-12 and math.isfinite(number.real)


def _scalar(value: Any) -> float | None:
    if isinstance(value, sp.Basic):
        try:
            value = complex(value.evalf())
        except TypeError:
            return None
    if not _is_real(value):
        return None
    number = float(complex(value).real)
    if not math.isfinite(number):
        return None
    return number


def _finite(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _split_top(text: str, separator: str, start: int = 0) -> int:
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise MathError("括号不匹配")
        elif depth == 0 and char == separator:
            return index
    return -1


def _find_ternary_colon(text: str, question: int) -> int:
    depth = 0
    ternaries = 0
    for index in range(question + 1, len(text)):
        char = text[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif depth == 0:
            if char == "?":
                ternaries += 1
            elif char == ":":
                if ternaries == 0:
                    return index
                ternaries -= 1
    return -1


def _convert_condition(text: str) -> str:
    text = re.sub(
        r"([A-Za-z0-9_.]+)\s*==\s*([A-Za-z0-9_.]+)", r"Eq(\1, \2)", text
    )
    text = re.sub(
        r"([A-Za-z0-9_.]+)\s*!=\s*([A-Za-z0-9_.]+)", r"Ne(\1, \2)", text
    )
    text = text.replace("&&", " & ").replace("||", " | ")
    text = re.sub(r"(?<![=!<>])!(?!=)", "~", text)
    text = re.sub(r"\band\b", " & ", text)
    text = re.sub(r"\bor\b", " | ", text)
    text = re.sub(r"\bnot\b", " ~", text)
    return text


def _convert_ternary(text: str) -> str:
    question = _split_top(text, "?")
    if question < 0:
        return text
    colon = _find_ternary_colon(text, question)
    if colon < 0:
        raise MathError("条件表达式缺少冒号")
    condition = _convert_condition(text[:question].strip())
    then_branch = _convert_ternary(text[question + 1 : colon].strip())
    else_branch = _convert_ternary(text[colon + 1 :].strip())
    if not condition or not then_branch or not else_branch:
        raise MathError("条件表达式不完整")
    return (
        f"Piecewise((({then_branch}), ({condition})), "
        f"(({else_branch}), True))"
    )


def _prepare(expression: str) -> str:
    if not isinstance(expression, str):
        raise MathError("表达式必须是文本")
    expression = expression.strip()
    if not expression:
        raise MathError("表达式不能为空")
    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise MathError(f"表达式不能超过 {MAX_EXPRESSION_LENGTH} 个字符")
    lowered = expression.lower()
    for token in FORBIDDEN_TOKENS:
        if token.lower() in lowered:
            raise MathError("表达式包含不支持的语法")
    expression = expression.replace("^", "**")
    expression = expression.replace("π", "pi")
    expression = _convert_ternary(expression)
    return expression


def _whitelist_check(expression: str, parameter_names: Iterable[str]) -> None:
    allowed = ALLOWED_IDENTIFIERS | set(parameter_names)
    for identifier in IDENT_RE.findall(expression):
        if identifier in {"Eq", "Ne", "Piecewise", "True"}:
            continue
        if identifier not in allowed:
            if len(identifier) == 1 and identifier.islower():
                raise MathError(
                    f"符号 {identifier} 未声明为参数；请在工作区添加该参数"
                )
            raise MathError(f"不支持的符号或函数：{identifier}")


def _local_dict(parameter_names: Iterable[str]) -> dict[str, Any]:
    local: dict[str, Any] = {
        "x": sp.Symbol("x", real=True),
        "pi": sp.pi,
        "e": sp.E,
        "sin": sp.sin,
        "cos": sp.cos,
        "tan": sp.tan,
        "asin": sp.asin,
        "acos": sp.acos,
        "atan": sp.atan,
        "sinh": sp.sinh,
        "cosh": sp.cosh,
        "tanh": sp.tanh,
        "exp": sp.exp,
        "log": sp.log,
        "sqrt": sp.sqrt,
        "abs": sp.Abs,
        "floor": sp.floor,
        "ceil": sp.ceiling,
        "round": lambda value: sp.floor(value + sp.Rational(1, 2)),
        "sign": sp.sign,
        "min": sp.Min,
        "max": sp.Max,
        "Piecewise": sp.Piecewise,
        "Eq": sp.Eq,
        "Ne": sp.Ne,
        "True": sp.true,
    }
    for name in parameter_names:
        local[name] = sp.Symbol(name, real=True)
    return local


@dataclass
class CompiledExpression:
    source: str
    expression: sp.Expr
    parameter_names: list[str] = field(default_factory=list)
    free_symbols: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def symbol(self) -> sp.Symbol:
        return sp.Symbol("x", real=True)

    def _args(self) -> list[sp.Symbol]:
        return [self.symbol] + [sp.Symbol(name, real=True) for name in self.parameter_names]

    def evaluate(self, x: float, parameters: dict[str, float] | None = None) -> float | None:
        parameters = parameters or {}
        args = [x]
        for name in self.parameter_names:
            if name not in parameters:
                raise MathError(f"缺少参数 {name} 的取值")
            args.append(float(parameters[name]))
        try:
            with np.errstate(all="ignore"):
                fn = sp.lambdify(self._args(), self.expression, modules=["numpy"])
                value = fn(*args)
                if isinstance(value, np.ndarray):
                    if value.size != 1:
                        return None
                    value = value.item()
                return _scalar(value)
        except Exception:
            try:
                fn = sp.lambdify(self._args(), self.expression, modules=["math"])
                return _finite(fn(*args))
            except Exception:
                return None

    def evaluate_array(
        self, xs: np.ndarray, parameters: dict[str, float] | None = None
    ) -> np.ndarray:
        parameters = parameters or {}
        args = [xs]
        for name in self.parameter_names:
            if name not in parameters:
                raise MathError(f"缺少参数 {name} 的取值")
            args.append(float(parameters[name]))
        try:
            with np.errstate(all="ignore"):
                fn = sp.lambdify(self._args(), self.expression, modules=["numpy"])
                values = fn(*args)
                array = np.asarray(values, dtype=np.complex128)
                real = np.real(array)
                imag = np.abs(np.imag(array))
                real = np.where(imag < 1e-12, real, np.nan)
                return np.asarray(real, dtype=float)
        except Exception:
            values = (self.evaluate(float(x), parameters) for x in xs)
            return np.array([value if value is not None else np.nan for value in values])


def compile_expression(
    expression: str, parameter_names: Iterable[str] = (), *, for_domain_check: bool = False
) -> CompiledExpression:
    names = sorted({name for name in parameter_names if name != "x"})
    prepared = _prepare(expression)
    if for_domain_check and re.fullmatch(r"dirichlet\s*\(\s*x\s*\)", prepared, re.IGNORECASE):
        symbol = sp.Symbol("x", real=True)
        return CompiledExpression(expression, sp.Function("Dirichlet")(symbol), [], ["x"])
    _whitelist_check(prepared, names)
    if for_domain_check:
        # Bound exact constant powers before SymPy constructs a numeric object.
        try:
            nodes = list(ast.walk(ast.parse(prepared, mode="eval")))
        except (SyntaxError, RecursionError) as error:
            raise MathError("表达式语法无法解析") from error
        for node in nodes:
            if isinstance(node, ast.Constant) and isinstance(node.value, int) and node.value.bit_length() > 48:
                raise MathError("常数过大")
            if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
                for part in ast.walk(node.right):
                    if (isinstance(part, ast.Pow) or
                        isinstance(part, ast.Constant) and isinstance(part.value, (int, float)) and abs(part.value) > 1024):
                        raise MathError("指数过于复杂")
    local = _local_dict(names)
    try:
        parsed = parse_expr(
            prepared,
            local_dict=local,
            global_dict={
                "__builtins__": {},
                "Symbol": sp.Symbol,
                "Integer": sp.Integer,
                "Float": sp.Float,
                "Rational": sp.Rational,
                "Add": sp.Add,
                "Mul": sp.Mul,
                "Pow": sp.Pow,
                "Lt": sp.Lt, "Le": sp.Le, "Gt": sp.Gt, "Ge": sp.Ge,
            },
            transformations=TRANSFORMATIONS,
            # Retain original denominators: cancelling x/x loses its hole at zero.
            evaluate=not for_domain_check,
        )
    except MathError:
        raise
    except Exception as exc:
        raise MathError("表达式语法无法解析，请检查括号、运算符和函数名") from exc
    if parsed is None or not isinstance(parsed, sp.Expr):
        raise MathError("表达式必须是实值一元函数")
    if parsed.has(sp.I) or parsed.has(sp.zoo) or parsed.has(sp.nan):
        raise MathError("暂不支持复值或非有限表达式")
    if for_domain_check and any(
        term.is_number and (term.is_real is False or term.is_finite is False)
        for term in sp.preorder_traversal(parsed) if isinstance(term, sp.Expr)
    ):
        raise MathError("暂不支持复值或非有限表达式")
    operations = sp.count_ops(parsed)
    if operations > MAX_OPERATIONS:
        raise MathError("表达式过于复杂")
    free = sorted(str(symbol) for symbol in parsed.free_symbols)
    unknown = [name for name in free if name != "x" and name not in names]
    if unknown:
        raise MathError(f"表达式使用了未声明的参数：{', '.join(unknown)}")
    warnings: list[str] = []
    if for_domain_check:
        return CompiledExpression(expression, parsed, names, free)
    try:
        singular = sp.singularities(parsed, sp.Symbol("x", real=True))
        if singular:
            warnings.append(f"符号分析检测到可能奇点：{str(singular)[:300]}")
    except Exception:
        pass
    if parsed.has(sp.Piecewise):
        warnings.append("分段表达式只在各自分支内部求值，分界点不自动视为连续")
    return CompiledExpression(
        source=expression,
        expression=parsed,
        parameter_names=names,
        free_symbols=free,
        warnings=warnings,
    )


def required_parameters(expression: str) -> list[str]:
    """Return undeclared symbols that the UI should turn into parameter sliders."""

    prepared = _prepare(expression)
    identifiers = set(IDENT_RE.findall(prepared))
    return sorted(
        identifier
        for identifier in identifiers
        if re.fullmatch(r"[a-df-wz]", identifier)
        and identifier not in {"x", "e"}
    )


def compile_surface_expression(expression: str) -> sp.Expr:
    """Validate a two-variable surface expression without evaluating it.

    This is intentionally separate from compile_expression(), which assumes a
    one-variable function x and parameter sliders. The frontend evaluates the
    actual grid; the backend validator only needs to reject unsafe or ambiguous
    expressions before an AI response is accepted.
    """

    prepared = _prepare(expression)
    _whitelist_check(prepared, {"y"})
    local = _local_dict(("y",))
    local["y"] = sp.Symbol("y", real=True)
    try:
        parsed = parse_expr(
            prepared,
            local_dict=local,
            global_dict={
                "__builtins__": {},
                "Symbol": sp.Symbol,
                "Integer": sp.Integer,
                "Float": sp.Float,
                "Rational": sp.Rational,
                "Add": sp.Add,
                "Mul": sp.Mul,
                "Pow": sp.Pow,
            },
            transformations=TRANSFORMATIONS,
            evaluate=True,
        )
    except MathError:
        raise
    except Exception as exc:
        raise MathError("曲面表达式语法无法解析，请检查括号、运算符和函数名") from exc
    if parsed is None or not isinstance(parsed, sp.Expr):
        raise MathError("曲面表达式必须是实值函数")
    if parsed.has(sp.I) or parsed.has(sp.zoo) or parsed.has(sp.nan):
        raise MathError("暂不支持复值或非有限表达式")
    if sp.count_ops(parsed) > MAX_OPERATIONS:
        raise MathError("曲面表达式过于复杂")
    free = {str(symbol) for symbol in parsed.free_symbols}
    unknown = sorted(free - {"x", "y"})
    if unknown:
        raise MathError(f"曲面只支持 x、y 两个自变量；未声明符号：{', '.join(unknown)}")
    return parsed



def _sample(compiled: CompiledExpression, start: float, end: float, count: int, params: dict) -> tuple[np.ndarray, np.ndarray]:
    xs = np.linspace(start, end, count)
    return xs, compiled.evaluate_array(xs, params)


def _max_abs(values: np.ndarray) -> float | None:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return None
    return float(np.max(np.abs(finite)))


def _valid_ratio(values: np.ndarray) -> float:
    if values.size == 0:
        return 0.0
    return float(np.count_nonzero(np.isfinite(values)) / values.size)


def validate_and_normalize_scene(scene: dict[str, Any]) -> dict[str, Any]:
    """Validate expressions and align the parameter list with required symbols."""

    curves = scene.get("curves") or []
    declared = {item["name"] for item in scene.get("parameters", [])}
    auto: set[str] = set()
    for curve in curves:
        auto.update(required_parameters(curve["expression"]))
    available = declared | auto
    required: set[str] = set()
    compiled_curves: list[dict[str, Any]] = []
    for curve in curves:
        compiled = compile_expression(curve["expression"], available)
        required.update(compiled.free_symbols)
        required.discard("x")
        compiled_curves.append(
            {
                "id": curve["id"],
                "symbols": compiled.free_symbols,
                "warnings": compiled.warnings,
            }
        )
    parameters = [
        dict(item) for item in scene.get("parameters", []) if item["name"] in required
    ]
    existing = {item["name"] for item in parameters}
    for name in sorted(required - existing):
        parameters.append({"name": name, "value": 1.0, "min": -5.0, "max": 5.0})
    if len(parameters) > 8:
        raise MathError("一个工作区最多支持 8 个参数")
    normalized = dict(scene)
    normalized["parameters"] = parameters
    normalized["_compiled"] = compiled_curves
    return normalized


def _numeric_taylor(compiled: CompiledExpression, x0: float, order: int, params: dict) -> dict[str, Any]:
    x = compiled.symbol
    polynomial = 0
    coefficients: list[float | None] = []
    try:
        for k in range(order + 1):
            coefficient = sp.simplify(
                sp.diff(compiled.expression, x, k).subs(x, sp.Float(x0)) / sp.factorial(k)
            )
            value = _scalar(coefficient)
            coefficients.append(value if value is not None else 0.0)
            if value is not None:
                polynomial += value * (sp.Symbol("x") - x0) ** k
    except Exception:
        return {
            "available": False,
            "reason": "该函数在当前展开点无法稳定计算 Taylor 系数",
            "coefficients": [],
        }
    remainder_bound = None
    try:
        derivative = sp.diff(compiled.expression, x, order + 1)
        fn = sp.lambdify([x] + [sp.Symbol(name) for name in compiled.parameter_names], derivative, "numpy")
        xs = np.linspace(x0 - 1, x0 + 1, 201)
        with np.errstate(all="ignore"):
            bound_values = np.asarray(
                fn(xs, *[params[name] for name in compiled.parameter_names]),
                dtype=np.complex128,
            )
        bound_values = np.abs(np.real(bound_values))
        finite = bound_values[np.isfinite(bound_values)]
        if finite.size:
            remainder_bound = float(np.max(finite))
    except Exception:
        remainder_bound = None
    return {
        "available": True,
        "polynomial": str(sp.simplify(polynomial)),
        "coefficients": coefficients,
        "remainder_numeric_bound": remainder_bound,
    }


def analyze_expression(
    expression: str,
    *,
    parameters: dict[str, float] | None = None,
    x0: float = 0.0,
    epsilon: float = 0.3,
    delta: float = 0.2,
    x_min: float = -3.0,
    x_max: float = 3.0,
    order: int = 3,
    subdivisions: int = 20,
) -> dict[str, Any]:
    """Return server-side analysis with explicit numeric/proof boundaries."""

    params = dict(parameters or {})
    compiled = compile_expression(expression, params.keys())
    for name in compiled.parameter_names:
        params.setdefault(name, 1.0)
    x = compiled.symbol
    result: dict[str, Any] = {
        "expression": expression,
        "normalized": str(compiled.expression),
        "parameters": compiled.parameter_names,
        "warnings": list(compiled.warnings),
        "disclaimer": (
            "以下结果来自符号计算与有限采样。数值检查不构成连续、可导或可积的证明；"
            "证明必须使用定义、定理与完整论证。"
        ),
    }

    # Symbolic derivative and second derivative.
    try:
        derivative = sp.simplify(sp.diff(compiled.expression, x))
        second = sp.simplify(sp.diff(compiled.expression, x, 2))
        result["derivative"] = str(derivative)
        result["second_derivative"] = str(second)
        derivative_ok = True
    except Exception:
        derivative = None
        second = None
        result["derivative"] = None
        result["second_derivative"] = None
        derivative_ok = False

    # Values at x0 and local epsilon-delta sampling.
    f_x0 = compiled.evaluate(x0, params)
    result["value_at_x0"] = f_x0
    xs_local, ys_local = _sample(
        compiled, x0 - delta, x0 + delta, 801, params
    )
    deviations = np.abs(ys_local - f_x0) if f_x0 is not None else np.array([])
    max_deviation = _max_abs(deviations) if deviations.size else None
    coverage = _valid_ratio(ys_local)
    passed = (
        max_deviation is not None
        and max_deviation < epsilon
        and coverage > 0.99
    )
    result["epsilon_delta"] = {
        "x0": x0,
        "epsilon": epsilon,
        "delta": delta,
        "max_deviation_numeric": _round(max_deviation),
        "sample_coverage": round(coverage, 4),
        "status": "passed_numeric" if passed else "failed_or_undefined_numeric",
        "proof": False,
    }

    # Derivative magnitude envelope on [x0-delta, x0+delta].
    slope_bound = None
    slope_samples = None
    if derivative_ok:
        try:
            dfn = sp.lambdify(
                [x] + [sp.Symbol(name) for name in compiled.parameter_names],
                derivative,
                "numpy",
            )
            with np.errstate(all="ignore"):
                slopes = np.asarray(
                    dfn(xs_local, *[params[name] for name in compiled.parameter_names]),
                    dtype=np.complex128,
                )
            slopes = np.abs(np.real(slopes))
            slope_samples = slopes
            slope_bound = _max_abs(slopes)
        except Exception:
            slope_bound = None
    delta_bound = None
    if slope_bound and slope_bound > 1e-9:
        delta_bound = epsilon / slope_bound
    result["slope_envelope"] = {
        "max_abs_derivative_numeric": _round(slope_bound),
        "delta_bound_numeric": _round(delta_bound),
        "status": (
            "no_bound"
            if slope_bound is None
            else "delta_at_or_below_bound"
            if delta_bound is not None and delta <= delta_bound
            else "delta_above_numeric_bound"
        ),
        "method": "numeric_sampling",
        "proof": False,
    }

    # Taylor coefficients and numeric remainder envelope.
    taylor = _numeric_taylor(compiled, x0, order, params)
    taylor["order"] = order
    taylor["x0"] = x0
    result["taylor"] = taylor

    # Riemann sums, clearly separated from Darboux exact bounds.
    try:
        xs, ys = _sample(compiled, x_min, x_max, max(2001, subdivisions * 20), params)
        finite = np.isfinite(ys)
        if not finite.any():
            raise ValueError("no finite samples")
        # Restrict to contiguous finite stretch containing the midpoint.
        edges = np.linspace(x_min, x_max, subdivisions + 1)
        left = 0.0
        right = 0.0
        midpoint = 0.0
        for a, b in zip(edges[:-1], edges[1:]):
            midpoint_value = compiled.evaluate((a + b) / 2, params)
            left_value = compiled.evaluate(a, params)
            right_value = compiled.evaluate(b, params)
            if midpoint_value is not None:
                midpoint += midpoint_value * (b - a)
            if left_value is not None:
                left += left_value * (b - a)
            if right_value is not None:
                right += right_value * (b - a)
        result["riemann"] = {
            "interval": [x_min, x_max],
            "subdivisions": subdivisions,
            "midpoint_sum": _round(midpoint),
            "left_sum": _round(left),
            "right_sum": _round(right),
            "note": (
                "这些是固定取点与有限分割下的数值和，不是 Darboux 上下和，也不构成可积性证明。"
            ),
            "proof": False,
        }
    except Exception:
        result["riemann"] = {
            "interval": [x_min, x_max],
            "subdivisions": subdivisions,
            "midpoint_sum": None,
            "left_sum": None,
            "right_sum": None,
            "note": "该区间上无法稳定采样。",
            "proof": False,
        }

    # Simple continuity diagnostics.
    discontinuity = None
    if f_x0 is None:
        discontinuity = "x0 处函数值未定义或非实值"
    else:
        left_value = compiled.evaluate(x0 - 1e-6, params)
        right_value = compiled.evaluate(x0 + 1e-6, params)
        if left_value is None or right_value is None:
            discontinuity = "邻域内存在未定义点"
        elif max(abs(left_value - f_x0), abs(right_value - f_x0)) > max(epsilon, 1e-3):
            discontinuity = "邻域内的函数值与 x0 处的值明显不一致，可能间断"
    result["continuity_note"] = discontinuity or "有限采样未发现明显异常，但不能据此断言连续"
    result["checks"] = {
        "expression_parsed": True,
        "derivative_computed": derivative_ok,
        "taylor_available": bool(taylor.get("available")),
        "numeric_only": True,
    }
    return result


def _round(value: float | None, digits: int = 8) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value):
        return None
    return round(float(value), digits)


def check_answer(
    expected: str, given: str, kind: str = "expression", variable: str = "x"
) -> dict[str, Any]:
    """Conservative symbolic equivalence check for computable exercises."""

    cleaned = given.strip()
    if cleaned.count("=") == 1:
        cleaned = cleaned.split("=", 1)[1].strip()
    if kind == "integral":
        # An antiderivative is only determined up to an additive constant.
        cleaned = re.sub(r"\+\s*[CK]\s*$", "", cleaned).strip()
    try:
        expected_expr = compile_expression(expected).expression
        given_expr = compile_expression(cleaned).expression
    except MathError as exc:
        return {
            "checked": True,
            "equivalent": None,
            "method": "parse_failed",
            "note": f"无法解析提交的表达式：{exc}",
        }
    x = sp.Symbol(variable, real=True)
    try:
        if kind == "derivative":
            difference = sp.simplify(sp.diff(given_expr, x) - expected_expr)
        elif kind == "integral":
            difference = sp.simplify(sp.diff(given_expr, x) - expected_expr)
        else:
            difference = sp.simplify(given_expr - expected_expr)
        if difference == 0:
            return {
                "checked": True,
                "equivalent": True,
                "method": "symbolic_simplify",
                "note": "符号化简后与参考表达式一致。",
            }
        # Numeric fallback for expressions SymPy cannot reduce symbolically.
        points = [0.37, 0.91, 1.23, SAFE_POINT]
        for point in points:
            a = expected_expr.subs(x, point)
            b = given_expr.subs(x, point)
            try:
                if abs(complex(a.evalf()) - complex(b.evalf())) > 1e-8:
                    return {
                        "checked": True,
                        "equivalent": False,
                        "method": "numeric_counterexample",
                        "note": f"在 x={point} 处两者数值不同，不能判定等价。",
                    }
            except (TypeError, ValueError):
                return {
                    "checked": True,
                    "equivalent": None,
                    "method": "inconclusive",
                    "note": "符号与数值检查均无法确认等价，需要人工核查。",
                }
        return {
            "checked": True,
            "equivalent": None,
            "method": "inconclusive",
            "note": "未找到反例，但符号化简未能证明等价，需要人工核查。",
        }
    except Exception:
        return {
            "checked": True,
            "equivalent": None,
            "method": "inconclusive",
            "note": "表达式检查未能完成，需要人工核查。",
        }


SAFE_POINT = 2.71
