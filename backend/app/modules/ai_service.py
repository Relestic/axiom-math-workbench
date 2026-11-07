"""AI-assisted plot editing, interpretation, feedback and reviewed-content lookup."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..adapters.llm import chat
from ..errors import ApiError
from ..models import Classic, Concept, Proposition, User
from ..serializers import classic_out
from ..schemas.visual import SceneModel
from .visual_service import validate_scene

PLOT_SYSTEM = """你是 Axiom 数学图像工作区助手。根据当前 scene 和用户对话修改函数，而不是切换预设函数类型。
只返回 JSON 对象 {"message":"中文说明","scene":完整配置或null}。输出必须是合法 json，不要代码围栏。纯解释或需澄清时 scene 为 null。
修改时保留未要求改变的函数、参数、分析模式和范围。
scene 字段：curves(1到4项，每项 id、expression、label、visible、domainMin、domainMax、leftOpen、rightOpen)，activeId，parameters(每项 name、value、min、max)，mode(graph/continuity/derivative/integral/taylor)，xMin、xMax、yMin、yMax、x0、epsilon、delta、h、integralStart、integralEnd、subdivisions(4到200整数)、order(1到5整数)。所有字段都必须返回。定义域端点不限时用null。
表达式使用 mathjs 语法：x^2、sin(a*x)、exp(-x^2)、x<0 ? -x : x^2。仅实值一元显函数，自变量x；参数为a-d,f-w,z中的单个小写字母，最多8个。允许 + - * / ^ 比较 and or not 及 sin cos tan asin acos atan sinh cosh tanh exp log sqrt abs floor ceil round sign min max。不允许赋值、数组、对象、函数定义、任意代码、积分求和命令。乘法明确写*。log是自然对数。pi和e是常数。
用户要求改变类型时请构造具体函数；要求分段函数时用条件表达式并说明分界点。新增参数提供合理范围。一元隐函数、微分方程和三维曲面暂不支持，请明确解释而不要强行转成其他函数。设置与函数相称的显示范围，定义域与显示窗口分开；不要用裁剪显示窗口掩盖数学定义域。xMin<xMax，yMin<yMax，integralStart<integralEnd。数值均在[-10000,10000]内，epsilon/delta在[.001,100]，h在[.0001,100]。
解释使用的假设，不能把有限采样当作连续性、可导性或可积性的证明。不要声称执行了未提供的工具。message中简要说明具体修改，不使用Markdown代码块。"""

INTERPRET_SYSTEM = """你是 Axiom 的图像解释助手。根据用户提供的 scene 与当前分析数据，用中文解释图像能说明什么、不能说明什么。
只返回 JSON：{"message":"不超过 400 字的解释","observations":["可观察事实"],"proof_links":[{"text":"对应的证明要素","kind":"quantifier/estimate/inequality/construction/sequence/partition"}],"uncertain":false}。输出必须是合法 json，不要代码围栏。
必须区分符号/数值证据与证明；不得声称有限采样已经证明连续、可导或可积。若图像不足以支持结论，uncertain=true 并在 message 中说明。"""

FEEDBACK_SYSTEM = """你是 Axiom 的数学作答反馈助手。根据题目、参考解答与学生作答，指出可定位的推理缺口。
只返回 JSON：{"feedback":"反馈文本","error_types":["quantifier","missing_condition","missing_argument","invalid_estimate","other"],"needs_review":true}。输出必须是合法 json，不要代码围栏。
不得因为学生方法与参考解答不同就判错；无法确认时必须 needs_review=true，并明确写出不确定性。不得声称看过完整的证明审核或形式化验证。"""


def _parse_plot_result(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回 JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("模型返回值必须是对象")
    extra = set(data) - {"message", "scene"}
    if extra:
        raise ValueError(f"模型返回了多余字段：{sorted(extra)}")
    message = data.get("message")
    if not isinstance(message, str) or not message.strip() or len(message) > 3000:
        raise ValueError("message 无效")
    scene = data.get("scene")
    if scene is None:
        return {"message": message.strip(), "scene": None}
    try:
        validated = SceneModel.model_validate(scene)
    except Exception as exc:
        raise ValueError(f"scene 未通过结构校验：{exc}") from exc
    normalized = validate_scene(validated.model_dump(), with_analysis=False)["scene"]
    return {"message": message.strip(), "scene": normalized}


def plot_change(
    session: Session,
    user: User | None,
    *,
    message: str,
    scene: dict[str, Any],
    history: list[dict] | None = None,
) -> dict[str, Any]:
    normalized = validate_scene(scene, with_analysis=False)["scene"]
    history_messages = []
    for item in (history or [])[-8:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str):
            history_messages.append({"role": role, "content": content[:3000]})
    messages = [
        {"role": "system", "content": PLOT_SYSTEM},
        *history_messages,
        {
            "role": "user",
            "content": json.dumps(
                {"currentScene": normalized, "request": message}, ensure_ascii=False
            ),
        },
    ]
    result, parsed = chat(
        session,
        messages,
        purpose="plot",
        user_id=user.id if user else None,
        json_mode=True,
        max_tokens=1600,
        validator=_parse_plot_result,
    )
    return {
        "message": parsed["message"],
        "scene": parsed["scene"],
        "provider": result.provider,
        "model": result.model,
        "usage": {
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "latency_ms": result.latency_ms,
        },
        "numeric_only": True,
    }


def _parse_interpret(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回 JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("模型返回值必须是对象")
    extra = set(data) - {"message", "observations", "proof_links", "uncertain"}
    if extra:
        raise ValueError(f"模型返回了多余字段：{sorted(extra)}")
    message = data.get("message")
    if not isinstance(message, str) or not message.strip() or len(message) > 2000:
        raise ValueError("message 无效")
    observations = data.get("observations", [])
    if not isinstance(observations, list) or any(not isinstance(item, str) for item in observations):
        raise ValueError("observations 无效")
    links = data.get("proof_links", [])
    if not isinstance(links, list):
        raise ValueError("proof_links 无效")
    return {
        "message": message.strip(),
        "observations": observations[:8],
        "proof_links": links[:8],
        "uncertain": bool(data.get("uncertain", True)),
    }


def interpret(
    session: Session,
    user: User | None,
    *,
    scene: dict[str, Any],
    question: str = "",
    template_slug: str | None = None,
) -> dict[str, Any]:
    validated = validate_scene(scene)
    normalized = validated["scene"]
    analysis = validated["analysis"]
    payload = {
        "scene": normalized,
        "analysis": analysis,
        "question": question,
        "template": template_slug,
    }
    messages = [
        {"role": "system", "content": INTERPRET_SYSTEM},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    result, parsed = chat(
        session,
        messages,
        purpose="interpret",
        user_id=user.id if user else None,
        json_mode=True,
        max_tokens=900,
        validator=_parse_interpret,
    )
    return {
        **parsed,
        "analysis": analysis,
        "provider": result.provider,
        "model": result.model,
    }


def _parse_feedback(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回 JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("模型返回值必须是对象")
    feedback = data.get("feedback")
    if not isinstance(feedback, str) or not feedback.strip():
        raise ValueError("feedback 无效")
    error_types = data.get("error_types", [])
    if not isinstance(error_types, list) or any(not isinstance(item, str) for item in error_types):
        raise ValueError("error_types 无效")
    return {
        "feedback": feedback.strip()[:5000],
        "error_types": error_types[:8],
        "needs_review": bool(data.get("needs_review", True)),
    }


def ai_feedback(
    session: Session,
    user: User,
    *,
    exercise_title: str,
    exercise_statement: str,
    solution_steps: list[dict],
    answer_text: str,
    rubric: dict[str, Any],
) -> dict[str, Any]:
    messages = [
        {"role": "system", "content": FEEDBACK_SYSTEM},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "题目": exercise_title,
                    "题干": exercise_statement,
                    "参考解答": solution_steps,
                    "学生作答": answer_text,
                    "规则检查": rubric,
                },
                ensure_ascii=False,
            ),
        },
    ]
    result, parsed = chat(
        session,
        messages,
        purpose="attempt_feedback",
        user_id=user.id,
        json_mode=True,
        max_tokens=900,
        validator=_parse_feedback,
    )
    return {**parsed, "provider": result.provider, "model": result.model}


def counterexamples(
    session: Session,
    user: User,
    *,
    proposition_id: str | None = None,
    concept_id: str | None = None,
    count: int = 3,
) -> dict[str, Any]:
    stmt = select(Classic).where(Classic.status == "published")
    if proposition_id:
        proposition = session.get(Proposition, proposition_id)
        if proposition is None:
            raise ApiError("not_found", "命题不存在")
        stmt = stmt.where(
            or_(
                Classic.refutes_proposition_id == proposition_id,
                Classic.concept_id == proposition.concept_id,
            )
        )
    elif concept_id:
        concept = session.get(Concept, concept_id)
        if concept is None:
            raise ApiError("not_found", "知识点不存在")
        stmt = stmt.where(Classic.concept_id == concept_id)
    classics = list(session.scalars(stmt.order_by(Classic.kind, Classic.name).limit(count)))
    return {
        "items": [classic_out(item) for item in classics],
        "total": len(classics),
        "reviewed": True,
        "notice": (
            "这里只返回已审核的经典案例；模型生成的新反例必须先经过人工核对，"
            "不能直接作为正式学习内容。"
        ),
    }
