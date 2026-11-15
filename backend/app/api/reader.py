"""Reader rules, correction examples and Word analysis endpoints."""

from __future__ import annotations

from flask import Blueprint

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import ApiError, parse_json
from ..modules import reader_analysis, reader_settings
from ..schemas.reader import (
    ReaderAnalyzeRequest,
    ReaderExampleCreate,
    ReaderRuleUpdate,
)
from .utils import limit

bp = Blueprint("reader", __name__, url_prefix="/api/v1/reader")
ai_bp = Blueprint("reader_ai", __name__, url_prefix="/api/v1/ai")


@bp.get("/settings")
@require_auth()
def get_settings():
    return reader_settings.settings(get_session(), current_user())


@bp.put("/rules/<task>")
@require_auth()
def save_rule(task: str):
    payload = parse_json(ReaderRuleUpdate)
    session = get_session()
    try:
        result = reader_settings.save_rule(session, current_user(), task, payload.content)
    except ValueError as exc:
        raise ApiError("not_found", str(exc)) from exc
    session.commit()
    return result


@bp.delete("/rules/<task>")
@require_auth()
def reset_rule(task: str):
    session = get_session()
    try:
        result = reader_settings.reset_rule(session, current_user(), task)
    except ValueError as exc:
        raise ApiError("not_found", str(exc)) from exc
    session.commit()
    return result


@bp.post("/examples")
@require_auth()
def create_example():
    payload = parse_json(ReaderExampleCreate)
    session = get_session()
    result = reader_settings.add_example(
        session,
        current_user(),
        payload.model_dump(),
    )
    session.commit()
    return result, 201


@bp.delete("/examples/<example_id>")
@require_auth()
def delete_example(example_id: str):
    session = get_session()
    reader_settings.delete_example(session, current_user(), example_id)
    session.commit()
    return {"deleted": True}


@ai_bp.post("/reader/analyze")
@require_auth()
def analyze_blocks():
    user = current_user()
    limit("ai", user.id)
    payload = parse_json(ReaderAnalyzeRequest)
    session = get_session()
    result = reader_analysis.analyze(session, user, payload)
    session.commit()
    return result
