"""Exercise retrieval, attempt submission, rubric feedback and variant generation."""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..adapters.math import MathError, check_answer
from ..constants import EXERCISE_SKILLS, skill_bucket
from ..errors import ApiError
from ..models import (
    Attempt,
    AttemptEvent,
    Concept,
    CourseProgress,
    Exercise,
    ExerciseTemplate,
    StudyEvent,
    User,
    isoformat,
    utcnow,
)
from ..schemas.learning import ExerciseListQuery
from ..seed.exercises import build_variant
from ..serializers import attempt_out, exercise_out

DELIVERABLE_REVIEW = ("reviewed", "auto_checked")
SKILLS = ["定义理解", "条件辨析", "独立证明", "反例构造", "综合迁移"]
QUANTIFIER_MARKERS = ("ε", "epsilon", "δ", "delta", "任意", "存在", "∀", "∃")
CONCLUSION_MARKERS = ("因此", "所以", "故", "结论", "从而", "即")
CONDITION_MARKERS = ("条件", "连续", "可导", "闭区间", "有界", "定义域", "假设")


def _visible_exercise(exercise: Exercise, user: User) -> bool:
    if user.role == "admin":
        return True
    return (
        exercise.status == "published"
        and exercise.review_status in DELIVERABLE_REVIEW
    )


def list_exercises(
    session: Session, user: User, query: ExerciseListQuery
) -> dict[str, Any]:
    stmt = select(Exercise)
    if user.role != "admin":
        stmt = stmt.where(
            Exercise.status == "published",
            Exercise.review_status.in_(DELIVERABLE_REVIEW),
        )
    if query.topic:
        stmt = stmt.where(Exercise.topic_id == query.topic)
    if query.skill:
        db_skills = {
            skill
            for skill in EXERCISE_SKILLS
            if skill == query.skill
            or (query.skill in {"定义理解", "条件辨析", "独立证明", "反例构造", "综合迁移"}
                and skill_bucket(skill) == query.skill)
        }
        stmt = stmt.where(Exercise.skill.in_(sorted(db_skills) or [query.skill]))
    if query.difficulty:
        stmt = stmt.where(Exercise.difficulty == query.difficulty)
    if query.type:
        stmt = stmt.where(Exercise.exercise_type == query.type)
    if query.q:
        pattern = f"%{query.q.strip()}%"
        stmt = stmt.where(
            or_(Exercise.title.like(pattern), Exercise.statement.like(pattern))
        )
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.order_by(Exercise.topic_id, Exercise.difficulty, Exercise.code)
            .limit(query.limit)
            .offset(query.offset)
        )
    )
    attempts = _attempt_map(session, user, [exercise.id for exercise in rows])
    items = []
    for exercise in rows:
        item = exercise_out(exercise, include_solution=False, include_hint=False)
        latest = attempts.get(exercise.id)
        item["attempt_count"] = len(latest or [])
        item["latest_attempt"] = (
            {
                "id": latest[-1].id,
                "self_rating": latest[-1].self_rating,
                "status": latest[-1].status,
                "created_at": isoformat(latest[-1].created_at),
            }
            if latest
            else None
        )
        items.append(item)
    return {
        "items": items,
        "total": total,
        "limit": query.limit,
        "offset": query.offset,
        "next_offset": query.offset + query.limit if query.offset + query.limit < total else None,
    }


def _attempt_map(
    session: Session, user: User, exercise_ids: list[str]
) -> dict[str, list[Attempt]]:
    if not exercise_ids:
        return {}
    rows = session.scalars(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.exercise_id.in_(exercise_ids))
        .order_by(Attempt.created_at)
    )
    result: dict[str, list[Attempt]] = {}
    for attempt in rows:
        result.setdefault(attempt.exercise_id, []).append(attempt)
    return result


def get_exercise(session: Session, user: User, exercise_id: str) -> dict[str, Any]:
    exercise = session.scalar(
        select(Exercise).where(or_(Exercise.id == exercise_id, Exercise.code == exercise_id))
    )
    if exercise is None or not _visible_exercise(exercise, user):
        raise ApiError("not_found", "练习不存在或尚未发布")
    data = exercise_out(exercise, include_solution=False, include_hint=True)
    data["solution_available"] = bool(exercise.solution_steps)
    data["answer_check_available"] = bool(exercise.answer_check)
    data["concept"] = None
    concept = session.get(Concept, exercise.topic_id)
    if concept:
        data["concept"] = {
            "id": concept.id,
            "name": concept.name,
            "summary": concept.summary,
            "page_start": concept.page_start,
            "page_end": concept.page_end,
        }
    return data


def get_hint(session: Session, user: User, exercise_id: str) -> dict[str, Any]:
    exercise = _require_exercise(session, user, exercise_id)
    _record_view(session, user, exercise, "hint_view")
    return {
        "exercise_id": exercise.id,
        "hint": exercise.hint,
        "notice": "查看提示会记入这次练习的辅助使用记录，不等于掌握。",
    }


def get_solution(session: Session, user: User, exercise_id: str) -> dict[str, Any]:
    exercise = _require_exercise(session, user, exercise_id)
    _record_view(session, user, exercise, "solution_view")
    return {
        "exercise_id": exercise.id,
        "steps": exercise.solution_steps or [],
        "common_errors": exercise.common_errors or [],
        "checks": exercise.checks or [],
        "notice": "参考解答只是一种可行论证；不同但有效的证明不应被直接判错。",
    }


def _require_exercise(session: Session, user: User, exercise_id: str) -> Exercise:
    exercise = session.scalar(
        select(Exercise).where(or_(Exercise.id == exercise_id, Exercise.code == exercise_id))
    )
    if exercise is None or not _visible_exercise(exercise, user):
        raise ApiError("not_found", "练习不存在或尚未发布")
    if exercise.source == "ai-variant":
        parent_id = (exercise.provenance or {}).get("parent_attempt_id")
        owner = session.scalar(select(Attempt.user_id).where(Attempt.id == parent_id))
        if owner != user.id:
            raise ApiError("not_found", "练习不存在或尚未发布")
    return exercise


def rate_attempt(session: Session, attempt: Attempt, rating: str):
    attempt.self_rating = rating
    session.add(AttemptEvent(
        attempt_id=attempt.id, user_id=attempt.user_id, exercise_id=attempt.exercise_id,
        type="self_rating", payload={"self_rating": rating},
    ))
    session.add(StudyEvent(
        user_id=attempt.user_id, kind="self_rating",
        concept_id=attempt.exercise.topic_id if attempt.exercise else None,
        payload={"attempt_id": attempt.id, "self_rating": rating},
    ))


def _record_view(session: Session, user: User, exercise: Exercise, kind: str) -> None:
    latest = session.scalar(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.exercise_id == exercise.id)
        .order_by(Attempt.created_at.desc())
        .limit(1)
    )
    session.add(
        AttemptEvent(
            attempt_id=latest.id if latest else None,
            user_id=user.id,
            exercise_id=exercise.id,
            type=kind,
            payload={"recorded_by": "api"},
        )
    )
    session.add(
        StudyEvent(
            user_id=user.id,
            kind=kind,
            concept_id=exercise.topic_id,
            payload={"exercise_id": exercise.id},
        )
    )


def _prior_views(
    session: Session, user: User, exercise: Exercise, since
) -> tuple[dict[str, int], list[AttemptEvent]]:
    stmt = select(AttemptEvent).where(
        AttemptEvent.user_id == user.id,
        AttemptEvent.exercise_id == exercise.id,
        AttemptEvent.created_at >= since,
    )
    counts = {"hint_view": 0, "solution_view": 0}
    pending: list[AttemptEvent] = []
    for event in session.scalars(stmt):
        if event.type in counts:
            counts[event.type] += 1
            if event.attempt_id is None:
                pending.append(event)
    return counts, pending


def submit_attempt(
    session: Session,
    user: User,
    *,
    exercise_id: str,
    answer_text: str,
    answer_format: str = "text",
    hints_used: int = 0,
    solution_viewed: bool = False,
    self_rating: str = "pending",
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    exercise = _require_exercise(session, user, exercise_id)
    if idempotency_key:
        existing = session.scalar(
            select(Attempt).where(
                Attempt.user_id == user.id,
                Attempt.idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            if existing.exercise_id != exercise.id:
                raise ApiError(
                    "conflict",
                    "该幂等键已用于另一道练习，请使用新的请求键",
                )
            data = attempt_out(existing, exercise=existing.exercise)
            data["duplicate"] = True
            return data
    last_attempt = session.scalar(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.exercise_id == exercise.id)
        .order_by(Attempt.created_at.desc())
        .limit(1)
    )
    window_start = (
        last_attempt.created_at if last_attempt else utcnow() - timedelta(hours=24)
    )
    if window_start is not None and window_start.tzinfo is None:
        from datetime import timezone

        window_start = window_start.replace(tzinfo=timezone.utc)
    views, pending_events = _prior_views(session, user, exercise, window_start)
    assistance = {
        "hints_used": max(int(hints_used or 0), views.get("hint_view", 0)),
        "solution_viewed": bool(solution_viewed or views.get("solution_view", 0) > 0),
        "solution_viewed_before_submit": bool(
            solution_viewed or views.get("solution_view", 0) > 0
        ),
    }
    feedback = build_feedback(exercise, answer_text, assistance)
    attempt = Attempt(
        user_id=user.id,
        exercise_id=exercise.id,
        exercise_version=exercise.version,
        answer_text=answer_text,
        answer_format=answer_format,
        assistance=assistance,
        self_rating=self_rating,
        status=feedback["status"],
        feedback=feedback,
        score=feedback.get("score"),
        error_types=feedback.get("error_types", []),
        idempotency_key=idempotency_key,
    )
    session.add(attempt)
    session.flush()
    for event in pending_events:
        event.attempt_id = attempt.id
    session.add(
        AttemptEvent(
            attempt_id=attempt.id,
            user_id=user.id,
            exercise_id=exercise.id,
            type="submit",
            payload={
                "assistance": assistance,
                "status": feedback["status"],
                "checker": feedback.get("checker"),
            },
        )
    )
    session.add(
        StudyEvent(
            user_id=user.id,
            kind="attempt_submit",
            concept_id=exercise.topic_id,
            payload={
                "attempt_id": attempt.id,
                "exercise_id": exercise.id,
                "assistance": assistance,
            },
        )
    )
    progress = session.scalar(
        select(CourseProgress).where(
            CourseProgress.user_id == user.id,
            CourseProgress.course_name == user.course_name,
        )
    )
    if progress is not None:
        progress.last_page = "exercises"
        progress.last_concept_id = exercise.topic_id
    session.flush()
    data = attempt_out(attempt, exercise=exercise)
    data["duplicate"] = False
    return data


def _normalized_answer(text: str) -> str:
    return re.sub(r"\s+", "", text.lower())


def _criterion_met(normalized: str, groups: list[list[str]]) -> bool:
    return all(
        any(marker.lower().replace(" ", "") in normalized for marker in group)
        for group in groups
    )


PROOF_RUBRICS: dict[str, list[dict[str, Any]]] = {
    "continuous": [
        {
            "id": "epsilon",
            "label": "说明 ε 的任意性，并把它作为证明起点",
            "weight": 20,
            "groups": [["ε", "epsilon"], ["任给", "任意", "对任意", "given", "∀"]],
        },
        {
            "id": "delta",
            "label": "选择 δ>0（通常取 ε/k）",
            "weight": 20,
            "groups": [["δ", "delta"], ["取", "选", "令", "let", "choose"]],
        },
        {
            "id": "estimate",
            "label": "把 |f(x)−f(x₀)| 化成 k|x−x₀| 的估计",
            "weight": 25,
            "groups": [["f(x", "|f"], ["x-x", "x−x", "x₀", "x0"]],
        },
        {
            "id": "implication",
            "label": "由 |x−x₀|<δ 推出函数值差 <ε",
            "weight": 25,
            "groups": [["<δ", "<δ", "<delta"], ["<ε", "<epsilon", "=ε", "=epsilon"]],
        },
        {
            "id": "conclusion",
            "label": "写出连续性结论",
            "weight": 10,
            "groups": [["连续", "continuous"]],
        },
    ],
    "uniform": [
        {
            "id": "closed_bound",
            "label": "在 [0,1] 上使用 |x+y| 或 |x²−y²| 的有界估计",
            "weight": 20,
            "groups": [["[0,1]", "闭区间"], ["x+y", "x²", "x^2", "4|x-y", "2|x−y|"]],
        },
        {
            "id": "delta",
            "label": "取 δ=ε/(2k) 并说明它与点无关",
            "weight": 20,
            "groups": [["δ", "delta"], ["ε", "epsilon"], ["/", "÷", "取"]],
        },
        {
            "id": "counterexample",
            "label": "在 ℝ 上构造 xₙ=n、yₙ=n+1/n 两列点",
            "weight": 25,
            "groups": [["xₙ", "x_n", "序列", "n"], ["1/n", "yₙ", "y_n"]],
        },
        {
            "id": "verify",
            "label": "验证两列点的函数值差有正下界",
            "weight": 25,
            "groups": [["2k", "2*k", "k", "函数值差", "|f"], ["大于", ">", "有正下界"]],
        },
        {
            "id": "conclusion",
            "label": "说明在 ℝ 上不一致连续",
            "weight": 10,
            "groups": [["不一致连续", "notuniformly"]],
        },
    ],
    "derivative": [
        {
            "id": "continuity",
            "label": "先证明 f 在 0 连续",
            "weight": 20,
            "groups": [["连续", "continuous"], ["f(0)", "|x|", "0"]],
        },
        {
            "id": "right",
            "label": "计算 h>0 时的右差商",
            "weight": 25,
            "groups": [["h>0", "h＞0", "右"], ["差商", "f(h)", "(f(h)"]],
        },
        {
            "id": "left",
            "label": "计算 h<0 时的左差商",
            "weight": 25,
            "groups": [["h<0", "h＜0", "左"], ["-k", "−k", "差商"]],
        },
        {
            "id": "condition",
            "label": "写出 h≠0 的条件",
            "weight": 10,
            "groups": [["h≠0", "h≠0", "h!=0", "不等于0", "h\neq0"]],
        },
        {
            "id": "conclusion",
            "label": "由左右差商不相等得出不可导",
            "weight": 20,
            "groups": [["不可导", "notdifferentiable"], ["左右", "不相等", "不存在"]],
        },
    ],
    "mean-value": [
        {
            "id": "conditions",
            "label": "检查闭区间连续、开区间可导",
            "weight": 20,
            "groups": [["连续", "continuous"], ["可导", "differentiable"]],
        },
        {
            "id": "equation",
            "label": "写出 sin x−sin y=cos ξ·(x−y)",
            "weight": 30,
            "groups": [["sin", "sinx"], ["cosξ", "cosξ", "cos", "ξ"], ["x-y", "x−y"]],
        },
        {
            "id": "bound",
            "label": "使用 |cos ξ|≤1 作估计",
            "weight": 30,
            "groups": [["|cos", "绝对值", "≤1", "<=1", "\\le1"]],
        },
        {
            "id": "conclusion",
            "label": "写出最终 Lipschitz 不等式",
            "weight": 20,
            "groups": [["|sinx", "|sinx", "≤|x-y", "≤|x−y", "lipschitz"]],
        },
    ],
    "taylor": [
        {
            "id": "polynomial",
            "label": "写出二阶 Taylor 多项式 1+x+x²/2",
            "weight": 25,
            "groups": [["1+x", "x²/2", "x^2/2", "p₂", "p2"]],
        },
        {
            "id": "remainder",
            "label": "写出 Lagrange 余项（含 e^θ）",
            "weight": 25,
            "groups": [["余项", "remainder", "r₂", "r2"], ["e^", "exp", "θ", "theta"]],
        },
        {
            "id": "range",
            "label": "限定 |x|≤1/k 的范围",
            "weight": 20,
            "groups": [["|x|≤1/", "|x|<=1/", "1/k", "1/{k}"]],
        },
        {
            "id": "estimate",
            "label": "估计指数因子并给出余项上界",
            "weight": 20,
            "groups": [["e^(1/", "e^{1/", "6k", "6*k", "6·k", "上界"]],
        },
        {
            "id": "conclusion",
            "label": "写清这个界只在给定区间成立",
            "weight": 10,
            "groups": [["因此", "所以", "故", "该区间", "范围内"]],
        },
    ],
    "riemann": [
        {
            "id": "partition",
            "label": "把 [0,1] 等分为 n 段",
            "weight": 20,
            "groups": [["等分", "分割", "partition"], ["1/n", "n段", "n段"]],
        },
        {
            "id": "infsup",
            "label": "指出每段的下确界与上确界取在端点",
            "weight": 20,
            "groups": [["下确界", "上确界", "inf", "sup"], ["左端", "右端", "递增"]],
        },
        {
            "id": "sums",
            "label": "计算 Darboux 上下和 Lₙ、Uₙ",
            "weight": 20,
            "groups": [["lₙ", "ln", "下和"], ["uₙ", "un", "上和"]],
        },
        {
            "id": "criterion",
            "label": "控制 Uₙ−Lₙ=k/n 并使用可积判据",
            "weight": 25,
            "groups": [["uₙ-lₙ", "un-ln", "u-l", "k/n"], ["ε", "epsilon"]],
        },
        {
            "id": "value",
            "label": "写出可积结论与积分值 k/2",
            "weight": 15,
            "groups": [["可积", "integrable"], ["k/2", "积分值", "∫"]],
        },
    ],
}

GENERIC_PROOF_RUBRIC: list[dict[str, Any]] = [
    {
        "id": "assumptions",
        "label": "写清题目假设、定义域与使用的条件",
        "weight": 30,
        "groups": [["假设", "条件", "定义域", "任给", "设"]],
    },
    {
        "id": "argument",
        "label": "给出关键构造、计算或引用依据",
        "weight": 40,
        "groups": [["因为", "由", "取", "构造", "估计", "根据"]],
    },
    {
        "id": "conclusion",
        "label": "写出与题目对应的结论",
        "weight": 30,
        "groups": [["因此", "所以", "故", "结论", "从而"]],
    },
]


def _assistance_observations(
    assistance: dict[str, Any], topic_id: str
) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    if assistance.get("solution_viewed_before_submit"):
        observations.append(
            {
                "type": "assistance",
                "message": "这次作答在看完整解答之后提交；记录为辅助作答，不自动计为独立掌握。",
                "concept_id": topic_id,
            }
        )
    if assistance.get("hints_used"):
        observations.append(
            {
                "type": "assistance",
                "message": f"使用了 {assistance['hints_used']} 次提示；建议再完成一道不借助提示的变式。",
                "concept_id": topic_id,
            }
        )
    return observations


def _extract_answer_candidates(text: str) -> list[str]:
    """Pull likely final expressions out of a mixed proof/answer text."""

    cleaned = (
        text.replace("$", "")
        .replace(r"\(", "")
        .replace(r"\)", "")
        .replace(r"\[", "")
        .replace(r"\]", "")
    )
    candidates: list[str] = []
    label_pattern = re.compile(
        r"(?:最终答案|答案|结果|结论|因此|所以|故|从而|得到|等于|为|是)\s*[：:，,]?\s*(.+)"
    )
    for match in label_pattern.finditer(cleaned):
        candidates.append(match.group(1))
    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    candidates.extend(reversed(lines))
    candidates.append(cleaned)
    extracted: list[str] = []
    for candidate in candidates:
        candidate = candidate.strip()
        candidate = re.sub(r"^\(?\d+\)?[.、)]\s*", "", candidate)
        # Drop prose before a final formula, then keep only the formula-shaped
        # prefix. This handles "最后得到 x*exp(2*x)" and "答案是 exp(2*x)".
        candidate = re.sub(r"^[\u4e00-\u9fff\s：:，,]+", "", candidate)
        candidate = re.split(r"[\u4e00-\u9fff]", candidate, maxsplit=1)[0]
        candidate = re.sub(
            r"^(?:[A-Za-z]'?\([^)]*\)|y)\s*=\s*", "", candidate
        )
        candidate = candidate.strip(" $。；;，,")
        if candidate and len(candidate) <= 300 and candidate not in extracted:
            extracted.append(candidate)
    return extracted


def _symbolic_feedback(
    exercise: Exercise, answer: str, assistance: dict[str, Any], check_spec: dict
) -> dict[str, Any]:
    expected = str(check_spec.get("expected", ""))
    base_kind = str(check_spec.get("kind", "expression"))
    accepted = None
    failure = None
    for candidate in _extract_answer_candidates(answer):
        modes = [base_kind]
        # integrate exercises may ask for F(x) or F'(x); accept both.
        if base_kind == "derivative":
            modes.append("expression")
        for mode in modes:
            result = check_answer(expected, candidate, mode)
            if result.get("equivalent") is True:
                accepted = (candidate, mode, result)
                break
            if result.get("equivalent") is False and failure is None:
                failure = (candidate, mode, result)
        if accepted:
            break
    if accepted:
        candidate, mode, result = accepted
        note = result.get("note", "符号化简后与参考结果一致。")
        return {
            "status": "auto_checked",
            "score": 100,
            "correct": True,
            "summary": "符号检查通过：提交的最终答案与参考结果等价。",
            "observations": [
                {
                    "type": "symbolic_check",
                    "message": note,
                    "concept_id": exercise.topic_id,
                },
                *_assistance_observations(assistance, exercise.topic_id),
            ],
            "error_types": [],
            "needs_review": False,
            "checker": "sympy",
            "symbolic": result,
            "reference_answer": expected,
            "answer_candidate": candidate,
            "accepted_as": "原函数/表达式" if mode != "expression" else "导数形式",
            "grading_scope": "symbolic",
            "uniqueness_note": "符号检查只验证最终表达式，不评价证明方法。",
        }
    if failure:
        candidate, mode, result = failure
        return {
            "status": "needs_review",
            "score": 0,
            "correct": False,
            "summary": "最终答案与参考表达式不等价，请检查代数变形或求导/积分步骤。",
            "observations": [
                {
                    "type": "symbolic_mismatch",
                    "message": result.get("note", "符号检查未得到等价结果。"),
                    "concept_id": exercise.topic_id,
                },
                *_assistance_observations(assistance, exercise.topic_id),
            ],
            "error_types": ["wrong_answer"],
            "needs_review": False,
            "checker": "sympy",
            "symbolic": result,
            "reference_answer": expected,
            "answer_candidate": candidate,
            "grading_scope": "symbolic",
            "uniqueness_note": "错误仅针对最终表达式；中间方法可能另有可取之处。",
        }
    return {
        "status": "needs_review",
        "score": None,
        "correct": None,
        "summary": "未能从作答中解析出可比较的最终答案。请把最终表达式单独写在最后一行。",
        "observations": [
            {
                "type": "unparsed_answer",
                "message": "自动批改需要可解析的表达式；证明文字不会被强行判错。",
                "concept_id": exercise.topic_id,
            },
            *_assistance_observations(assistance, exercise.topic_id),
        ],
        "error_types": ["unparsed_answer"],
        "needs_review": True,
        "checker": "sympy",
        "reference_answer": expected,
        "grading_scope": "symbolic",
        "uniqueness_note": "没有解析成功不等于作答错误；可参考完整解答自行核对。",
    }


def _rubric_feedback(
    exercise: Exercise, answer: str, assistance: dict[str, Any]
) -> dict[str, Any]:
    text = answer.strip()
    word_count = len(re.sub(r"\s+", "", text))
    normalized = _normalized_answer(text)
    # A generated problem may change the proposition itself (e.g. x² on [0,1] to 4x on R).
    # Seed-specific constructions and conclusions would misgrade its proof.
    rubric = (GENERIC_PROOF_RUBRIC if exercise.source == "ai-variant"
              else PROOF_RUBRICS.get(exercise.topic_id, GENERIC_PROOF_RUBRIC))
    criteria = []
    observations = []
    error_types = []
    score = 0
    for criterion in rubric:
        met = _criterion_met(normalized, criterion.get("groups", []))
        criteria.append(
            {
                "id": criterion["id"],
                "label": criterion["label"],
                "weight": criterion["weight"],
                "met": met,
            }
        )
        if met:
            score += int(criterion["weight"])
            observations.append(
                {
                    "type": "criterion_met",
                    "message": f"✓ {criterion['label']}",
                    "concept_id": exercise.topic_id,
                }
            )
        else:
            error_types.append(criterion["id"])
            observations.append(
                {
                    "type": "criterion_missing",
                    "message": f"✗ {criterion['label']}（{criterion['weight']} 分）",
                    "concept_id": exercise.topic_id,
                }
            )
    if word_count < 20:
        score = min(score, 60)
        error_types.append("too_short")
        observations.append(
            {
                "type": "too_short",
                "message": "论证过短：至少写清假设、关键构造和结论。",
                "concept_id": exercise.topic_id,
            }
        )
    observations.extend(_assistance_observations(assistance, exercise.topic_id))
    missing = [item["label"] for item in criteria if not item["met"]]
    if score >= 100:
        summary = "结构检查覆盖全部关键步骤；结构分不等于证明正确，仍需人工检查推理。"
    elif score >= 80:
        summary = "结构检查覆盖大部分关键步骤；结构分不等于证明正确，仍需人工检查推理。"
    elif score >= 50:
        summary = "结构基本成形，但有关键步骤缺失；先补齐标记为 ✗ 的项目。"
    else:
        summary = "关键步骤缺失较多；先按左侧自查项搭起证明骨架，再补细节。"
    return {
        "status": "needs_review",
        "score": score,
        "correct": None,
        "summary": summary,
        "observations": observations,
        "criteria": criteria,
        "error_types": sorted(set(error_types)),
        "needs_review": True,
        "checker": "rubric+keywords",
        "grading_scope": "structural",
        "missing_steps": missing,
        "uniqueness_note": "结构分只检查是否写出关键步骤，不能判断证明是否数学上正确；不同解法只要满足题意同样有效。",
    }


def build_feedback(
    exercise: Exercise, answer: str, assistance: dict[str, Any]
) -> dict[str, Any]:
    """Grade computable answers symbolically, and proofs by explainable rubric.

    Symbolic checks are bounded to reviewed ``answer_check`` templates. Proofs
    never get a "mathematically correct" verdict from keywords; they get a
    transparent structural score plus a required human-review flag.
    """

    text = answer.strip()
    check_spec = exercise.answer_check or {}
    if check_spec and check_spec.get("expected"):
        return _symbolic_feedback(exercise, text, assistance, check_spec)
    if exercise.topic_id in PROOF_RUBRICS or exercise.exercise_type in {
        "proof",
        "proof_completion",
        "condition_variant",
    }:
        return _rubric_feedback(exercise, text, assistance)
    return _rubric_feedback(exercise, text, assistance)


def latest_attempt(session: Session, user: User, exercise: Exercise) -> Attempt | None:
    return session.scalar(
        select(Attempt)
        .where(Attempt.user_id == user.id, Attempt.exercise_id == exercise.id)
        .order_by(Attempt.created_at.desc())
        .limit(1)
    )


def generate_exercises(
    session: Session,
    user: User,
    *,
    topic_id: str,
    skill: str | None,
    difficulty: int,
    count: int,
    focus: str = "",
) -> dict[str, Any]:
    concept = session.get(Concept, topic_id)
    if concept is None:
        raise ApiError("not_found", "知识点不存在")
    stmt = select(ExerciseTemplate).where(ExerciseTemplate.topic_id == topic_id)
    templates = list(session.scalars(stmt.order_by(ExerciseTemplate.id)))
    if skill:
        aliased = [
            item
            for item in templates
            if item.skill == skill
            or (skill in {"定义理解", "条件辨析", "独立证明", "反例构造", "综合迁移"}
                and skill_bucket(item.skill) == skill)
        ]
        if not aliased:
            raise ApiError(
                "not_found",
                "该知识点还没有这个能力维度的已审核题型；不能把未审核的模型输出当作正式练习。",
            )
        templates = aliased
    if not templates:
        raise ApiError(
            "not_found",
            "该知识点还没有已审核的题型；不能把未审核的模型输出当作正式练习。",
        )
    created: list[Exercise] = []
    reused: list[Exercise] = []
    for template in templates:
        coefficients = template.generator.get("coefficients", [2, 3, 4, 5])
        for coefficient in coefficients:
            code = f"{topic_id}-{coefficient}"
            existing = session.scalar(select(Exercise).where(Exercise.code == code))
            if existing is not None:
                reused.append(existing)
            else:
                variant = build_variant(topic_id, int(coefficient))
                exercise = Exercise(
                    topic_id=topic_id,
                    template_id=template.id,
                    code=code,
                    title=variant["title"],
                    statement=variant["statement"],
                    domain=variant["domain"],
                    difficulty=max(1, min(5, difficulty or variant["difficulty"])),
                    skill=template.skill,
                    exercise_type=template.exercise_type,
                    allowed_refs=template.allowed_refs,
                    hint=variant["hint"],
                    solution_steps=variant["solution"],
                    common_errors=variant["errors"],
                    checks=variant["checks"],
                    answer_check=variant["answer_check"],
                    source="template",
                    provenance={
                        "template": template.slug,
                        "template_version": template.version,
                        "coefficient": coefficient,
                        "model": None,
                        "prompt_version": None,
                        "focus": focus[:200],
                    },
                    validation={
                        "checked_by": "template_rules",
                        "template_version": template.version,
                        "constraints_checked": True,
                        "solution_present": True,
                        "symbolic_check": bool(variant["answer_check"]),
                        "proof_auto_graded": False,
                        "note": "由已审核模板按需生成；证明题不自动判分。",
                    },
                    review_status="auto_checked",
                    version=1,
                    status="published",
                    published_at=utcnow(),
                )
                session.add(exercise)
                session.flush()
                created.append(exercise)
            if len(created) + len(reused) >= count:
                break
        if len(created) + len(reused) >= count:
            break
    if not created:
        message = "该知识点可用的已审核变式已经全部存在，未重复创建题目。"
    else:
        message = f"从已审核模板生成了 {len(created)} 道新变式；全部保留了生成配置与校验记录。"
    return {
        "created": [exercise_out(exercise, include_solution=True, include_hint=True) for exercise in created],
        "reused": [exercise_out(exercise, include_solution=False, include_hint=False) for exercise in reused],
        "message": message,
        "generation": {
            "mode": "template",
            "model": None,
            "prompt_version": None,
            "template_count": len(templates),
            "requested": count,
        },
    }
