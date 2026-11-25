"""API error types and JSON error envelope."""

from __future__ import annotations

from typing import Any

from flask import Flask, jsonify, request
from pydantic import BaseModel, ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException

ERROR_STATUS = {
    "bad_request": 400,
    "invalid_json": 400,
    "unauthorized": 401,
    "forbidden": 403,
    "not_found": 404,
    "method_not_allowed": 405,
    "conflict": 409,
    "payload_too_large": 413,
    "unsupported_media_type": 415,
    "unprocessable": 422,
    "rate_limited": 429,
    "internal": 500,
    "service_unavailable": 503,
    "upstream_error": 502,
}


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int | None = None,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status or ERROR_STATUS.get(code, 400)
        self.details = details
        self.headers = headers or {}


def _request_id() -> str:
    try:
        from flask import g

        return getattr(g, "request_id", "")
    except Exception:  # pragma: no cover - outside request context
        return ""


def error_response(error: ApiError):
    payload: dict[str, Any] = {
        "error": {
            "code": error.code,
            "message": error.message,
        },
        "request_id": _request_id(),
    }
    if error.details is not None:
        payload["error"]["details"] = error.details
    response = jsonify(payload)
    response.status_code = error.status
    for key, value in error.headers.items():
        response.headers[key] = value
    return response


def parse_json(model_cls: type[BaseModel]) -> Any:
    """Parse and validate a JSON request body against a Pydantic model."""

    if not request.is_json:
        raise ApiError(
            "unsupported_media_type",
            "请求必须使用 Content-Type: application/json",
        )
    payload = request.get_json(silent=True)
    if payload is None:
        raise ApiError("invalid_json", "请求体不是有效的 JSON")
    try:
        return model_cls.model_validate(payload)
    except ValidationError as exc:
        details = []
        for item in exc.errors():
            details.append(
                {
                    "loc": [str(part) for part in item.get("loc", ())],
                    "msg": item.get("msg", ""),
                    "type": item.get("type", ""),
                }
            )
        raise ApiError("unprocessable", "请求参数校验失败", details=details)


def parse_query(model_cls: type[BaseModel], values: dict[str, Any] | None = None) -> Any:
    source = values if values is not None else request.args.to_dict(flat=True)
    try:
        return model_cls.model_validate(source)
    except ValidationError as exc:
        details = [
            {
                "loc": [str(part) for part in item.get("loc", ())],
                "msg": item.get("msg", ""),
                "type": item.get("type", ""),
            }
            for item in exc.errors()
        ]
        raise ApiError("unprocessable", "查询参数校验失败", details=details)


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(error: ApiError):
        return error_response(error)

    @app.errorhandler(ValidationError)
    def _pydantic_error(error: ValidationError):
        return error_response(
            ApiError("unprocessable", "数据校验失败", details=error.errors(include_url=False))
        )

    @app.errorhandler(HTTPException)
    def _http_error(error: HTTPException):
        mapping = {
            400: "bad_request",
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            405: "method_not_allowed",
            413: "payload_too_large",
            415: "unsupported_media_type",
            429: "rate_limited",
        }
        code = mapping.get(error.code or 500, "internal")
        return error_response(ApiError(code, error.description or "请求失败", status=error.code))

    @app.errorhandler(IntegrityError)
    def _integrity_error(error: IntegrityError):
        try:
            from .db import get_session

            get_session().rollback()
        except Exception:
            pass
        app.logger.warning("integrity error: %s", error.orig)
        return error_response(
            ApiError("conflict", "该记录与已有数据冲突，请检查唯一标识或重复提交")
        )

    @app.errorhandler(Exception)
    def _unexpected(error: Exception):
        app.logger.exception("unhandled error: %s", error)
        return error_response(
            ApiError("internal", "服务端发生未预期错误，请稍后重试")
        )
