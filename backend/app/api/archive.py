"""Portable SQLite snapshots with browser learning records and private PDF attachments."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import shutil
import tempfile
import time
import zipfile
from contextlib import closing
from pathlib import Path

from flask import Blueprint, Request, current_app, request, send_file

from ..db import get_engine
from ..errors import ApiError
from .local_only import require_local

bp = Blueprint("archive", __name__, url_prefix="/api/v1/archive")
MAX_ARCHIVE = 256 * 1024 * 1024
MAX_JSON = 8 * 1024 * 1024
STORAGE_KEYS = {
    "name", "theme", "last-page", "offline-concept", "offline-notes", "offline-attempts",
    "offline-bookmarks", "offline-diagnostic", "function-scene", "function-chat",
    "surface-scene", "surface-chat", "exploration", "exploration-chat", "observations",
    "companion-muted",
}
DRAFT_KEY = re.compile(r"(?:draft|assistance|exercise-variant)-[\w.-]{1,160}")


class WorkstationRequest(Request):
    @property
    def max_content_length(self):
        if self.endpoint == "archive.import_archive" and current_app.config["AXIOM"].local_mode:
            return MAX_ARCHIVE + 2 * 1024 * 1024  # ZIP headers and multipart framing
        return super().max_content_length


def invalid(message="文件不是有效的 Axiom 学习存档"):
    return ApiError("unprocessable", message)


def check_storage(storage):
    if not isinstance(storage, dict) or len(storage) > 5000:
        raise invalid("浏览器学习记录格式错误")
    for key, value in storage.items():
        name = key.removeprefix("axiom-")
        if (not key.startswith("axiom-") or not isinstance(value, str)
                or (name not in STORAGE_KEYS and not DRAFT_KEY.fullmatch(name))):
            raise invalid("存档包含不支持的浏览器记录")
    return storage


def copy_database(source, destination):
    deadline = time.monotonic() + 20

    def progress(_status, _remaining, _total):
        if time.monotonic() > deadline:
            raise ApiError("conflict", "数据库正忙，请稍后重试")

    source.backup(destination, pages=128, progress=progress, sleep=0.05)


def schema(conn):
    return conn.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' "
        "ORDER BY type,name"
    ).fetchall()


def upload_root():
    return (Path(current_app.config["AXIOM"].data_dir) / "uploads").resolve()


def attachments(conn):
    rows = conn.execute("SELECT id,sha256,storage_path FROM assets").fetchall()
    if any(not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
           for _, digest, _ in rows):
        raise invalid("教材附件校验值无效")
    return rows


@bp.before_request
def local_sqlite_only():
    require_local()
    if get_engine().dialect.name != "sqlite":
        raise ApiError("bad_request", "本地学习存档需要 SQLite 数据库")


@bp.route("/export", methods=["GET", "POST"])
def export_archive():
    payload = request.get_json(silent=True) if request.method == "POST" else {}
    if not isinstance(payload, dict):
        raise invalid("导出设置格式错误")
    storage = check_storage(payload.get("storage", {}))
    stream = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    try:
        write_archive(stream, storage)
        size = stream.tell()
        stream.seek(0)
        response = send_file(stream, mimetype="application/zip", as_attachment=True,
                             download_name="Axiom-learning.zip", max_age=0)
        response.content_length = size
        return response
    except BaseException:
        stream.close()
        raise


def write_archive(stream, storage):
    manifest = {"format": "axiom-learning", "version": 1, "storage": storage}
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "learning.sqlite"
        with closing(get_engine().raw_connection()) as live, closing(sqlite3.connect(db_path)) as snap:
            copy_database(live.driver_connection, snap)
            files = attachments(snap)
            snap.execute("UPDATE assets SET storage_path=''")
            snap.commit()
        total = db_path.stat().st_size
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as pack:
            included = set()
            for _, digest, original in files:
                if digest in included:
                    continue
                path = Path(original).resolve()
                if not path.is_relative_to(upload_root()) or not path.is_file():
                    raise invalid("教材附件缺失，无法生成完整存档")
                total += path.stat().st_size
                if total > MAX_ARCHIVE:
                    raise ApiError("payload_too_large", "学习存档超过 256 MB")
                with path.open("rb") as source:
                    if hashlib.file_digest(source, "sha256").hexdigest() != digest:
                        raise invalid("教材附件内容与记录不一致")
                    source.seek(0)
                    with pack.open(f"files/{digest}.pdf", "w") as zipped:
                        shutil.copyfileobj(source, zipped)
                included.add(digest)
            if total > MAX_ARCHIVE:
                raise ApiError("payload_too_large", "学习存档超过 256 MB")
            with db_path.open("rb") as source:
                manifest["database_sha256"] = hashlib.file_digest(source, "sha256").hexdigest()
            metadata = json.dumps(manifest, ensure_ascii=False).encode("utf8")
            if len(metadata) > MAX_JSON or total + len(metadata) > MAX_ARCHIVE:
                raise ApiError("payload_too_large", "学习存档超过容量限制")
            pack.write(db_path, "learning.sqlite")
            pack.writestr("learning.json", metadata)


def validate_entries(pack):
    infos = pack.infolist()
    names = {item.filename for item in infos}
    required = {"learning.json", "learning.sqlite"}
    if (len(infos) > 5000 or len(names) != len(infos) or not required.issubset(names)
            or sum(item.file_size for item in infos) > MAX_ARCHIVE
            or pack.getinfo("learning.json").file_size > MAX_JSON
            or any(not re.fullmatch(r"files/[0-9a-f]{64}\.pdf", name) for name in names - required)):
        raise invalid()
    return names - required


def restore(pack, folder, preview):
    names = validate_entries(pack)
    info = json.loads(pack.read("learning.json"))
    path = folder / "incoming.sqlite"
    with pack.open("learning.sqlite") as source, path.open("wb") as target:
        shutil.copyfileobj(source, target)
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
        source.seek(0)
        magic = source.read(16)
    if (not isinstance(info, dict) or info.get("format") != "axiom-learning"
            or info.get("version") != 1 or info.get("database_sha256") != digest
            or magic != b"SQLite format 3\x00"):
        raise invalid()
    storage = check_storage(info.get("storage"))
    with closing(sqlite3.connect(path)) as snap, closing(get_engine().raw_connection()) as db:
        snap.execute("PRAGMA trusted_schema=OFF")
        live = db.driver_connection
        if schema(snap) != schema(live):
            raise invalid("存档数据库版本或结构与当前工作台不匹配")
        if (snap.execute("SELECT revision FROM schema_migrations ORDER BY revision").fetchall()
                != live.execute("SELECT revision FROM schema_migrations ORDER BY revision").fetchall()):
            raise invalid("存档迁移版本不兼容")
        if (snap.execute("PRAGMA integrity_check").fetchone() != ("ok",)
                or snap.execute("PRAGMA foreign_key_check").fetchone()):
            raise invalid("存档数据库损坏，原有记录已保留")
        files = attachments(snap)
        if names != {f"files/{digest}.pdf" for _, digest, _ in files}:
            raise invalid("存档缺少教材附件")
        destination = upload_root() / "restored"
        for name in names:
            digest = Path(name).stem
            staged_file = folder / digest
            with pack.open(name) as source, staged_file.open("wb") as target:
                shutil.copyfileobj(source, target)
            with staged_file.open("rb") as source:
                if source.read(5) != b"%PDF-":
                    raise invalid("存档附件校验失败")
                source.seek(0)
                if hashlib.file_digest(source, "sha256").hexdigest() != digest:
                    raise invalid("存档附件校验失败")
        if preview:
            return {"storage": storage}
        if names:
            destination.mkdir(parents=True, exist_ok=True)
            for name in names:
                digest = Path(name).stem
                target = destination / f"{digest}.pdf"
                # Content-addressed writes can be repeated safely if a restore is interrupted.
                with tempfile.NamedTemporaryFile(dir=destination, delete=False) as staged:
                    with (folder / digest).open("rb") as source:
                        shutil.copyfileobj(source, staged)
                try:
                    os.replace(staged.name, target)
                finally:
                    Path(staged.name).unlink(missing_ok=True)
            snap.executemany("UPDATE assets SET storage_path=? WHERE id=?",
                             [(str(destination / f"{digest}.pdf"), asset_id)
                              for asset_id, digest, _ in files])
            snap.commit()
        copy_database(snap, live)
    return {"ok": True}


@bp.post("/import")
def import_archive():
    uploaded = request.files.get("archive")
    if uploaded is None:
        raise invalid("请选择要导入的 ZIP 存档")
    try:
        with zipfile.ZipFile(uploaded.stream) as pack, tempfile.TemporaryDirectory() as tmp:
            return restore(pack, Path(tmp), request.args.get("validate") == "1")
    except (zipfile.BadZipFile, sqlite3.DatabaseError, UnicodeError, ValueError,
            RuntimeError, NotImplementedError) as exc:
        raise invalid() from exc

