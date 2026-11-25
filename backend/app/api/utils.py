"""Helpers shared by API blueprints."""

from __future__ import annotations

from typing import Any

from flask import current_app, g, request

from ..errors import ApiError


def limit(name: str, key: str | None = None) -> None:
    limiters = current_app.extensions.get("axiom_limiters", {})
    limiter = limiters.get(name)
    if limiter is None:
        return
    identifier = key or request.remote_addr or "anonymous"
    allowed, retry_after = limiter.hit(identifier)
    if not allowed:
        raise ApiError(
            "rate_limited",
            "请求过于频繁，请稍后再试",
            headers={"Retry-After": str(retry_after)},
        )


def request_id() -> str:
    return getattr(g, "request_id", "")


def pagination(limit_value: int, offset: int, total: int) -> dict[str, Any]:
    return {
        "limit": limit_value,
        "offset": offset,
        "total": total,
        "next_offset": offset + limit_value if offset + limit_value < total else None,
    }
