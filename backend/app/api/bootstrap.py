"""One-request bootstrap bundle used by the web client.

Loading a page used to require catalog + eight concept details + eight list
endpoints. Over a tunnel that made the first paint unnecessarily slow, so this
endpoint assembles the same read-only state in one server round trip. Writes
still use their dedicated endpoints.
"""

from __future__ import annotations

from flask import Blueprint
from sqlalchemy import select

from ..auth import current_user, require_auth
from ..db import get_session
from ..models import Attempt, Bookmark, Exercise, Note
from ..modules import content_service, exercise_service, graph_service, progress_service
from ..schemas.learning import ExerciseListQuery
from ..serializers import attempt_out, bookmark_out, note_out

bp = Blueprint("bootstrap", __name__, url_prefix="/api/v1")


@bp.get("/bootstrap")
@require_auth()
def bootstrap():
    session = get_session()
    user = current_user()

    catalog = content_service.catalog(session, user)
    details = [
        content_service.get_concept(session, user, concept["id"])
        for concept in catalog["concepts"]
    ]
    exercises = exercise_service.list_exercises(
        session, user, ExerciseListQuery(limit=100)
    )
    summary = progress_service.summary(session, user)
    graph = graph_service.graph(
        session,
        user,
        scope="all",
        include_examples=True,
        include_extensions=True,
        unlocked_only=False,
        relation=None,
    )
    practice = progress_service.practice_map(session, user)
    notes = list(
        session.scalars(
            select(Note)
            .where(Note.user_id == user.id, Note.deleted_at.is_(None))
            .order_by(Note.updated_at.desc())
            .limit(100)
        )
    )
    attempts = list(
        session.scalars(
            select(Attempt)
            .where(Attempt.user_id == user.id)
            .order_by(Attempt.created_at.desc())
            .limit(100)
        )
    )
    exercise_by_id = {
        exercise.id: exercise
        for exercise in session.scalars(
            select(Exercise).where(
                Exercise.id.in_([attempt.exercise_id for attempt in attempts])
            )
        )
    }
    bookmarks = list(
        session.scalars(
            select(Bookmark)
            .where(Bookmark.user_id == user.id)
            .order_by(Bookmark.created_at.desc())
        )
    )
    diagnostic = progress_service.diagnostic(session, user)

    return {
        "catalog": catalog,
        "details": details,
        "exercises": exercises["items"],
        "attempts": [
            attempt_out(attempt, exercise=exercise_by_id.get(attempt.exercise_id))
            for attempt in attempts
        ],
        "notes": [note_out(note) for note in notes],
        "bookmarks": [bookmark_out(bookmark) for bookmark in bookmarks],
        "dashboard": {
            "user": None,
            "summary": summary,
            "catalog": {
                "textbook": catalog["textbook"],
                "stats": catalog["stats"],
                "progress": catalog["progress"],
            },
            "review_queue": progress_service.review_queue(session, user, limit=5),
            "suggestions": [],
        },
        "graph": graph,
        "practice": practice,
        "diagnostic": diagnostic,
    }
