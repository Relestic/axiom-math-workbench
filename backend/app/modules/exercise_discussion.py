"""AI discussion and final grading for exercise attempts.

The discussion path deliberately never writes an Attempt. Only the explicit
submit path grades and records one. This keeps "discussion" and "submission"
separate in both the API and the database.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import Field
from sqlalchemy.orm import Session

from ..adapters.llm import chat
from ..models import Exercise, User
from ..schemas.common import StrictModel
from . import exercise_service


class DiscussionMessage(StrictModel):
    message: str = Field(min_length=1, max_length=4000)


class ExerciseGrade(StrictModel):
    score: int = Field(ge=0, le=100)
    verdict: Literal["strong", "partial", "needs_work"]
    summary: str = Field(min_length=1, max_length=2000)
    strengths: list[str] = Field(default_factory=list, max_length=6)
    gaps: list[str] = Field(default_factory=list, max_length=6)
    next_steps: list[str] = Field(default_factory=list, max_length=6)


DISCUSSION_SYSTEM = """你是 Axiom 的数学讨论导师。学生正在做一道练习，你可以和学生实时讨论思路，但绝不能提交作答、打分或直接给出完整解答。
规则：
1. 先理解学生当前草稿，再指出一个最值得推进的点；一次最多问一个关键问题。
2. 用苏格拉底式追问，引导学生补条件、写量词、检查估计或构造反例。
3. 不要直接粘贴参考解答；学生明确要求时，只给下一步提示。
4. 结合题目条件、可用工具和常见错误，但不要编造教材原文。
只返回 JSON：{"message":"中文回复，包含一个具体问题或下一步建议"}。不要代码围栏。"""

GRADING_SYSTEM = """你是 Axiom 的数学练习批改导师。根据题目、参考解答、常见错误和学生的最终作答（以及讨论记录）给出最终批改。
规则：
1. 只评价学生的最终作答；讨论记录用于理解其思路，不把导师说过的话算作学生答案。
2. 评分 0-100，重点看定义/条件、关键构造或计算、结论是否完整；不能因为与参考解法不同就判错。
3. strengths、gaps、next_steps 各最多 4 条，具体、可执行；不要泄露完整参考解答。
4. 如果作答过短或未完成，score 可以低，但 summary 要说明下一步。
只返回 JSON：{"score":0-100,"verdict":"strong|partial|needs_work","summary":"中文总结","strengths":[],"gaps":[],"next_steps":[]}。不要代码围栏。"""


def _exercise_context(exercise: Exercise, include_solution: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": exercise.id,
        "title": exercise.title,
        "statement": exercise.statement,
        "domain": exercise.domain,
        "type": exercise.exercise_type,
        "skill": exercise.skill,
        "checks": exercise.checks,
        "common_errors": exercise.common_errors,
        "hint": exercise.hint,
    }
    if include_solution:
        data["reference_solution"] = exercise.solution_steps
        data["answer_check"] = exercise.answer_check
    return data


def _history_messages(history: list[dict] | None) -> list[dict]:
    messages: list[dict] = []
    for item in (history or [])[-8:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content[:3000]})
    return messages


def _parse_discussion(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回 JSON") from exc
    parsed = DiscussionMessage.model_validate(data)
    return {"message": parsed.message}


def _parse_grade(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回 JSON") from exc
    return ExerciseGrade.model_validate(data).model_dump()


def discuss(
    session: Session,
    user: User,
    *,
    exercise_id: str,
    answer_text: str,
    message: str,
    history: list[dict] | None,
) -> dict[str, Any]:
    exercise = exercise_service._require_exercise(session, user, exercise_id)
    context = _exercise_context(exercise, include_solution=False)
    messages = [
        {"role": "system", "content": DISCUSSION_SYSTEM},
        *_history_messages(history),
        {
            "role": "user",
            "content": json.dumps(
                {
                    "exercise": context,
                    "student_draft": answer_text,
                    "student_message": message
                    or "请先看我的草稿，指出一个最值得改进的点，并问我一个推进问题。",
                },
                ensure_ascii=False,
            ),
        },
    ]
    result, parsed = chat(
        session,
        messages,
        purpose="exercise_discussion",
        user_id=user.id,
        json_mode=True,
        max_tokens=1000,
        validator=_parse_discussion,
    )
    assert parsed is not None
    return {
        **parsed,
        "provider": result.provider,
        "model": result.model,
    }


def grade_and_record(
    session: Session,
    user: User,
    *,
    exercise_id: str,
    answer_text: str,
    history: list[dict] | None,
    hints_used: int,
    solution_viewed: bool,
) -> dict[str, Any]:
    exercise = exercise_service._require_exercise(session, user, exercise_id)
    context = _exercise_context(exercise, include_solution=True)
    messages = [
        {"role": "system", "content": GRADING_SYSTEM},
        *_history_messages(history),
        {
            "role": "user",
            "content": json.dumps(
                {
                    "exercise": context,
                    "student_final_answer": answer_text,
                    "discussion_history_above": True,
                },
                ensure_ascii=False,
            ),
        },
    ]
    result, parsed = chat(
        session,
        messages,
        purpose="exercise_grading",
        user_id=user.id,
        json_mode=True,
        max_tokens=1400,
        validator=_parse_grade,
    )
    assert parsed is not None
    grade = ExerciseGrade.model_validate(parsed)
    feedback = {
        "status": "ai_reviewed",
        "score": grade.score,
        "correct": None,
        "summary": grade.summary,
        "observations": [
            *[
                {"type": "ai_strength", "message": f"优点：{item}"}
                for item in grade.strengths
            ],
            *[
                {"type": "ai_gap", "message": f"待改进：{item}"}
                for item in grade.gaps
            ],
            *[
                {"type": "ai_next", "message": f"下一步：{item}"}
                for item in grade.next_steps
            ],
        ],
        "error_types": [],
        "needs_review": False,
        "checker": result.provider,
        "grading_scope": "ai",
        "ai": {
            "verdict": grade.verdict,
            "strengths": grade.strengths,
            "gaps": grade.gaps,
            "next_steps": grade.next_steps,
            "provider": result.provider,
            "model": result.model,
        },
        "uniqueness_note": "AI 批改基于当前作答与讨论记录；不同但有效的证明路径应同样被接受。",
    }
    attempt = exercise_service.submit_attempt(
        session,
        user,
        exercise_id=exercise.id,
        answer_text=answer_text,
        answer_format="text",
        hints_used=hints_used,
        solution_viewed=solution_viewed,
        feedback_override=feedback,
    )
    return attempt
