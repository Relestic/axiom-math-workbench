"""Exercise, attempt and event endpoints."""

from __future__ import annotations

from flask import Blueprint, request
from sqlalchemy import func, or_, select

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import ApiError, parse_json, parse_query
from ..models import Attempt, AttemptEvent, Exercise, StudyEvent
from ..schemas.common import PageQuery
from ..schemas.learning import (
    AttemptCreateRequest,
    AttemptPatchRequest,
    EventRequest,
    ExerciseListQuery,
)
from ..schemas.queries import AttemptListQuery
from ..schemas.visual import GenerateExercisesRequest
from ..serializers import attempt_out, exercise_out
from ..modules import exercise_service
from .utils import pagination

bp = Blueprint("exercises", __name__, url_prefix="/api/v1")


@bp.get("/exercises")
@require_auth()
def list_exercises():
    query = parse_query(ExerciseListQuery)
    session = get_session()
    return exercise_service.list_exercises(session, current_user(), query)


@bp.post("/exercises/generate")
@require_auth()
def generate_exercises():
    payload = parse_json(GenerateExercisesRequest)
    session = get_session()
    result = exercise_service.generate_exercises(
        session,
        current_user(),
        topic_id=payload.topic_id,
        skill=payload.skill,
        difficulty=payload.difficulty,
        count=payload.count,
        focus=payload.focus,
    )
    session.commit()
    return result, 201


@bp.get("/exercises/<exercise_id>")
@require_auth()
def exercise_detail(exercise_id: str):
    session = get_session()
    return exercise_service.get_exercise(session, current_user(), exercise_id)


@bp.get("/exercises/<exercise_id>/hint")
@require_auth()
def hint(exercise_id: str):
    session = get_session()
    result = exercise_service.get_hint(session, current_user(), exercise_id)
    session.commit()
    return result


@bp.get("/exercises/<exercise_id>/solution")
@require_auth()
def solution(exercise_id: str):
    session = get_session()
    result = exercise_service.get_solution(session, current_user(), exercise_id)
    session.commit()
    return result


@bp.get("/attempts")
@require_auth()
def list_attempts():
    query = parse_query(AttemptListQuery)
    topic = query.topic
    rating = query.self_rating
    session = get_session()
    stmt = select(Attempt).where(Attempt.user_id == current_user().id)
    if topic:
        stmt = stmt.join(Exercise, Exercise.id == Attempt.exercise_id).where(
            Exercise.topic_id == topic
        )
    if rating:
        stmt = stmt.where(Attempt.self_rating == rating)
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(stmt.order_by(Attempt.created_at.desc()).limit(query.limit).offset(query.offset))
    )
    exercises = {
        exercise.id: exercise
        for exercise in session.scalars(
            select(Exercise).where(Exercise.id.in_([row.exercise_id for row in rows]))
        )
    }
    return {
        "items": [
            attempt_out(row, exercise=exercises.get(row.exercise_id)) for row in rows
        ],
        **pagination(query.limit, query.offset, total),
    }


@bp.get("/attempts/<attempt_id>")
@require_auth()
def attempt_detail(attempt_id: str):
    session = get_session()
    attempt = session.get(Attempt, attempt_id)
    if attempt is None or attempt.user_id != current_user().id:
        raise ApiError("not_found", "作答记录不存在")
    return attempt_out(attempt, exercise=attempt.exercise, include_events=True)


@bp.patch("/attempts/<attempt_id>")
@require_auth()
def update_attempt(attempt_id: str):
    payload = parse_json(AttemptPatchRequest)
    session = get_session()
    attempt = session.get(Attempt, attempt_id)
    if attempt is None or attempt.user_id != current_user().id:
        raise ApiError("not_found", "作答记录不存在")
    if payload.self_rating is not None:
        exercise_service.rate_attempt(session, attempt, payload.self_rating)
    session.commit()
    return attempt_out(attempt, exercise=attempt.exercise, include_events=True)


@bp.post("/attempts")
@require_auth()
def submit_attempt():
    payload = parse_json(AttemptCreateRequest)
    idempotency_key = request.headers.get("Idempotency-Key") or payload.idempotency_key
    if idempotency_key and len(idempotency_key) > 120:
        raise ApiError("unprocessable", "Idempotency-Key 不能超过 120 个字符")
    session = get_session()
    result = exercise_service.submit_attempt(
        session,
        current_user(),
        exercise_id=payload.exercise_id,
        answer_text=payload.answer_text,
        answer_format=payload.answer_format,
        hints_used=payload.hints_used,
        solution_viewed=payload.solution_viewed,
        self_rating=payload.self_rating,
        idempotency_key=idempotency_key,
    )
    session.commit()
    return result, 201


@bp.post("/attempts/<attempt_id>/events")
@require_auth()
def add_event(attempt_id: str):
    payload = parse_json(EventRequest)
    session = get_session()
    attempt = session.get(Attempt, attempt_id)
    if attempt is None or attempt.user_id != current_user().id:
        raise ApiError("not_found", "作答记录不存在")
    session.add(
        AttemptEvent(
            attempt_id=attempt.id,
            user_id=attempt.user_id,
            exercise_id=attempt.exercise_id,
            type=payload.type,
            payload=payload.payload,
        )
    )
    if payload.type in {"hint_view", "solution_view"}:
        session.add(
            StudyEvent(
                user_id=attempt.user_id,
                kind=payload.type,
                concept_id=attempt.exercise.topic_id if attempt.exercise else None,
                payload={"attempt_id": attempt.id},
            )
        )
    session.commit()
    return {"recorded": True, "type": payload.type}
