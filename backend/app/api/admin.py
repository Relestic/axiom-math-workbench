"""Administrator endpoints: accounts, content authoring, imports, jobs and review."""

from __future__ import annotations

import uuid
from typing import Any, Literal

from flask import Blueprint, current_app, g, request, send_file
from pydantic import Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from ..adapters.files import save_pdf
from ..auth import current_user, hash_password, invite_hash, invite_prefix, require_admin
from ..config import Config
from ..db import get_session
from ..errors import ApiError, parse_json, parse_query
from ..models import (
    Asset,
    Attempt,
    AuditLog,
    Chapter,
    Classic,
    Concept,
    ContentRevision,
    Exercise,
    GraphEdge,
    GraphNode,
    Invite,
    Job,
    Proof,
    Proposition,
    Report,
    Section,
    Textbook,
    User,
    utcnow,
)
from ..schemas.common import PageQuery, StrictModel
from ..schemas.content import (
    ChapterCreateRequest,
    ClassicCreateRequest,
    ConceptUpsertRequest,
    ExerciseCreateRequest,
    GraphEdgeCreateRequest,
    GraphNodeCreateRequest,
    ImportTextRequest,
    ProofCreateRequest,
    PropositionCreateRequest,
    PublishRequest,
    SectionCreateRequest,
    SectionUpdateRequest,
    TextbookCreateRequest,
)
from ..schemas.learning import JobListQuery, ReportResolveRequest
from ..schemas.queries import ReportListQuery
from ..serializers import (
    chapter_out,
    classic_out,
    concept_detail,
    exercise_out,
    graph_edge_out,
    graph_node_out,
    job_out,
    proof_out,
    proposition_out,
    report_out,
    section_out,
    textbook_out,
    user_out,
)
from ..modules.content_service import get_progress
from ..workers.queue import cancel_job, enqueue, retry_job, usage_summary

bp = Blueprint("admin", __name__, url_prefix="/api/v1/admin")


class UserAdminUpdate(StrictModel):
    role: Literal["student", "admin"] | None = None
    is_active: bool | None = None
    week: int | None = Field(default=None, ge=1, le=60)


class ParseRequest(StrictModel):
    asset_id: str | None = Field(default=None, max_length=40)


def audit(
    session,
    actor: User,
    action: str,
    target_type: str,
    target_id: str,
    detail: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail or {},
            request_id=getattr(g, "request_id", ""),
        )
    )


# ---------------------------------------------------------------- accounts


@bp.get("/invites")
@require_admin
def list_invites():
    session = get_session()
    rows = list(session.scalars(select(Invite).order_by(Invite.created_at.desc()).limit(100)))
    return {
        "items": [
            {
                "id": row.id,
                "prefix": row.code_prefix,
                "role": row.role,
                "note": row.note,
                "used": row.used_at is not None,
                "used_by_id": row.used_by_id,
                "used_at": row.used_at.isoformat() if row.used_at else None,
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


@bp.post("/invites")
@require_admin
def create_invite():
    from ..schemas.auth import InviteCreateRequest
    from datetime import timedelta

    payload = parse_json(InviteCreateRequest)
    session = get_session()
    code = f"AXIOM-{uuid.uuid4().hex[:4].upper()}-{uuid.uuid4().hex[:4].upper()}"
    invite = Invite(
        code_hash=invite_hash(code),
        code_prefix=invite_prefix(code),
        role=payload.role,
        note=payload.note,
        created_by_id=current_user().id,
        expires_at=utcnow() + timedelta(days=payload.expires_in_days),
    )
    session.add(invite)
    audit(session, current_user(), "invite.create", "invite", invite.id, {"role": payload.role})
    session.commit()
    return {
        "id": invite.id,
        "code": code,
        "role": invite.role,
        "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
        "notice": "邀请码只显示这一次；服务端只保存哈希。",
    }, 201


@bp.delete("/invites/<invite_id>")
@require_admin
def delete_invite(invite_id: str):
    session = get_session()
    invite = session.get(Invite, invite_id)
    if invite is None:
        raise ApiError("not_found", "邀请码不存在")
    if invite.used_at is not None:
        raise ApiError("conflict", "已使用的邀请码不能删除，以免丢失审计记录")
    session.delete(invite)
    audit(session, current_user(), "invite.revoke", "invite", invite.id)
    session.commit()
    return {"deleted": True}


@bp.get("/users")
@require_admin
def list_users():
    session = get_session()
    rows = list(session.scalars(select(User).order_by(User.created_at.desc()).limit(200)))
    return {
        "items": [
            {
                **user_out(row, get_progress(session, row)),
                "data_origin": row.data_origin,
                "last_login_at": row.last_login_at.isoformat() if row.last_login_at else None,
            }
            for row in rows
        ],
        "total": len(rows),
    }


@bp.patch("/users/<user_id>")
@require_admin
def update_user(user_id: str):
    payload = parse_json(UserAdminUpdate)
    session = get_session()
    target = session.get(User, user_id)
    if target is None:
        raise ApiError("not_found", "账号不存在")
    actor = current_user()
    if target.id == actor.id and payload.role == "student":
        raise ApiError("conflict", "不能把自己降级为学生")
    if target.id == actor.id and payload.is_active is False:
        raise ApiError("conflict", "不能停用自己的账号")
    if payload.role is not None:
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.week is not None:
        target.week = payload.week
        progress = get_progress(session, target)
        progress.week = payload.week
    audit(session, actor, "user.update", "user", target.id, payload.model_dump(exclude_none=True))
    session.commit()
    return user_out(target, get_progress(session, target))


# ---------------------------------------------------------------- textbooks


@bp.get("/textbooks")
@require_admin
def list_textbooks():
    session = get_session()
    rows = list(session.scalars(select(Textbook).order_by(Textbook.created_at.desc())))
    return {"items": [textbook_out(row, include_internal=True) for row in rows], "total": len(rows)}


@bp.post("/textbooks")
@require_admin
def upload_textbook():
    allowed = {"title", "edition", "author", "subject", "page_count", "source_note"}
    form = {
        key: value
        for key, value in request.form.items()
        if key in allowed and value != ""
    }
    try:
        payload = TextbookCreateRequest.model_validate(form)
    except Exception as exc:
        raise ApiError("unprocessable", "教材信息不完整", details=str(exc))
    session = get_session()
    user = current_user()
    slug = request.form.get("slug") or f"tb-{uuid.uuid4().hex[:8]}"
    if session.scalar(select(Textbook).where(Textbook.slug == slug)):
        raise ApiError("conflict", "教材标识已存在")
    file = request.files.get("file")
    asset = None
    if file and file.filename:
        asset = save_pdf(session, user, file)
    textbook = Textbook(
        slug=slug,
        title=payload.title,
        edition=payload.edition,
        author=payload.author,
        subject=payload.subject,
        page_count=payload.page_count,
        source_note=payload.source_note,
        status="draft",
        parse_state="uploaded" if asset else "not_uploaded",
        parse_meta={"asset_id": asset.id} if asset else {},
        data_origin="admin",
    )
    session.add(textbook)
    session.flush()
    audit(
        session,
        user,
        "textbook.create",
        "textbook",
        textbook.id,
        {"asset_id": asset.id if asset else None},
    )
    job = None
    if asset is not None and request.form.get("parse", "true").lower() != "false":
        config: Config = current_app.config["AXIOM"]
        job = enqueue(
            session,
            config,
            job_type="textbook.parse",
            payload={"textbook_id": textbook.id, "asset_id": asset.id},
            created_by_id=user.id,
            idempotency_key=f"parse:{textbook.id}",
        )
    session.commit()
    return {
        "textbook": textbook_out(textbook, include_internal=True),
        "asset": {
            "id": asset.id,
            "filename": asset.filename,
            "size_bytes": asset.size_bytes,
            "sha256": asset.sha256,
        }
        if asset
        else None,
        "job": job_out(job) if job else None,
        "next_step": "解析只产生候选文本；章节与知识点仍需人工核对后发布。",
    }, 201


@bp.post("/textbooks/<textbook_id>/parse")
@require_admin
def parse_textbook(textbook_id: str):
    payload = parse_json(ParseRequest)
    session = get_session()
    textbook = session.get(Textbook, textbook_id)
    if textbook is None:
        raise ApiError("not_found", "教材不存在")
    asset_id = payload.asset_id or (textbook.parse_meta or {}).get("asset_id")
    if not asset_id:
        raise ApiError("unprocessable", "该教材还没有上传 PDF 文件")
    asset = session.get(Asset, asset_id)
    if asset is None:
        raise ApiError("not_found", "文件不存在")
    config: Config = current_app.config["AXIOM"]
    job = enqueue(
        session,
        config,
        job_type="textbook.parse",
        payload={"textbook_id": textbook.id, "asset_id": asset.id},
        created_by_id=current_user().id,
        idempotency_key=f"parse:{textbook.id}:{asset.id}:{int(utcnow().timestamp())}",
    )
    session.commit()
    return {"job": job_out(job)}, 202


@bp.get("/textbooks/<textbook_id>/file")
@require_admin
def download_file(textbook_id: str):
    session = get_session()
    textbook = session.get(Textbook, textbook_id)
    if textbook is None:
        raise ApiError("not_found", "教材不存在")
    asset_id = (textbook.parse_meta or {}).get("asset_id")
    asset = session.get(Asset, asset_id) if asset_id else None
    if asset is None:
        raise ApiError("not_found", "没有可下载的文件")
    return send_file(
        asset.storage_path,
        mimetype=asset.mime,
        as_attachment=True,
        download_name=asset.filename,
    )


@bp.post("/textbooks/<textbook_id>/chapters")
@require_admin
def create_chapter(textbook_id: str):
    payload = parse_json(ChapterCreateRequest)
    session = get_session()
    textbook = session.get(Textbook, textbook_id)
    if textbook is None:
        raise ApiError("not_found", "教材不存在")
    if session.scalar(
        select(Chapter).where(
            Chapter.textbook_id == textbook.id, Chapter.number == payload.number
        )
    ):
        raise ApiError("conflict", "该章号已存在")
    chapter = Chapter(
        textbook_id=textbook.id,
        number=payload.number,
        title=payload.title,
        summary=payload.summary,
        week_start=payload.week_start,
        week_end=payload.week_end,
        source_page_start=payload.source_page_start,
        source_page_end=payload.source_page_end,
        sort_order=payload.sort_order or payload.number,
        status="draft",
    )
    session.add(chapter)
    audit(session, current_user(), "chapter.create", "chapter", chapter.id)
    session.commit()
    return chapter_out(chapter), 201


@bp.post("/chapters/<chapter_id>/sections")
@require_admin
def create_section(chapter_id: str):
    payload = parse_json(SectionCreateRequest)
    session = get_session()
    chapter = session.get(Chapter, chapter_id)
    if chapter is None:
        raise ApiError("not_found", "章节不存在")
    section = Section(
        chapter_id=chapter.id,
        title=payload.title,
        page_start=payload.page_start,
        page_end=payload.page_end,
        printed_page_start=payload.printed_page_start,
        printed_page_end=payload.printed_page_end,
        text=payload.text,
        anchors=payload.anchors,
        sort_order=payload.sort_order,
        status="draft",
    )
    session.add(section)
    audit(session, current_user(), "section.create", "section", section.id)
    session.commit()
    return section_out(section), 201


@bp.put("/sections/<section_id>")
@require_admin
def update_section(section_id: str):
    payload = parse_json(SectionUpdateRequest)
    session = get_session()
    section = session.get(Section, section_id)
    if section is None:
        raise ApiError("not_found", "教材片段不存在")
    before = section_out(section)
    for field in ("title", "page_start", "page_end", "text", "anchors", "status"):
        value = getattr(payload, field)
        if value is not None:
            setattr(section, field, value)
    if section.status == "published":
        section.status = "draft"
    section.version += 1
    session.add(
        ContentRevision(
            target_type="section",
            target_id=section.id,
            version=section.version,
            snapshot=before,
            status="draft",
            note="管理员修订教材片段",
            created_by_id=current_user().id,
        )
    )
    audit(session, current_user(), "section.update", "section", section.id)
    session.commit()
    return section_out(section)


# ---------------------------------------------------------------- content


@bp.post("/concepts")
@require_admin
def upsert_concept():
    payload = parse_json(ConceptUpsertRequest)
    session = get_session()
    concept = session.get(Concept, payload.id) if payload.id else None
    is_new = concept is None
    if payload.chapter_id and session.get(Chapter, payload.chapter_id) is None:
        raise ApiError("not_found", "章节不存在")
    if concept is None:
        concept = Concept(
            id=payload.id or f"concept-{uuid.uuid4().hex[:8]}",
            data_origin="admin",
            status="draft",
            review_status="draft",
            version=0,
        )
        session.add(concept)
    for field in (
        "chapter_id",
        "name",
        "short_name",
        "english_name",
        "kind",
        "scope",
        "summary",
        "definition",
        "formula",
        "quantifiers",
        "symbols",
        "conditions",
        "goals",
        "prerequisites",
        "tags",
        "week",
        "page_start",
        "page_end",
        "sort_order",
    ):
        setattr(concept, field, getattr(payload, field))
    concept.status = "draft"
    concept.review_status = "draft"
    concept.version += 1
    session.flush()
    session.add(
        ContentRevision(
            target_type="concept",
            target_id=concept.id,
            version=concept.version,
            snapshot=concept_detail(concept, include_drafts=True),
            status="draft",
            note="管理员创建或修订知识点",
            created_by_id=current_user().id,
        )
    )
    audit(session, current_user(), "concept.upsert", "concept", concept.id)
    session.commit()
    return concept_detail(concept, include_drafts=True), 201


@bp.post("/concepts/<concept_id>/proofs")
@require_admin
def create_proof(concept_id: str):
    payload = parse_json(ProofCreateRequest)
    session = get_session()
    concept = session.get(Concept, concept_id)
    if concept is None:
        raise ApiError("not_found", "知识点不存在")
    proof = Proof(
        concept_id=concept.id,
        title=payload.title,
        idea=payload.idea,
        steps=payload.steps,
        key_construction=payload.key_construction,
        tools=payload.tools,
        source_page=payload.source_page,
        status="draft",
        review_status="draft",
        version=1,
    )
    session.add(proof)
    audit(session, current_user(), "proof.create", "proof", proof.id)
    session.commit()
    return proof_out(proof), 201


@bp.post("/concepts/<concept_id>/propositions")
@require_admin
def create_proposition(concept_id: str):
    payload = parse_json(PropositionCreateRequest)
    session = get_session()
    concept = session.get(Concept, concept_id)
    if concept is None:
        raise ApiError("not_found", "知识点不存在")
    proposition = Proposition(
        concept_id=concept.id,
        statement=payload.statement,
        truth=payload.truth,
        given_text=payload.given_text,
        desired_text=payload.desired_text,
        missing_conditions=payload.missing_conditions,
        explanation=payload.explanation,
        source_page=payload.source_page,
        status="draft",
        review_status="draft",
        version=1,
    )
    session.add(proposition)
    audit(session, current_user(), "proposition.create", "proposition", proposition.id)
    session.commit()
    return proposition_out(proposition), 201


@bp.post("/classics")
@require_admin
def create_classic():
    payload = parse_json(ClassicCreateRequest)
    session = get_session()
    if session.scalar(select(Classic).where(Classic.slug == payload.slug)):
        raise ApiError("conflict", "经典案例标识已存在")
    if payload.refutes_proposition_id and session.get(
        Proposition, payload.refutes_proposition_id
    ) is None:
        raise ApiError("not_found", "被反驳的命题不存在")
    if payload.concept_id and session.get(Concept, payload.concept_id) is None:
        raise ApiError("not_found", "关联知识点不存在")
    classic = Classic(
        slug=payload.slug,
        name=payload.name,
        english_name=payload.english_name,
        kind=payload.kind,
        object_definition=payload.object_definition,
        properties=payload.properties,
        refutes_proposition_id=payload.refutes_proposition_id,
        refutes_text=payload.refutes_text,
        concept_id=payload.concept_id,
        source_title=payload.source_title,
        source_url=payload.source_url,
        source_page=payload.source_page,
        image_kind=payload.image_kind,
        license=payload.license,
        historical_note=payload.historical_note,
        display_limit=payload.display_limit,
        status="draft",
        review_status="draft",
        version=1,
    )
    session.add(classic)
    session.flush()
    audit(session, current_user(), "classic.create", "classic", classic.id)
    session.commit()
    return classic_out(classic), 201


@bp.post("/exercises")
@require_admin
def create_exercise():
    payload = parse_json(ExerciseCreateRequest)
    session = get_session()
    if session.scalar(select(Exercise).where(Exercise.code == payload.code)):
        raise ApiError("conflict", "题目编号已存在")
    if session.get(Concept, payload.topic_id) is None:
        raise ApiError("not_found", "题目关联的知识点不存在")
    exercise = Exercise(
        topic_id=payload.topic_id,
        code=payload.code,
        title=payload.title,
        statement=payload.statement,
        domain=payload.domain,
        difficulty=payload.difficulty,
        skill=payload.skill,
        exercise_type=payload.exercise_type,
        allowed_refs=payload.allowed_refs,
        hint=payload.hint,
        solution_steps=payload.solution_steps,
        common_errors=payload.common_errors,
        checks=payload.checks,
        answer_check=payload.answer_check,
        source=payload.source,
        review_status="draft",
        status="draft",
        version=1,
    )
    session.add(exercise)
    session.flush()
    audit(session, current_user(), "exercise.create", "exercise", exercise.id)
    session.commit()
    return exercise_out(exercise, include_solution=True), 201


TARGETS = {
    "textbook": Textbook,
    "concept": Concept,
    "proof": Proof,
    "classic": Classic,
    "exercise": Exercise,
    "section": Section,
    "proposition": Proposition,
}


def _snapshot(target_type: str, obj) -> dict[str, Any]:
    mapping = {
        "textbook": lambda: textbook_out(obj, include_internal=True),
        "concept": lambda: concept_detail(obj, include_drafts=True),
        "proof": lambda: proof_out(obj),
        "classic": lambda: classic_out(obj),
        "exercise": lambda: exercise_out(obj, include_solution=True),
        "section": lambda: section_out(obj),
        "proposition": lambda: proposition_out(obj),
    }
    return mapping[target_type]()


def _publish_ready(target_type: str, obj) -> str | None:
    if target_type == "textbook":
        if not obj.title:
            return "教材必须包含标题"
    if target_type == "concept":
        if not obj.name or not obj.definition:
            return "知识点必须包含名称与定义"
        if not obj.proofs and not obj.propositions:
            return "发布前至少关联一条证明或命题"
    if target_type == "proof":
        if not obj.steps:
            return "证明必须包含步骤"
    if target_type == "classic":
        if not obj.properties:
            return "经典案例必须包含性质核对"
    if target_type == "exercise":
        if not obj.solution_steps:
            return "每道练习必须有完整解答步骤"
    if target_type == "proposition":
        if not obj.statement:
            return "命题必须包含陈述"
    return None


@bp.post("/content/<target_type>/<target_id>/publish")
@require_admin
def publish_content(target_type: str, target_id: str):
    payload = parse_json(PublishRequest)
    model = TARGETS.get(target_type)
    if model is None:
        raise ApiError("not_found", "不支持的内容类型")
    session = get_session()
    obj = session.get(model, target_id)
    if obj is None and target_type == "exercise":
        obj = session.scalar(select(Exercise).where(Exercise.code == target_id))
    if obj is None:
        raise ApiError("not_found", "内容不存在")
    if payload.status == "published":
        problem = _publish_ready(target_type, obj)
        if problem:
            raise ApiError("unprocessable", problem)
        obj.status = "published"
        obj.review_status = "reviewed"
        if target_type == "exercise":
            obj.published_at = utcnow()
    else:
        obj.status = payload.status
        if payload.status == "withdrawn":
            obj.review_status = "withdrawn"
    obj.version += 1
    session.add(
        ContentRevision(
            target_type=target_type,
            target_id=obj.id,
            version=obj.version,
            snapshot=_snapshot(target_type, obj),
            status=payload.status,
            note=payload.note,
            created_by_id=current_user().id,
            reviewed_by_id=current_user().id,
            reviewed_at=utcnow(),
        )
    )
    audit(
        session,
        current_user(),
        f"content.{payload.status}",
        target_type,
        obj.id,
        {"note": payload.note},
    )
    session.commit()
    return {
        "type": target_type,
        "id": obj.id,
        "status": obj.status,
        "review_status": getattr(obj, "review_status", None),
        "version": obj.version,
    }


@bp.get("/content/<target_type>/<target_id>/revisions")
@require_admin
def revisions(target_type: str, target_id: str):
    if target_type not in TARGETS:
        raise ApiError("not_found", "不支持的内容类型")
    session = get_session()
    target = session.get(TARGETS[target_type], target_id)
    if target is None and target_type == "exercise":
        target = session.scalar(select(Exercise).where(Exercise.code == target_id))
    if target is None:
        raise ApiError("not_found", "内容不存在")
    rows = list(
        session.scalars(
            select(ContentRevision)
            .where(
                ContentRevision.target_type == target_type,
                ContentRevision.target_id == target.id,
            )
            .order_by(ContentRevision.created_at.desc())
            .limit(50)
        )
    )
    return {
        "items": [
            {
                "id": row.id,
                "version": row.version,
                "status": row.status,
                "note": row.note,
                "snapshot": row.snapshot,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
            }
            for row in rows
        ]
    }


@bp.post("/import/text")
@require_admin
def import_text():
    payload = parse_json(ImportTextRequest)
    session = get_session()
    textbook = session.scalar(
        select(Textbook).where(
            or_(
                Textbook.slug == payload.textbook_slug,
                Textbook.id == payload.textbook_slug,
            )
        )
    )
    if textbook is None:
        raise ApiError("not_found", "教材不存在；先上传教材元数据")
    chapters_created = 0
    sections_created = 0
    for chapter_item in payload.chapters:
        chapter = session.scalar(
            select(Chapter).where(
                Chapter.textbook_id == textbook.id,
                Chapter.number == chapter_item.number,
            )
        )
        if chapter is None:
            chapter = Chapter(
                textbook_id=textbook.id,
                number=chapter_item.number,
                title=chapter_item.title,
                summary=chapter_item.summary,
                source_page_start=chapter_item.source_page_start,
                source_page_end=chapter_item.source_page_end,
                sort_order=chapter_item.number,
                status="draft",
            )
            session.add(chapter)
            session.flush()
            chapters_created += 1
        else:
            chapter.title = chapter_item.title
            chapter.summary = chapter_item.summary
            chapter.source_page_start = chapter_item.source_page_start
            chapter.source_page_end = chapter_item.source_page_end
        if payload.replace:
            for section in chapter.sections:
                if section.status == "published":
                    section.status = "withdrawn"
        for index, section_item in enumerate(chapter_item.sections):
            session.add(
                Section(
                    chapter_id=chapter.id,
                    title=section_item.title,
                    page_start=section_item.page_start,
                    page_end=section_item.page_end,
                    printed_page_start=section_item.page_start,
                    printed_page_end=section_item.page_end,
                    text=section_item.text,
                    anchors=[],
                    sort_order=index,
                    status="draft",
                    version=1,
                )
            )
            sections_created += 1
    textbook.parse_state = "needs_review"
    meta = dict(textbook.parse_meta or {})
    meta.update({"imported_chapters": chapters_created, "imported_sections": sections_created})
    textbook.parse_meta = meta
    audit(
        session,
        current_user(),
        "content.import_text",
        "textbook",
        textbook.id,
        {"chapters": chapters_created, "sections": sections_created},
    )
    session.commit()
    return {
        "textbook_id": textbook.id,
        "chapters_created": chapters_created,
        "sections_created": sections_created,
        "status": "draft",
        "notice": "导入内容为草稿；需人工核对公式、页码与条件后再发布。",
    }


# ---------------------------------------------------------------- graph


@bp.post("/graph/nodes")
@require_admin
def create_graph_node():
    payload = parse_json(GraphNodeCreateRequest)
    session = get_session()
    if session.get(GraphNode, payload.id):
        raise ApiError("conflict", "节点已存在")
    if payload.concept_id and session.get(Concept, payload.concept_id) is None:
        raise ApiError("not_found", "关联知识点不存在")
    if payload.classic_id and session.get(Classic, payload.classic_id) is None:
        raise ApiError("not_found", "关联经典案例不存在")
    node = GraphNode(
        id=payload.id,
        name=payload.name,
        kind=payload.kind,
        scope=payload.scope,
        description=payload.description,
        detail=payload.detail,
        concept_id=payload.concept_id,
        classic_id=payload.classic_id,
        x=payload.x,
        y=payload.y,
        page=payload.page,
        week=payload.week,
        status="published",
        review_status="reviewed",
        source="管理员创建",
    )
    session.add(node)
    audit(session, current_user(), "graph.node.create", "graph_node", node.id)
    session.commit()
    return graph_node_out(node), 201


@bp.post("/graph/edges")
@require_admin
def create_graph_edge():
    payload = parse_json(GraphEdgeCreateRequest)
    session = get_session()
    if session.get(GraphNode, payload.from_node_id) is None or session.get(
        GraphNode, payload.to_node_id
    ) is None:
        raise ApiError("not_found", "边的端点不存在")
    edge = GraphEdge(
        from_node_id=payload.from_node_id,
        to_node_id=payload.to_node_id,
        relation=payload.relation,
        condition=payload.condition,
        evidence=payload.evidence,
        source_page=payload.source_page,
        provenance=payload.provenance,
        review_status=payload.review_status,
    )
    session.add(edge)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise ApiError("conflict", "这条关系已经存在")
    audit(
        session,
        current_user(),
        "graph.edge.create",
        "graph_edge",
        edge.id,
        {"relation": edge.relation},
    )
    session.commit()
    return graph_edge_out(edge), 201


# ---------------------------------------------------------------- review / jobs


@bp.get("/review-queue")
@require_admin
def review_queue():
    session = get_session()
    concepts = list(
        session.scalars(select(Concept).where(Concept.status == "draft").limit(50))
    )
    exercises = list(
        session.scalars(select(Exercise).where(Exercise.status == "draft").limit(50))
    )
    classics = list(
        session.scalars(select(Classic).where(Classic.status == "draft").limit(50))
    )
    reports = list(
        session.scalars(select(Report).where(Report.status == "open").order_by(Report.created_at).limit(50))
    )
    textbooks = list(
        session.scalars(
            select(Textbook).where(
                Textbook.parse_state.in_(["needs_review", "needs_text_import", "failed"])
            )
        )
    )
    return {
        "concepts": [concept_detail(item, include_drafts=True) for item in concepts],
        "exercises": [exercise_out(item, include_solution=True) for item in exercises],
        "classics": [classic_out(item) for item in classics],
        "reports": [report_out(item) for item in reports],
        "textbooks": [textbook_out(item, include_internal=True) for item in textbooks],
        "counts": {
            "concepts": len(concepts),
            "exercises": len(exercises),
            "classics": len(classics),
            "reports": len(reports),
            "textbooks": len(textbooks),
        },
    }


@bp.get("/jobs")
@require_admin
def list_jobs():
    query = parse_query(JobListQuery)
    session = get_session()
    stmt = select(Job)
    if query.status:
        stmt = stmt.where(Job.status == query.status)
    if query.type:
        stmt = stmt.where(Job.type == query.type)
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(stmt.order_by(Job.created_at.desc()).limit(query.limit).offset(query.offset))
    )
    return {
        "items": [job_out(row) for row in rows],
        "total": total,
        "limit": query.limit,
        "offset": query.offset,
    }


@bp.post("/jobs/<job_id>/retry")
@require_admin
def retry(job_id: str):
    session = get_session()
    job = session.get(Job, job_id)
    if job is None:
        raise ApiError("not_found", "任务不存在")
    retry_job(session, job)
    session.commit()
    return job_out(job)


@bp.post("/jobs/<job_id>/cancel")
@require_admin
def cancel(job_id: str):
    session = get_session()
    job = session.get(Job, job_id)
    if job is None:
        raise ApiError("not_found", "任务不存在")
    cancel_job(session, job)
    session.commit()
    return job_out(job)


@bp.get("/usage")
@require_admin
def usage():
    session = get_session()
    return usage_summary(session, None)


@bp.get("/reports")
@require_admin
def admin_reports():
    query = parse_query(ReportListQuery)
    session = get_session()
    stmt = select(Report)
    status = query.status
    if status:
        stmt = stmt.where(Report.status == status)
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.order_by(Report.created_at.desc()).limit(query.limit).offset(query.offset)
        )
    )
    return {"items": [report_out(row) for row in rows], "total": total}


@bp.patch("/reports/<report_id>")
@require_admin
def resolve_report(report_id: str):
    payload = parse_json(ReportResolveRequest)
    session = get_session()
    report = session.get(Report, report_id)
    if report is None:
        raise ApiError("not_found", "反馈不存在")
    report.status = payload.status
    report.admin_note = payload.admin_note
    report.resolved_by_id = current_user().id
    report.resolved_at = utcnow()
    audit(session, current_user(), "report.resolve", "report", report.id, {"status": payload.status})
    session.commit()
    return report_out(report)


@bp.get("/audit")
@require_admin
def audit_log():
    query = parse_query(PageQuery)
    session = get_session()
    rows = list(
        session.scalars(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .limit(query.limit)
            .offset(query.offset)
        )
    )
    return {
        "items": [
            {
                "id": row.id,
                "actor_id": row.actor_id,
                "action": row.action,
                "target_type": row.target_type,
                "target_id": row.target_id,
                "detail": row.detail,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


@bp.get("/stats")
@require_admin
def stats():
    session = get_session()
    return {
        "users": session.scalar(select(func.count(User.id))) or 0,
        "students": session.scalar(select(func.count(User.id)).where(User.role == "student")) or 0,
        "textbooks": session.scalar(select(func.count(Textbook.id))) or 0,
        "chapters": session.scalar(select(func.count(Chapter.id))) or 0,
        "sections": session.scalar(select(func.count(Section.id))) or 0,
        "concepts": session.scalar(select(func.count(Concept.id))) or 0,
        "published_concepts": session.scalar(
            select(func.count(Concept.id)).where(Concept.status == "published")
        )
        or 0,
        "exercises": session.scalar(select(func.count(Exercise.id))) or 0,
        "published_exercises": session.scalar(
            select(func.count(Exercise.id)).where(Exercise.status == "published")
        )
        or 0,
        "classics": session.scalar(select(func.count(Classic.id))) or 0,
        "graph_nodes": session.scalar(select(func.count(GraphNode.id))) or 0,
        "graph_edges": session.scalar(select(func.count(GraphEdge.id))) or 0,
        "attempts": session.scalar(select(func.count(Attempt.id))) or 0,
        "open_reports": session.scalar(
            select(func.count(Report.id)).where(Report.status == "open")
        )
        or 0,
        "queued_jobs": session.scalar(
            select(func.count(Job.id)).where(Job.status.in_(["queued", "running"]))
        )
        or 0,
    }
