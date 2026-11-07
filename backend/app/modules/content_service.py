"""Catalog, content retrieval, search and tool-unlock services."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import (
    Chapter,
    Classic,
    Concept,
    CourseProgress,
    Exercise,
    GraphEdge,
    GraphNode,
    Proof,
    Proposition,
    Section,
    Textbook,
    Tool,
    User,
)
from ..serializers import (
    chapter_out,
    classic_out,
    concept_detail,
    concept_summary,
    proof_out,
    proposition_out,
    section_out,
    textbook_out,
    tool_out,
)
from ..schemas.common import PageQuery


def published_only(user: User) -> bool:
    return user.role != "admin"


def get_primary_textbook(session: Session) -> Textbook:
    textbook = session.scalar(
        select(Textbook)
        .where(Textbook.status == "published")
        .order_by(Textbook.is_primary.desc(), Textbook.created_at.asc())
        .limit(1)
    )
    if textbook is None:
        raise ApiError("not_found", "还没有已发布的教材，请管理员先导入内容")
    return textbook


def get_textbook(session: Session, slug_or_id: str, *, include_drafts: bool = False) -> Textbook:
    textbook = session.scalar(
        select(Textbook).where(
            or_(Textbook.id == slug_or_id, Textbook.slug == slug_or_id)
        )
    )
    if textbook is None:
        raise ApiError("not_found", "教材不存在")
    if textbook.status != "published" and not include_drafts:
        raise ApiError("not_found", "教材尚未发布")
    return textbook


def get_progress(session: Session, user: User) -> CourseProgress:
    progress = session.scalar(
        select(CourseProgress).where(
            CourseProgress.user_id == user.id,
            CourseProgress.course_name == user.course_name,
        )
    )
    if progress is None:
        progress = CourseProgress(
            user_id=user.id,
            course_name=user.course_name,
            week=user.week,
            total_weeks=user.total_weeks,
            last_page="dashboard",
            daily_goal=8,
        )
        session.add(progress)
        session.flush()
    return progress


def catalog(session: Session, user: User) -> dict[str, Any]:
    textbook = get_primary_textbook(session)
    progress = get_progress(session, user)
    chapters = list(
        session.scalars(
            select(Chapter)
            .where(Chapter.textbook_id == textbook.id)
            .order_by(Chapter.sort_order)
        )
    )
    if published_only(user):
        chapters = [chapter for chapter in chapters if chapter.status == "published"]
    concepts = list(
        session.scalars(
            select(Concept)
            .where(Concept.chapter_id.in_([chapter.id for chapter in chapters]))
            .order_by(Concept.sort_order, Concept.name)
        )
    )
    visible_concepts = [
        concept if not published_only(user) or concept.status == "published" else None
        for concept in concepts
    ]
    visible_concepts = [concept for concept in visible_concepts if concept is not None]
    chapter_rows = []
    for chapter in chapters:
        row = chapter_out(chapter)
        row["concept_count"] = len(
            [c for c in visible_concepts if c.chapter_id == chapter.id]
        )
        chapter_rows.append(row)

    tools = list(session.scalars(select(Tool).where(Tool.status == "published").order_by(Tool.unlock_week, Tool.name)))
    exercise_count = session.scalar(
        select(func.count(Exercise.id)).where(
            Exercise.status == "published",
            Exercise.review_status.in_(["reviewed", "auto_checked"]),
        )
    ) or 0
    classic_count = session.scalar(
        select(func.count(Classic.id)).where(Classic.status == "published")
    ) or 0
    proof_count = session.scalar(
        select(func.count(Proof.id)).where(Proof.status == "published")
    ) or 0
    return {
        "textbook": textbook_out(textbook),
        "chapters": chapter_rows,
        "concepts": [concept_summary(concept) for concept in visible_concepts],
        "progress": {
            "week": progress.week,
            "total_weeks": progress.total_weeks,
            "last_page": progress.last_page,
            "last_concept_id": progress.last_concept_id,
            "daily_goal": progress.daily_goal,
            "percent": round(progress.week / progress.total_weeks * 100) if progress.total_weeks else 0,
        },
        "tools": [
            tool_out(tool, unlocked=user.role == "admin" or progress.week >= tool.unlock_week)
            for tool in tools
        ],
        "stats": {
            "chapters": len(chapters),
            "concepts": len(visible_concepts),
            "published_exercises": exercise_count,
            "classics": classic_count,
            "proofs": proof_count,
        },
        "sample_content": True,
        "content_notice": "当前为项目自编的 8 个示例学习单元，不是完整教材；正式内容需替换并人工审核。",
    }


def list_concepts(
    session: Session,
    user: User,
    query: PageQuery,
    *,
    chapter: str | None = None,
    scope: str | None = None,
    kind: str | None = None,
    text: str | None = None,
    include_extension: bool = False,
) -> dict[str, Any]:
    stmt = select(Concept)
    if published_only(user):
        stmt = stmt.where(Concept.status == "published")
    if chapter:
        stmt = stmt.where(Concept.chapter_id == chapter)
    if scope:
        stmt = stmt.where(Concept.scope == scope)
    if kind:
        stmt = stmt.where(Concept.kind == kind)
    if text:
        pattern = f"%{text.strip()}%"
        stmt = stmt.where(
            or_(
                Concept.name.like(pattern),
                Concept.short_name.like(pattern),
                Concept.summary.like(pattern),
                Concept.definition.like(pattern),
            )
        )
    if not include_extension:
        stmt = stmt.where(Concept.scope != "v1_extension")
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.order_by(Concept.sort_order, Concept.name)
            .limit(query.limit)
            .offset(query.offset)
        )
    )
    return {
        "items": [concept_summary(concept) for concept in rows],
        "total": total,
        "limit": query.limit,
        "offset": query.offset,
        "next_offset": query.offset + query.limit if query.offset + query.limit < total else None,
    }


def get_concept(session: Session, user: User, concept_id: str) -> dict[str, Any]:
    concept = session.scalar(
        select(Concept).where(or_(Concept.id == concept_id, Concept.short_name == concept_id))
    )
    if concept is None:
        raise ApiError("not_found", "知识点不存在")
    if published_only(user) and concept.status != "published":
        raise ApiError("not_found", "知识点尚未发布")
    if (
        published_only(user)
        and concept.chapter is not None
        and concept.chapter.status != "published"
    ):
        raise ApiError("not_found", "知识点所属章节尚未发布")
    data = concept_detail(concept, include_drafts=user.role == "admin")
    neighbors = list(
        session.scalars(
            select(Concept)
            .where(Concept.status == "published", Concept.chapter_id == concept.chapter_id)
            .order_by(Concept.sort_order)
        )
    )
    ids = [item.id for item in neighbors]
    index = ids.index(concept.id) if concept.id in ids else -1
    data["navigation"] = {
        "previous": concept_summary(neighbors[index - 1]) if index > 0 else None,
        "next": concept_summary(neighbors[index + 1]) if 0 <= index < len(neighbors) - 1 else None,
    }
    data["exercises"] = [
        {
            "id": exercise.id,
            "code": exercise.code,
            "title": exercise.title,
            "difficulty": exercise.difficulty,
            "skill": exercise.skill,
            "type": exercise.exercise_type,
            "review_status": exercise.review_status,
        }
        for exercise in session.scalars(
            select(Exercise)
            .where(
                Exercise.topic_id == concept.id,
                Exercise.status == "published",
                Exercise.review_status.in_(["reviewed", "auto_checked"]),
            )
            .order_by(Exercise.difficulty, Exercise.code)
            .limit(50)
        )
    ]
    data["graph"] = {
        "node_id": session.scalar(
            select(GraphNode.id).where(GraphNode.concept_id == concept.id)
        ),
        "relations": _concept_relations(session, concept.id),
    }
    return data


def _concept_relations(session: Session, concept_id: str) -> list[dict[str, Any]]:
    node = session.scalar(select(GraphNode).where(GraphNode.concept_id == concept_id))
    if node is None:
        return []
    results: list[dict[str, Any]] = []
    edges = list(
        session.scalars(
            select(GraphEdge).where(
                or_(GraphEdge.from_node_id == node.id, GraphEdge.to_node_id == node.id)
            )
        )
    )
    for edge in edges:
        other_id = edge.to_node_id if edge.from_node_id == node.id else edge.from_node_id
        other = session.get(GraphNode, other_id)
        results.append(
            {
                "edge_id": edge.id,
                "relation": edge.relation,
                "direction": "out" if edge.from_node_id == node.id else "in",
                "node_id": other_id,
                "name": other.name if other else other_id,
                "condition": edge.condition,
                "evidence": edge.evidence,
                "source_page": edge.source_page,
                "provenance": edge.provenance,
            }
        )
    return results


def get_chapter(session: Session, user: User, chapter_id: str) -> dict[str, Any]:
    chapter = session.get(Chapter, chapter_id)
    if chapter is None:
        raise ApiError("not_found", "章节不存在")
    if published_only(user) and chapter.status != "published":
        raise ApiError("not_found", "章节尚未发布")
    data = chapter_out(chapter, include_sections=True)
    if published_only(user):
        data["sections"] = [
            section for section in data["sections"] if section["status"] == "published"
        ]
        data["concepts"] = [
            concept_summary(concept)
            for concept in chapter.concepts
            if concept.status == "published"
        ]
    else:
        data["concepts"] = [concept_summary(concept) for concept in chapter.concepts]
    return data


def get_section(session: Session, user: User, section_id: str) -> dict[str, Any]:
    section = session.get(Section, section_id)
    if section is None:
        raise ApiError("not_found", "教材片段不存在")
    if published_only(user) and section.status != "published":
        raise ApiError("not_found", "教材片段尚未发布")
    if (
        published_only(user)
        and section.chapter is not None
        and section.chapter.status != "published"
    ):
        raise ApiError("not_found", "教材片段所属章节尚未发布")
    data = section_out(section)
    data["chapter"] = chapter_out(section.chapter)
    data["concept_refs"] = [
        item.get("concept_id")
        for item in section.anchors or []
        if item.get("concept_id")
    ]
    return data


def get_proof(session: Session, user: User, proof_id: str) -> dict[str, Any]:
    proof = session.get(Proof, proof_id)
    if proof is None:
        raise ApiError("not_found", "证明不存在")
    if published_only(user) and proof.status != "published":
        raise ApiError("not_found", "证明尚未发布")
    if (
        published_only(user)
        and proof.concept is not None
        and proof.concept.status != "published"
    ):
        raise ApiError("not_found", "证明所属知识点尚未发布")
    data = proof_out(proof)
    data["concept"] = concept_summary(proof.concept) if proof.concept else None
    tool_names = set(proof.tools or [])
    tools = list(
        session.scalars(select(Tool).where(Tool.status == "published", Tool.slug.in_(tool_names)))
    )
    progress = get_progress(session, user)
    data["tool_details"] = [
        tool_out(tool, unlocked=user.role == "admin" or progress.week >= tool.unlock_week)
        for tool in tools
    ]
    return data


def get_classic(session: Session, user: User, classic_id: str) -> dict[str, Any]:
    classic = session.scalar(
        select(Classic).where(or_(Classic.id == classic_id, Classic.slug == classic_id))
    )
    if classic is None:
        raise ApiError("not_found", "经典案例不存在")
    if published_only(user) and classic.status != "published":
        raise ApiError("not_found", "经典案例尚未发布")
    if (
        published_only(user)
        and classic.concept is not None
        and classic.concept.status != "published"
    ):
        raise ApiError("not_found", "经典案例所属知识点尚未发布")
    data = classic_out(classic)
    if classic.refutes_proposition_id:
        proposition = session.get(Proposition, classic.refutes_proposition_id)
        data["proposition"] = proposition_out(proposition) if proposition else None
    else:
        data["proposition"] = None
    data["concept"] = concept_summary(classic.concept) if classic.concept else None
    return data


def get_proposition(session: Session, user: User, proposition_id: str) -> dict[str, Any]:
    proposition = session.get(Proposition, proposition_id)
    if proposition is None:
        raise ApiError("not_found", "命题不存在")
    if published_only(user) and proposition.status != "published":
        raise ApiError("not_found", "命题尚未发布")
    if (
        published_only(user)
        and proposition.concept is not None
        and proposition.concept.status != "published"
    ):
        raise ApiError("not_found", "命题所属知识点尚未发布")
    data = proposition_out(proposition)
    data["classics"] = [
        classic_out(item)
        for item in session.scalars(
            select(Classic).where(
                Classic.refutes_proposition_id == proposition.id,
                Classic.status == "published",
            )
        )
    ]
    return data


def search(session: Session, user: User, query: str, limit: int, types: set[str]) -> dict[str, Any]:
    pattern = f"%{query.strip()}%"
    results: list[dict[str, Any]] = []
    if "concept" in types:
        stmt = select(Concept).where(
            or_(
                Concept.name.like(pattern),
                Concept.short_name.like(pattern),
                Concept.english_name.like(pattern),
                Concept.summary.like(pattern),
                Concept.definition.like(pattern),
            )
        )
        if published_only(user):
            stmt = stmt.where(Concept.status == "published")
        for concept in session.scalars(stmt.limit(limit)):
            results.append(
                {
                    "type": "concept",
                    "id": concept.id,
                    "title": concept.name,
                    "subtitle": concept.summary,
                    "route": f"#/textbook?concept={concept.id}",
                    "meta": {"chapter_id": concept.chapter_id, "page": concept.page_start},
                }
            )
    if "classic" in types:
        stmt = select(Classic).where(
            or_(
                Classic.name.like(pattern),
                Classic.english_name.like(pattern),
                Classic.object_definition.like(pattern),
                Classic.refutes_text.like(pattern),
            )
        )
        if published_only(user):
            stmt = stmt.where(Classic.status == "published")
        for classic in session.scalars(stmt.limit(limit)):
            results.append(
                {
                    "type": "classic",
                    "id": classic.id,
                    "title": classic.name,
                    "subtitle": classic.object_definition[:160],
                    "route": f"#/counterexamples?classic={classic.id}",
                    "meta": {"kind": classic.kind, "page": classic.source_page},
                }
            )
    if "proposition" in types:
        stmt = select(Proposition).where(
            or_(Proposition.statement.like(pattern), Proposition.explanation.like(pattern))
        )
        if published_only(user):
            stmt = stmt.where(Proposition.status == "published")
        for proposition in session.scalars(stmt.limit(limit)):
            results.append(
                {
                    "type": "proposition",
                    "id": proposition.id,
                    "title": proposition.statement,
                    "subtitle": proposition.explanation[:160],
                    "route": f"#/counterexamples?proposition={proposition.id}",
                    "meta": {"truth": proposition.truth},
                }
            )
    if "proof" in types:
        stmt = select(Proof).where(or_(Proof.title.like(pattern), Proof.idea.like(pattern)))
        if published_only(user):
            stmt = stmt.where(Proof.status == "published")
        for proof in session.scalars(stmt.limit(limit)):
            results.append(
                {
                    "type": "proof",
                    "id": proof.id,
                    "title": proof.title,
                    "subtitle": proof.idea[:160],
                    "route": f"#/proof?proof={proof.id}",
                    "meta": {"concept_id": proof.concept_id, "page": proof.source_page},
                }
            )
    if "exercise" in types:
        stmt = select(Exercise).where(
            or_(Exercise.title.like(pattern), Exercise.statement.like(pattern))
        )
        if published_only(user):
            stmt = stmt.where(
                Exercise.status == "published",
                Exercise.review_status.in_(["reviewed", "auto_checked"]),
            )
        for exercise in session.scalars(stmt.limit(limit)):
            results.append(
                {
                    "type": "exercise",
                    "id": exercise.id,
                    "title": exercise.title,
                    "subtitle": f"{exercise.skill} · 难度 {exercise.difficulty}",
                    "route": f"#/exercises?exercise={exercise.id}",
                    "meta": {"topic_id": exercise.topic_id, "code": exercise.code},
                }
            )
    # Stable dedupe and a simple relevance order: title match first.
    lowered = query.strip().lower()
    results.sort(
        key=lambda item: (
            0 if lowered in str(item["title"]).lower() else 1,
            item["type"],
            item["title"],
        )
    )
    return {"query": query, "total": len(results), "items": results[:limit]}


def get_tools(session: Session, user: User) -> dict[str, Any]:
    progress = get_progress(session, user)
    tools = list(
        session.scalars(select(Tool).where(Tool.status == "published").order_by(Tool.unlock_week, Tool.name))
    )
    return {
        "week": progress.week,
        "items": [
            tool_out(tool, unlocked=user.role == "admin" or progress.week >= tool.unlock_week)
            for tool in tools
        ],
    }
