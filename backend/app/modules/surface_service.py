"""AI-assisted changes for the interactive 3D surface scene."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..adapters.llm import chat
from ..models import User
from ..schemas.surface import SurfaceScene

SURFACE_SYSTEM = """你是 Axiom 三维曲面工作区助手。根据当前 scene 和用户对话修改曲面与相机，而不是切换页面。
只返回 JSON 对象：{"message":"中文说明","scene":完整 scene 或 null}。输出必须是合法 json，不要代码围栏。
scene 字段必须全部返回：expression（只含 x、y 的曲面表达式），xMin、xMax、yMin、yMax（-20 到 20），
resolution（10 到 64 的整数），view{azimuth 0-360, elevation 5-85, heightScale 0.2-3, zoom 0.5-2}，
display{opacity 0.2-1, wireframe 布尔, showAxes 布尔, palette 为 violet/teal/amber/mono}。
一次只修改用户明确要求的内容，保留未提及的字段。不要生成 JavaScript、Python 或任意代码。
曲面表达式的自变量固定为 x、y；不支持参数滑块。"""


def _parse_surface_result(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型没有返回 JSON") from exc
    if not isinstance(data, dict):
        raise ValueError("模型返回值必须是对象")
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ValueError("模型没有返回说明")
    raw_scene = data.get("scene")
    if raw_scene is None:
        return {"message": message.strip()[:2000], "scene": None}
    try:
        scene = SurfaceScene.model_validate(raw_scene)
    except Exception as exc:
        raise ValueError(f"三维 scene 未通过结构校验：{exc}") from exc
    return {
        "message": message.strip()[:2000],
        "scene": scene.model_dump(),
    }


def plot_surface_change(
    session: Session,
    user: User | None,
    *,
    message: str,
    scene: dict[str, Any],
    history: list[dict] | None = None,
) -> dict[str, Any]:
    current = SurfaceScene.model_validate(scene).model_dump()
    messages: list[dict] = [{"role": "system", "content": SURFACE_SYSTEM}]
    for item in (history or [])[-8:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str) and content:
            messages.append({"role": role, "content": content[:3000]})
    messages.append(
        {
            "role": "user",
            "content": json.dumps(
                {"currentSurface": current, "request": message},
                ensure_ascii=False,
            ),
        }
    )
    result, parsed = chat(
        session,
        messages,
        purpose="surface_plot",
        user_id=user.id if user else None,
        json_mode=True,
        max_tokens=1800,
        validator=_parse_surface_result,
    )
    assert parsed is not None
    return {
        **parsed,
        "provider": result.provider,
        "model": result.model,
    }
