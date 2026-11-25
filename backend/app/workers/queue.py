"""Persisted background jobs and a single-process worker.

Production can replace the thread with Celery + RabbitMQ without changing the
Job table or handler signatures: claim → execute → persist result. Every stage
keeps attempts, timeout and idempotency metadata.
"""

from __future__ import annotations

import threading
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Callable

from flask import Flask
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..adapters.pdf import extract_text, inspect_pdf
from ..config import Config
from ..db import session_scope
from ..errors import ApiError
from ..models import Asset, Job, ModelCall, Textbook, User, utcnow
from ..modules.exercise_service import generate_exercises
from ..modules.ai_service import ai_feedback

HANDLERS: dict[str, Callable[[Session, Job, Config], dict[str, Any]]] = {}


def handler(name: str):
    def decorator(func: Callable[[Session, Job, Config], dict[str, Any]]):
        HANDLERS[name] = func
        return func

    return decorator


@handler("exercises.generate")
def _generate(session: Session, job: Job, config: Config) -> dict[str, Any]:
    payload = job.payload or {}
    user = session.get(User, payload.get("user_id") or job.created_by_id)
    if user is None:
        raise ApiError("not_found", "发起任务的账号不存在")
    result = generate_exercises(
        session,
        user,
        topic_id=payload["topic_id"],
        skill=payload.get("skill"),
        difficulty=int(payload.get("difficulty", 3)),
        count=int(payload.get("count", 3)),
        focus=payload.get("focus", ""),
    )
    return {
        "created": [item["id"] for item in result["created"]],
        "reused": [item["id"] for item in result["reused"]],
        "message": result["message"],
        "generation": result["generation"],
    }


@handler("attempt.feedback")
def _attempt_feedback(session: Session, job: Job, config: Config) -> dict[str, Any]:
    from ..models import Attempt, Exercise

    attempt = session.get(Attempt, (job.payload or {}).get("attempt_id"))
    if attempt is None:
        raise ApiError("not_found", "作答记录不存在")
    exercise = session.get(Exercise, attempt.exercise_id)
    user = session.get(User, attempt.user_id)
    if exercise is None or user is None:
        raise ApiError("not_found", "题目或账号不存在")
    result = ai_feedback(
        session,
        user,
        exercise_title=exercise.title,
        exercise_statement=exercise.statement,
        solution_steps=exercise.solution_steps or [],
        answer_text=attempt.answer_text,
        rubric=attempt.feedback or {},
    )
    feedback = dict(attempt.feedback or {})
    feedback["ai"] = {
        "feedback": result["feedback"],
        "error_types": result["error_types"],
        "needs_review": result["needs_review"],
        "provider": result.get("provider"),
        "model": result.get("model"),
    }
    feedback["status"] = "needs_review"
    attempt.feedback = feedback
    attempt.error_types = sorted(
        set(attempt.error_types or []) | set(result.get("error_types", []))
    )
    return {
        "attempt_id": attempt.id,
        "needs_review": result["needs_review"],
        "feedback": result["feedback"],
    }


@handler("textbook.parse")
def _parse_textbook(session: Session, job: Job, config: Config) -> dict[str, Any]:
    payload = job.payload or {}
    textbook = session.get(Textbook, payload.get("textbook_id"))
    asset = session.get(Asset, payload.get("asset_id"))
    if textbook is None or asset is None:
        raise ApiError("not_found", "教材或文件不存在")
    textbook.parse_state = "extracting"
    from pathlib import Path

    data = Path(asset.storage_path).read_bytes() if Path(asset.storage_path).exists() else b""
    info = inspect_pdf(data)
    text, error = extract_text(asset.storage_path) if info["extraction_available"] else (None, None)
    meta = dict(textbook.parse_meta or {})
    meta.update(
        {
            "asset_id": asset.id,
            "page_count_estimate": info["page_count_estimate"],
            "extractor": info["extractor"],
            "extraction_available": info["extraction_available"],
            "extraction_error": error,
            "text_preview": (text or "")[:2000],
            "text_characters": len(text or ""),
            "note": info["note"],
            "parsed_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    textbook.parse_meta = meta
    if textbook.page_count is None and info["page_count_estimate"]:
        textbook.page_count = info["page_count_estimate"]
    if text:
        textbook.parse_state = "needs_review"
        message = "已提取文本，必须人工确认章节与公式后才能发布知识点。"
    else:
        textbook.parse_state = "needs_text_import"
        message = (
            "PDF 已保存并通过结构检查，但没有可用的文本提取器；"
            "请导入已核对文本，或安装可选依赖后重新解析。"
        )
    return {
        "textbook_id": textbook.id,
        "parse_state": textbook.parse_state,
        "page_count_estimate": info["page_count_estimate"],
        "extractor": info["extractor"],
        "extracted_characters": len(text or ""),
        "message": message,
    }


def enqueue(
    session: Session,
    config: Config,
    *,
    job_type: str,
    payload: dict[str, Any],
    created_by_id: str | None,
    idempotency_key: str | None = None,
    run_sync: bool | None = None,
) -> Job:
    if job_type not in HANDLERS:
        raise ApiError("bad_request", f"未知任务类型：{job_type}")
    if idempotency_key:
        existing = session.scalar(
            select(Job).where(
                Job.created_by_id == created_by_id,
                Job.type == job_type,
                Job.idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            return existing
    job = Job(
        type=job_type,
        status="queued",
        payload=payload,
        created_by_id=created_by_id,
        max_attempts=config.job_max_attempts,
        timeout_seconds=config.job_timeout_seconds,
        idempotency_key=idempotency_key,
    )
    session.add(job)
    session.flush()
    should_run = config.worker_sync if run_sync is None else run_sync
    if should_run:
        _run(session, job, config, claimed_attempts=0)
    return job


def claim_next(session: Session) -> Job | None:
    job = session.scalar(
        select(Job)
        .where(Job.status == "queued", Job.cancel_requested.is_(False))
        .order_by(Job.created_at.asc())
        .limit(1)
    )
    if job is None:
        return None
    job.status = "running"
    job.attempts += 1
    job.started_at = utcnow()
    session.flush()
    return job


def _run(session: Session, job: Job, config: Config, *, claimed_attempts: int) -> None:
    if job.status in {"succeeded", "cancelled"}:
        return
    if job.status != "running":
        job.status = "running"
        job.attempts += 1
        job.started_at = utcnow()
    job.progress = 10
    session.flush()
    func = HANDLERS.get(job.type)
    if func is None:
        job.status = "failed"
        job.error = f"未注册的任务类型：{job.type}"
        job.finished_at = utcnow()
        session.flush()
        return
    try:
        result = func(session, job, config)
        if job.cancel_requested:
            job.status = "cancelled"
            job.error = "任务已取消"
            job.finished_at = utcnow()
            session.flush()
            return
        job.result = result
        job.status = "succeeded"
        job.progress = 100
        job.error = ""
        job.finished_at = utcnow()
        session.flush()
    except ApiError as exc:
        _fail(session, job, config, exc.message)
    except Exception as exc:  # pragma: no cover - defensive
        _fail(session, job, config, f"{type(exc).__name__}: {exc}")
        traceback.print_exc()


def _fail(session: Session, job: Job, config: Config, message: str) -> None:
    job.error = message[:2000]
    if job.attempts < min(job.max_attempts, config.job_max_attempts):
        job.status = "queued"
        job.progress = 0
        job.started_at = None
    else:
        job.status = "failed"
        job.finished_at = utcnow()
    session.flush()


class Worker:
    def __init__(self, app: Flask) -> None:
        self.app = app
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, name="axiom-worker", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            processed = False
            try:
                with self.app.app_context():
                    config = self.app.config["AXIOM"]
                    with session_scope() as session:
                        job = claim_next(session)
                        if job is not None:
                            session.commit()
                            _run(session, job, config, claimed_attempts=1)
                            session.commit()
                            processed = True
            except Exception:  # pragma: no cover - worker resilience
                traceback.print_exc()
            if not processed:
                self._stop.wait(0.5)


def start_worker(app: Flask) -> Worker | None:
    config = app.config["AXIOM"]
    if not config.worker_enabled or config.testing:
        return None
    worker = Worker(app)
    worker.start()
    app.extensions["axiom_worker"] = worker
    return worker


def stop_worker(app: Flask) -> None:
    worker = app.extensions.get("axiom_worker")
    if worker is not None:
        worker.stop()


def retry_job(session: Session, job: Job) -> Job:
    if job.status not in {"failed", "cancelled"}:
        raise ApiError("conflict", "只有失败或已取消的任务可以重试")
    job.status = "queued"
    job.error = ""
    job.result = {}
    job.cancel_requested = False
    job.finished_at = None
    job.progress = 0
    session.flush()
    return job


def cancel_job(session: Session, job: Job) -> Job:
    if job.status in {"succeeded", "failed", "cancelled"}:
        raise ApiError("conflict", "任务已经结束")
    job.cancel_requested = True
    if job.status == "queued":
        job.status = "cancelled"
        job.finished_at = utcnow()
    session.flush()
    return job


def usage_summary(session: Session, user_id: str | None = None) -> dict[str, Any]:
    stmt = select(ModelCall)
    if user_id:
        stmt = stmt.where(ModelCall.user_id == user_id)
    calls = list(session.scalars(stmt.order_by(ModelCall.created_at.desc())))
    total_input = sum(call.input_tokens for call in calls)
    total_output = sum(call.output_tokens for call in calls)
    total_cost = sum(call.cost_estimate for call in calls)
    by_purpose: dict[str, dict[str, int]] = {}
    for call in calls:
        bucket = by_purpose.setdefault(
            call.purpose, {"calls": 0, "input_tokens": 0, "output_tokens": 0, "errors": 0}
        )
        bucket["calls"] += 1
        bucket["input_tokens"] += call.input_tokens
        bucket["output_tokens"] += call.output_tokens
        if call.status != "ok":
            bucket["errors"] += 1
    return {
        "calls": len(calls),
        "input_tokens": total_input,
        "output_tokens": total_output,
        "cost_estimate": total_cost,
        "failed_calls": sum(1 for call in calls if call.status != "ok"),
        "by_purpose": by_purpose,
        "recent": [
            {
                "id": call.id,
                "purpose": call.purpose,
                "model": call.model,
                "status": call.status,
                "latency_ms": call.latency_ms,
                "created_at": call.created_at.isoformat() if call.created_at else None,
            }
            for call in calls[:10]
        ],
    }
