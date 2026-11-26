"""Private file storage with checksum and content-type checks."""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path

from flask import current_app
from werkzeug.datastructures import FileStorage
from sqlalchemy import select

from ..errors import ApiError
from ..models import Asset, User

PDF_MAGIC = b"%PDF-"


def _config():
    return current_app.config["AXIOM"]


def read_pdf_upload(file: FileStorage, limit_mb: int):
    if not file or not file.filename:
        raise ApiError("bad_request", "请选择要上传的 PDF 文件")
    filename = Path(file.filename.replace("\\", "/")).name
    if not filename.lower().endswith(".pdf"):
        raise ApiError("unsupported_media_type", "只接受 .pdf 文件")
    limit = limit_mb * 1024 * 1024
    data = file.read(limit + 1)
    if len(data) > limit:
        raise ApiError("payload_too_large", f"文件不能超过 {limit_mb} MB")
    if not data.startswith(PDF_MAGIC):
        raise ApiError("unsupported_media_type", "文件不是有效的 PDF（缺少 %PDF- 头）")
    if b"/Encrypt" in data[:4096]:
        raise ApiError("unprocessable", "暂不处理加密 PDF，请先移除密码保护")
    return filename, data, hashlib.sha256(data).hexdigest()


def store_pdf(session, user: User, filename: str, data: bytes, digest: str) -> Asset:
    existing = session.scalar(select(Asset).where(Asset.owner_id == user.id, Asset.sha256 == digest,
                                                  Asset.visibility == "private", Asset.kind == "pdf"))
    if existing and Path(existing.storage_path).is_file():
        return existing
    folder = Path(_config().data_dir) / "uploads" / user.id
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{digest}.pdf"
    if not target.exists():
        staged = tempfile.NamedTemporaryFile(dir=folder, delete=False)
        try:
            with staged:
                staged.write(data)
            os.replace(staged.name, target)
        finally:
            Path(staged.name).unlink(missing_ok=True)
    if existing:
        existing.storage_path = str(target)
        return existing
    asset = Asset(
        owner_id=user.id,
        kind="pdf",
        filename=filename[:200],
        mime="application/pdf",
        size_bytes=len(data),
        sha256=digest,
        storage_path=str(target),
        visibility="private",
    )
    session.add(asset)
    session.flush()
    return asset


def save_pdf(session, user: User, file: FileStorage) -> Asset:
    return store_pdf(session, user, *read_pdf_upload(file, _config().max_upload_mb))


def read_asset(asset: Asset) -> bytes:
    path = Path(asset.storage_path)
    if not path.exists():
        raise ApiError("not_found", "文件内容已不存在")
    return path.read_bytes()
