"""Idempotent seed loader."""

from __future__ import annotations

import hashlib
import hmac
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Config
from ..models import (
    Attempt,
    AttemptEvent,
    Bookmark,
    Chapter,
    Classic,
    Concept,
    CourseProgress,
    DiagnosticQuestion,
    Exercise,
    ExerciseTemplate,
    GraphEdge,
    GraphNode,
    Invite,
    Note,
    Observation,
    Proof,
    Proposition,
    SceneVersion,
    Section,
    StudyEvent,
    Textbook,
    Tool,
    User,
    VisualScene,
    VisualTemplate,
    utcnow,
)
from .content import CHAPTERS, CLASSICS, CONCEPTS, PROOFS, PROPOSITIONS, SECTIONS, TEXTBOOK, TOOLS
from .diagnostic import DIAGNOSTIC_QUESTIONS
from .exercises import EXERCISE_TEMPLATES, build_exercises
from .graph import GRAPH_EDGES, GRAPH_NODES
from .visual import VISUAL_TEMPLATES

SEED_VERSION = "2026-11-05.1"
DEFAULT_STUDENT_PASSWORD = "axiom-demo-2026"


def _invite_hash(secret: str, code: str) -> str:
    normalized = code.strip().upper()
    return hmac.new(secret.encode(), normalized.encode(), hashlib.sha256).hexdigest()


def _admin(session: Session, config: Config) -> User:
    user = session.scalar(select(User).where(User.email == config.admin_email))
    if user is not None:
        return user
    from ..auth import hash_password

    user = User(
        email=config.admin_email,
        password_hash=hash_password(config.admin_password),
        display_name="管理员",
        role="admin",
        course_name="数学分析 II",
        week=7,
        total_weeks=16,
        data_origin="seed",
    )
    session.add(user)
    session.flush()
    session.add(
        CourseProgress(
            user_id=user.id,
            course_name=user.course_name,
            week=7,
            total_weeks=16,
            last_page="dashboard",
            daily_goal=8,
        )
    )
    return user


def _demo_user(session: Session, config: Config) -> User:
    user = session.scalar(select(User).where(User.email == "demo@axiom.local"))
    if user is not None:
        return user
    from ..auth import hash_password

    user = User(
        email="demo@axiom.local",
        password_hash=hash_password(DEFAULT_STUDENT_PASSWORD),
        display_name="林越",
        role="student",
        course_name="数学分析 II",
        week=7,
        total_weeks=16,
        data_origin="demo",
    )
    session.add(user)
    session.flush()
    session.add(
        CourseProgress(
            user_id=user.id,
            course_name=user.course_name,
            week=7,
            total_weeks=16,
            last_page="explore",
            last_concept_id="uniform",
            daily_goal=8,
        )
    )
    return user


def _invite(session: Session, config: Config, admin: User) -> Invite:
    digest = _invite_hash(config.secret_key, config.demo_invite_code)
    invite = session.scalar(select(Invite).where(Invite.code_hash == digest))
    if invite is not None:
        return invite
    invite = Invite(
        code_hash=digest,
        code_prefix=config.demo_invite_code[:10].upper(),
        role="student",
        note="演示邀请码（请在生产环境更换）",
        created_by_id=admin.id,
        expires_at=utcnow() + timedelta(days=365),
    )
    session.add(invite)
    return invite


def seed_content(session: Session, config: Config) -> dict[str, Any]:
    existing = session.scalar(select(Textbook).where(Textbook.slug == TEXTBOOK["slug"]))
    if existing is not None:
        return {
            "created": False,
            "textbook": existing.slug,
            "counts": _counts(session),
        }

    textbook = Textbook(
        id=TEXTBOOK["id"],
        slug=TEXTBOOK["slug"],
        title=TEXTBOOK["title"],
        edition=TEXTBOOK["edition"],
        author=TEXTBOOK["author"],
        subject=TEXTBOOK["subject"],
        is_primary=True,
        status="published",
        page_count=TEXTBOOK["page_count"],
        parse_state="ready",
        parse_meta=dict(TEXTBOOK["parse_meta"], seed_version=SEED_VERSION),
        source_note=TEXTBOOK["source_note"],
        data_origin="seed",
    )
    session.add(textbook)

    for item in CHAPTERS:
        session.add(
            Chapter(
                id=item["id"],
                textbook_id=textbook.id,
                number=item["number"],
                title=item["title"],
                summary=item["summary"],
                week_start=item["week_start"],
                week_end=item["week_end"],
                source_page_start=item["page_start"],
                source_page_end=item["page_end"],
                sort_order=item["number"],
                status="published",
            )
        )

    for item in SECTIONS:
        session.add(
            Section(
                id=item["id"],
                chapter_id=item["chapter"],
                title=item["title"],
                page_start=item["page_start"],
                page_end=item["page_end"],
                printed_page_start=item["printed_page_start"],
                printed_page_end=item["printed_page_end"],
                text=item["text"],
                anchors=item["anchors"],
                sort_order=item["sort_order"],
                status="published",
            )
        )

    for item in CONCEPTS:
        session.add(
            Concept(
                id=item["id"],
                chapter_id=item.get("chapter"),
                name=item["name"],
                short_name=item["short_name"],
                english_name=item["english_name"],
                kind=item["kind"],
                scope=item["scope"],
                summary=item["summary"],
                definition=item["definition"],
                formula=item["formula"],
                quantifiers=item["quantifiers"],
                symbols=item["symbols"],
                conditions=item["conditions"],
                goals=item["goals"],
                prerequisites=item["prerequisites"],
                tags=item["tags"],
                week=item["week"],
                page_start=item["page_start"],
                page_end=item["page_end"],
                status="published",
                review_status="reviewed",
                version=1,
                data_origin="seed",
                sort_order=item["sort_order"],
            )
        )

    for item in PROOFS:
        session.add(
            Proof(
                id=item["id"],
                concept_id=item["concept"],
                title=item["title"],
                idea=item["idea"],
                steps=item["steps"],
                key_construction=item["key_construction"],
                tools=item["tools"],
                source_page=item["source_page"],
                status="published",
                review_status="reviewed",
                version=1,
            )
        )

    for item in PROPOSITIONS:
        session.add(
            Proposition(
                id=item["id"],
                concept_id=item["concept"],
                statement=item["statement"],
                truth=item["truth"],
                given_text=item["given_text"],
                desired_text=item["desired_text"],
                missing_conditions=item["missing_conditions"],
                explanation=item["explanation"],
                source_page=item["source_page"],
                status="published",
                review_status="reviewed",
                version=1,
            )
        )

    session.flush()

    for item in CLASSICS:
        session.add(
            Classic(
                id=item["id"],
                slug=item["slug"],
                name=item["name"],
                english_name=item["english_name"],
                kind=item["kind"],
                object_definition=item["object_definition"],
                properties=item["properties"],
                refutes_proposition_id=item["refutes_proposition_id"],
                refutes_text=item["refutes_text"],
                concept_id=item["concept_id"],
                source_title=item["source_title"],
                source_url=item["source_url"],
                source_page=item["source_page"],
                image_kind=item["image_kind"],
                license=item["license"],
                historical_note=item["historical_note"],
                display_limit=item["display_limit"],
                status="published",
                review_status="reviewed",
                version=1,
                data_origin="seed",
            )
        )

    for slug, name, description, unlock_week, scope in TOOLS:
        session.add(
            Tool(
                id=slug,
                slug=slug,
                name=name,
                description=description,
                unlock_week=unlock_week,
                scope=scope,
                status="published",
            )
        )

    for item in GRAPH_NODES:
        session.add(
            GraphNode(
                id=item["id"],
                concept_id=item.get("concept_id"),
                classic_id=item.get("classic_id"),
                name=item["name"],
                kind=item["kind"],
                scope=item["scope"],
                description=item["description"],
                detail=item["detail"],
                x=item["x"],
                y=item["y"],
                color=item["color"],
                size=item["size"],
                page=item["page"],
                week=item["week"],
                status="published",
                source=item["source"],
                review_status="reviewed",
            )
        )

    conditions = {
        ("compact", "uniform", "implies"): "f 在 [a,b] 上连续，a<b",
        ("derivative", "continuity", "implies"): "f 在 x₀ 可导",
        ("bounded", "lipschitz", "implies"): "f 在区间上可导且 |f′|≤L",
        ("lipschitz", "uniform", "implies"): "Lipschitz 常数 L 存在",
    }
    session.flush()
    for source, target, relation, evidence, page, provenance in GRAPH_EDGES:
        session.add(
            GraphEdge(
                from_node_id=source,
                to_node_id=target,
                relation=relation,
                condition=conditions.get((source, target, relation), ""),
                evidence=evidence,
                source_page=page,
                provenance=provenance,
                review_status="reviewed",
                content_version=1,
            )
        )

    for item in VISUAL_TEMPLATES:
        session.add(
            VisualTemplate(
                id=item["id"],
                slug=item["slug"],
                name=item["name"],
                family=item["family"],
                goal=item["goal"],
                description=item["description"],
                scene=item["scene"],
                meta=item["meta"],
                concept_ids=item["concept_ids"],
                proof_step_ref=item["proof_step_ref"],
                supported_range=item["supported_range"],
                display_limits=item["display_limits"],
                version=item["version"],
                status="published",
            )
        )

    for template in EXERCISE_TEMPLATES:
        session.add(
            ExerciseTemplate(
                id=template["id"],
                slug=template["slug"],
                topic_id=template["topic"],
                name=template["name"],
                family=template["family"],
                skill=template["skill"],
                exercise_type=template["type"],
                difficulty=template["difficulty"],
                allowed_refs=template["allowed_refs"],
                generator=template["generator"],
                review_status="reviewed",
                version=1,
            )
        )

    for item in build_exercises():
        session.add(
            Exercise(
                id=item["id"],
                topic_id=item["topic"],
                template_id=item["template"],
                code=item["code"],
                title=item["title"],
                statement=item["statement"],
                domain=item["domain"],
                difficulty=item["difficulty"],
                skill=item["skill"],
                exercise_type=item["type"],
                allowed_refs=item["allowed_refs"],
                hint=item["hint"],
                solution_steps=item["solution"],
                common_errors=item["errors"],
                checks=item["checks"],
                answer_check=item["answer_check"],
                source=item["source"],
                provenance=item["provenance"],
                validation=item["validation"],
                review_status=item["review_status"],
                version=1,
                status="published",
                published_at=utcnow(),
            )
        )

    for item in DIAGNOSTIC_QUESTIONS:
        session.add(
            DiagnosticQuestion(
                id=item["id"],
                text=item["text"],
                options=item["options"],
                correct_index=item["correct_index"],
                reason=item["reason"],
                concept_id=item["concept_id"],
                skill=item["skill"],
                sort_order=item["sort_order"],
                status="published",
            )
        )

    session.flush()
    return {"created": True, "textbook": textbook.slug, "counts": _counts(session)}


def _counts(session: Session) -> dict[str, int]:
    from sqlalchemy import func

    return {
        "chapters": session.scalar(select(func.count(Chapter.id))) or 0,
        "sections": session.scalar(select(func.count(Section.id))) or 0,
        "concepts": session.scalar(select(func.count(Concept.id))) or 0,
        "proofs": session.scalar(select(func.count(Proof.id))) or 0,
        "classics": session.scalar(select(func.count(Classic.id))) or 0,
        "graph_nodes": session.scalar(select(func.count(GraphNode.id))) or 0,
        "graph_edges": session.scalar(select(func.count(GraphEdge.id))) or 0,
        "exercises": session.scalar(select(func.count(Exercise.id))) or 0,
        "visual_templates": session.scalar(select(func.count(VisualTemplate.id))) or 0,
    }


def seed_demo_activity(session: Session, user: User) -> None:
    existing = session.scalar(
        select(Attempt).where(Attempt.user_id == user.id, Attempt.data_origin == "demo")
    )
    if existing is not None:
        return
    entries = [
        ("continuous-2", 8, "understood", "取 δ=ε/2，并说明 δ 不依赖 x₀。", True, False),
        ("uniform-2", 7, "revisit", "闭区间上用 |x+y|≤2 得到一致连续；在 ℝ 上取 xₙ=n, yₙ=n+1/n。", False, True),
        ("derivative-3", 6, "understood", "左右差商分别为 3 与 −3，因此不可导。", True, False),
        ("mean-value-2", 5, "pending", "中值定理给出 sin x−sin y=cos ξ(x−y)，再用 |cos ξ|≤1。", False, False),
        ("taylor-2", 3, "revisit", "P₂=1+x+x²/2，余项上界为 e^(1/2)/48。", True, True),
        ("riemann-4", 2, "understood", "n 等分，Lₙ=2(n−1)/n，Uₙ=2(n+1)/n，差 4/n。", False, False),
        ("integral-3", 1, "understood", "F(x)=x³，F′(x)=3x²，被积函数连续。", False, False),
        ("primitive-2", 0, "pending", "分部积分得 e^(2x)(2x−1)/4+C。", False, False),
    ]
    now = utcnow()
    for code, days_ago, rating, answer, hints, solution_viewed in entries:
        exercise = session.scalar(select(Exercise).where(Exercise.code == code))
        if exercise is None:
            continue
        attempt = Attempt(
            user_id=user.id,
            exercise_id=exercise.id,
            exercise_version=exercise.version,
            answer_text=answer,
            answer_format="text",
            assistance={
                "hints_used": 1 if hints else 0,
                "solution_viewed": solution_viewed,
                "solution_viewed_before_submit": solution_viewed,
            },
            self_rating=rating,
            status="submitted",
            feedback={
                "status": "needs_review",
                "summary": "演示数据：证明题不自动判分，保留人工复核状态。",
                "error_types": [],
            },
            data_origin="demo",
            created_at=now - timedelta(days=days_ago, hours=2),
            updated_at=now - timedelta(days=days_ago, hours=2),
        )
        session.add(attempt)
        session.flush()
        session.add(
            AttemptEvent(
                attempt_id=attempt.id,
                user_id=user.id,
                exercise_id=exercise.id,
                type="submit",
                payload={"demo": True},
                created_at=attempt.created_at,
            )
        )
        if hints:
            session.add(
                AttemptEvent(
                    attempt_id=attempt.id,
                    user_id=user.id,
                    exercise_id=exercise.id,
                    type="hint_view",
                    payload={"demo": True},
                    created_at=attempt.created_at,
                )
            )
        if solution_viewed:
            session.add(
                AttemptEvent(
                    attempt_id=attempt.id,
                    user_id=user.id,
                    exercise_id=exercise.id,
                    type="solution_view",
                    payload={"demo": True},
                    created_at=attempt.created_at,
                )
            )
        session.add(
            StudyEvent(
                user_id=user.id,
                kind="attempt_submit",
                concept_id=exercise.topic_id,
                payload={"attempt_id": attempt.id, "demo": True},
                data_origin="demo",
                created_at=attempt.created_at,
            )
        )
    session.add(
        Note(
            user_id=user.id,
            text="一致连续的关键不是“函数看起来连在一起”，而是同一个 δ 是否对所有点对有效。",
            concept_id="uniform",
            tags=["量词", "复习"],
            data_origin="demo",
        )
    )
    session.add(
        Note(
            user_id=user.id,
            text="1/x 在 (0,1) 上连续但不一致连续：xₙ=1/n，yₙ=1/(n+1)。",
            concept_id="uniform",
            tags=["反例"],
            data_origin="demo",
        )
    )
    session.add(
        Bookmark(
            user_id=user.id,
            target_type="concept",
            target_id="uniform",
        )
    )
    scene = VisualScene(
        user_id=user.id,
        template_id="vt-eps-delta-square",
        title="一致连续 · ε 与 δ",
        scene=VISUAL_TEMPLATES[0]["scene"],
        version=1,
        is_active=True,
        data_origin="demo",
    )
    session.add(scene)
    session.flush()
    session.add(
        SceneVersion(
            scene_id=scene.id,
            version=1,
            scene=scene.scene,
            origin="seed",
            message="演示场景",
            created_by_id=user.id,
        )
    )
    session.add(
        Observation(
            scene_id=scene.id,
            user_id=user.id,
            text="δ 减到 0.03 时，向上取整的余量还能覆盖，但再小就失效。",
            tags=["量词"],
            data_origin="demo",
        )
    )


def seed_all(session: Session, config: Config, *, with_demo: bool = False) -> dict[str, Any]:
    admin = _admin(session, config)
    invite = _invite(session, config, admin)
    content = seed_content(session, config)
    demo = None
    if with_demo:
        demo = _demo_user(session, config)
        seed_demo_activity(session, demo)
    session.commit()
    return {
        "seed_version": SEED_VERSION,
        "content": content,
        "admin": admin.email,
        "demo_invite": config.demo_invite_code,
        "demo_user": demo.email if demo else None,
        "demo_password": DEFAULT_STUDENT_PASSWORD if demo else None,
    }
