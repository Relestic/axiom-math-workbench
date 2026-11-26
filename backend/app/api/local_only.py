"""Restrict workstation capabilities to explicitly enabled loopback servers."""

from urllib.parse import urlsplit

from flask import current_app, request

from sqlalchemy import select

from ..errors import ApiError
from ..models import User


def _loopback_origin(origin: str) -> bool:
    try:
        parsed = urlsplit(origin)
        if parsed.port is not None and parsed.port == 0:
            return False
        return (
            parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            and parsed.username is None
            and parsed.password is None
            and origin == f"http://{parsed.netloc}"
        )
    except ValueError:
        return False


def require_local() -> None:
    config = current_app.config["AXIOM"]
    if not config.local_mode or config.is_production:
        raise ApiError("not_found", "本地功能未启用")
    endpoint = f"http://{request.host}"
    origin = request.headers.get("Origin")
    if (
        request.remote_addr not in {"127.0.0.1", "::1"}
        or not _loopback_origin(endpoint)
        or "Forwarded" in request.headers
        or any(name.lower().startswith("x-forwarded-") for name in request.headers.keys())
        or request.headers.get("Via")
        or (
            origin is not None
            and (not _loopback_origin(origin) or origin not in {endpoint, *config.cors_origins})
        )
        or (origin is None and request.headers.get("Sec-Fetch-Site") == "cross-site")
    ):
        raise ApiError("forbidden", "仅允许本机工作台访问")


def local_learner(session):
    learner = session.scalar(select(User).where(User.email == "demo@axiom.local", User.is_active.is_(True)))
    if learner is None:
        raise ApiError("service_unavailable", "本机学习者尚未初始化，请通过启动工作台打开")
    return learner
