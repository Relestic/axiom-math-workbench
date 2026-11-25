"""Private file storage with checksum and content-type checks."""

from __future__ import annotations

import hashlib
import mimetypes
import re
from pathlib import Path

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from ..errors import ApiError
from ..models import Asset, User

PDF_MAGIC = b"%PDF-"
SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _config():
    return current_app.config["AXIOM"]


def save_pdf(session, user: User, file: FileStorage) -> Asset:
    config = _config()
    if not file or not file.filename:
        raise ApiError("bad_request", "请选择要上传的 PDF 文件")
    filename = secure_filename(file.filename)
    if not filename.lower().endswith(".pdf"):
        raise ApiError("unsupported_media_type", "只接受 .pdf 文件")
    data = file.read()
    limit = config.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise ApiError("payload_too_large", f"文件不能超过 {config.max_upload_mb} MB")
    if not data.startswith(PDF_MAGIC):
        raise ApiError("unsupported_media_type", "文件不是有效的 PDF（缺少 %PDF- 头）")
    if b"/Encrypt" in data[:4096]:
        raise ApiError("unprocessable", "暂不处理加密 PDF，请先移除密码保护")
    digest = hashlib.sha256(data).hexdigest()
    folder = Path(config.data_dir) / "uploads" / user.id
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{digest[:32]}.pdf"
    if not target.exists():
        target.write_bytes(data)
    asset = Asset(
        owner_id=user.id,
        kind="pdf",
        filename=SAFE_NAME.sub("_", filename)[:200],
        mime=mimetypes.types_map.get(".pdf", "application/pdf"),
        size_bytes=len(data),
        sha256=digest,
        storage_path=str(target),
        visibility="private",
    )
    session.add(asset)
    session.flush()
    return asset


def read_asset(asset: Asset) -> bytes:
    path = Path(asset.storage_path)
    if not path.exists():
        raise ApiError("not_found", "文件内容已不存在")
    return path.read_bytes()
