"""Response serializers shared by API routes and the OpenAPI document."""

from __future__ import annotations

from typing import Any

from .models import (
    Attempt,
    AttemptEvent,
    Bookmark,
    Chapter,
    Classic,
    Concept,
    Exercise,
    GraphEdge,
    GraphNode,
    Job,
    ModelCall,
    Note,
    Observation,
    Proof,
    Proposition,
    Report,
    Section,
    Textbook,
    Tool,
    User,
    VisualScene,
    VisualTemplate,
    isoformat,
)


def user_out(user: User, progress=None) -> dict[str, Any]:
    data = {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "course_name": user.course_name,
        "week": user.week,
        "total_weeks": user.total_weeks,
        "is_active": user.is_active,
        "created_at": isoformat(user.created_at),
        "last_login_at": isoformat(user.last_login_at),
    }
    if progress is not None:
        data["progress"] = {
            "week": progress.week,
            "total_weeks": progress.total_weeks,
            "last_page": progress.last_page,
            "last_concept_id": progress.last_concept_id,
            "daily_goal": progress.daily_goal,
        }
    return data


def textbook_out(
    textbook: Textbook, *, include_counts: bool = True, include_internal: bool = False
) -> dict[str, Any]:
    parse_meta = dict(textbook.parse_meta or {})
    if not include_internal:
        for key in ("text_preview", "asset_id", "extraction_error", "counts_entries"):
            parse_meta.pop(key, None)
    data = {
        "id": textbook.id,
        "slug": textbook.slug,
        "title": textbook.title,
        "edition": textbook.edition,
        "author": textbook.author,
        "subject": textbook.subject,
        "is_primary": textbook.is_primary,
        "status": textbook.status,
        "page_count": textbook.page_count,
        "parse_state": textbook.parse_state,
        "parse_meta": parse_meta,
        "version": textbook.version,
        "source_note": textbook.source_note,
        "created_at": isoformat(textbook.created_at),
        "updated_at": isoformat(textbook.updated_at),
    }
    if include_counts:
        data["chapter_count"] = len(textbook.chapters)
    return data


def chapter_out(chapter: Chapter, *, include_sections: bool = False) -> dict[str, Any]:
    data = {
        "id": chapter.id,
        "textbook_id": chapter.textbook_id,
        "number": chapter.number,
        "title": chapter.title,
        "summary": chapter.summary,
        "week_start": chapter.week_start,
        "week_end": chapter.week_end,
        "source_page_start": chapter.source_page_start,
        "source_page_end": chapter.source_page_end,
        "status": chapter.status,
        "concept_count": len(chapter.concepts),
    }
    if include_sections:
        data["sections"] = [section_out(section) for section in chapter.sections]
    return data


def section_out(section: Section, *, include_text: bool = True) -> dict[str, Any]:
    data = {
        "id": section.id,
        "chapter_id": section.chapter_id,
        "title": section.title,
        "page_start": section.page_start,
        "page_end": section.page_end,
        "printed_page_start": section.printed_page_start,
        "printed_page_end": section.printed_page_end,
        "sort_order": section.sort_order,
        "status": section.status,
        "version": section.version,
        "anchors": section.anchors or [],
    }
    if include_text:
        data["text"] = section.text
    return data


def proof_out(proof: Proof) -> dict[str, Any]:
    return {
        "id": proof.id,
        "concept_id": proof.concept_id,
        "title": proof.title,
        "idea": proof.idea,
        "steps": proof.steps or [],
        "key_construction": proof.key_construction,
        "tools": proof.tools or [],
        "source_page": proof.source_page,
        "status": proof.status,
        "review_status": proof.review_status,
        "version": proof.version,
    }


def proposition_out(proposition: Proposition) -> dict[str, Any]:
    return {
        "id": proposition.id,
        "concept_id": proposition.concept_id,
        "statement": proposition.statement,
        "truth": proposition.truth,
        "given_text": proposition.given_text,
        "desired_text": proposition.desired_text,
        "missing_conditions": proposition.missing_conditions or [],
        "explanation": proposition.explanation,
        "source_page": proposition.source_page,
        "review_status": proposition.review_status,
        "version": proposition.version,
    }


def classic_out(classic: Classic) -> dict[str, Any]:
    return {
        "id": classic.id,
        "slug": classic.slug,
        "name": classic.name,
        "english_name": classic.english_name,
        "kind": classic.kind,
        "object_definition": classic.object_definition,
        "properties": classic.properties or [],
        "refutes_proposition_id": classic.refutes_proposition_id,
        "refutes_text": classic.refutes_text,
        "concept_id": classic.concept_id,
        "source_title": classic.source_title,
        "source_url": classic.source_url,
        "source_page": classic.source_page,
        "image_kind": classic.image_kind,
        "license": classic.license,
        "historical_note": classic.historical_note,
        "display_limit": classic.display_limit,
        "review_status": classic.review_status,
        "version": classic.version,
    }


def concept_summary(concept: Concept, *, include_drafts: bool = False) -> dict[str, Any]:
    proofs = [
        proof
        for proof in concept.proofs
        if include_drafts or proof.status == "published"
    ]
    classics = [
        classic
        for classic in concept.classics
        if include_drafts or classic.status == "published"
    ]
    return {
        "id": concept.id,
        "chapter_id": concept.chapter_id,
        "name": concept.name,
        "short_name": concept.short_name,
        "english_name": concept.english_name,
        "kind": concept.kind,
        "scope": concept.scope,
        "summary": concept.summary,
        "formula": concept.formula,
        "week": concept.week,
        "page_start": concept.page_start,
        "page_end": concept.page_end,
        "tags": concept.tags or [],
        "status": concept.status,
        "review_status": concept.review_status,
        "version": concept.version,
        "proof_count": len(proofs),
        "classic_count": len(classics),
    }


def concept_detail(concept: Concept, *, include_drafts: bool = False) -> dict[str, Any]:
    data = concept_summary(concept, include_drafts=include_drafts)
    proofs = [
        proof
        for proof in concept.proofs
        if include_drafts or proof.status == "published"
    ]
    propositions = [
        item
        for item in concept.propositions
        if include_drafts or item.status == "published"
    ]
    classics = [
        item
        for item in concept.classics
        if include_drafts or item.status == "published"
    ]
    data.update(
        {
            "definition": concept.definition,
            "quantifiers": concept.quantifiers or [],
            "symbols": concept.symbols or [],
            "conditions": concept.conditions or [],
            "goals": concept.goals or [],
            "prerequisites": concept.prerequisites or [],
            "proofs": [proof_out(proof) for proof in proofs],
            "propositions": [proposition_out(item) for item in propositions],
            "classics": [classic_out(item) for item in classics],
            "chapter": chapter_out(concept.chapter) if concept.chapter else None,
        }
    )
    return data


def tool_out(tool: Tool, *, unlocked: bool) -> dict[str, Any]:
    return {
        "id": tool.id,
        "slug": tool.slug,
        "name": tool.name,
        "description": tool.description,
        "unlock_week": tool.unlock_week,
        "scope": tool.scope,
        "unlocked": unlocked,
    }


def graph_node_out(node: GraphNode, *, state: str | None = None) -> dict[str, Any]:
    data = {
        "id": node.id,
        "name": node.name,
        "kind": node.kind,
        "scope": node.scope,
        "description": node.description,
        "detail": node.detail,
        "x": node.x,
        "y": node.y,
        "color": node.color,
        "size": node.size,
        "page": node.page,
        "week": node.week,
        "concept_id": node.concept_id,
        "classic_id": node.classic_id,
    }
    if state is not None:
        data["state"] = state
    return data


def graph_edge_out(edge: GraphEdge) -> dict[str, Any]:
    return {
        "id": edge.id,
        "from": edge.from_node_id,
        "to": edge.to_node_id,
        "relation": edge.relation,
        "condition": edge.condition,
        "evidence": edge.evidence,
        "source_page": edge.source_page,
        "provenance": edge.provenance,
        "review_status": edge.review_status,
        "content_version": edge.content_version,
    }


def template_out(template: VisualTemplate) -> dict[str, Any]:
    return {
        "id": template.id,
        "slug": template.slug,
        "name": template.name,
        "family": template.family,
        "goal": template.goal,
        "description": template.description,
        "scene": template.scene,
        "meta": template.meta or {},
        "concept_ids": template.concept_ids or [],
        "proof_step_ref": template.proof_step_ref,
        "supported_range": template.supported_range,
        "display_limits": template.display_limits,
        "version": template.version,
    }


def scene_out(scene: VisualScene) -> dict[str, Any]:
    return {
        "id": scene.id,
        "title": scene.title,
        "template_id": scene.template_id,
        "scene": scene.scene,
        "version": scene.version,
        "is_active": scene.is_active,
        "created_at": isoformat(scene.created_at),
        "updated_at": isoformat(scene.updated_at),
    }


def observation_out(observation: Observation) -> dict[str, Any]:
    return {
        "id": observation.id,
        "scene_id": observation.scene_id,
        "text": observation.text,
        "tags": observation.tags or [],
        "created_at": isoformat(observation.created_at),
    }


def exercise_out(
    exercise: Exercise,
    *,
    include_solution: bool = False,
    include_hint: bool = True,
) -> dict[str, Any]:
    data = {
        "id": exercise.id,
        "code": exercise.code,
        "topic_id": exercise.topic_id,
        "title": exercise.title,
        "statement": exercise.statement,
        "domain": exercise.domain,
        "difficulty": exercise.difficulty,
        "skill": exercise.skill,
        "type": exercise.exercise_type,
        "allowed_refs": exercise.allowed_refs or [],
        "checks": exercise.checks or [],
        "common_errors": exercise.common_errors or [],
        "source": exercise.source,
        "provenance": exercise.provenance or {},
        "validation": exercise.validation or {},
        "review_status": exercise.review_status,
        "version": exercise.version,
        "hint_available": bool(exercise.hint),
        "solution_available": bool(exercise.solution_steps),
    }
    if exercise.source == "textbook-exercise":
        data["exercise_type"] = exercise.exercise_type
    if include_hint:
        data["hint"] = exercise.hint
    if include_solution:
        data["solution_steps"] = exercise.solution_steps or []
    return data


def attempt_out(
    attempt: Attempt,
    *,
    exercise: Exercise | None = None,
    include_events: bool = False,
) -> dict[str, Any]:
    data = {
        "id": attempt.id,
        "exercise_id": attempt.exercise_id,
        "exercise_version": attempt.exercise_version,
        "answer_text": attempt.answer_text,
        "answer_format": attempt.answer_format,
        "assistance": attempt.assistance or {},
        "self_rating": attempt.self_rating,
        "status": attempt.status,
        "feedback": attempt.feedback or {},
        "ai_review": attempt.ai_review,
        "score": attempt.score,
        "error_types": attempt.error_types or [],
        "created_at": isoformat(attempt.created_at),
        "updated_at": isoformat(attempt.updated_at),
    }
    if exercise is not None:
        data["exercise"] = {
            "id": exercise.id,
            "code": exercise.code,
            "title": exercise.title,
            "topic_id": exercise.topic_id,
            "skill": exercise.skill,
            "difficulty": exercise.difficulty,
        }
    if include_events:
        data["events"] = [attempt_event_out(event) for event in attempt.events]
    return data


def attempt_event_out(event: AttemptEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "type": event.type,
        "payload": event.payload or {},
        "created_at": isoformat(event.created_at),
    }


def note_out(note: Note) -> dict[str, Any]:
    return {
        "id": note.id,
        "text": note.text,
        "concept_id": note.concept_id,
        "tags": note.tags or [],
        "created_at": isoformat(note.created_at),
        "updated_at": isoformat(note.updated_at),
    }


def bookmark_out(bookmark: Bookmark) -> dict[str, Any]:
    return {
        "id": bookmark.id,
        "target_type": bookmark.target_type,
        "target_id": bookmark.target_id,
        "created_at": isoformat(bookmark.created_at),
    }


def report_out(report: Report) -> dict[str, Any]:
    return {
        "id": report.id,
        "user_id": report.user_id,
        "target_type": report.target_type,
        "target_id": report.target_id,
        "kind": report.kind,
        "message": report.message,
        "status": report.status,
        "admin_note": report.admin_note,
        "created_at": isoformat(report.created_at),
        "resolved_at": isoformat(report.resolved_at),
    }


def job_out(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "type": job.type,
        "status": job.status,
        "progress": job.progress,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "payload": job.payload or {},
        "result": job.result or {},
        "error": job.error,
        "created_by_id": job.created_by_id,
        "created_at": isoformat(job.created_at),
        "started_at": isoformat(job.started_at),
        "finished_at": isoformat(job.finished_at),
        "cancel_requested": job.cancel_requested,
    }


def model_call_out(call: ModelCall) -> dict[str, Any]:
    return {
        "id": call.id,
        "purpose": call.purpose,
        "provider": call.provider,
        "model": call.model,
        "prompt_version": call.prompt_version,
        "input_tokens": call.input_tokens,
        "output_tokens": call.output_tokens,
        "latency_ms": call.latency_ms,
        "status": call.status,
        "cost_estimate": call.cost_estimate,
        "created_at": isoformat(call.created_at),
    }
