"""Environment-driven configuration for the Axiom backend.

The backend runs on Flask + SQLAlchemy + Pydantic. PostgreSQL and RabbitMQ are
production options; the default single-machine mode uses SQLite and an
in-process worker so a reviewer can start the service without infrastructure.
"""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEEPSEEK_MODELS = ("deepseek-flash", "deepseek-v4-pro")
DEEPSEEK_LEGACY_MODELS = {
    "deepseek-chat": DEEPSEEK_MODELS[0],
    "deepseek-reasoner": DEEPSEEK_MODELS[1],
}


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _csv(name: str, default: str) -> list[str]:
    raw = _env(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Config:
    env: str = "development"
    testing: bool = False
    local_mode: bool = False
    secret_key: str = "axiom-development-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_ttl_seconds: int = 30 * 60
    refresh_ttl_seconds: int = 14 * 24 * 60 * 60
    database_url: str = "sqlite:///" + str(BACKEND_DIR / "var" / "axiom.db")
    data_dir: Path = BACKEND_DIR / "var"
    auto_migrate: bool = True
    seed_on_start: bool = False
    cors_origins: list[str] = field(
        default_factory=lambda: [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
            "http://127.0.0.1:5175",
            "http://localhost:5175",
            "http://127.0.0.1:3080",
            "http://localhost:3080",
        ]
    )
    admin_email: str = "admin@axiom.local"
    admin_password: str = "axiom-admin-2026"
    demo_invite_code: str = "AXIOM-DEMO-2026"
    worker_enabled: bool = True
    worker_sync: bool = False
    worker_interval_seconds: float = 0.5
    job_timeout_seconds: int = 600
    job_max_attempts: int = 2
    max_upload_mb: int = 50
    max_content_length: int = 60 * 1024 * 1024
    timezone: str = "Asia/Shanghai"
    ai_base_url: str = ""
    ai_model: str = ""
    ai_api_key: str = field(default="", repr=False)
    ai_provider: str = "none"  # none | openai | deepseek | mock
    ai_json_mode: bool = True
    ai_timeout_seconds: int = 60
    ai_daily_call_limit: int = 200
    ai_legacy_daily_limit: int = 80
    ai_prompt_version: str = "2026-11-06.1"
    pdf_tool: str = "auto"  # auto | none
    legacy_ai_enabled: bool = True
    log_level: str = "INFO"
    docs_enabled: bool = True

    @property
    def is_production(self) -> bool:
        return self.env.lower() in {"production", "prod"}

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_base_url and self.ai_model and self.ai_api_key)

    @property
    def ai_active(self) -> bool:
        return self.ai_provider == "mock" or self.ai_configured

    @property
    def ai_provider_label(self) -> str:
        return {
            "deepseek": "DeepSeek",
            "openai": "OpenAI-compatible",
            "mock": "Mock",
            "none": "未配置",
        }.get(self.ai_provider, self.ai_provider)

    @property
    def ai_is_reasoner(self) -> bool:
        return "reasoner" in self.ai_model.lower() or "thinking" in self.ai_model.lower()

    @property
    def ai_json_effective(self) -> bool:
        # Keep the existing opt-out for providers with reasoning-only models.
        return bool(self.ai_json_mode and not self.ai_is_reasoner)

    @property
    def ai_endpoint(self) -> str:
        return self.ai_base_url.rstrip("/") + "/chat/completions"

    def validate(self) -> None:
        if self.is_production:
            weak_secrets = {
                "",
                "axiom-development-secret-change-me",
                "change-me-to-a-long-random-string",
            }
            if self.secret_key in weak_secrets or len(self.secret_key) < 32:
                raise RuntimeError(
                    "AXIOM_SECRET_KEY must be a strong random value of at least 32 characters"
                )
            weak_passwords = {
                "axiom-admin-2026",
                "change-me",
                "password",
            }
            if self.admin_password in weak_passwords or len(self.admin_password) < 12:
                raise RuntimeError(
                    "AXIOM_ADMIN_PASSWORD must be changed before production startup"
                )
        if self.ai_base_url:
            parsed = urlparse(self.ai_base_url)
            local = parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            if not (
                parsed.scheme == "https" or (parsed.scheme == "http" and local)
            ):
                raise RuntimeError(
                    "AI_BASE_URL must use HTTPS (localhost HTTP is allowed for local models)"
                )
            if parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise RuntimeError("AI_BASE_URL must not contain credentials or query strings")
        if self.database_url.startswith("sqlite"):
            self.data_dir.mkdir(parents=True, exist_ok=True)
        try:
            from zoneinfo import ZoneInfo

            ZoneInfo(self.timezone)
        except Exception as exc:
            raise RuntimeError(f"invalid AXIOM_TIMEZONE: {self.timezone}") from exc


def load_config(overrides: dict[str, Any] | None = None) -> Config:
    """Build a Config from the environment, then apply explicit overrides."""

    try:
        from dotenv import load_dotenv

        load_dotenv(BACKEND_DIR / ".env", override=False)
    except Exception:
        pass

    database_url = _env("AXIOM_DB_URL", "")
    data_dir = Path(_env("AXIOM_DATA_DIR", str(BACKEND_DIR / "var"))).expanduser()
    if not database_url:
        database_url = "sqlite:///" + str(data_dir / "axiom.db")

    secret = _env("AXIOM_SECRET_KEY", "")
    if not secret:
        if _env("AXIOM_ENV", "development").lower() in {"production", "prod"}:
            secret = ""
        else:
            secret = "axiom-development-secret-change-me"

    ai_provider = _env("AXIOM_AI_PROVIDER", "none").lower().strip()
    ai_base_url = _env("AI_BASE_URL", "").strip()
    ai_model = _env("AI_MODEL", "").strip()
    ai_api_key = _env("AI_API_KEY", "").strip()

    if ai_provider == "openai" and not ai_base_url:
        ai_base_url = "https://api.openai.com/v1"
    elif ai_provider == "none" and ai_base_url:
        # Preserve existing deployments that only set AI_BASE_URL.
        ai_provider = "deepseek" if "deepseek" in ai_base_url.lower() else "openai"

    config = Config(
        env=_env("AXIOM_ENV", "development"),
        testing=_flag("AXIOM_TESTING", False),
        secret_key=secret,
        access_ttl_seconds=_int("AXIOM_ACCESS_TTL_SECONDS", 30 * 60),
        refresh_ttl_seconds=_int("AXIOM_REFRESH_TTL_SECONDS", 14 * 24 * 60 * 60),
        database_url=database_url,
        data_dir=data_dir,
        auto_migrate=_flag("AXIOM_AUTO_MIGRATE", True),
        seed_on_start=_flag("AXIOM_SEED_ON_START", False),
        cors_origins=_csv(
            "AXIOM_CORS_ORIGINS",
            "http://127.0.0.1:5174,http://localhost:5174,"
            "http://127.0.0.1:5175,http://localhost:5175,"
            "http://127.0.0.1:3080,http://localhost:3080",
        ),
        admin_email=_env("AXIOM_ADMIN_EMAIL", "admin@axiom.local").lower(),
        admin_password=_env("AXIOM_ADMIN_PASSWORD", "axiom-admin-2026"),
        demo_invite_code=_env("AXIOM_DEMO_INVITE_CODE", "AXIOM-DEMO-2026"),
        worker_enabled=_flag("AXIOM_WORKER_ENABLED", True),
        worker_sync=_flag("AXIOM_WORKER_SYNC", False),
        worker_interval_seconds=float(_env("AXIOM_WORKER_INTERVAL", "0.5") or 0.5),
        job_timeout_seconds=_int("AXIOM_JOB_TIMEOUT", 600),
        job_max_attempts=_int("AXIOM_JOB_MAX_ATTEMPTS", 2),
        max_upload_mb=_int("AXIOM_MAX_UPLOAD_MB", 50),
        max_content_length=_int("AXIOM_MAX_CONTENT_LENGTH", 60 * 1024 * 1024),
        timezone=_env("AXIOM_TIMEZONE", "Asia/Shanghai"),
        ai_base_url=ai_base_url,
        ai_model=ai_model,
        ai_api_key=ai_api_key,
        ai_provider=ai_provider,
        ai_json_mode=_flag("AI_JSON_MODE", True),
        ai_timeout_seconds=_int("AI_TIMEOUT_SECONDS", 60),
        ai_daily_call_limit=_int("AXIOM_AI_DAILY_CALL_LIMIT", 200),
        ai_legacy_daily_limit=_int("AXIOM_AI_LEGACY_DAILY_LIMIT", 80),
        ai_prompt_version=_env("AXIOM_AI_PROMPT_VERSION", "2026-11-06.1"),
        pdf_tool=_env("AXIOM_PDF_TOOL", "auto").lower(),
        legacy_ai_enabled=_flag("AXIOM_LEGACY_AI", True),
        log_level=_env("AXIOM_LOG_LEVEL", "INFO").upper(),
        docs_enabled=_flag("AXIOM_DOCS_ENABLED", True),
    )
    if overrides:
        for key, value in overrides.items():
            if not hasattr(config, key):
                raise KeyError(f"unknown config override: {key}")
            if key == "data_dir" and not isinstance(value, Path):
                value = Path(value).expanduser()
            setattr(config, key, value)
        if config.database_url.startswith("sqlite"):
            config.data_dir.mkdir(parents=True, exist_ok=True)
    if config.ai_provider == "deepseek":
        config.ai_base_url = config.ai_base_url or "https://api.deepseek.com"
        config.ai_model = DEEPSEEK_LEGACY_MODELS.get(config.ai_model, config.ai_model) or DEEPSEEK_MODELS[0]
    config.validate()
    return config


def new_secret() -> str:
    return secrets.token_urlsafe(48)
