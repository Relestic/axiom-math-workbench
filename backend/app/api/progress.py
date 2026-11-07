"""Dashboard, progress, practice map, review and diagnostic endpoints."""

from __future__ import annotations

from flask import Blueprint

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import parse_json, parse_query
from ..schemas.common import StrictModel
from ..schemas.learning import DiagnosticSubmitRequest, PracticeMapQuery, ProgressQuery
from ..serializers import user_out
from ..modules import content_service, progress_service
from pydantic import Field

bp = Blueprint("progress", __name__, url_prefix="/api/v1")


class PageRequest(StrictModel):
    page: str = Field(min_length=1, max_length=60)
    concept_id: str | None = Field(default=None, max_length=40)


@bp.get("/dashboard")
@require_auth()
def dashboard():
    session = get_session()
    user = current_user()
    summary = progress_service.summary(session, user)
    catalog = content_service.catalog(session, user)
    progress = content_service.get_progress(session, user)
    return {
        "user": user_out(user, progress),
        "summary": summary,
        "catalog": {
            "textbook": catalog["textbook"],
            "stats": catalog["stats"],
            "progress": catalog["progress"],
        },
        "review_queue": progress_service.review_queue(session, user, limit=5),
        "suggestions": [
            {
                "type": "continue",
                "title": "继续上次学习",
                "concept": summary["current"]["concept"],
                "page": summary["current"]["page"],
            },
            {
                "type": "review",
                "title": f"待复习 {summary['review']['count']} 项",
                "items": summary["review"]["items"][:3],
            },
            {
                "type": "gap",
                "title": f"前置缺口 {summary['graph']['gaps']} 处",
                "items": summary["graph"]["gap_items"][:3],
            },
        ],
    }


@bp.get("/progress/summary")
@require_auth()
def summary():
    session = get_session()
    return progress_service.summary(session, current_user())


@bp.get("/progress/practice-map")
@require_auth()
def practice_map():
    query = parse_query(PracticeMapQuery)
    session = get_session()
    return progress_service.practice_map(
        session, current_user(), textbook_slug=query.textbook_slug
    )


@bp.get("/progress/heatmap")
@require_auth()
def heatmap():
    query = parse_query(ProgressQuery)
    session = get_session()
    return progress_service.heatmap(session, current_user(), query.days)


@bp.get("/progress/review-queue")
@require_auth()
def review_queue():
    session = get_session()
    items = progress_service.review_queue(session, current_user(), limit=20)
    return {"items": items, "total": len(items)}


@bp.get("/diagnostic")
@require_auth()
def diagnostic():
    session = get_session()
    return progress_service.diagnostic(session, current_user())


@bp.post("/diagnostic")
@require_auth()
def submit_diagnostic():
    payload = parse_json(DiagnosticSubmitRequest)
    session = get_session()
    result = progress_service.submit_diagnostic(session, current_user(), payload.answers)
    session.commit()
    return result, 201


@bp.post("/progress/page")
@require_auth()
def page_view():
    payload = parse_json(PageRequest)
    session = get_session()
    result = progress_service.record_page_view(
        session,
        current_user(),
        page=payload.page,
        concept_id=payload.concept_id,
    )
    session.commit()
    return result
