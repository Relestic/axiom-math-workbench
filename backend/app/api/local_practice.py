"""Signed-out practice uses the protected workstation learner and the regular grader."""

from flask import Blueprint, request
from pydantic import Field

from ..db import get_session
from ..errors import ApiError, parse_json
from ..modules import local_practice as practice
from ..modules.exercise_service import rate_attempt
from ..schemas.common import StrictModel
from ..schemas.learning import AttemptCreateRequest, AttemptPatchRequest
from ..serializers import attempt_out
from .local_only import local_learner

bp = Blueprint("local_practice", __name__)


class VariantRequest(StrictModel):
    attempt_id: str = Field(min_length=1, max_length=40)
    error_focus: practice.Focus | None = None


@bp.post("/attempts")
def submit():
    session = get_session()
    payload = parse_json(AttemptCreateRequest)
    key = request.headers.get("Idempotency-Key") or payload.idempotency_key
    if key and len(key) > 120:
        raise ApiError("unprocessable", "Idempotency-Key 不能超过 120 个字符")
    result = practice.submit_local(session, local_learner(session), payload, key)
    return result, 201


@bp.patch("/attempts/<attempt_id>/self-rating")
def update_rating(attempt_id):
    session = get_session()
    attempt = practice.owned_attempt(session, local_learner(session), attempt_id)
    rating = parse_json(AttemptPatchRequest).self_rating
    if rating is None:
        raise ApiError("unprocessable", "请选择自评结果")
    if rating != attempt.self_rating:
        rate_attempt(session, attempt, rating)
        session.commit()
    return attempt_out(attempt, exercise=attempt.exercise)


@bp.post("/exercises/variant")
def new_variant():
    session = get_session()
    payload = parse_json(VariantRequest)
    return (
        practice.generate_variant(session, local_learner(session), payload.attempt_id, payload.error_focus),
        201,
    )
