"""Validated conversation actions (tool-call style control of the workspace).

The model can only request operations from this list. Every action re-checks
ownership, parameter ranges and current state before returning a real result;
the response never claims an action succeeded unless it did.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import Concept, Conversation, User, StudyEvent
from ..serializers import concept_summary
from . import content_service, exercise_service, graph_service, progress_service, visual_service


def _require(params: dict[str, Any], key: str) -> Any:
    value = params.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ApiError("unprocessable", f"缺少参数 {key}")
    return value


def dispatch(
    session: Session,
    user: User,
    conversation: Conversation,
    action: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    state_version = 0
    result: dict[str, Any] | None = None
    message = ""

    if action == "search_concepts":
        query = str(params.get("query") or params.get("q") or "").strip()
        if not query:
            raise ApiError("unprocessable", "搜索需要 query")
        types = {"concept", "classic", "proposition", "proof"}
        result = content_service.search(session, user, query[:120], 10, types)
        message = f"找到 {result['total']} 条相关条目"

    elif action == "focus_concept":
        concept_id = str(_require(params, "concept_id"))
        concept = session.get(Concept, concept_id)
        if concept is None or (user.role != "admin" and concept.status != "published"):
            raise ApiError("not_found", "知识点不存在或尚未发布")
        result = content_service.get_concept(session, user, concept.id)
        progress = content_service.get_progress(session, user)
        progress.last_concept_id = concept.id
        progress.last_page = "textbook"
        session.add(
            StudyEvent(
                user_id=user.id,
                kind="conversation_focus",
                concept_id=concept.id,
                payload={"conversation_id": conversation.id},
            )
        )
        message = f"已定位到「{concept.name}」"

    elif action == "expand_relations":
        node_id = str(_require(params, "node_id"))
        result = graph_service.node_detail(session, user, node_id)
        message = f"已展开节点「{result['name']}」的有限关系"

    elif action == "open_source":
        concept_id = params.get("concept_id")
        section_id = params.get("section_id")
        if section_id:
            result = content_service.get_section(session, user, str(section_id))
            message = "已打开教材片段"
        elif concept_id:
            concept = session.get(Concept, str(concept_id))
            if concept is None:
                raise ApiError("not_found", "知识点不存在")
            detail = content_service.get_concept(session, user, concept.id)
            result = {
                "concept_id": concept.id,
                "chapter_id": concept.chapter_id,
                "page_start": concept.page_start,
                "page_end": concept.page_end,
                "chapter": detail.get("chapter"),
            }
            message = f"已定位到教材第 {concept.page_start}–{concept.page_end} 页"
        else:
            raise ApiError("unprocessable", "需要 concept_id 或 section_id")

    elif action == "open_classic_case":
        classic_id = str(_require(params, "classic_id"))
        result = content_service.get_classic(session, user, classic_id)
        message = f"已打开经典案例「{result['name']}」"

    elif action == "open_visualization":
        scene_id = params.get("scene_id")
        template_slug = params.get("template_slug")
        if scene_id:
            result = visual_service.get_scene(session, user, str(scene_id))
            state_version = result.get("version", 0)
            message = "已打开你的图像场景"
        elif template_slug:
            result = visual_service.get_template(session, str(template_slug))
            message = f"已打开模板「{result['name']}」"
        else:
            raise ApiError("unprocessable", "需要 scene_id 或 template_slug")

    elif action == "update_visualization":
        scene_id = str(_require(params, "scene_id"))
        scene = params.get("scene")
        if not isinstance(scene, dict):
            raise ApiError("unprocessable", "scene 必须是对象")
        expected = params.get("expected_version")
        result = visual_service.update_scene(
            session,
            user,
            scene_id,
            scene=scene,
            expected_version=int(expected) if expected is not None else None,
            origin="conversation",
            message=str(params.get("note", "对话改图")),
        )
        state_version = result["version"]
        conversation.scene_id = scene_id
        message = "图像已更新"

    elif action == "open_proof_step":
        proof_id = str(_require(params, "proof_id"))
        proof = content_service.get_proof(session, user, proof_id)
        step_number = params.get("step")
        if step_number is None:
            result = proof
            message = "已打开证明"
        else:
            try:
                step = next(
                    item
                    for item in proof["steps"]
                    if int(item.get("n", 0)) == int(step_number)
                )
            except (StopIteration, ValueError):
                raise ApiError("not_found", "证明步骤不存在")
            result = {"proof": proof, "step": step}
            message = f"已定位到证明第 {step_number} 步"

    elif action == "generate_exercises":
        topic_id = str(_require(params, "topic_id"))
        result = exercise_service.generate_exercises(
            session,
            user,
            topic_id=topic_id,
            skill=params.get("skill"),
            difficulty=int(params.get("difficulty", 3)),
            count=min(10, max(1, int(params.get("count", 3)))),
            focus=str(params.get("focus", ""))[:500],
        )
        message = result["message"]

    elif action == "submit_attempt":
        exercise_id = str(_require(params, "exercise_id"))
        answer = str(_require(params, "answer_text"))
        result = exercise_service.submit_attempt(
            session,
            user,
            exercise_id=exercise_id,
            answer_text=answer[:20000],
            hints_used=int(params.get("hints_used", 0)),
            solution_viewed=bool(params.get("solution_viewed", False)),
            self_rating=str(params.get("self_rating", "pending")),
            idempotency_key=params.get("idempotency_key"),
        )
        message = "作答已保存并生成规则反馈"

    elif action == "show_hint":
        exercise_id = str(_require(params, "exercise_id"))
        result = exercise_service.get_hint(session, user, exercise_id)
        message = "已展示提示并记录查看行为"

    elif action == "show_solution":
        exercise_id = str(_require(params, "exercise_id"))
        result = exercise_service.get_solution(session, user, exercise_id)
        message = "已展示完整解答并记录查看行为"

    elif action == "undo_action":
        scene_id = str(_require(params, "scene_id"))
        result = visual_service.undo_scene(session, user, scene_id)
        state_version = result["version"]
        conversation.scene_id = scene_id
        message = f"已撤销到版本 {result['restored_from']}"

    else:  # pragma: no cover - Literal already restricts this
        raise ApiError("unprocessable", f"不支持的操作：{action}")

    visual_service.append_message(
        session,
        conversation,
        role="assistant",
        content=message,
        action={"type": action, "params": params, "result_summary": _summary(result)},
        state_version=state_version,
    )
    return {
        "action": action,
        "status": "ok",
        "message": message,
        "result": result,
        "state_version": state_version,
        "conversation_id": conversation.id,
    }


def _summary(result: dict[str, Any]) -> dict[str, Any]:
    if "items" in result and isinstance(result["items"], list):
        return {"count": len(result["items"])}
    if "id" in result:
        return {"id": result.get("id"), "version": result.get("version")}
    return {}
