"""Health, version and API documentation endpoints."""

from __future__ import annotations

import platform
import sys
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify
from sqlalchemy import text

from ..db import get_engine
from ..openapi import build_openapi

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    config = current_app.config["AXIOM"]
    database = "ok"
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover
        database = f"error: {type(exc).__name__}"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "service": "axiom-backend",
        "version": app_version(),
        "environment": config.env,
        "database": database,
        "worker": "sync" if config.worker_sync else ("enabled" if config.worker_enabled else "disabled"),
        "ai": {
            "provider": config.ai_provider,
            "configured": config.ai_configured,
            "active": config.ai_active,
        },
        "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


@bp.get("/version")
def version():
    return {
        "name": "Axiom 公理后端",
        "version": app_version(),
        "api": "v1",
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "docs": "/api/docs" if current_app.config["AXIOM"].docs_enabled else None,
    }


def app_version() -> str:
    try:
        from importlib.metadata import version

        return version("axiom-backend")
    except Exception:
        return "0.2.0"


@bp.get("/openapi.json")
def openapi_json():
    if not current_app.config["AXIOM"].docs_enabled:
        return jsonify({"error": {"code": "not_found", "message": "文档已关闭"}}), 404
    return jsonify(build_openapi(current_app._get_current_object()))


@bp.get("/docs")
def docs():
    if not current_app.config["AXIOM"].docs_enabled:
        return "文档已关闭", 404
    return DOCS_HTML


DOCS_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Axiom 后端 API</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
         background: #f6f7fb; color: #1c2033; }
  header { background: #14172b; color: #fff; padding: 28px 32px; }
  header h1 { margin: 0 0 6px; font-size: 24px; }
  header p { margin: 0; color: #b9c0dc; font-size: 14px; }
  main { max-width: 1080px; margin: 24px auto 64px; padding: 0 20px; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .toolbar input { flex: 1; min-width: 240px; padding: 10px 12px; border: 1px solid #d8dced;
                   border-radius: 10px; font-size: 14px; background: #fff; }
  .toolbar a { color: #4b56d2; font-size: 14px; text-decoration: none; }
  .tag { margin: 26px 0 10px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase;
         color: #6b7194; }
  details { background: #fff; border: 1px solid #e4e7f2; border-radius: 12px; margin-bottom: 10px;
            overflow: hidden; }
  summary { cursor: pointer; padding: 12px 16px; display: flex; gap: 12px; align-items: center; }
  summary::-webkit-details-marker { display: none; }
  .method { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;
            color: #fff; min-width: 56px; text-align: center; }
  .get { background: #2f8f5b; } .post { background: #4b56d2; } .patch { background: #b7791f; }
  .put { background: #7b3fb0; } .delete { background: #b83232; }
  code { font-family: "Cascadia Code", Consolas, monospace; font-size: 13px; }
  .summary { flex: 1; font-size: 14px; }
  .body { padding: 4px 16px 16px; border-top: 1px solid #eef0f7; }
  pre { background: #f7f8fc; padding: 12px; border-radius: 10px; overflow: auto; font-size: 12px;
        max-height: 380px; }
  .hint { color: #6b7194; font-size: 13px; }
  .auth { font-size: 11px; color: #8a4b00; background: #fff4df; padding: 2px 6px; border-radius: 6px; }
</style>
</head>
<body>
<header>
  <h1>Axiom 公理 · 后端 API</h1>
  <p>数学交互学习工作台 · 单机模块化单体 · Bearer JWT · <span id="count"></span></p>
</header>
<main>
  <div class="toolbar">
    <input id="search" placeholder="筛选路径或摘要…" />
    <a href="/api/openapi.json">OpenAPI JSON</a>
    <a href="/demo">打开试用台 →</a>
  </div>
  <div id="content"><p class="hint">正在加载接口清单…</p></div>
</main>
<script>
(async () => {
  const spec = await fetch('/api/openapi.json').then(r => r.json());
  const methods = ['get','post','patch','put','delete'];
  document.getElementById('count').textContent = Object.keys(spec.paths).length + ' 个路径';
  const content = document.getElementById('content');
  const groups = {};
  Object.entries(spec.paths).forEach(([path, ops]) => {
    Object.entries(ops).forEach(([method, op]) => {
      const tag = (op.tags || ['其他'])[0];
      (groups[tag] = groups[tag] || []).push({path, method, op});
    });
  });
  const render = (filter = '') => {
    content.innerHTML = '';
    Object.entries(groups).sort().forEach(([tag, items]) => {
      const visible = items.filter(item =>
        !filter || item.path.toLowerCase().includes(filter) ||
        (item.op.summary || '').toLowerCase().includes(filter));
      if (!visible.length) return;
      const heading = document.createElement('div');
      heading.className = 'tag'; heading.textContent = tag + ' · ' + visible.length;
      content.appendChild(heading);
      visible.forEach(({path, method, op}) => {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.innerHTML = `<span class="method ${method}">${method.toUpperCase()}</span>` +
          `<code>${path}</code><span class="summary">${op.summary || ''}</span>` +
          (op.security ? '<span class="auth">需要登录</span>' : '');
        const body = document.createElement('div');
        body.className = 'body';
        const schema = op.requestBody?.content?.['application/json']?.schema;
        body.innerHTML = `<p class="hint">${op.description || op.summary || ''}</p>` +
          (schema ? `<p class="hint">请求体：</p><pre>${JSON.stringify(schema, null, 2)}</pre>` : '') +
          `<p class="hint">响应：</p><pre>${JSON.stringify(op.responses, null, 2).slice(0, 4000)}</pre>`;
        details.appendChild(summary); details.appendChild(body);
        content.appendChild(details);
      });
    });
    if (!content.children.length) content.innerHTML = '<p class="hint">没有匹配的接口。</p>';
  };
  render();
  document.getElementById('search').addEventListener('input', e => render(e.target.value.trim().toLowerCase()));
})();
</script>
</body>
</html>
"""
