"""Authentication, invite registration and bearer-token authorisation."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable, Iterable

import jwt
from flask import current_app, g, request
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_session
from .errors import ApiError
from .models import AuthEvent, Invite, RefreshToken, User, utcnow

ACCESS_TTL_DEFAULT = 1800
REFRESH_TTL_DEFAULT = 14 * 24 * 3600


def _config():
    return current_app.config["AXIOM"]


def client_ip() -> str:
    return (request.remote_addr or "unknown")[:64]


def user_agent() -> str:
    return request.headers.get("User-Agent", "")[:255]


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except (ValueError, TypeError):
        return False


def password_problem(password: str) -> str | None:
    if len(password) < 10:
        return "密码至少需要 10 个字符"
    if len(password) > 200:
        return "密码过长"
    if password.lower() in {"password12", "1234567890", "axiom-admin"}:
        return "密码过于常见，请换一个"
    return None


def invite_hash(code: str) -> str:
    normalized = code.strip().upper()
    key = _config().secret_key.encode("utf-8")
    return hmac.new(key, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def invite_prefix(code: str) -> str:
    normalized = code.strip().upper()
    return normalized[:10]


def create_access_token(user: User) -> tuple[str, int]:
    config = _config()
    ttl = int(config.access_ttl_seconds or ACCESS_TTL_DEFAULT)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "role": user.role,
        "type": "access",
        "jti": secrets.token_hex(12),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "iss": "axiom",
        "aud": "axiom-web",
    }
    token = jwt.encode(payload, config.secret_key, algorithm=config.jwt_algorithm)
    return token, ttl


def decode_access_token(token: str) -> dict:
    config = _config()
    try:
        return jwt.decode(
            token,
            config.secret_key,
            algorithms=[config.jwt_algorithm],
            audience="axiom-web",
            issuer="axiom",
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError:
        raise ApiError("unauthorized", "登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise ApiError("unauthorized", "登录凭证无效")


def _hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_refresh_token(session: Session, user: User) -> str:
    config = _config()
    ttl = int(config.refresh_ttl_seconds or REFRESH_TTL_DEFAULT)
    plain = secrets.token_urlsafe(48)
    row = RefreshToken(
        user_id=user.id,
        token_hash=_hash_refresh(plain),
        expires_at=utcnow() + timedelta(seconds=ttl),
        user_agent=user_agent(),
        ip=client_ip(),
    )
    session.add(row)
    return plain


def rotate_refresh_token(session: Session, plain: str) -> tuple[User, str]:
    digest = _hash_refresh(plain)
    row = session.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    if row is None:
        raise ApiError("unauthorized", "刷新凭证无效，请重新登录")
    if row.revoked_at is not None:
        if row.replaced_by_id:
            # A rotated token being replayed means it may have leaked: revoke
            # every active token in the family.
            session.execute(
                update(RefreshToken)
                .where(
                    RefreshToken.user_id == row.user_id,
                    RefreshToken.revoked_at.is_(None),
                )
                .values(revoked_at=utcnow())
            )
            session.add(
                AuthEvent(
                    user_id=row.user_id,
                    kind="refresh_reuse",
                    ip=client_ip(),
                    user_agent=user_agent(),
                    detail={"token_id": row.id},
                )
            )
            session.commit()
        raise ApiError("unauthorized", "刷新凭证已失效，请重新登录")
    expires = row.expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires is None or expires < utcnow():
        raise ApiError("unauthorized", "刷新凭证已过期，请重新登录")
    user = session.get(User, row.user_id)
    if user is None or not user.is_active:
        raise ApiError("unauthorized", "账号不可用")
    new_plain = issue_refresh_token(session, user)
    session.flush()
    new_row = session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == _hash_refresh(new_plain)
        )
    )
    row.revoked_at = utcnow()
    row.replaced_by_id = new_row.id if new_row else None
    session.add(row)
    session.commit()
    return user, new_plain


def revoke_refresh_token(session: Session, plain: str) -> None:
    digest = _hash_refresh(plain)
    row = session.scalar(select(RefreshToken).where(RefreshToken.token_hash == digest))
    if row is not None and row.revoked_at is None:
        row.revoked_at = utcnow()
        session.add(row)


def consume_invite(session: Session, code: str) -> Invite:
    digest = invite_hash(code)
    row = session.scalar(select(Invite).where(Invite.code_hash == digest))
    if row is None:
        raise ApiError("forbidden", "邀请码无效")
    if row.used_at is not None:
        raise ApiError("forbidden", "邀请码已被使用")
    expires = row.expires_at
    if expires is not None:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < utcnow():
            raise ApiError("forbidden", "邀请码已过期")
    return row


def mark_invite_used(session: Session, invite: Invite, user_id: str) -> bool:
    result = session.execute(
        update(Invite)
        .where(Invite.id == invite.id, Invite.used_at.is_(None))
        .values(used_at=utcnow(), used_by_id=user_id)
    )
    return result.rowcount == 1


def current_user() -> User:
    user = getattr(g, "current_user", None)
    if user is None:
        raise ApiError("unauthorized", "需要登录")
    return user


def _extract_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header:
        parts = header.split(" ", 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise ApiError("unauthorized", "Authorization 头格式应为 Bearer <token>")
        return parts[1].strip()
    return None


def require_auth(*roles: str) -> Callable:
    allowed: Iterable[str] = roles

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            token = _extract_token()
            if not token:
                raise ApiError(
                    "unauthorized",
                    "需要登录后访问",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            payload = decode_access_token(token)
            if payload.get("type") != "access":
                raise ApiError("unauthorized", "凭证类型不正确")
            session = get_session()
            user = session.get(User, payload.get("sub"))
            if user is None or not user.is_active:
                raise ApiError("unauthorized", "账号不存在或已停用")
            if allowed and user.role not in allowed:
                raise ApiError("forbidden", "当前账号无权执行该操作")
            g.current_user = user
            g.current_session = session
            return func(*args, **kwargs)

        return wrapper

    return decorator


def require_admin(func: Callable) -> Callable:
    return require_auth("admin")(func)


def record_auth_event(
    session: Session,
    kind: str,
    *,
    user_id: str | None = None,
    email: str = "",
    detail: dict | None = None,
) -> None:
    session.add(
        AuthEvent(
            user_id=user_id,
            email=email[:255],
            kind=kind,
            ip=client_ip(),
            user_agent=user_agent(),
            detail=detail or {},
        )
    )
