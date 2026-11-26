"""Loopback-only routes for the default, signed-out workstation learner."""

from pathlib import Path
from threading import RLock

from flask import Blueprint, current_app, request, send_file
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..adapters.files import read_pdf_upload
from ..db import get_session
from ..errors import ApiError, parse_json
from ..models import Asset, User
from ..modules import local_textbooks as shelf
from .local_only import require_local

bp = Blueprint("local_workstation", __name__, url_prefix="/api/v1/local")
bp.before_request(require_local)
# Keep a concurrent upload from reusing a file between deletion's commit and unlink.
_shelf_write = RLock()


class BookTitle(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)


def local_learner(session):
    learner = session.scalar(select(User).where(User.email == "demo@axiom.local", User.is_active.is_(True)))
    if learner is None:
        raise ApiError("service_unavailable", "本机学习者尚未初始化，请通过启动工作台打开")
    return learner


@bp.get("/bootstrap-extras")
def bootstrap_extras():
    session = get_session()
    return shelf.bootstrap(session, local_learner(session))


@bp.post("/textbooks")
def upload_textbook():
    session = get_session()
    user = local_learner(session)
    config = current_app.config["AXIOM"]
    filename, data, digest = read_pdf_upload(request.files.get("file"), min(config.max_upload_mb, 50))
    title = (request.form.get("title") or Path(filename).stem).strip()
    if not title or len(title) > 200:
        raise ApiError("unprocessable", "教材名称需为 1 至 200 个字符")
    with _shelf_write:
        try:
            book = shelf.add_book(session, user, title, filename, data, digest)
            session.commit()
        except IntegrityError:
            # Separate worker processes share the unique owner/content slug.
            session.rollback()
            existing = session.execute(shelf.owned_books(user).where(Asset.sha256 == digest)).first()
            if not existing:
                raise
            book, _ = existing
    return shelf.book_summary(book), 201


@bp.patch("/textbooks/<book_id>")
def rename_textbook(book_id):
    session = get_session()
    book, _ = shelf.owned_book(session, local_learner(session), book_id)
    book.title = parse_json(BookTitle).title
    session.commit()
    return shelf.book_summary(book)


@bp.delete("/textbooks/<book_id>")
def delete_textbook(book_id):
    session = get_session()
    with _shelf_write:
        book, asset = shelf.owned_book(session, local_learner(session), book_id)
        unused = shelf.remove_book(session, book, asset)
        session.commit()
        root = (Path(current_app.config["AXIOM"].data_dir) / "uploads").resolve()
        if unused and unused.resolve().is_relative_to(root):
            try:
                unused.unlink(missing_ok=True)
            except PermissionError:
                # A Windows PDF viewer may hold the unreferenced file open until its tab closes.
                current_app.logger.info("deferred cleanup of an open shelf attachment")
    return "", 204


@bp.get("/textbooks/<book_id>/file")
def textbook_file(book_id):
    session = get_session()
    _, asset = shelf.owned_book(session, local_learner(session), book_id)
    path = Path(asset.storage_path).resolve()
    root = (Path(current_app.config["AXIOM"].data_dir) / "uploads").resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ApiError("not_found", "找不到教材原文件")
    response = send_file(
        path,
        mimetype="application/pdf",
        as_attachment=False,
        download_name=asset.filename,
        conditional=True,
    )
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'self'"
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bp.post("/textbooks/<book_id>/extract-cards")
def generate_cards(book_id):
    session = get_session()
    user = local_learner(session)
    book, _ = shelf.owned_book(session, user, book_id)
    cards = shelf.extract_cards(session, user, book, parse_json(shelf.PageRange))
    session.commit()
    return {"cards": cards}, 201
