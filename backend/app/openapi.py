"""Lightweight OpenAPI 3.1 document generated from the live Flask URL map.

Request schemas are taken from the Pydantic models used by the handlers. This
keeps the published contract aligned with validation without a second route
registry.
"""

from __future__ import annotations

import re
from typing import Any

from flask import Flask
from pydantic import BaseModel

from .schemas.auth import (
    ChangePasswordRequest,
    InviteCreateRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    UpdateMeRequest,
)
from .schemas.ai import AICredentialRequest
from .schemas.content import GraphQuery, ImportTextRequest
from .schemas.learning import (
    AttemptCreateRequest,
    BookmarkCreateRequest,
    DiagnosticSubmitRequest,
    NoteCreateRequest,
    NoteUpdateRequest,
    ReportCreateRequest,
)
from .schemas.surface import SurfaceAIRequest
from .schemas.visual import (
    AIPlotRequest,
    InterpretRequest,
    ObservationCreateRequest,
    SceneCreateRequest,
    SceneModel,
    SceneUpdateRequest,
    ValidateSceneRequest,
)

PUBLIC_PATHS = {
    "/api/health",
    "/api/version",
    "/api/openapi.json",
    "/api/docs",
    "/demo",
    "/api/console",
    "/api/ai/status",
    "/api/ai/plot",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
}

REQUEST_MODELS: dict[tuple[str, str], type[BaseModel]] = {
    ("post", "/api/v1/auth/register"): RegisterRequest,
    ("post", "/api/v1/auth/login"): LoginRequest,
    ("post", "/api/v1/auth/refresh"): RefreshRequest,
    ("patch", "/api/v1/auth/me"): UpdateMeRequest,
    ("post", "/api/v1/auth/password"): ChangePasswordRequest,
    ("post", "/api/v1/admin/invites"): InviteCreateRequest,
    ("post", "/api/v1/visualizations/validate"): ValidateSceneRequest,
    ("post", "/api/v1/visualizations/scenes"): SceneCreateRequest,
    ("patch", "/api/v1/visualizations/scenes/{scene_id}"): SceneUpdateRequest,
    ("post", "/api/v1/visualizations/scenes/{scene_id}/observations"): ObservationCreateRequest,
    ("post", "/api/v1/ai/plot"): AIPlotRequest,
    ("post", "/api/v1/ai/surface"): SurfaceAIRequest,
    ("put", "/api/v1/ai/credentials"): AICredentialRequest,
    ("post", "/api/ai/plot"): AIPlotRequest,
    ("post", "/api/v1/ai/interpret"): InterpretRequest,
    ("post", "/api/v1/attempts"): AttemptCreateRequest,
    ("post", "/api/v1/notes"): NoteCreateRequest,
    ("patch", "/api/v1/notes/{note_id}"): NoteUpdateRequest,
    ("post", "/api/v1/bookmarks"): BookmarkCreateRequest,
    ("post", "/api/v1/reports"): ReportCreateRequest,
    ("post", "/api/v1/diagnostic"): DiagnosticSubmitRequest,
    ("post", "/api/v1/admin/import/text"): ImportTextRequest,
}

SCHEMAS: dict[str, type[BaseModel]] = {
    "RegisterRequest": RegisterRequest,
    "LoginRequest": LoginRequest,
    "RefreshRequest": RefreshRequest,
    "UpdateMeRequest": UpdateMeRequest,
    "ChangePasswordRequest": ChangePasswordRequest,
    "InviteCreateRequest": InviteCreateRequest,
    "Scene": SceneModel,
    "ValidateSceneRequest": ValidateSceneRequest,
    "SceneCreateRequest": SceneCreateRequest,
    "SceneUpdateRequest": SceneUpdateRequest,
    "ObservationCreateRequest": ObservationCreateRequest,
    "AIPlotRequest": AIPlotRequest,
    "SurfaceAIRequest": SurfaceAIRequest,
    "AICredentialRequest": AICredentialRequest,
    "InterpretRequest": InterpretRequest,
    "AttemptCreateRequest": AttemptCreateRequest,
    "NoteCreateRequest": NoteCreateRequest,
    "NoteUpdateRequest": NoteUpdateRequest,
    "BookmarkCreateRequest": BookmarkCreateRequest,
    "ReportCreateRequest": ReportCreateRequest,
    "DiagnosticSubmitRequest": DiagnosticSubmitRequest,
    "ImportTextRequest": ImportTextRequest,
}


def _path(rule: str) -> str:
    return re.sub(r"<(?:[^:>]+:)?([^>]+)>", r"{\1}", rule)


def _tags(endpoint: str) -> list[str]:
    parts = endpoint.split(".")
    return [parts[0] if parts else "api"]


def _summary(func) -> str:
    doc = (func.__doc__ or "").strip()
    if doc:
        return doc.splitlines()[0][:120]
    return func.__name__.replace("_", " ")


def _merge_defs(components: dict[str, Any]) -> None:
    """Lift Pydantic ``$defs`` into components and rewrite their references."""

    def walk(node):
        if isinstance(node, dict):
            defs = node.pop("$defs", None)
            if isinstance(defs, dict):
                for name, schema in defs.items():
                    components.setdefault(name, schema)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for schema in list(components.values()):
        walk(schema)

    def rewrite(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "$ref" and isinstance(value, str):
                    node[key] = value.replace("#/$defs/", "#/components/schemas/")
                else:
                    rewrite(value)
        elif isinstance(node, list):
            for value in node:
                rewrite(value)

    rewrite(components)


def build_openapi(app: Flask) -> dict[str, Any]:
    paths: dict[str, dict[str, Any]] = {}
    components_schemas: dict[str, Any] = {}
    for name, model in SCHEMAS.items():
        schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
        components_schemas[name] = schema
    _merge_defs(components_schemas)
    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        route = _path(str(rule))
        if not route.startswith("/api"):
            continue
        for method in sorted(rule.methods or []):
            if method in {"HEAD", "OPTIONS"}:
                continue
            func = app.view_functions.get(rule.endpoint)
            operation: dict[str, Any] = {
                "tags": _tags(rule.endpoint),
                "summary": _summary(func) if func else rule.endpoint,
                "operationId": f"{method.lower()}_{rule.endpoint.replace('.', '_')}",
                "parameters": [],
                "responses": {
                    "200": {"description": "成功"},
                    "400": {"$ref": "#/components/responses/BadRequest"},
                    "401": {"$ref": "#/components/responses/Unauthorized"},
                    "403": {"$ref": "#/components/responses/Forbidden"},
                    "404": {"$ref": "#/components/responses/NotFound"},
                    "422": {"$ref": "#/components/responses/Unprocessable"},
                },
            }
            for argument in rule.arguments:
                operation["parameters"].append(
                    {
                        "name": argument,
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    }
                )
            model = REQUEST_MODELS.get((method.lower(), route))
            if model is not None:
                schema_name = model.__name__
                if schema_name not in components_schemas:
                    components_schemas[schema_name] = model.model_json_schema(
                        ref_template="#/components/schemas/{model}"
                    )
                    _merge_defs(components_schemas)
                operation["requestBody"] = {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": f"#/components/schemas/{schema_name}"}
                        }
                    },
                }
            if route not in PUBLIC_PATHS:
                operation["security"] = [{"bearerAuth": []}]
                operation["responses"]["429"] = {"$ref": "#/components/responses/RateLimited"}
            paths.setdefault(route, {})[method.lower()] = operation

    _merge_defs(components_schemas)
    components_schemas["Error"] = {
        "type": "object",
        "properties": {
            "error": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                    "details": {},
                },
                "required": ["code", "message"],
            },
            "request_id": {"type": "string"},
        },
        "required": ["error"],
    }
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "Axiom 公理 · 后端 API",
            "version": "0.2.0",
            "description": (
                "数学交互学习工作台的后端：教材与知识卡片、知识图谱、"
                "可视化场景、练习与作答、学习进度、管理员导入与任务队列。"
                "所有数值图像结果都标注为数值证据，不构成证明。"
            ),
        },
        "servers": [{"url": "http://127.0.0.1:8000", "description": "本地单机模式"}],
        "tags": [
            {"name": "health", "description": "健康检查"},
            {"name": "auth", "description": "账号与邀请"},
            {"name": "catalog", "description": "教材、知识点、经典案例与搜索"},
            {"name": "graph", "description": "知识图谱与前置缺口"},
            {"name": "visualizations", "description": "图像模板、场景与观察"},
            {"name": "exercises", "description": "练习、提示、解答与作答"},
            {"name": "progress", "description": "仪表盘、练习热力图与诊断"},
            {"name": "notes", "description": "笔记与收藏"},
            {"name": "reports", "description": "内容纠错"},
            {"name": "ai", "description": "模型辅助改图、解释与反馈"},
            {"name": "legacy_ai", "description": "与既有前端兼容的本地 AI 接口"},
            {"name": "admin", "description": "管理员内容审核、导入与任务"},
        ],
        "paths": dict(sorted(paths.items())),
        "components": {
            "schemas": components_schemas,
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                }
            },
            "responses": {
                "BadRequest": {
                    "description": "请求格式错误",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "Unauthorized": {
                    "description": "未登录或凭证失效",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "Forbidden": {
                    "description": "无权访问",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "NotFound": {
                    "description": "资源不存在或未发布",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "Unprocessable": {
                    "description": "参数校验失败",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
                "RateLimited": {
                    "description": "请求频率过高",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/Error"}
                        }
                    },
                },
            },
        },
    }
