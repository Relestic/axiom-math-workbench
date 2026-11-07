"""Resolve, store and delete user-owned AI credentials safely."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..adapters.llm import AICredentials, provider_status
from ..errors import ApiError
from ..models import User, UserAICredential

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
ALLOWED_MODELS = {"deepseek-chat", "deepseek-reasoner"}
KEY_MIN_LENGTH = 12
KEY_MAX_LENGTH = 200


def _fernet(secret_key: str) -> Fernet:
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_api_key(api_key: str, secret_key: str) -> str:
    return _fernet(secret_key).encrypt(api_key.encode("utf-8")).decode("ascii")


def decrypt_api_key(value: str, secret_key: str) -> str:
    try:
        return _fernet(secret_key).decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError) as exc:
        raise ApiError(
            "service_unavailable",
            "已保存的 API Key 无法解密（服务端密钥可能已变更），请重新填写。",
        ) from exc


def _key_hint(api_key: str) -> str:
    return f"…{api_key[-4:]}" if len(api_key) >= 4 else ""


def _validate_key(api_key: str) -> str:
    key = api_key.strip()
    if not (KEY_MIN_LENGTH <= len(key) <= KEY_MAX_LENGTH):
        raise ApiError("validation_error", "API Key 长度不合法。")
    if not key.startswith("sk-"):
        raise ApiError("validation_error", "DeepSeek API Key 应以 sk- 开头。")
    if any(character.isspace() for character in key):
        raise ApiError("validation_error", "API Key 不能包含空格或换行。")
    return key


def get_user_credential(
    session: Session, user_id: str
) -> UserAICredential | None:
    return session.scalar(
        select(UserAICredential).where(UserAICredential.user_id == user_id)
    )


def resolve_user_credentials(
    session: Session, user_id: str, *, secret_key: str
) -> AICredentials | None:
    row = get_user_credential(session, user_id)
    if row is None:
        return None
    api_key = decrypt_api_key(row.encrypted_api_key, secret_key)
    return AICredentials(
        provider="deepseek",
        base_url=DEEPSEEK_BASE_URL,
        model=row.model,
        api_key=api_key,
        source="user",
        key_hint=row.key_hint,
    )


def user_ai_status(session: Session, user_id: str) -> dict:
    row = get_user_credential(session, user_id)
    if row is not None:
        reasoner = "reasoner" in row.model.lower() or "thinking" in row.model.lower()
        return {
            "configured": True,
            "active": True,
            "provider": "deepseek",
            "provider_label": "DeepSeek",
            "model": row.model,
            "endpoint_host": "api.deepseek.com",
            "json_mode": not reasoner,
            "reasoner": reasoner,
            "source": "user",
            "using_user_key": True,
            "key_hint": row.key_hint,
            "daily_limit": 0,
        }
    data = provider_status()
    data["source"] = "system" if data.get("active") else "none"
    data["using_user_key"] = False
    data["key_hint"] = ""
    return data


def save_user_credential(
    session: Session,
    user: User,
    *,
    api_key: str,
    model: str,
    secret_key: str,
) -> dict:
    key = _validate_key(api_key)
    if model not in ALLOWED_MODELS:
        raise ApiError("validation_error", "不支持这个 DeepSeek 模型。")
    row = get_user_credential(session, user.id)
    encrypted = encrypt_api_key(key, secret_key)
    hint = _key_hint(key)
    if row is None:
        row = UserAICredential(
            user_id=user.id,
            provider="deepseek",
            model=model,
            encrypted_api_key=encrypted,
            key_hint=hint,
        )
        session.add(row)
    else:
        row.provider = "deepseek"
        row.model = model
        row.encrypted_api_key = encrypted
        row.key_hint = hint
    session.flush()
    return user_ai_status(session, user.id)


def delete_user_credential(session: Session, user: User) -> dict:
    row = get_user_credential(session, user.id)
    if row is not None:
        session.delete(row)
        session.flush()
    return user_ai_status(session, user.id)
