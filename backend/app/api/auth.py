"""Account, session and password endpoints."""

from __future__ import annotations

from datetime import timedelta

from flask import Blueprint, current_app, request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..auth import (
    client_ip,
    consume_invite,
    create_access_token,
    current_user,
    hash_password,
    issue_refresh_token,
    mark_invite_used,
    password_problem,
    record_auth_event,
    require_auth,
    revoke_refresh_token,
    rotate_refresh_token,
    user_agent,
    verify_password,
)
from ..db import get_session
from ..errors import ApiError, parse_json
from ..models import CourseProgress, RefreshToken, User, utcnow
from ..schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    UpdateMeRequest,
)
from ..serializers import user_out
from ..modules.content_service import get_progress
from .utils import limit

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


def _session_response(user: User, progress: CourseProgress | None) -> dict:
    session = get_session()
    access, ttl = create_access_token(user)
    refresh = issue_refresh_token(session, user)
    return {
        "user": user_out(user, progress),
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": ttl,
        "refresh_token": refresh,
        "refresh_expires_in": current_app.config["AXIOM"].refresh_ttl_seconds,
    }


@bp.post("/register")
def register():
    limit("register")
    payload = parse_json(RegisterRequest)
    problem = password_problem(payload.password)
    if problem:
        raise ApiError("unprocessable", problem)
    session = get_session()
    if session.scalar(select(User).where(User.email == payload.email)):
        raise ApiError("conflict", "该邮箱已注册")
    invite = consume_invite(session, payload.invite_code)
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=invite.role if invite.role in {"student", "admin"} else "student",
        course_name="数学分析 II",
        week=7,
        total_weeks=16,
    )
    session.add(user)
    session.flush()
    if not mark_invite_used(session, invite, user.id):
        session.rollback()
        raise ApiError("conflict", "邀请码已被其他请求使用")
    session.add(
        CourseProgress(
            user_id=user.id,
            course_name=user.course_name,
            week=7,
            total_weeks=16,
            last_page="dashboard",
            daily_goal=8,
        )
    )
    record_auth_event(session, "register", user_id=user.id, email=user.email)
    response = _session_response(user, None)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ApiError("conflict", "该邮箱或邀请码已被使用")
    return response, 201


@bp.post("/login")
def login():
    payload = parse_json(LoginRequest)
    limit("login", f"{client_ip()}:{payload.email}")
    session = get_session()
    user = session.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        record_auth_event(session, "login_failed", email=payload.email)
        session.commit()
        raise ApiError("unauthorized", "邮箱或密码不正确")
    if not user.is_active:
        raise ApiError("forbidden", "账号已停用")
    user.last_login_at = utcnow()
    progress = get_progress(session, user)
    record_auth_event(session, "login", user_id=user.id, email=user.email)
    response = _session_response(user, progress)
    session.commit()
    return response


@bp.post("/refresh")
def refresh():
    limit("refresh")
    payload = parse_json(RefreshRequest)
    session = get_session()
    user, refresh_token = rotate_refresh_token(session, payload.refresh_token)
    access, ttl = create_access_token(user)
    progress = get_progress(session, user)
    session.commit()
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": ttl,
        "refresh_token": refresh_token,
        "user": user_out(user, progress),
    }


@bp.post("/logout")
@require_auth()
def logout():
    payload = parse_json(LogoutRequest)
    session = get_session()
    user = current_user()
    if payload.refresh_token:
        revoke_refresh_token(session, payload.refresh_token)
    record_auth_event(session, "logout", user_id=user.id, email=user.email)
    session.commit()
    return {"logged_out": True}


@bp.get("/me")
@require_auth()
def me():
    session = get_session()
    user = current_user()
    progress = get_progress(session, user)
    return user_out(user, progress)


@bp.patch("/me")
@require_auth()
def update_me():
    payload = parse_json(UpdateMeRequest)
    session = get_session()
    user = current_user()
    progress = get_progress(session, user)
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.course_name is not None:
        user.course_name = payload.course_name
        progress.course_name = payload.course_name
    if payload.total_weeks is not None:
        user.total_weeks = payload.total_weeks
        progress.total_weeks = payload.total_weeks
    if payload.week is not None:
        if payload.week > (payload.total_weeks or user.total_weeks):
            raise ApiError("unprocessable", "当前周次不能超过总周次")
        user.week = payload.week
        progress.week = payload.week
    if payload.daily_goal is not None:
        progress.daily_goal = payload.daily_goal
    session.commit()
    return user_out(user, progress)


@bp.post("/password")
@require_auth()
def change_password():
    payload = parse_json(ChangePasswordRequest)
    session = get_session()
    user = current_user()
    if not verify_password(payload.current_password, user.password_hash):
        raise ApiError("unauthorized", "当前密码不正确")
    problem = password_problem(payload.new_password)
    if problem:
        raise ApiError("unprocessable", problem)
    user.password_hash = hash_password(payload.new_password)
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    record_auth_event(session, "password_change", user_id=user.id, email=user.email)
    session.commit()
    return {"changed": True, "message": "密码已修改，其他设备需要重新登录"}
