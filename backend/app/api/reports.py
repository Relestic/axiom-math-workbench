"""Content correction reports."""

from __future__ import annotations

from flask import Blueprint, request
from sqlalchemy import func, select

from ..auth import current_user, require_auth
from ..db import get_session
from ..errors import ApiError, parse_json, parse_query
from ..models import Report
from ..schemas.common import PageQuery
from ..schemas.learning import ReportCreateRequest
from ..serializers import report_out
from .utils import pagination

bp = Blueprint("reports", __name__, url_prefix="/api/v1/reports")


@bp.post("")
@require_auth()
def create_report():
    payload = parse_json(ReportCreateRequest)
    session = get_session()
    report = Report(
        user_id=current_user().id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        kind=payload.kind,
        message=payload.message,
    )
    session.add(report)
    session.commit()
    return report_out(report), 201


@bp.get("")
@require_auth()
def list_reports():
    query = parse_query(PageQuery)
    session = get_session()
    user = current_user()
    stmt = select(Report)
    if user.role != "admin":
        stmt = stmt.where(Report.user_id == user.id)
    status = request.args.get("status")
    if status:
        stmt = stmt.where(Report.status == status)
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        session.scalars(
            stmt.order_by(Report.created_at.desc()).limit(query.limit).offset(query.offset)
        )
    )
    return {"items": [report_out(row) for row in rows], **pagination(query.limit, query.offset, total)}


@bp.get("/<report_id>")
@require_auth()
def report_detail(report_id: str):
    session = get_session()
    report = session.get(Report, report_id)
    if report is None:
        raise ApiError("not_found", "反馈不存在")
    user = current_user()
    if user.role != "admin" and report.user_id != user.id:
        raise ApiError("forbidden", "无权查看该反馈")
    return report_out(report)
