"""Catalog, concept, proof, classic-case and search endpoints."""

from __future__ import annotations

from flask import Blueprint, request, send_file
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import ApiError, parse_json, parse_query
from ..models import Asset, Classic, Concept, Proof, Proposition, Textbook
from ..schemas.common import PageQuery
from ..schemas.content import ConceptListQuery, SearchQuery
from ..schemas.queries import ClassicListQuery
from ..serializers import classic_out, concept_summary, proof_out, proposition_out, textbook_out
from ..modules import content_service
from .utils import pagination

bp = Blueprint("catalog", __name__, url_prefix="/api/v1")


@bp.get("/catalog")
@require_auth()
def catalog():
    session = get_session()
    return content_service.catalog(session, current_user())


@bp.get("/textbooks")
@require_auth()
def textbooks():
    session = get_session()
    user = current_user()
    stmt = select(Textbook).order_by(Textbook.is_primary.desc(), Textbook.created_at)
    if user.role != "admin":
        stmt = stmt.where(Textbook.status == "published")
    items = [textbook_out(row) for row in session.scalars(stmt)]
    return {"items": items, "total": len(items)}


@bp.get("/textbooks/<textbook_id>")
@require_auth()
def textbook_detail(textbook_id: str):
    session = get_session()
    user = current_user()
    textbook = content_service.get_textbook(
        session, textbook_id, include_drafts=user.role == "admin"
    )
    data = textbook_out(textbook, include_internal=user.role == "admin")
    data["chapters"] = [
        {
            "id": chapter.id,
            "number": chapter.number,
            "title": chapter.title,
            "week_start": chapter.week_start,
            "week_end": chapter.week_end,
            "page_start": chapter.source_page_start,
            "page_end": chapter.source_page_end,
            "concept_count": len([c for c in chapter.concepts if c.status == "published"]),
        }
        for chapter in textbook.chapters
    ]
    return data


@bp.get("/textbooks/<textbook_id>/file")
@require_auth()
def textbook_file(textbook_id: str):
    session = get_session()
    user = current_user()
    textbook = content_service.get_textbook(
        session, textbook_id, include_drafts=user.role == "admin"
    )
    asset_id = (textbook.parse_meta or {}).get("asset_id")
    asset = session.get(Asset, asset_id) if asset_id else None
    if asset is None:
        raise ApiError("not_found", "该教材还没有可阅读的 PDF 文件")
    return send_file(
        asset.storage_path,
        mimetype=asset.mime,
        as_attachment=False,
        download_name=asset.filename,
    )


@bp.get("/chapters/<chapter_id>")
@require_auth()
def chapter_detail(chapter_id: str):
    session = get_session()
    return content_service.get_chapter(session, current_user(), chapter_id)


@bp.get("/sections/<section_id>")
@require_auth()
def section_detail(section_id: str):
    session = get_session()
    return content_service.get_section(session, current_user(), section_id)


@bp.get("/concepts")
@require_auth()
def concepts():
    query = parse_query(ConceptListQuery)
    session = get_session()
    return content_service.list_concepts(
        session,
        current_user(),
        query,
        chapter=query.chapter,
        scope=query.scope,
        kind=query.kind,
        text=query.query,
        include_extension=query.include_extension,
    )


@bp.get("/concepts/<concept_id>")
@require_auth()
def concept_detail(concept_id: str):
    session = get_session()
    return content_service.get_concept(session, current_user(), concept_id)


@bp.get("/proofs/<proof_id>")
@require_auth()
def proof_detail(proof_id: str):
    session = get_session()
    return content_service.get_proof(session, current_user(), proof_id)


@bp.get("/classics")
@require_auth()
def classics():
    query = parse_query(ClassicListQuery)
    concept_id = query.concept_id
    kind = query.kind
    session = get_session()
    stmt = select(Classic).where(Classic.status == "published")
    if concept_id:
        stmt = stmt.where(Classic.concept_id == concept_id)
    if kind:
        stmt = stmt.where(Classic.kind == kind)
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = session.scalars(
        stmt.order_by(Classic.kind, Classic.name).limit(query.limit).offset(query.offset)
    )
    return {
        "items": [classic_out(row) for row in rows],
        **pagination(query.limit, query.offset, total),
    }


@bp.get("/classics/<classic_id>")
@require_auth()
def classic_detail(classic_id: str):
    session = get_session()
    return content_service.get_classic(session, current_user(), classic_id)


@bp.get("/propositions/<proposition_id>")
@require_auth()
def proposition_detail(proposition_id: str):
    session = get_session()
    return content_service.get_proposition(session, current_user(), proposition_id)


@bp.get("/search")
@require_auth()
def search():
    query = parse_query(SearchQuery)
    types = {item.strip() for item in query.types.split(",") if item.strip()}
    allowed = {"concept", "classic", "proposition", "proof", "exercise"}
    unknown = types - allowed
    if unknown:
        raise ApiError("unprocessable", f"不支持的搜索类型：{', '.join(sorted(unknown))}")
    session = get_session()
    return content_service.search(session, current_user(), query.q, query.limit, types)


@bp.get("/tools")
@require_auth()
def tools():
    session = get_session()
    return content_service.get_tools(session, current_user())
