"""Flask application factory."""

from __future__ import annotations

import atexit
import logging
import sys
import uuid
from datetime import datetime, timezone

from flask import Flask, Response, g, jsonify, make_response, request
from werkzeug.exceptions import HTTPException

from .config import Config, load_config
from .db import close_session, get_engine, init_db
from .errors import ApiError, error_response, register_error_handlers
from .ratelimit import SlidingWindowLimiter


def _configure_logging(level: str) -> None:
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        root.addHandler(handler)
    root.setLevel(level)
    logging.getLogger("werkzeug").setLevel(max(logging.WARNING, root.level))


def _request_id() -> str:
    incoming = request.headers.get("X-Request-ID", "")
    if incoming and 8 <= len(incoming) <= 64 and all(
        char.isalnum() or char in "-_" for char in incoming
    ):
        return incoming
    return uuid.uuid4().hex


def _cors_origin(config: Config, origin: str | None) -> str | None:
    if not origin:
        return None
    if origin in config.cors_origins:
        return origin
    return None


def create_app(overrides: dict | None = None) -> Flask:
    config = load_config(overrides)
    app = Flask(__name__)
    app.config["AXIOM"] = config
    app.config["MAX_CONTENT_LENGTH"] = config.max_content_length
    app.config["PROPAGATE_EXCEPTIONS"] = False
    app.json.ensure_ascii = False
    app.json.sort_keys = False

    _configure_logging(config.log_level)
    init_db(config.database_url)

    if config.auto_migrate:
        from migrations.runner import migrate

        applied = migrate(get_engine())
        if applied:
            app.logger.info("applied migrations: %s", ", ".join(applied))

    if config.seed_on_start:
        from .db import session_scope
        from .seed.loader import seed_all

        with app.app_context():
            with session_scope() as session:
                result = seed_all(session, config)
            app.logger.info("seeded content: %s", result["content"]["counts"])

    from .adapters.local_key import LocalKeyStore

    app.extensions["axiom_local_key"] = LocalKeyStore(config.data_dir)
    app.extensions["axiom_limiters"] = {
        "global": SlidingWindowLimiter(900, 60),
        "login": SlidingWindowLimiter(10, 300),
        "register": SlidingWindowLimiter(5, 3600),
        "refresh": SlidingWindowLimiter(30, 300),
        "ai": SlidingWindowLimiter(30, 3600),
        "legacy_ai": SlidingWindowLimiter(20, 3600),
    }

    @app.before_request
    def _before():
        g.request_id = _request_id()
        g.started_at = datetime.now(timezone.utc)
        if request.method == "OPTIONS":
            response = make_response("", 204)
            origin = _cors_origin(config, request.headers.get("Origin"))
            if origin:
                _apply_cors(response, origin)
            return response
        limiter = app.extensions["axiom_limiters"]["global"]
        allowed, retry_after = limiter.hit(request.remote_addr or "unknown")
        if not allowed:
            raise ApiError(
                "rate_limited",
                "请求过于频繁，请稍后再试",
                headers={"Retry-After": str(retry_after)},
            )

    @app.after_request
    def _after(response: Response):
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = response.headers.get(
            "Cache-Control", "no-store"
        )
        origin = _cors_origin(config, request.headers.get("Origin"))
        if origin:
            _apply_cors(response, origin)
        if config.is_production and request.is_secure:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        if request.path.startswith("/api") and response.status_code >= 400:
            app.logger.info(
                "request_id=%s method=%s path=%s status=%s",
                getattr(g, "request_id", ""),
                request.method,
                request.path,
                response.status_code,
            )
        return response

    @app.teardown_appcontext
    def _teardown(_exc):
        close_session(_exc)

    register_error_handlers(app)

    from .api.admin import bp as admin_bp
    from .api.ai import bp as ai_bp
    from .api.ai import legacy_bp
    from .api.archive import bp as archive_bp
    from .api.auth import bp as auth_bp
    from .api.bootstrap import bp as bootstrap_bp
    from .api.catalog import bp as catalog_bp
    from .api.console import bp as console_bp
    from .api.exercises import bp as exercises_bp
    from .api.graph import bp as graph_bp
    from .api.health import bp as health_bp
    from .api.notes import bp as notes_bp
    from .api.progress import bp as progress_bp
    from .api.reports import bp as reports_bp
    from .api.visual import bp as visual_bp

    for blueprint in (
        health_bp,
        console_bp,
        auth_bp,
        bootstrap_bp,
        catalog_bp,
        graph_bp,
        visual_bp,
        exercises_bp,
        progress_bp,
        notes_bp,
        reports_bp,
        ai_bp,
        archive_bp,
        legacy_bp,
        admin_bp,
    ):
        app.register_blueprint(blueprint)

    if not config.testing:
        from .workers.queue import start_worker, stop_worker

        worker = start_worker(app)
        if worker is not None:
            atexit.register(lambda: stop_worker(app))

    @app.get("/")
    def index():
        return {
            "service": "Axiom 公理后端",
            "api": "/api/v1",
            "health": "/api/health",
            "docs": "/api/docs" if config.docs_enabled else None,
            "try": "/demo",
        }

    return app


def _apply_cors(response: Response, origin: str) -> None:
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = (
        "Authorization, Content-Type, Idempotency-Key, X-Request-ID"
    )
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PATCH, PUT, DELETE, OPTIONS"
    )
    response.headers["Access-Control-Expose-Headers"] = "X-Request-ID, Retry-After"
    response.headers["Access-Control-Max-Age"] = "600"
