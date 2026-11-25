"""Progress aggregation, practice heatmap, review queue and diagnostics."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..constants import HEATMAP_SKILLS, skill_bucket
from ..errors import ApiError
from ..models import (
    Attempt,
    AttemptEvent,
    Concept,
    DiagnosticQuestion,
    DiagnosticRun,
    Exercise,
    Note,
    StudyEvent,
    User,
    utcnow,
)
from ..serializers import concept_summary, isoformat
from .content_service import get_primary_textbook, get_progress, published_only
from .graph_service import gaps as graph_gaps
from .graph_service import mastery_map

SKILLS = HEATMAP_SKILLS


def _weights(attempt: Attempt) -> float:
    assistance = attempt.assistance or {}
    if attempt.self_rating == "understood":
        weight = 1.0
    elif attempt.self_rating == "pending":
        weight = 0.35
    else:
        weight = 0.1
    if assistance.get("solution_viewed"):
        weight *= 0.35
    if assistance.get("hints_used"):
        weight *= 0.8
    return max(0.0, min(1.0, weight))


def _tz() -> ZoneInfo:
    return ZoneInfo(current_app.config["AXIOM"].timezone)


def _local_date(value: datetime | None) -> date | None:
    value = _as_utc(value)
    return value.astimezone(_tz()).date() if value else None


def _day_start_utc(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=_tz()).astimezone(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _attempt_rows(session: Session, user: User) -> list[tuple[Attempt, Exercise]]:
    return list(
        session.execute(
            select(Attempt, Exercise)
            .join(Exercise, Exercise.id == Attempt.exercise_id)
            .where(Attempt.user_id == user.id)
            .order_by(Attempt.created_at)
        ).all()
    )


def _streak(session: Session, user: User, rows: list[tuple[Attempt, Exercise]]) -> int:
    days: set[date] = set()
    for attempt, _exercise in rows:
        created = _local_date(attempt.created_at)
        if created:
            days.add(created)
    events = session.scalars(
        select(StudyEvent).where(
            StudyEvent.user_id == user.id,
            StudyEvent.created_at >= utcnow() - timedelta(days=90),
        )
    )
    for event in events:
        created = _local_date(event.created_at)
        if created:
            days.add(created)
    cursor = datetime.now(_tz()).date()
    if cursor not in days:
        cursor -= timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def summary(session: Session, user: User) -> dict[str, Any]:
    progress = get_progress(session, user)
    rows = _attempt_rows(session, user)
    today = datetime.now(_tz()).date()
    today_start = _day_start_utc(today)
    tomorrow_start = _day_start_utc(today + timedelta(days=1))
    today_rows = [
        (attempt, exercise)
        for attempt, exercise in rows
        if (created := _as_utc(attempt.created_at)) and created >= today_start
    ]
    today_concepts = {exercise.topic_id for _attempt, exercise in today_rows}
    today_events = (
        session.scalar(
            select(func.count(StudyEvent.id)).where(
                StudyEvent.user_id == user.id,
                StudyEvent.created_at >= today_start,
                StudyEvent.created_at < tomorrow_start,
            )
        )
        or 0
    )
    understood = sum(1 for attempt, _exercise in rows if attempt.self_rating == "understood")
    revisit = sum(1 for attempt, _exercise in rows if attempt.self_rating == "revisit")
    auto_checked = [
        attempt.score
        for attempt, _exercise in rows
        if attempt.score is not None
    ]
    mastery = mastery_map(session, user)
    concept_ids = [
        concept.id
        for concept in session.scalars(
            select(Concept).where(Concept.status == "published", Concept.scope != "v1_extension")
        )
    ]
    mastery_values = [mastery.get(concept_id, 0.0) for concept_id in concept_ids]
    overall_mastery = round(sum(mastery_values) / len(mastery_values)) if mastery_values else 0
    gap_data = graph_gaps(session, user)
    review = review_queue(session, user, limit=50)
    current = session.get(Concept, progress.last_concept_id) if progress.last_concept_id else None
    if current is None:
        current = session.scalar(
            select(Concept).where(Concept.id == "uniform", Concept.status == "published")
        )
    latest_attempt = rows[-1][0] if rows else None
    return {
        "streak_days": _streak(session, user, rows),
        "today": {
            "attempts": len(today_rows),
            "distinct_concepts": len(today_concepts),
            "events": today_events,
            "goal": progress.daily_goal,
            "goal_percent": round(
                min(100, len(today_concepts) / progress.daily_goal * 100)
            )
            if progress.daily_goal
            else 0,
        },
        "practice": {
            "attempts_total": len(rows),
            "understood": understood,
            "understood_rate": round(understood / len(rows) * 100) if rows else 0,
            "revisit": revisit,
            "average_score": round(sum(auto_checked) / len(auto_checked))
            if auto_checked
            else None,
            "auto_checked_attempts": len(auto_checked),
        },
        "mastery": {
            "overall": overall_mastery,
            "concepts_tracked": len([value for value in mastery_values if value > 0]),
            "concept_total": len(concept_ids),
            "by_concept": mastery,
        },
        "graph": {
            "gaps": len(gap_data["gaps"]),
            "gap_items": gap_data["gaps"][:4],
        },
        "review": {
            "count": len(review),
            "items": review[:5],
        },
        "current": {
            "page": progress.last_page,
            "week": progress.week,
            "total_weeks": progress.total_weeks,
            "concept": concept_summary(current) if current else None,
        },
        "last_activity_at": isoformat(latest_attempt.created_at) if latest_attempt else None,
        "notice": "掌握度是学习证据的加权估计，不是能力标签；观看解答不自动计为掌握。",
    }


def practice_map(session: Session, user: User, *, textbook_slug: str | None = None) -> dict[str, Any]:
    textbook = get_primary_textbook(session)
    if textbook_slug and textbook_slug not in {textbook.slug, textbook.id}:
        raise ApiError("not_found", "教材不存在")
    concept_stmt = select(Concept).where(Concept.status == "published")
    if not published_only(user):
        concept_stmt = select(Concept)
    concepts = list(
        session.scalars(
            concept_stmt.where(Concept.scope != "v1_extension").order_by(Concept.sort_order)
        )
    )
    exercises = list(
        session.scalars(
            select(Exercise).where(
                Exercise.status == "published",
                Exercise.review_status.in_(["reviewed", "auto_checked"]),
            )
        )
    )
    rows = _attempt_rows(session, user)
    attempts_by_exercise: dict[str, list[Attempt]] = defaultdict(list)
    for attempt, exercise in rows:
        attempts_by_exercise[exercise.id].append(attempt)

    exercise_index: dict[tuple[str, str], list[Exercise]] = defaultdict(list)
    for exercise in exercises:
        exercise_index[(exercise.topic_id, skill_bucket(exercise.skill))].append(exercise)

    table = []
    covered = 0
    blank_cells = []
    for concept in concepts:
        cells = []
        for skill in SKILLS:
            cell_exercises = exercise_index.get((concept.id, skill), [])
            if cell_exercises:
                covered += 1
            else:
                blank_cells.append(
                    {
                        "topic_id": concept.id,
                        "topic_name": concept.name,
                        "skill": skill,
                    }
                )
            cell_attempts = [
                attempt
                for exercise in cell_exercises
                for attempt in attempts_by_exercise.get(exercise.id, [])
            ]
            mastery = (
                round(sum(_weights(attempt) for attempt in cell_attempts) / len(cell_attempts) * 100)
                if cell_attempts
                else 0
            )
            cells.append(
                {
                    "skill": skill,
                    "exercise_count": len(cell_exercises),
                    "attempt_count": len(cell_attempts),
                    "distinct_exercises_attempted": len(
                        {attempt.exercise_id for attempt in cell_attempts}
                    ),
                    "mastery": mastery,
                }
            )
        table.append(
            {
                "topic_id": concept.id,
                "name": concept.short_name or concept.name,
                "chapter_id": concept.chapter_id,
                "page_start": concept.page_start,
                "cells": cells,
                "exercise_count": sum(cell["exercise_count"] for cell in cells),
                "attempt_count": sum(cell["attempt_count"] for cell in cells),
            }
        )
    total_cells = len(concepts) * len(SKILLS)
    return {
        "textbook": {"id": textbook.id, "slug": textbook.slug, "title": textbook.title},
        "skills": SKILLS,
        "rows": table,
        "totals": {
            "concepts": len(concepts),
            "cells": total_cells,
            "covered_cells": covered,
            "blank_cells": max(0, total_cells - covered),
            "coverage_percent": round(covered / total_cells * 100) if total_cells else 0,
            "exercises": len(exercises),
            "attempts": len(rows),
        },
        "by_skill": [
            {
                "skill": skill,
                "exercise_count": sum(
                    len(exercises_for_cell)
                    for (_topic, cell_skill), exercises_for_cell in exercise_index.items()
                    if cell_skill == skill
                ),
                "attempts": sum(
                    len(attempts_by_exercise.get(exercise.id, []))
                    for exercise in exercises
                    if skill_bucket(exercise.skill) == skill
                ),
            }
            for skill in SKILLS
        ],
        "blank_cells": blank_cells[:24],
        "recommendations": _recommendations(table),
        "notice": "空白格表示当前题库没有该知识点 × 能力的已审核练习，不等于该能力不需要训练。",
    }


def _recommendations(table: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for row in table:
        for cell in row["cells"]:
            if cell["exercise_count"] == 0:
                continue
            score = cell["mastery"] if cell["attempt_count"] else 0
            if score < 60:
                items.append(
                    {
                        "topic_id": row["topic_id"],
                        "topic_name": row["name"],
                        "skill": cell["skill"],
                        "mastery": score,
                        "exercise_count": cell["exercise_count"],
                        "reason": "练习量不足或最近作答未标记为掌握" if cell["attempt_count"] < 2 else "掌握度低于 60%",
                    }
                )
    items.sort(key=lambda item: (item["mastery"], -item["exercise_count"]))
    return items[:4]


def review_queue(session: Session, user: User, limit: int = 10) -> list[dict[str, Any]]:
    rows = _attempt_rows(session, user)
    latest: dict[str, Attempt] = {}
    for attempt, exercise in rows:
        latest[exercise.id] = attempt
    items = []
    now = datetime.now(timezone.utc)
    for exercise_id, attempt in latest.items():
        if attempt.self_rating not in {"revisit", "pending"}:
            continue
        exercise = session.get(Exercise, exercise_id)
        if exercise is None:
            continue
        created = _as_utc(attempt.created_at) or now
        age = max(0, (now - created).days)
        priority = 2 if attempt.self_rating == "revisit" else 1
        items.append(
            {
                "attempt_id": attempt.id,
                "exercise_id": exercise.id,
                "code": exercise.code,
                "title": exercise.title,
                "topic_id": exercise.topic_id,
                "skill": exercise.skill,
                "self_rating": attempt.self_rating,
                "days_since_attempt": age,
                "priority": priority,
                "recommended_action": (
                    "重新独立作答" if priority == 2 else "完成一道同知识点变式"
                ),
            }
        )
    items.sort(key=lambda item: (-item["priority"], -item["days_since_attempt"], item["title"]))
    return items[:limit]


def heatmap(session: Session, user: User, days: int = 84) -> dict[str, Any]:
    start = datetime.now(_tz()).date() - timedelta(days=days - 1)
    start_dt = _day_start_utc(start)
    attempts = session.execute(
        select(Attempt.created_at).where(
            Attempt.user_id == user.id, Attempt.created_at >= start_dt
        )
    ).scalars()
    events = session.execute(
        select(StudyEvent.created_at).where(
            StudyEvent.user_id == user.id, StudyEvent.created_at >= start_dt
        )
    ).scalars()
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"attempts": 0, "events": 0})
    for created in attempts:
        value = _local_date(created)
        if value:
            counts[value.isoformat()]["attempts"] += 1
    for created in events:
        value = _local_date(created)
        if value:
            counts[value.isoformat()]["events"] += 1
    cells = []
    for offset in range(days):
        current = start + timedelta(days=offset)
        entry = counts.get(current.isoformat(), {"attempts": 0, "events": 0})
        cells.append(
            {
                "date": current.isoformat(),
                "attempts": entry["attempts"],
                "activity": entry["attempts"] + entry["events"],
            }
        )
    return {"days": days, "cells": cells, "max_activity": max((cell["activity"] for cell in cells), default=0)}


def diagnostic(session: Session, user: User) -> dict[str, Any]:
    questions = list(
        session.scalars(
            select(DiagnosticQuestion)
            .where(DiagnosticQuestion.status == "published")
            .order_by(DiagnosticQuestion.sort_order)
        )
    )
    previous = session.scalar(
        select(DiagnosticRun)
        .where(DiagnosticRun.user_id == user.id)
        .order_by(DiagnosticRun.created_at.desc())
        .limit(1)
    )
    return {
        "questions": [
            {
                "id": question.id,
                "text": question.text,
                "options": question.options,
                "concept_id": question.concept_id,
                "skill": question.skill,
            }
            for question in questions
        ],
        "previous": (
            {
                "id": previous.id,
                "answers": previous.answers,
                "correct_count": previous.correct_count,
                "created_at": isoformat(previous.created_at),
            }
            if previous
            else None
        ),
        "notice": "诊断只用于定位前置知识，不作为能力判定。",
    }


def submit_diagnostic(session: Session, user: User, answers: dict[str, int]) -> dict[str, Any]:
    questions = list(
        session.scalars(
            select(DiagnosticQuestion)
            .where(DiagnosticQuestion.status == "published")
            .order_by(DiagnosticQuestion.sort_order)
        )
    )
    if not questions:
        raise ApiError("not_found", "还没有诊断题")
    normalized: dict[str, int] = {}
    results = []
    correct_count = 0
    for index, question in enumerate(questions):
        raw = answers.get(question.id)
        if raw is None:
            raw = answers.get(str(index))
        if raw is None:
            continue
        answer = int(raw)
        if answer < 0 or answer >= len(question.options):
            raise ApiError("unprocessable", f"第 {index + 1} 题的选项不存在")
        normalized[question.id] = answer
        correct = answer == question.correct_index
        correct_count += 1 if correct else 0
        results.append(
            {
                "question_id": question.id,
                "selected": answer,
                "correct_index": question.correct_index,
                "correct": correct,
                "reason": question.reason,
                "concept_id": question.concept_id,
            }
        )
    if len(normalized) != len(questions):
        raise ApiError("unprocessable", "请回答全部问题后再查看结果")
    wrong_concepts = {
        item["concept_id"] for item in results if not item["correct"] and item["concept_id"]
    }
    recommendations = []
    for concept_id in sorted(wrong_concepts):
        concept = session.get(Concept, concept_id)
        if concept:
            recommendations.append(concept_summary(concept))
    run = DiagnosticRun(
        user_id=user.id,
        answers=normalized,
        correct_count=correct_count,
        result={"results": results, "recommended_concepts": [item["id"] for item in recommendations]},
    )
    session.add(run)
    session.add(
        StudyEvent(
            user_id=user.id,
            kind="diagnostic",
            payload={"correct_count": correct_count, "total": len(questions)},
        )
    )
    session.flush()
    return {
        "id": run.id,
        "correct_count": correct_count,
        "total": len(questions),
        "results": results,
        "recommendations": recommendations,
        "notice": "错题指向相关知识点，不表示永久性的能力标签。",
    }


def record_page_view(
    session: Session, user: User, *, page: str, concept_id: str | None = None
) -> dict[str, Any]:
    if len(page) > 60:
        raise ApiError("unprocessable", "页面标识过长")
    progress = get_progress(session, user)
    progress.last_page = page
    if concept_id:
        concept = session.get(Concept, concept_id)
        if concept is None:
            raise ApiError("not_found", "知识点不存在")
        progress.last_concept_id = concept_id
    session.add(
        StudyEvent(
            user_id=user.id,
            kind="page_view",
            concept_id=concept_id,
            payload={"page": page},
        )
    )
    session.flush()
    return {
        "page": progress.last_page,
        "concept_id": progress.last_concept_id,
        "week": progress.week,
    }
