"""Protected persistence for the workstation's DeepSeek connection."""

from __future__ import annotations

import ctypes
import json
import os
import stat
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import RLock
from uuid import uuid4

from ..config import DEEPSEEK_LEGACY_MODELS, DEEPSEEK_MODELS as MODELS
from ..errors import ApiError


def valid_key(value: object) -> bool:
    return isinstance(value, str) and 8 <= len(value) <= 512 and value.isascii() and all(
        33 <= ord(char) <= 126 for char in value
    )


def _windows_dpapi(data: bytes, *, protect: bool) -> bytes:
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.c_void_p)]

    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    function = crypt.CryptProtectData if protect else crypt.CryptUnprotectData
    function.argtypes = (
        ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
        ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob),
    )
    function.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = (ctypes.c_void_p,)
    kernel.LocalFree.restype = ctypes.c_void_p

    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.c_void_p))
    result = Blob()
    # CRYPTPROTECT_UI_FORBIDDEN. Omitting LOCAL_MACHINE binds encryption to the user.
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        kernel.LocalFree(result.data)


@dataclass(frozen=True)
class Credentials:
    api_key: str = field(repr=False)
    model: str
    revision: str = field(default_factory=lambda: uuid4().hex)
    migrated_from: str | None = None


class LocalKeyStore:
    def __init__(self, data_dir: Path):
        self.path = data_dir / ("ai-key.dpapi" if os.name == "nt" else "ai-key.json")
        self.lock = RLock()
        self.failed_revision: str | None = None

    def read(self) -> Credentials | None:
        try:
            flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
            with os.fdopen(os.open(self.path, flags), "rb") as stream:
                mode = os.fstat(stream.fileno()).st_mode
                if not stat.S_ISREG(mode) or (os.name != "nt" and stat.S_IMODE(mode) != 0o600):
                    raise ValueError("unexpected credential file permissions")
                raw = stream.read(64 * 1024)
            if os.name == "nt":
                raw = _windows_dpapi(raw, protect=False)
            value = json.loads(raw)
            if (
                not isinstance(value, dict)
                or not valid_key(value.get("api_key"))
                or not isinstance(value.get("model"), str)
                or not isinstance(value.get("revision"), str)
            ):
                raise ValueError("invalid credential file")
            saved_model = value["model"]
            model = DEEPSEEK_LEGACY_MODELS.get(saved_model, saved_model)
            if model not in MODELS:
                raise ValueError("invalid credential model")
            return Credentials(value["api_key"], model, value["revision"],
                               migrated_from=saved_model if saved_model != model else None)
        except FileNotFoundError:
            return None
        except (ValueError, OSError):
            raise ApiError("key_storage_error", "无法读取本地密钥，请重新保存", status=503) from None

    def save(self, api_key: str | None, model: str) -> None:
        with self.lock:
            if api_key is None:
                existing = self.read()
                if existing is None:
                    raise ApiError("unprocessable", "请先输入个人 DeepSeek API Key")
                api_key = existing.api_key
            credentials = Credentials(api_key, model)
            raw = json.dumps({"api_key": api_key, "model": model, "revision": credentials.revision}).encode("utf-8")
            temporary = None
            try:
                if os.name == "nt":
                    raw = _windows_dpapi(raw, protect=True)
                self.path.parent.mkdir(parents=True, exist_ok=True)
                # NamedTemporaryFile creates the file with owner-only mode on POSIX.
                with NamedTemporaryFile(dir=self.path.parent, prefix=".ai-key-", delete=False) as stream:
                    temporary = Path(stream.name)
                    if os.name != "nt":
                        os.fchmod(stream.fileno(), 0o600)
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                temporary.replace(self.path)
            except OSError:
                raise ApiError("key_storage_error", "无法保存本地密钥", status=503) from None
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
            self.failed_revision = None

    def clear(self) -> None:
        with self.lock:
            try:
                self.path.unlink(missing_ok=True)
            except OSError:
                raise ApiError("key_storage_error", "无法清除本地密钥", status=503) from None
            self.failed_revision = None

    def mark_result(self, credentials: Credentials, *, ok: bool) -> None:
        with self.lock:
            current = self.read()
            if current and current.revision == credentials.revision:
                self.failed_revision = None if ok else credentials.revision

    def status(self) -> dict:
        with self.lock:
            try:
                current = self.read()
            except ApiError:
                return {"configured": False, "model": MODELS[0], "state": "error"}
            if current is None:
                return {"configured": False, "model": MODELS[0], "state": "unset"}
            state = "error" if current.revision == self.failed_revision else "ready"
            status = {"configured": True, "model": current.model, "state": state}
            if current.migrated_from:
                status["migrated_from"] = current.migrated_from
            return status
