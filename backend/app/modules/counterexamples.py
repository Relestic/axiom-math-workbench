"""Check a proposed real function on an explicitly open or closed interval."""

import numpy as np
import sympy as sp
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator
from sympy.calculus.util import continuous_domain

from ..adapters.math import MathError, compile_expression


class IntervalInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    a: FiniteFloat
    b: FiniteFloat
    left_closed: bool
    right_closed: bool

    @model_validator(mode="after")
    def ordered(self):
        if self.a >= self.b:
            raise ValueError("左端点必须小于右端点")
        return self

    def interval(self):
        return sp.Interval(sp.Rational(str(self.a)), sp.Rational(str(self.b)),
                           left_open=not self.left_closed, right_open=not self.right_closed)

    def label(self):
        def number(value):
            return str(value).removesuffix(".0")
        return f"{'[' if self.left_closed else '('}{number(self.a)}, {number(self.b)}{']' if self.right_closed else ')'}"


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    expression: str = Field(min_length=1, max_length=300)
    interval: IntervalInput
    include_model: bool = False


def finding(basis, text):
    return {"verdict_basis": basis, "text": text}


def _display(value):
    if isinstance(value, sp.Interval):
        return f"{'(' if value.left_open else '['}{value.start}, {value.end}{')' if value.right_open else ']'}"
    if isinstance(value, sp.Union):
        return " ∪ ".join(_display(part) for part in value.args)
    return sp.sstr(value).replace("**", "^")


def _finite_singularities(expr, symbol, interval):
    try:
        roots = sp.singularities(expr, symbol)
        return [point for point in roots if interval.contains(point) is sp.true] if isinstance(roots, sp.FiniteSet) else []
    except (ValueError, TypeError, NotImplementedError):
        return []


def _oscillatory_point(expr, symbol, closure):
    for wave in expr.atoms(sp.sin, sp.cos):
        phase = wave.args[0]
        if not phase.is_rational_function(symbol):
            continue
        for point in _finite_singularities(phase, symbol, closure):
            direction = "-" if point == closure.end else "+"
            if sp.limit(phase, symbol, point, dir=direction) in (sp.oo, -sp.oo):
                return point
    return None


def _continuous_samples(xs, domain):
    if isinstance(domain, sp.Interval):
        left, right = float(domain.start), float(domain.end)
        return (xs > left if domain.left_open else xs >= left) & (xs < right if domain.right_open else xs <= right)
    if isinstance(domain, sp.Union):
        parts = [_continuous_samples(xs, part) for part in domain.args]
        if all(part is not None for part in parts):
            return np.logical_or.reduce(parts)
    if domain is sp.S.EmptySet:
        return np.zeros(xs.shape, dtype=bool)
    return None


def _numeric_finding(compiled, bounds, domain):
    # Interpolation avoids overflow in b-a; filtering handles very short
    # intervals where floating-point rounding lands on an excluded endpoint.
    weights = np.linspace(0, 1, 257)
    xs = np.unique((1 - weights) * bounds.a + weights * bounds.b)
    xs = xs[(xs >= bounds.a if bounds.left_closed else xs > bounds.a)
            & (xs <= bounds.b if bounds.right_closed else xs < bounds.b)]
    if not len(xs):
        return finding("numeric-sample", "当前开闭区间内没有可用的浮点网格点。")
    sample_mask = _continuous_samples(xs, domain)
    restricted = sample_mask is not None and not sample_mask.all()
    if restricted:
        xs = xs[sample_mask]
    if not len(xs):
        return finding("numeric-sample", "本次网格没有落在已确认实数连续域内的点。")
    values = np.broadcast_to(compiled.evaluate_array(xs), xs.shape)
    finite = values[np.isfinite(values)]
    if not len(finite):
        return finding("numeric-sample", f"{len(xs)} 个网格点均未得到有限实数值，不能据此断言整个区间无定义。")
    location = "在已确认的实数连续域内" if restricted else ""
    return finding("numeric-sample", f"{location}检验 {len(xs)} 个网格点，其中 {len(finite)} 个得到有限实数值，"
                   f"样本最小值 {finite.min():.6g}、最大值 {finite.max():.6g}。有限采样不能证明连续、有界或可积。")


def check_candidate(candidate: Candidate):
    try:
        compiled = compile_expression(candidate.expression, for_domain_check=True)
    except (MathError, ValueError, RecursionError) as error:
        raise MathError("表达式不被允许，请使用 x、四则运算或支持的数学函数。") from error
    expr, symbol = compiled.expression, compiled.symbol
    bounds = candidate.interval
    label = bounds.label()
    findings = []
    result = {"expression": candidate.expression, "interval": label, "findings": findings}
    if expr.func == sp.Function("Dirichlet"):
        findings.append(finding("definition-only", "按定义，有理点取 1，无理点取 0。任一非退化子区间内两类点都稠密，"
                                "上下确界分别为 1 和 0。在任一非退化闭子区间上，上下和之差恒为区间长度。"))
        return result

    interval = bounds.interval()
    closure = sp.Interval(interval.start, interval.end)
    # Attempt exact calculations for modest elementary expressions. A complex
    # expression still receives the independently labelled numerical check.
    tractable = sp.count_ops(expr) <= 24 and all(
        not power.exp.is_Integer or abs(power.exp) <= 16 for power in expr.atoms(sp.Pow)
    )
    domain = None
    if tractable:
        try:
            point = _oscillatory_point(expr, symbol, closure)
            if point is not None:
                findings.append(finding("definition-only", f"靠近 x = {_display(point)} 时，三角函数的相位无界。"
                                        "普通网格会漏掉振荡，请用定义、两列点或夹逼估计检验整体函数。"))
                return result
        except (ValueError, TypeError, NotImplementedError, RecursionError):
            pass

    # General periodic domain inequalities can expand into arbitrarily many
    # individual intervals. Leave those to the explicitly numerical check.
    periodic = expr.has(sp.sin, sp.cos, sp.tan)
    simple_wave = expr.func in (sp.sin, sp.cos) and expr.args[0].is_polynomial(symbol)
    if tractable and (not periodic or simple_wave) and not expr.has(sp.Piecewise, sp.sign, sp.floor, sp.ceiling):
        try:
            domain = continuous_domain(expr, symbol, interval)
            if domain == interval:
                findings.append(finding("symbolic", f"按实数连续域推导，函数在 {label} 上处处有定义且连续。"))
            elif domain is sp.S.EmptySet:
                findings.append(finding("symbolic", f"符号算法在 {label} 内没有找到实数连续域。"))
            else:
                findings.append(finding("symbolic", f"所选区间内，符号算法得到的实数连续域为 {_display(domain)}。"))
        except (ValueError, TypeError, NotImplementedError, RecursionError):
            pass
        for point in _finite_singularities(expr, symbol, interval):
            findings.append(finding("symbolic", f"x = {_display(point)} 属于 {label}，原式在该点未定义。"))

    if tractable and expr.is_rational_function(symbol):
        try:
            derivative = sp.cancel(sp.diff(expr, symbol))
            findings.append(finding("symbolic", f"在原式有定义的区间内部，f′(x) = {_display(derivative)}。"))
            for point, direction, side, closed in (
                (interval.start, "+", "右", bounds.left_closed),
                (interval.end, "-", "左", bounds.right_closed),
            ):
                limit = sp.limit(expr, symbol, point, dir=direction)
                membership = "计入区间" if closed else "不计入区间"
                if limit in (sp.oo, -sp.oo):
                    sign = "+∞" if limit == sp.oo else "−∞"
                    text = f"{_display(point)} {membership}，趋近该端点的{side}极限为 {sign}，沿区间内有定义的点，函数值无界。"
                elif limit.is_finite is True and limit.is_real is True:
                    text = f"{_display(point)} {membership}，从区间内部趋近该端点的{side}极限为 {_display(limit)}。"
                else:
                    continue
                findings.append(finding("symbolic", text))
        except (ValueError, TypeError, NotImplementedError, RecursionError):
            pass
    findings.append(_numeric_finding(compiled, bounds, domain))
    return result
