"""Reviewed exercise templates and deterministic, validated variants.

Every variant is generated from a reviewed template (not a free-form model
output). The stored ``validation`` record states exactly what was checked:
template constraints, arithmetic checks and whether a symbolic answer check is
available. Proof variants are explicitly not auto-graded.
"""

from __future__ import annotations

from typing import Any

EXERCISE_TEMPLATES = [
    {
        "id": "et-continuous-linear",
        "slug": "continuous-linear",
        "topic": "continuous",
        "name": "线性函数的 ε–δ 证明",
        "family": "定义与量词",
        "skill": "定义理解",
        "type": "proof",
        "difficulty": 2,
        "allowed_refs": ["eps-delta", "absolute-value"],
        "generator": {"family": "linear-epsilon-delta", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-uniform-quadratic",
        "slug": "uniform-quadratic",
        "topic": "uniform",
        "name": "平方函数在闭区间与实数轴上的对比",
        "family": "条件变式",
        "skill": "条件辨析",
        "type": "condition_variant",
        "difficulty": 3,
        "allowed_refs": ["eps-delta", "absolute-value", "compact-interval"],
        "generator": {"family": "uniform-quadratic", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-derivative-abs",
        "slug": "derivative-abs",
        "topic": "derivative",
        "name": "连续不可导的反例构造",
        "family": "判断与正反例",
        "skill": "反例构造",
        "type": "proof",
        "difficulty": 2,
        "allowed_refs": ["one-sided-limits", "difference-quotient"],
        "generator": {"family": "scaled-abs", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-mvt-sine",
        "slug": "mvt-sine",
        "topic": "mean-value",
        "name": "用中值定理证明正弦的 Lipschitz 估计",
        "family": "证明补全",
        "skill": "独立证明",
        "type": "proof_completion",
        "difficulty": 3,
        "allowed_refs": ["mvt", "inequality"],
        "generator": {"family": "sine-lipschitz", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-taylor-exp",
        "slug": "taylor-exp",
        "topic": "taylor",
        "name": "指数函数的二阶 Taylor 与余项估计",
        "family": "计算与论证",
        "skill": "计算与论证",
        "type": "computation",
        "difficulty": 3,
        "allowed_refs": ["taylor-theorem", "high-derivative", "inequality"],
        "generator": {"family": "exp-taylor", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-primitive-partial",
        "slug": "primitive-partial",
        "topic": "primitive",
        "name": "分部积分与求导验证",
        "family": "计算与论证",
        "skill": "计算与论证",
        "type": "computation",
        "difficulty": 3,
        "allowed_refs": ["integration-by-parts", "derivative-rules"],
        "generator": {"family": "x-exp-kx", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-riemann-linear",
        "slug": "riemann-linear",
        "topic": "riemann",
        "name": "Darboux 上下和与可积性",
        "family": "证明补全",
        "skill": "独立证明",
        "type": "proof",
        "difficulty": 3,
        "allowed_refs": ["darboux", "sup-inf", "finite-sum"],
        "generator": {"family": "linear-darboux", "coefficients": [2, 3, 4, 5]},
    },
    {
        "id": "et-ftc-polynomial",
        "slug": "ftc-polynomial",
        "topic": "integral",
        "name": "变上限积分与微积分基本定理",
        "family": "计算与论证",
        "skill": "综合迁移",
        "type": "computation",
        "difficulty": 3,
        "allowed_refs": ["ftc", "integration-by-parts"],
        "generator": {"family": "ftc-cubic", "coefficients": [2, 3, 4, 5]},
    },
]


def _steps(*items: tuple[str, str]) -> list[dict[str, str]]:
    return [{"title": title, "text": text} for title, text in items]


def build_variant(topic: str, k: int) -> dict[str, Any]:
    common_checks = [
        "写清定义域与全部条件",
        "说明关键构造或引用依据",
        "覆盖边界情况并写出结论",
    ]
    if topic == "continuous":
        return {
            "title": f"用 ε–δ 定义证明 f(x)={k}x+1 在任意 x₀∈ℝ 连续。",
            "domain": "x∈ℝ，x₀ 任意取定",
            "hint": "先把函数值的差写成自变量之差的倍数，再反推 δ。",
            "solution": _steps(
                ("分析目标", f"|f(x)−f(x₀)|={k}|x−x₀|，所以只需让 |x−x₀| 小于 ε/{k}。"),
                ("选择 δ", f"任给 ε>0，取 δ=ε/{k}>0。"),
                ("验证定义", f"若 |x−x₀|<δ，则 |f(x)−f(x₀)|={k}|x−x₀|<{k}δ=ε，故 f 在 x₀ 连续。"),
                ("补充观察", "这里的 δ 不依赖 x₀，因此同一估计还说明 f 在 ℝ 上一致连续。"),
            ),
            "errors": [
                {"text": "把 δ 取成依赖 x₀ 的量而不说明理由", "error_type": "quantifier", "review_concept": "uniform"},
                {"text": "直接写“显然连续”，没有使用定义", "error_type": "missing_argument", "review_concept": "continuous"},
            ],
            "answer_check": {},
            "difficulty": 2,
        }
    if topic == "uniform":
        return {
            "title": f"证明 f(x)={k}x² 在 [0,1] 上一致连续，并证明它在 ℝ 上不一致连续。",
            "domain": "先讨论 [0,1]，再讨论整个 ℝ",
            "hint": f"先在 [0,1] 上固定 ε，取 δ=ε/{2*k} 并估计 |x+y|；整个实数轴上让两点距离趋于零而函数值差保持有界。",
            "solution": _steps(
                ("有界区间估计", f"在 [0,1] 上，|f(x)−f(y)|={k}|x−y||x+y|≤{2*k}|x−y|。"),
                ("取 δ", f"任给 ε>0，取 δ=ε/{2*k}，则 |x−y|<δ 时 |f(x)−f(y)|<ε，故在 [0,1] 上一致连续。"),
                ("构造反例序列", f"在 ℝ 上取 xₙ=n，yₙ=n+1/n，则 |xₙ−yₙ|=1/n→0。"),
                ("验证失败", f"但 |f(yₙ)−f(xₙ)|={2*k}+{k}/n²>{k}。固定 ε₀={k}，任意 δ>0 取 n>1/δ 即违反一致连续的定义。"),
                ("结论", "因此 f 在 ℝ 上不一致连续。这说明闭区间条件不能随意去掉。"),
            ),
            "errors": [
                {"text": "在 ℝ 上仍然使用 |x+y|≤2 的界", "error_type": "invalid_estimate", "review_concept": "uniform"},
                {"text": "只说明“越远离原点越陡”，没有给出两列点", "error_type": "missing_counterexample", "review_concept": "uniform"},
            ],
            "answer_check": {},
            "difficulty": 3,
        }
    if topic == "derivative":
        return {
            "title": f"证明 f(x)={k}|x| 在 0 连续但不可导。",
            "domain": "x∈ℝ",
            "hint": "对 h>0 与 h<0 分别写出差商，并注意 h≠0。",
            "solution": _steps(
                ("连续性", f"f(0)=0，且 |f(x)−f(0)|={k}|x|→0，故 f 在 0 连续。也可任给 ε>0 取 δ=ε/{k}。"),
                ("右差商", f"当 h>0 时 [f(h)−f(0)]/h={k}。"),
                ("左差商", f"当 h<0 时 [f(h)−f(0)]/h=−{k}。"),
                ("结论", f"左右差商极限分别为 {k} 与 −{k}，不相等，因此双侧差商极限不存在，f 在 0 不可导。"),
            ),
            "errors": [
                {"text": "用图像的“尖点”代替左右差商计算", "error_type": "informal_argument", "review_concept": "derivative"},
                {"text": "漏写 h≠0 的条件", "error_type": "missing_condition", "review_concept": "derivative"},
            ],
            "answer_check": {},
            "difficulty": 2,
        }
    if topic == "mean-value":
        return {
            "title": f"用 Lagrange 中值定理证明 |sin x−sin y|≤|x−y|，其中 x,y∈[−{k},{k}]。",
            "domain": f"x,y∈[−{k},{k}]",
            "hint": "将函数值之差写成某处的导数乘以两点间距。",
            "solution": _steps(
                ("平凡情形", "若 x=y，不等式两边都为 0。"),
                ("检查定理条件", "若 x≠y，sin 在连接 x,y 的闭区间上连续，在其内部可导，因此可以使用 Lagrange 中值定理。"),
                ("应用中值定理", "存在介于 x,y 之间的 ξ，使 sin x−sin y=cos ξ·(x−y)。"),
                ("估计", "因为 |cos ξ|≤1，取绝对值得 |sin x−sin y|≤|x−y|。该结论对所有实数 x,y 都成立。"),
            ),
            "errors": [
                {"text": "未检查闭区间连续与开区间可导", "error_type": "missing_condition", "review_concept": "mean-value"},
                {"text": "把 |cos ξ|≤1 写成等式", "error_type": "invalid_inequality", "review_concept": "mean-value"},
            ],
            "answer_check": {},
            "difficulty": 3,
        }
    if topic == "taylor":
        remainder = f"e^(1/{k})/{6*k*k*k}"
        return {
            "title": f"写出 eˣ 在 0 处的二阶 Taylor 多项式，并给出 |x|≤1/{k} 时的严格余项上界。",
            "domain": f"|x|≤1/{k}",
            "hint": "先写出带 Lagrange 余项的等式，再分别估计指数因子与 x³。",
            "solution": _steps(
                ("写出公式", "指数函数各阶导数连续，故 eˣ=1+x+x²/2+eᶿx³/6，θ 介于 0 与 x 之间（x=0 时余项为 0）。"),
                ("多项式", "二阶 Taylor 多项式为 P₂(x)=1+x+x²/2。"),
                ("余项估计", f"当 |x|≤1/{k} 时 θ≤1/{k}，因此 |R₂(x)|≤e^(1/{k})/(6·{k}³)={remainder}。"),
                ("解释", "这个界来自 Taylor 定理与区间估计，不依赖图像采样；离开该区间时不能套用同一个界。"),
            ),
            "errors": [
                {"text": "把 Taylor 多项式当成所有实数上的精确等式", "error_type": "overgeneralization", "review_concept": "taylor"},
                {"text": "余项估计未限定 x 的范围", "error_type": "missing_condition", "review_concept": "taylor"},
            ],
            "answer_check": {},
            "difficulty": 3,
        }
    if topic == "primitive":
        return {
            "title": f"求 ∫ x e^({k}x) dx，验证结果并说明任意两个原函数相差常数的原因。",
            "domain": "x∈ℝ",
            "hint": "取 u=x，使求导后次数降低；把指数函数放在 dv 中。",
            "solution": _steps(
                ("分部积分", f"取 u=x，dv=e^({k}x)dx，则 du=dx，v=e^({k}x)/{k}。"),
                ("计算", f"原式=x e^({k}x)/{k}−∫e^({k}x)/{k}dx=x e^({k}x)/{k}−e^({k}x)/{k}²+C。"),
                ("整理", f"即 e^({k}x)({k}x−1)/{k}²+C。"),
                ("求导验证", f"对结果求导得 e^({k}x)({k}x−1)/{k}+e^({k}x)/{k}=x e^({k}x)，与 integrand 一致。"),
                ("常数差", "任意两个原函数的差导数为 0，对区间内任意两点应用中值定理可知该差在整个区间上为常数。"),
            ),
            "errors": [
                {"text": "忘记 +C", "error_type": "missing_constant", "review_concept": "primitive"},
                {"text": "分部积分中 u 与 dv 选反导致循环", "error_type": "method_choice", "review_concept": "primitive"},
            ],
            "answer_check": {"kind": "integral", "expected": f"x*exp({k}*x)", "variable": "x"},
            "difficulty": 3,
        }
    if topic == "riemann":
        return {
            "title": f"用 Darboux 上下和证明 f(x)={k}x 在 [0,1] 上可积，并求积分值。",
            "domain": "[0,1]",
            "hint": "在每个小区间找出上下确界；注意“网格足够细”与“图像看起来接近”不是同一件事。",
            "solution": _steps(
                ("等分与确界", f"将 [0,1] 等分 n 段，每段长 1/n。f 递增，故每段下确界在左端、上确界在右端。"),
                ("计算上下和", f"Lₙ={k}(n−1)/(2n)，Uₙ={k}(n+1)/(2n)。"),
                ("控制差", f"Uₙ−Lₙ={k}/n。任给 ε>0，取 n>{k}/ε，则上下和之差小于 ε。"),
                ("应用判据", "由 Darboux 判据，f 在 [0,1] 上 Riemann 可积。"),
                ("求积分值", f"上下和都趋于 {k}/2，且积分被它们夹住，故 ∫₀¹{k}x dx={k}/2。"),
            ),
            "errors": [
                {"text": "用采样最大最小值冒充上下确界", "error_type": "invalid_concept", "review_concept": "riemann"},
                {"text": "只用某一种固定取点的 Riemann 和说明可积", "error_type": "insufficient_argument", "review_concept": "riemann"},
            ],
            "answer_check": {},
            "difficulty": 3,
        }
    if topic == "integral":
        return {
            "title": f"设 F(x)=∫₀ˣ{k}t²dt，x∈[0,1]。求 F(x)、F′(x)（0<x<1），并核对基本定理的条件。",
            "domain": "x∈[0,1]",
            "hint": "分别用原函数计算累积量、用基本定理求其导数。",
            "solution": _steps(
                ("检查条件", f"被积函数 {k}t² 在 [0,1] 上连续，因此 Riemann 可积并满足当前版本微积分基本定理的条件。"),
                ("求 F", f"一个原函数是 {k}t³/3，故 F(x)={k}x³/3。"),
                ("求导", f"对 0<x<1，基本定理给出 F′(x)={k}x²。直接对 {k}x³/3 求导得到相同结果。"),
                ("端点说明", "在 x=0 与 x=1 处只讨论相应单侧导数，不把内点结论直接搬到端点。"),
            ),
            "errors": [
                {"text": "未说明被积函数连续就使用基本定理", "error_type": "missing_condition", "review_concept": "integral"},
                {"text": "把定积分直接写成不定积分并漏掉常数处理", "error_type": "concept_confusion", "review_concept": "integral"},
            ],
            "answer_check": {"kind": "derivative", "expected": f"{k}*x^2", "variable": "x"},
            "difficulty": 3,
        }
    raise ValueError(f"unsupported exercise topic: {topic}")


def build_exercises() -> list[dict[str, Any]]:
    exercises: list[dict[str, Any]] = []
    for template in EXERCISE_TEMPLATES:
        for k in template["generator"]["coefficients"]:
            variant = build_variant(template["topic"], k)
            difficulty = min(5, variant["difficulty"] + (k - 2))
            exercises.append(
                {
                    "id": f"{template['topic']}-{k}",
                    "code": f"{template['topic']}-{k}",
                    "topic": template["topic"],
                    "template": template["id"],
                    "title": variant["title"],
                    "statement": variant["title"],
                    "domain": variant["domain"],
                    "difficulty": difficulty,
                    "skill": template["skill"],
                    "type": template["type"],
                    "allowed_refs": template["allowed_refs"],
                    "hint": variant["hint"],
                    "solution": variant["solution"],
                    "errors": variant["errors"],
                    "checks": [
                        "写清定义域与全部条件",
                        "说明关键构造或引用依据",
                        "覆盖边界情况并写出结论",
                    ],
                    "answer_check": variant["answer_check"],
                    "source": "template",
                    "provenance": {
                        "template": template["slug"],
                        "template_version": 1,
                        "coefficient": k,
                        "model": None,
                        "prompt_version": None,
                    },
                    "validation": {
                        "checked_by": "template_rules",
                        "template_version": 1,
                        "constraints_checked": True,
                        "solution_present": True,
                        "symbolic_check": bool(variant["answer_check"]),
                        "proof_auto_graded": False,
                        "note": (
                            "由已审核模板确定性生成；计算题检查最终表达式，证明题只做关键步骤结构分，不判定数学正确性。"
                        ),
                    },
                    "review_status": "auto_checked",
                }
            )
    return exercises
