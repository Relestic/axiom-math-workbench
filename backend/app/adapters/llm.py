"""OpenAI-compatible model adapter with usage accounting.

Only the backend reads the API key. Prompts, responses and keys are never logged
verbatim; model calls record provider, model, purpose, latency and token counts.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import httpx
from flask import current_app
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import ModelCall

CODE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class LLMError(Exception):
    def __init__(self, message: str, *, kind: str = "upstream", retryable: bool = False):
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.retryable = retryable


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AICredentials:
    """Effective endpoint credentials for one call.

    ``source="user"`` means a per-user encrypted key; only this adapter receives
    the decrypted value. ``source="system"`` is never constructed here; the
    caller falls back to Config when no override exists.
    """

    provider: str
    base_url: str
    model: str
    api_key: str
    source: str = "user"
    key_hint: str = ""

    @property
    def is_reasoner(self) -> bool:
        return "reasoner" in self.model.lower() or "thinking" in self.model.lower()

    @property
    def endpoint(self) -> str:
        return self.base_url.rstrip("/") + "/chat/completions"


def _config():
    return current_app.config["AXIOM"]


def _clean_content(content: str) -> str:
    return CODE_FENCE.sub("", content.strip()).strip()


class _MockProvider:
    """Deterministic local provider for tests and offline demonstrations.

    It never claims to be a real model: every response is shaped by explicit
    rules and the API marks ``provider: mock`` in status and usage records.
    """

    name = "mock"
    model = "axiom-mock-1"

    def complete(self, messages: list[dict], purpose: str, json_mode: bool) -> LLMResult:
        started = time.perf_counter()
        user_text = ""
        for message in reversed(messages):
            if message.get("role") == "user":
                user_text = str(message.get("content", ""))
                break
        if purpose in {"plot", "plot_change"}:
            payload = self._plot_payload(user_text)
        elif purpose == "surface_plot":
            payload = self._surface_payload(user_text)
        elif purpose == "interpret":
            payload = {
                "message": "这是模拟模型的解释：图像中的 ε 带与 δ 邻域帮助你区分逐点控制与统一控制。",
                "observations": [
                    "有限采样只能提供数值证据，不能代替证明。",
                    "切换函数时注意定义域与间断点。",
                ],
                "proof_links": [],
                "uncertain": False,
            }
        elif purpose == "exercise_generation":
            payload = {
                "message": "模拟模型未生成新题，使用已审核模板变式。",
                "exercises": [],
            }
        elif purpose == "attempt_feedback":
            payload = {
                "feedback": "模拟反馈：请补充定义中的量词顺序，并说明关键估计成立的条件。",
                "error_types": [],
                "needs_review": True,
            }
        else:
            payload = {"message": "模拟模式：请求已记录。"}
        text = json.dumps(payload, ensure_ascii=False)
        elapsed = int((time.perf_counter() - started) * 1000)
        return LLMResult(
            text=text,
            provider=self.name,
            model=self.model,
            input_tokens=max(1, len(user_text) // 4),
            output_tokens=max(1, len(text) // 4),
            latency_ms=elapsed,
        )

    @staticmethod
    def _plot_payload(user_text: str) -> dict[str, Any]:
        scene = None
        try:
            envelope = json.loads(user_text)
            scene = envelope.get("currentScene")
        except Exception:
            scene = None
        request = ""
        try:
            request = str(json.loads(user_text).get("request", ""))
        except Exception:
            request = user_text
        if isinstance(scene, dict):
            scene = json.loads(json.dumps(scene))
            request_lower = request.lower()
            if "sin" in request_lower:
                scene["curves"][0]["expression"] = "sin(x)"
                scene["curves"][0]["label"] = "sin(x)"
                message = "已把函数改为 sin(x)（模拟模型）。"
            elif "epsilon" in request_lower or "ε" in request or "epsilon" in request_lower:
                scene["epsilon"] = min(0.02, scene.get("epsilon", 0.3))
                message = "已把 ε 调小（模拟模型）。"
            else:
                message = "模拟模型理解了这个请求；公式未改变。"
            return {"message": message, "scene": scene}
        return {"message": "模拟模型没有收到可用场景。", "scene": None}

    @staticmethod
    def _surface_payload(user_text: str) -> dict[str, Any]:
        scene = None
        try:
            envelope = json.loads(user_text)
            scene = envelope.get("currentSurface")
        except Exception:
            scene = None
        request = ""
        try:
            request = str(json.loads(user_text).get("request", ""))
        except Exception:
            request = user_text
        if not isinstance(scene, dict):
            return {"message": "模拟模型没有收到三维曲面。", "scene": None}
        scene = json.loads(json.dumps(scene))
        lower = request.lower()
        if "sin" in lower or "波浪" in request:
            scene["expression"] = "sin(x)*cos(y)"
            message = "已把曲面换成 sin(x)cos(y)（模拟模型）。"
        elif "马鞍" in request:
            scene["expression"] = "x^2 - y^2"
            message = "已换成马鞍面（模拟模型）。"
        elif "角度" in request or "视角" in request:
            scene["view"]["azimuth"] = 60
            scene["view"]["elevation"] = 35
            message = "已调整视角（模拟模型）。"
        else:
            message = "模拟模型理解了这个三维请求；场景未改变。"
        return {"message": message, "scene": scene}


def _post_chat(
    messages: list[dict],
    *,
    purpose: str,
    json_mode: bool,
    timeout: int,
    max_tokens: int,
    credentials: AICredentials | None = None,
) -> LLMResult:
    config = _config()
    if credentials is None and config.ai_provider == "mock":
        return _MockProvider().complete(messages, purpose=purpose, json_mode=json_mode)
    if credentials is None and not config.ai_configured:
        raise LLMError("模型尚未配置", kind="unconfigured")
    if credentials is not None:
        endpoint = credentials.endpoint
        api_key = credentials.api_key
        model = credentials.model
        provider = credentials.provider
        is_reasoner = credentials.is_reasoner
    else:
        endpoint = config.ai_endpoint
        api_key = config.ai_api_key
        model = config.ai_model
        provider = config.ai_provider
        is_reasoner = config.ai_is_reasoner
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "max_tokens": max_tokens,
    }
    # DeepSeek thinking/reasoner models do not accept temperature or
    # response_format. Their prompt still asks for JSON and the schema validator
    # is the final gate.
    if not is_reasoner:
        payload["temperature"] = 0.2
    if json_mode and config.ai_json_mode and not is_reasoner:
        payload["response_format"] = {"type": "json_object"}
    started = time.perf_counter()
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = httpx.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=timeout,
            )
        except httpx.TimeoutException as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(0.3)
                continue
            raise LLMError("模型请求超时", kind="timeout", retryable=True) from exc
        except httpx.HTTPError as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(0.3)
                continue
            raise LLMError("无法连接模型服务", kind="network", retryable=True) from exc
        if response.status_code in {401, 403}:
            raise LLMError("模型服务鉴权失败，请检查服务端 API Key", kind="auth")
        if response.status_code == 402:
            raise LLMError(
                "模型账户余额不足，请先充值或更换 API Key",
                kind="billing",
            )
        if response.status_code == 429:
            if attempt == 0:
                time.sleep(0.6)
                continue
            raise LLMError("模型服务限流或额度不足", kind="rate_limit", retryable=True)
        if response.status_code >= 500:
            if attempt == 0:
                time.sleep(0.4)
                continue
            raise LLMError(f"模型服务返回 HTTP {response.status_code}", kind="upstream", retryable=True)
        if response.status_code >= 400:
            detail = ""
            try:
                body = response.json()
                detail = str((body.get("error") or {}).get("message") or "")
            except Exception:
                detail = ""
            suffix = f"：{detail[:180]}" if detail else ""
            raise LLMError(
                f"模型服务返回 HTTP {response.status_code}{suffix}",
                kind="upstream",
            )
        if len(response.content) > 400_000:
            raise LLMError("模型返回内容过大", kind="invalid")
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMError("模型服务未返回有效 JSON", kind="invalid") from exc
        message = (data.get("choices") or [{}])[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            # DeepSeek JSON mode can replace non-JSON output with spaces. Retry
            # once rather than failing immediately, then report a useful error.
            if attempt == 0:
                time.sleep(0.3)
                continue
            raise LLMError(
                "模型未返回可用内容（JSON 模式可能被截断），请重试或关闭 AI_JSON_MODE",
                kind="invalid",
            )
        usage = data.get("usage") or {}
        elapsed = int((time.perf_counter() - started) * 1000)
        return LLMResult(
            text=_clean_content(content),
            provider=provider,
            model=str(data.get("model") or model),
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            latency_ms=elapsed,
            raw={},
        )
    raise LLMError(f"模型请求失败：{last_error}", kind="upstream", retryable=True)


def _purpose_from_messages(messages: list[dict]) -> str:
    system = messages[0].get("content", "") if messages else ""
    if isinstance(system, str):
        if "图像工作区" in system:
            return "plot"
        if "练习生成" in system:
            return "exercise_generation"
        if "反馈" in system:
            return "attempt_feedback"
        if "图像解释" in system:
            return "interpret"
    return "generic"


def daily_call_count(session: Session, user_id: str | None) -> int:
    if not user_id:
        return 0
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return int(
        session.scalar(
            select(func.count(ModelCall.id)).where(
                ModelCall.user_id == user_id,
                ModelCall.created_at >= start,
            )
        )
        or 0
    )


def chat(
    session: Session,
    messages: list[dict],
    *,
    purpose: str,
    user_id: str | None = None,
    job_id: str | None = None,
    json_mode: bool = True,
    timeout: int | None = None,
    max_tokens: int = 2000,
    validator: Callable[[str], Any] | None = None,
) -> tuple[LLMResult, Any | None]:
    config = _config()
    credentials: AICredentials | None = None
    if user_id:
        # Imported lazily to keep the adapter usable without the models layer
        # during simple config/mock tests.
        from ..modules.ai_credentials import resolve_user_credentials

        credentials = resolve_user_credentials(
            session, user_id, secret_key=config.secret_key
        )
    if (
        credentials is None
        and config.ai_provider != "mock"
        and not config.ai_configured
    ):
        raise ApiError(
            "service_unavailable",
            "模型尚未配置。请在图像工作区接入自己的 DeepSeek API Key，"
            "或由管理员设置系统 AI_API_KEY。",
        )
    if user_id and daily_call_count(session, user_id) >= config.ai_daily_call_limit:
        raise ApiError("rate_limited", "今日模型调用额度已用完")
    if not user_id:
        start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        anonymous_calls = int(
            session.scalar(
                select(func.count(ModelCall.id)).where(
                    ModelCall.user_id.is_(None),
                    ModelCall.created_at >= start,
                )
            )
            or 0
        )
        if anonymous_calls >= config.ai_legacy_daily_limit:
            raise ApiError("rate_limited", "公开演示的 AI 额度已用完，请明天再试")
    timeout = timeout or config.ai_timeout_seconds
    started = time.perf_counter()
    record = ModelCall(
        user_id=user_id,
        job_id=job_id,
        provider=credentials.provider if credentials else config.ai_provider,
        model=(
            credentials.model
            if credentials
            else config.ai_model
            or ("axiom-mock-1" if config.ai_provider == "mock" else "")
        ),
        purpose=purpose,
        prompt_version=config.ai_prompt_version,
        status="ok",
    )
    try:
        result = _post_chat(
            messages,
            purpose=purpose,
            json_mode=json_mode,
            timeout=timeout,
            max_tokens=max_tokens,
            credentials=credentials,
        )
        record.provider = result.provider
        record.model = result.model
        record.input_tokens = result.input_tokens
        record.output_tokens = result.output_tokens
        record.latency_ms = result.latency_ms or int((time.perf_counter() - started) * 1000)
        parsed = None
        if validator is not None:
            try:
                parsed = validator(result.text)
            except Exception as exc:
                record.status = "invalid"
                record.error = f"schema validation failed: {exc}"[:1000]
                session.add(record)
                session.commit()
                raise ApiError(
                    "upstream_error",
                    "模型返回的内容未通过结构校验，当前状态保持不变。",
                ) from exc
        record.status = "ok"
        session.add(record)
        session.flush()
        return result, parsed
    except ApiError:
        raise
    except LLMError as exc:
        record.status = "error"
        record.error = exc.message
        record.latency_ms = int((time.perf_counter() - started) * 1000)
        session.add(record)
        session.commit()
        if exc.kind == "unconfigured":
            raise ApiError("service_unavailable", exc.message)
        if exc.kind == "timeout":
            raise ApiError("upstream_error", "模型请求超时，请稍后重试")
        if exc.kind == "rate_limit":
            raise ApiError("rate_limited", exc.message)
        if exc.kind == "auth":
            raise ApiError("service_unavailable", exc.message)
        if exc.kind == "billing":
            raise ApiError("service_unavailable", exc.message)
        raise ApiError("upstream_error", exc.message)
    except Exception as exc:  # validation / parsing errors
        record.status = "error"
        record.error = str(exc)[:1000]
        record.latency_ms = int((time.perf_counter() - started) * 1000)
        session.add(record)
        session.commit()
        raise


def provider_status() -> dict[str, Any]:
    config = _config()
    return {
        "configured": bool(config.ai_configured),
        "active": bool(config.ai_active),
        "provider": config.ai_provider,
        "provider_label": config.ai_provider_label,
        "model": config.ai_model or ("axiom-mock-1" if config.ai_provider == "mock" else ""),
        "endpoint_host": _host(config.ai_base_url),
        "json_mode": config.ai_json_effective,
        "reasoner": config.ai_is_reasoner,
        "daily_limit": config.ai_daily_call_limit,
    }


def _host(url: str) -> str:
    if not url:
        return ""
    try:
        from urllib.parse import urlparse

        return urlparse(url).hostname or ""
    except Exception:
        return ""
