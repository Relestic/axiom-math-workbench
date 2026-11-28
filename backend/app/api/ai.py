"""AI endpoints, including the legacy local frontend contract."""

from __future__ import annotations

import json
from urllib.parse import urlsplit

from flask import Blueprint, current_app, request
from sqlalchemy import select

from ..adapters.llm import (
    chat, daily_call_count, local_key_store, provider_status, test_local_connection, use_local_ai,
)
from ..adapters.local_key import DEFAULT_BASE_URL, valid_key
from ..auth import current_user, require_auth
from ..config import Config, openai_reasoning_model
from ..db import get_session
from ..errors import ApiError, parse_json
from ..models import Attempt, Conversation, Exercise
from ..modules import ai_service, surface_service, visual_service
from ..schemas.visual import (
    AIPlotRequest,
    GenerateCounterexamplesRequest,
    GenerateExercisesRequest,
    InterpretRequest,
)
from ..schemas.surface import SurfaceAIRequest
from ..schemas.diagram import DIAGRAM_FORMAT, DiagramRequest, DiagramScene
from ..serializers import attempt_out, job_out
from ..workers.queue import enqueue, usage_summary
from .local_only import require_local
from .utils import limit

bp = Blueprint("ai", __name__, url_prefix="/api/v1/ai")
legacy_bp = Blueprint("legacy_ai", __name__, url_prefix="/api/ai")


def _config() -> Config:
    return current_app.config["AXIOM"]


@bp.get("/key/status")
def key_status():
    require_local()
    return local_key_store().status()


@bp.put("/key")
def save_key():
    require_local()
    if not request.is_json:
        raise ApiError("unsupported_media_type", "请求必须使用 Content-Type: application/json")
    raw = request.stream.read(4097)
    if len(raw) > 4096:
        raise ApiError("payload_too_large", "密钥配置请求过大")
    try:
        payload = json.loads(raw)
    except (ValueError, RecursionError):
        raise ApiError("invalid_json", "请求体不是有效的 JSON") from None
    if not isinstance(payload, dict):
        raise ApiError("invalid_json", "请求体必须是 JSON 对象")
    api_key = payload.get("api_key")
    provider = payload.get("provider", "deepseek")
    if (
        set(payload) - {"api_key", "model", "provider", "base_url", "reasoning_effort"}
        or provider not in ("deepseek", "openai", "codex")
        or ("api_key" in payload and not (provider == "codex" and api_key == "") and not valid_key(api_key))
    ):
        raise ApiError("unprocessable", "请检查提供商和 API Key 格式")
    store = local_key_store()
    store.save(**payload)
    return store.status()


@bp.delete("/key")
def clear_key():
    require_local()
    store = local_key_store()
    store.clear()
    return store.status()


@bp.post("/key/test")
def check_key():
    require_local()
    limit("ai")
    test_local_connection()
    return {"ok": True}


@bp.post("/local-diagram")
def local_diagram():
    use_local_ai()
    limit("legacy_ai")
    payload = parse_json(DiagramRequest)
    session = get_session()
    _, scene = chat(session, [
        {"role": "system", "content": "按学生描述绘制数学概念教学图，只输出完整图解。" + DIAGRAM_FORMAT},
        {"role": "user", "content": payload.message},
    ], purpose="diagram", max_tokens=4000, validator=DiagramScene.model_validate_json)
    session.commit()
    return {"scene": scene.model_dump(by_alias=True, exclude_none=True)}


@bp.post("/local-surface")
def local_surface_plot():
    use_local_ai()
    limit("legacy_ai")
    payload = parse_json(SurfaceAIRequest)
    session = get_session()
    result = surface_service.plot_surface_change(
        session,
        None,
        message=payload.message,
        scene=payload.scene.model_dump(),
        history=payload.history,
    )
    session.commit()
    return result


@bp.get("/status")
@require_auth()
def status():
    session = get_session()
    user = current_user()
    data = provider_status()
    data["authenticated"] = True
    data["daily_calls"] = daily_call_count(session, user.id)
    data["prompt_version"] = _config().ai_prompt_version
    data["usage"] = usage_summary(session, user.id)["recent"][:5]
    return data


@bp.post("/test")
@require_auth()
def test_model():
    """Make one tiny live call so the UI can distinguish config from a working key."""

    config = _config()
    if not config.ai_active:
        raise ApiError(
            "service_unavailable",
            "模型尚未配置。请设置 AXIOM_AI_PROVIDER=deepseek、AI_MODEL 和 AI_API_KEY。",
        )
    session = get_session()
    user = current_user()
    limit("ai", user.id)
    result, _ = chat(
        session,
        [
            {
                "role": "system",
                "content": "This is a connectivity check. Reply with exactly: OK",
            },
            {"role": "user", "content": "ping"},
        ],
        purpose="connection_test",
        user_id=user.id,
        json_mode=False,
        max_tokens=32,
        timeout=min(30, config.ai_timeout_seconds),
    )
    session.commit()
    return {
        "ok": True,
        "provider": config.ai_provider,
        "provider_label": config.ai_provider_label,
        "model": result.model,
        "latency_ms": result.latency_ms,
        "reply": result.text[:80],
    }


@bp.post("/surface")
@require_auth()
def surface_plot():
    user = current_user()
    limit("ai", user.id)
    payload = parse_json(SurfaceAIRequest)
    session = get_session()
    result = surface_service.plot_surface_change(
        session,
        user,
        message=payload.message,
        scene=payload.scene.model_dump(),
        history=payload.history,
    )
    session.commit()
    return result


@bp.post("/plot")
@require_auth()
def plot():
    user = current_user()
    limit("ai", user.id)
    payload = parse_json(AIPlotRequest)
    session = get_session()
    result = ai_service.plot_change(
        session,
        user,
        message=payload.message,
        scene=payload.scene.model_dump(),
        history=payload.history,
    )
    scene_id = request.args.get("scene_id")
    conversation_id = request.args.get("conversation_id")
    expected_version = request.args.get("expected_version", type=int)
    saved = None
    conversation = None
    if conversation_id:
        conversation = session.get(Conversation, conversation_id)
        if conversation is None or conversation.user_id != user.id:
            raise ApiError("not_found", "对话不存在")
        scene_id = scene_id or conversation.scene_id
        visual_service.append_message(
            session,
            conversation,
            role="user",
            content=payload.message,
            action={"type": "request", "scene_version": expected_version},
        )
    if scene_id and result.get("scene"):
        saved = visual_service.update_scene(
            session,
            user,
            scene_id,
            scene=result["scene"],
            expected_version=expected_version,
            origin="ai",
            message=result["message"],
        )
        result["saved_scene"] = saved
    if conversation is not None:
        visual_service.append_message(
            session,
            conversation,
            role="assistant",
            content=result["message"],
            action={
                "type": "scene_update" if saved else "explanation",
                "scene_id": saved["id"] if saved else scene_id,
                "scene_version": saved["version"] if saved else None,
            },
            state_version=saved["version"] if saved else 0,
        )
        session.commit()
        result["conversation_id"] = conversation.id
    else:
        session.commit()
    return result


@bp.post("/interpret")
@require_auth()
def interpret():
    user = current_user()
    limit("ai", user.id)
    payload = parse_json(InterpretRequest)
    session = get_session()
    result = ai_service.interpret(
        session,
        user,
        scene=payload.scene.model_dump(),
        question=payload.question,
        template_slug=payload.template_slug,
    )
    session.commit()
    return result


@bp.post("/counterexamples")
@require_auth()
def counterexamples():
    user = current_user()
    payload = parse_json(GenerateCounterexamplesRequest)
    session = get_session()
    result = ai_service.counterexamples(
        session,
        user,
        proposition_id=payload.proposition_id,
        concept_id=payload.concept_id,
        count=payload.count,
    )
    session.commit()
    return result


@bp.post("/exercises")
@require_auth()
def generate_exercises_job():
    user = current_user()
    limit("ai", user.id)
    payload = parse_json(GenerateExercisesRequest)
    session = get_session()
    config = _config()
    job = enqueue(
        session,
        config,
        job_type="exercises.generate",
        payload={
            "user_id": user.id,
            "topic_id": payload.topic_id,
            "skill": payload.skill,
            "difficulty": payload.difficulty,
            "count": payload.count,
            "focus": payload.focus,
        },
        created_by_id=user.id,
        idempotency_key=request.headers.get("Idempotency-Key"),
    )
    session.commit()
    return {"job": job_out(job), "queue_mode": "sync" if config.worker_sync else "background"}, 202


@bp.post("/feedback/<attempt_id>")
@require_auth()
def feedback(attempt_id: str):
    user = current_user()
    limit("ai", user.id)
    session = get_session()
    attempt = session.get(Attempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        raise ApiError("not_found", "作答记录不存在")
    config = _config()
    if not config.ai_active:
        raise ApiError(
            "service_unavailable",
            "模型尚未配置；规则检查结果已随作答保存，可直接查看。",
        )
    job = enqueue(
        session,
        config,
        job_type="attempt.feedback",
        payload={"attempt_id": attempt.id},
        created_by_id=user.id,
        idempotency_key=request.headers.get("Idempotency-Key"),
    )
    session.commit()
    return {"job": job_out(job), "queue_mode": "sync" if config.worker_sync else "background"}, 202


def _origin_allowed() -> bool:
    config = _config()
    origin = request.headers.get("Origin")
    if not origin:
        return True
    if origin in config.cors_origins:
        return True
    host = request.host
    return origin in {f"http://{host}", f"https://{host}"}


@legacy_bp.get("/status")
def legacy_status():
    config = _config()
    if not config.legacy_ai_enabled:
        raise ApiError("not_found", "本地 AI 接口已关闭")
    if config.local_mode and not config.is_production:
        require_local()
        status = local_key_store().status()
        provider = status.get("provider", "deepseek")
        label = {"openai": "ChatGPT (OpenAI)", "deepseek": "DeepSeek", "codex": "本机 Codex CLI"}[provider]
        reasoning = provider == "openai" and openai_reasoning_model(status["model"])
        return {
            **status,
            "provider": label,
            "provider_label": label,
            "endpoint_host": ("codex-cli" if provider == "codex" else
                              urlsplit(status.get("base_url") or DEFAULT_BASE_URL[provider]).hostname),
            "mode": provider if status["configured"] else "none",
            "reasoner": reasoning,
            "json_mode": config.ai_json_mode and not reasoning,
        }
    data = provider_status()
    return {
        "configured": data["active"],
        "model": data["model"],
        "provider": data["provider_label"],
        "provider_label": data["provider_label"],
        "endpoint_host": data["endpoint_host"],
        "mode": config.ai_provider,
        "reasoner": data["reasoner"],
        "json_mode": data["json_mode"],
    }


@legacy_bp.post("/plot")
def legacy_plot():
    config = _config()
    if not config.legacy_ai_enabled:
        raise ApiError("not_found", "本地 AI 接口已关闭")
    if config.local_mode and not config.is_production:
        use_local_ai()
    elif not _origin_allowed():
        raise ApiError("forbidden", "仅接受当前站点的请求")
    limit("legacy_ai")
    payload = parse_json(AIPlotRequest)
    session = get_session()
    result = ai_service.plot_change(
        session,
        None,
        message=payload.message,
        scene=payload.scene.model_dump(),
        history=payload.history,
    )
    session.commit()
    return {"message": result["message"], "scene": result["scene"]}
