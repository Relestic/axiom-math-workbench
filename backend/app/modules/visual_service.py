"""Visualization scene persistence, server-side analysis and observations."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..adapters.math import MathError, analyze_expression, validate_and_normalize_scene
from ..errors import ApiError
from ..models import (
    Conversation,
    ConversationMessage,
    Observation,
    SceneVersion,
    User,
    VisualScene,
    VisualTemplate,
    utcnow,
)
from ..serializers import observation_out, scene_out, template_out


def list_templates(session: Session) -> list[dict[str, Any]]:
    templates = list(
        session.scalars(
            select(VisualTemplate)
            .where(VisualTemplate.status == "published")
            .order_by(VisualTemplate.name)
        )
    )
    return [template_out(template) for template in templates]


def get_template(session: Session, slug: str) -> dict[str, Any]:
    template = session.scalar(
        select(VisualTemplate).where(
            (VisualTemplate.slug == slug) | (VisualTemplate.id == slug)
        )
    )
    if template is None or template.status != "published":
        raise ApiError("not_found", "图像模板不存在")
    return template_out(template)


def _clean_scene(scene: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in scene.items() if not key.startswith("_")}


def validate_scene(scene: dict[str, Any], *, with_analysis: bool = True) -> dict[str, Any]:
    try:
        normalized = validate_and_normalize_scene(scene)
    except MathError as exc:
        raise ApiError("unprocessable", str(exc), details={"field": "scene"})
    except Exception as exc:
        raise ApiError("unprocessable", f"函数配置无法通过校验：{exc}")
    cleaned = _clean_scene(normalized)
    warnings = {
        item["id"]: item["warnings"] for item in normalized.get("_compiled", []) if item.get("warnings")
    }
    response: dict[str, Any] = {
        "scene": cleaned,
        "warnings": warnings,
        "numeric_only": True,
    }
    if with_analysis:
        active = next(
            (curve for curve in cleaned["curves"] if curve["id"] == cleaned["activeId"]),
            cleaned["curves"][0],
        )
        parameters = {item["name"]: item["value"] for item in cleaned["parameters"]}
        try:
            response["analysis"] = analyze_expression(
                active["expression"],
                parameters=parameters,
                x0=cleaned["x0"],
                epsilon=cleaned["epsilon"],
                delta=cleaned["delta"],
                x_min=cleaned["xMin"],
                x_max=cleaned["xMax"],
                order=cleaned["order"],
                subdivisions=cleaned["subdivisions"],
            )
        except MathError as exc:
            raise ApiError("unprocessable", str(exc))
    return response


def create_scene(
    session: Session,
    user: User,
    *,
    title: str,
    scene: dict[str, Any] | None,
    template_slug: str | None = None,
) -> dict[str, Any]:
    template = None
    if template_slug:
        template = session.scalar(
            select(VisualTemplate).where(
                (VisualTemplate.slug == template_slug) | (VisualTemplate.id == template_slug)
            )
        )
        if template is None:
            raise ApiError("not_found", "图像模板不存在")
    if scene is None:
        if template is None:
            raise ApiError("unprocessable", "scene 与 template_slug 至少提供一个")
        scene = template.scene
    normalized = validate_scene(scene, with_analysis=False)["scene"]
    row = VisualScene(
        user_id=user.id,
        template_id=template.id if template else None,
        title=title or (template.name if template else "未命名图像"),
        scene=normalized,
        version=1,
        is_active=True,
    )
    session.add(row)
    session.flush()
    session.add(
        SceneVersion(
            scene_id=row.id,
            version=1,
            scene=normalized,
            origin="user",
            message="创建场景",
            created_by_id=user.id,
        )
    )
    session.flush()
    return scene_out(row)


def list_scenes(session: Session, user: User) -> dict[str, Any]:
    rows = list(
        session.scalars(
            select(VisualScene)
            .where(VisualScene.user_id == user.id, VisualScene.is_active.is_(True))
            .order_by(VisualScene.updated_at.desc())
        )
    )
    return {"items": [scene_out(row) for row in rows], "total": len(rows)}


def _scene_or_404(session: Session, user: User, scene_id: str) -> VisualScene:
    row = session.get(VisualScene, scene_id)
    if row is None or row.user_id != user.id or not row.is_active:
        raise ApiError("not_found", "场景不存在")
    return row


def get_scene(session: Session, user: User, scene_id: str) -> dict[str, Any]:
    row = _scene_or_404(session, user, scene_id)
    data = scene_out(row)
    data["versions"] = [
        {
            "version": version.version,
            "origin": version.origin,
            "message": version.message,
            "created_at": version.created_at.isoformat() if version.created_at else None,
        }
        for version in row.versions
    ]
    data["observations"] = [observation_out(item) for item in row.observations]
    return data


def update_scene(
    session: Session,
    user: User,
    scene_id: str,
    *,
    scene: dict[str, Any],
    expected_version: int | None,
    origin: str = "user",
    message: str = "更新场景",
) -> dict[str, Any]:
    row = _scene_or_404(session, user, scene_id)
    if expected_version is not None and expected_version != row.version:
        raise ApiError(
            "conflict",
            "场景已在其他操作中更新，请刷新后再提交",
            details={"current_version": row.version, "expected_version": expected_version},
        )
    normalized = validate_scene(scene, with_analysis=False)["scene"]
    row.scene = normalized
    row.version += 1
    session.add(
        SceneVersion(
            scene_id=row.id,
            version=row.version,
            scene=normalized,
            origin=origin,
            message=message[:500],
            created_by_id=user.id,
        )
    )
    session.flush()
    return scene_out(row)


def undo_scene(session: Session, user: User, scene_id: str) -> dict[str, Any]:
    row = _scene_or_404(session, user, scene_id)
    if row.version <= 1:
        raise ApiError("conflict", "已经是第一个版本，没有可撤销的修改")
    previous = session.scalar(
        select(SceneVersion)
        .where(SceneVersion.scene_id == row.id, SceneVersion.version == row.version - 1)
    )
    if previous is None:
        raise ApiError("conflict", "找不到上一个版本")
    row.scene = previous.scene
    row.version += 1
    session.add(
        SceneVersion(
            scene_id=row.id,
            version=row.version,
            scene=previous.scene,
            origin="undo",
            message=f"撤销到版本 {previous.version}",
            created_by_id=user.id,
        )
    )
    session.flush()
    data = scene_out(row)
    data["restored_from"] = previous.version
    return data


def delete_scene(session: Session, user: User, scene_id: str) -> dict[str, Any]:
    row = _scene_or_404(session, user, scene_id)
    row.is_active = False
    session.flush()
    return {"deleted": True, "id": row.id}


def add_observation(
    session: Session, user: User, scene_id: str, text: str, tags: list[str]
) -> dict[str, Any]:
    row = _scene_or_404(session, user, scene_id)
    observation = Observation(
        scene_id=row.id,
        user_id=user.id,
        text=text,
        tags=tags,
    )
    session.add(observation)
    session.flush()
    return observation_out(observation)


def list_observations(session: Session, user: User, scene_id: str) -> dict[str, Any]:
    row = _scene_or_404(session, user, scene_id)
    return {
        "items": [observation_out(item) for item in row.observations],
        "total": len(row.observations),
    }


def create_conversation(
    session: Session, user: User, *, title: str, scene_id: str | None
) -> dict[str, Any]:
    if scene_id:
        _scene_or_404(session, user, scene_id)
    conversation = Conversation(user_id=user.id, title=title or "图像对话", scene_id=scene_id)
    session.add(conversation)
    session.flush()
    return _conversation_out(conversation)


def _conversation_out(conversation: Conversation) -> dict[str, Any]:
    return {
        "id": conversation.id,
        "title": conversation.title,
        "scene_id": conversation.scene_id,
        "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "action": message.action or {},
                "state_version": message.state_version,
                "created_at": message.created_at.isoformat() if message.created_at else None,
            }
            for message in conversation.messages
        ],
    }


def get_conversation(session: Session, user: User, conversation_id: str) -> dict[str, Any]:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise ApiError("not_found", "对话不存在")
    return _conversation_out(conversation)


def append_message(
    session: Session,
    conversation: Conversation,
    *,
    role: str,
    content: str,
    action: dict[str, Any] | None = None,
    state_version: int = 0,
) -> ConversationMessage:
    message = ConversationMessage(
        conversation_id=conversation.id,
        role=role,
        content=content,
        action=action or {},
        state_version=state_version,
    )
    conversation.updated_at = utcnow()
    session.add(message)
    session.flush()
    return message
