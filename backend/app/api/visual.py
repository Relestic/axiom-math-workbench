"""Visualization template, scene, observation and analysis endpoints."""

from __future__ import annotations

from flask import Blueprint, request

from ..adapters.math import analyze_expression
from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import ApiError, parse_json, parse_query
from ..schemas.visual import (
    ConversationActionRequest,
    ConversationCreateRequest,
    ObservationCreateRequest,
    SceneCreateRequest,
    SceneUpdateRequest,
    ValidateSceneRequest,
    VisualAnalysisQuery,
)
from ..modules import conversation_service, visual_service
from ..models import Conversation
from sqlalchemy import select

bp = Blueprint("visualizations", __name__, url_prefix="/api/v1/visualizations")


@bp.get("/conversations")
@require_auth()
def conversations():
    session = get_session()
    rows = session.scalars(
        select(Conversation)
        .where(Conversation.user_id == current_user().id)
        .order_by(Conversation.updated_at.desc())
        .limit(30)
    )
    return {
        "items": [
            {
                "id": row.id,
                "title": row.title,
                "scene_id": row.scene_id,
                "message_count": len(row.messages),
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    }


@bp.post("/conversations")
@require_auth()
def create_conversation():
    payload = parse_json(ConversationCreateRequest)
    session = get_session()
    row = visual_service.create_conversation(
        session, current_user(), title=payload.title, scene_id=payload.scene_id
    )
    session.commit()
    return row, 201


@bp.get("/conversations/<conversation_id>")
@require_auth()
def conversation_detail(conversation_id: str):
    session = get_session()
    return visual_service.get_conversation(session, current_user(), conversation_id)


@bp.post("/conversations/<conversation_id>/actions")
@require_auth()
def conversation_action(conversation_id: str):
    payload = parse_json(ConversationActionRequest)
    session = get_session()
    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != current_user().id:
        raise ApiError("not_found", "对话不存在")
    result = conversation_service.dispatch(
        session,
        current_user(),
        conversation,
        payload.action,
        payload.params,
    )
    session.commit()
    return result


@bp.get("/templates")
@require_auth()
def templates():
    session = get_session()
    items = visual_service.list_templates(session)
    return {"items": items, "total": len(items)}


@bp.get("/templates/<slug>")
@require_auth()
def template_detail(slug: str):
    session = get_session()
    return visual_service.get_template(session, slug)


@bp.post("/validate")
@require_auth()
def validate():
    payload = parse_json(ValidateSceneRequest)
    return visual_service.validate_scene(payload.scene.model_dump())


@bp.get("/analyze")
@require_auth()
def analyze():
    query = parse_query(VisualAnalysisQuery)
    try:
        return analyze_expression(
            query.expression,
            x0=query.x0,
            epsilon=query.epsilon,
            delta=query.delta,
            x_min=query.x_min,
            x_max=query.x_max,
            order=query.order,
            subdivisions=query.subdivisions,
        )
    except Exception as exc:
        if isinstance(exc, ApiError):
            raise
        raise ApiError("unprocessable", str(exc))


@bp.get("/scenes")
@require_auth()
def scenes():
    session = get_session()
    return visual_service.list_scenes(session, current_user())


@bp.post("/scenes")
@require_auth()
def create_scene():
    payload = parse_json(SceneCreateRequest)
    session = get_session()
    row = visual_service.create_scene(
        session,
        current_user(),
        title=payload.title,
        scene=payload.scene.model_dump() if payload.scene else None,
        template_slug=payload.template_slug,
    )
    session.commit()
    return row, 201


@bp.get("/scenes/<scene_id>")
@require_auth()
def scene_detail(scene_id: str):
    session = get_session()
    return visual_service.get_scene(session, current_user(), scene_id)


@bp.patch("/scenes/<scene_id>")
@require_auth()
def update_scene(scene_id: str):
    payload = parse_json(SceneUpdateRequest)
    session = get_session()
    row = visual_service.update_scene(
        session,
        current_user(),
        scene_id,
        scene=payload.scene.model_dump(),
        expected_version=payload.expected_version,
    )
    session.commit()
    return row


@bp.delete("/scenes/<scene_id>")
@require_auth()
def delete_scene(scene_id: str):
    session = get_session()
    result = visual_service.delete_scene(session, current_user(), scene_id)
    session.commit()
    return result


@bp.post("/scenes/<scene_id>/undo")
@require_auth()
def undo_scene(scene_id: str):
    session = get_session()
    row = visual_service.undo_scene(session, current_user(), scene_id)
    session.commit()
    return row


@bp.get("/scenes/<scene_id>/observations")
@require_auth()
def observations(scene_id: str):
    session = get_session()
    return visual_service.list_observations(session, current_user(), scene_id)


@bp.post("/scenes/<scene_id>/observations")
@require_auth()
def add_observation(scene_id: str):
    payload = parse_json(ObservationCreateRequest)
    session = get_session()
    row = visual_service.add_observation(
        session, current_user(), scene_id, payload.text, payload.tags
    )
    session.commit()
    return row, 201
