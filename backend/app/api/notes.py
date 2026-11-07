"""Notes, bookmarks and personal export endpoints."""

from __future__ import annotations

from urllib.parse import quote

from flask import Blueprint, Response, request
from sqlalchemy import or_, select

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import ApiError, parse_json, parse_query
from ..models import Bookmark, Concept, Note, utcnow
from ..schemas.common import PageQuery
from ..schemas.learning import BookmarkCreateRequest, NoteCreateRequest, NoteUpdateRequest
from ..schemas.queries import NoteListQuery
from ..serializers import bookmark_out, note_out
from .utils import pagination

bp = Blueprint("notes", __name__, url_prefix="/api/v1")


@bp.get("/notes")
@require_auth()
def list_notes():
    query = parse_query(NoteListQuery)
    session = get_session()
    user = current_user()
    stmt = select(Note).where(Note.user_id == user.id, Note.deleted_at.is_(None))
    text = query.q
    concept_id = query.concept_id
    if text:
        stmt = stmt.where(Note.text.like(f"%{text.strip()}%"))
    if concept_id:
        stmt = stmt.where(Note.concept_id == concept_id)
    from sqlalchemy import func

    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.order_by(Note.updated_at.desc()).limit(query.limit).offset(query.offset)
        )
    )
    return {
        "items": [note_out(row) for row in rows],
        **pagination(query.limit, query.offset, total),
    }


@bp.post("/notes")
@require_auth()
def create_note():
    payload = parse_json(NoteCreateRequest)
    session = get_session()
    if payload.concept_id:
        concept = session.get(Concept, payload.concept_id)
        if concept is None:
            raise ApiError("not_found", "知识点不存在")
    note = Note(
        user_id=current_user().id,
        text=payload.text,
        concept_id=payload.concept_id,
        tags=payload.tags,
    )
    session.add(note)
    session.commit()
    return note_out(note), 201


@bp.get("/notes/<note_id>")
@require_auth()
def note_detail(note_id: str):
    session = get_session()
    note = session.get(Note, note_id)
    if note is None or note.user_id != current_user().id or note.deleted_at is not None:
        raise ApiError("not_found", "笔记不存在")
    return note_out(note)


@bp.patch("/notes/<note_id>")
@require_auth()
def update_note(note_id: str):
    payload = parse_json(NoteUpdateRequest)
    session = get_session()
    note = session.get(Note, note_id)
    if note is None or note.user_id != current_user().id or note.deleted_at is not None:
        raise ApiError("not_found", "笔记不存在")
    if payload.text is not None:
        note.text = payload.text
    if payload.concept_id is not None:
        note.concept_id = payload.concept_id or None
    if payload.tags is not None:
        note.tags = payload.tags
    session.commit()
    return note_out(note)


@bp.delete("/notes/<note_id>")
@require_auth()
def delete_note(note_id: str):
    session = get_session()
    note = session.get(Note, note_id)
    if note is None or note.user_id != current_user().id or note.deleted_at is not None:
        raise ApiError("not_found", "笔记不存在")
    note.deleted_at = utcnow()
    session.commit()
    return {"deleted": True, "id": note.id}


@bp.get("/notes/export")
@require_auth()
def export_notes():
    session = get_session()
    user = current_user()
    notes = list(
        session.scalars(
            select(Note)
            .where(Note.user_id == user.id, Note.deleted_at.is_(None))
            .order_by(Note.created_at)
        )
    )
    concepts = {
        concept.id: concept.name
        for concept in session.scalars(
            select(Concept).where(Concept.id.in_([note.concept_id for note in notes if note.concept_id]))
        )
    }
    lines = ["# Axiom 数学学习笔记", "", f"导出时间：{utcnow().isoformat()}", ""]
    for note in notes:
        title = concepts.get(note.concept_id or "", "未关联知识点")
        lines.append(f"## {title}")
        lines.append("")
        lines.append(note.text)
        lines.append("")
        if note.tags:
            lines.append("标签：" + "、".join(note.tags))
            lines.append("")
    markdown = "\n".join(lines)
    filename = quote("Axiom-notes.md")
    return Response(
        markdown,
        mimetype="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
            "Cache-Control": "no-store",
        },
    )


@bp.get("/bookmarks")
@require_auth()
def list_bookmarks():
    session = get_session()
    rows = list(
        session.scalars(
            select(Bookmark)
            .where(Bookmark.user_id == current_user().id)
            .order_by(Bookmark.created_at.desc())
        )
    )
    return {"items": [bookmark_out(row) for row in rows], "total": len(rows)}


@bp.post("/bookmarks")
@require_auth()
def create_bookmark():
    payload = parse_json(BookmarkCreateRequest)
    session = get_session()
    user = current_user()
    existing = session.scalar(
        select(Bookmark).where(
            Bookmark.user_id == user.id,
            Bookmark.target_type == payload.target_type,
            Bookmark.target_id == payload.target_id,
        )
    )
    if existing is not None:
        return bookmark_out(existing)
    bookmark = Bookmark(
        user_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
    )
    session.add(bookmark)
    session.commit()
    return bookmark_out(bookmark), 201


@bp.delete("/bookmarks/<target_type>/<target_id>")
@require_auth()
def delete_bookmark(target_type: str, target_id: str):
    session = get_session()
    bookmark = session.scalar(
        select(Bookmark).where(
            Bookmark.user_id == current_user().id,
            Bookmark.target_type == target_type,
            Bookmark.target_id == target_id,
        )
    )
    if bookmark is None:
        raise ApiError("not_found", "收藏不存在")
    session.delete(bookmark)
    session.commit()
    return {"deleted": True}
