"""Protected persistence for the workstation's personal AI connection."""

from __future__ import annotations

import ctypes
import ipaddress
import json
import os
import re
import socket
import stat
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import RLock
from urllib.parse import urlsplit
from uuid import uuid4

from ..config import DEEPSEEK_LEGACY_MODELS, DEEPSEEK_MODELS as MODELS
from ..errors import ApiError

DEFAULT_BASE_URL = {"deepseek": "https://api.deepseek.com", "openai": "https://api.openai.com/v1"}
OPENAI_MODEL = re.compile(r"[a-zA-Z0-9._-]{2,80}")
HOST_LABEL = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", re.I)
_UNSET = object()


def valid_model(provider, model) -> bool:
    if provider == "deepseek":
        return model in MODELS
    return provider == "openai" and isinstance(model, str) and OPENAI_MODEL.fullmatch(model) is not None


def _public_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        elif ip.is_site_local:
            return False
    return ip.is_global and not ip.is_multicast and not ip.is_reserved


def clean_base_url(value, *, resolve=False, require_resolution=False) -> str | None:
    if value is None or value == "":
        return None
    try:
        if not isinstance(value, str) or len(value) > 2048 or any(
            ch in "\\?#" or ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in value
        ):
            raise ValueError
        parts = urlsplit(value)
        host = (parts.hostname or "").rstrip(".")
        if (parts.scheme != "https" or not host or parts.username is not None
                or parts.port == 0 or "%" in parts.netloc
                or not re.fullmatch(r"(?:\[[0-9a-fA-F:.]+\]|[^\[\]:]+)(?::[0-9]+)?", parts.netloc)):
            raise ValueError
        try:
            ipaddress.ip_address(host)
        except ValueError:
            labels = host.encode("idna").decode("ascii").split(".")
            if (len(labels) < 2 or not all(HOST_LABEL.fullmatch(label) for label in labels)
                    or labels[-1] in {"localhost", "local", "internal", "lan", "localdomain"}
                    or host.endswith(".home.arpa") or re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)", labels[-1])):
                raise ValueError
            if resolve or require_resolution:
                try:
                    addresses = socket.getaddrinfo(host, parts.port or 443, type=socket.SOCK_STREAM)
                except socket.gaierror:
                    # Settings may be saved offline. Connecting requires a public DNS result.
                    addresses = []
                if require_resolution and not addresses:
                    raise ValueError
                if any(not _public_ip(row[4][0]) for row in addresses):
                    raise ValueError
        else:
            if not _public_ip(host):
                raise ValueError
    except ValueError:
        raise ValueError("Base URL 必须是公网 HTTPS 地址，且不能包含账密、查询串或片段") from None
    return value.rstrip("/")


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
    provider: str = "deepseek"
    base_url: str | None = None
    legacy_format: bool = False


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
            provider = value.get("provider", "deepseek")
            model = DEEPSEEK_LEGACY_MODELS.get(saved_model, saved_model) if provider == "deepseek" else saved_model
            if not valid_model(provider, model):
                raise ValueError("invalid credential model")
            return Credentials(value["api_key"], model, value["revision"],
                               migrated_from=saved_model if saved_model != model else None,
                               provider=provider, base_url=clean_base_url(value.get("base_url")),
                               legacy_format="provider" not in value)
        except FileNotFoundError:
            return None
        except (ValueError, OSError):
            raise ApiError("key_storage_error", "无法读取本地密钥，请重新保存", status=503) from None

    def save(self, api_key: str | None = None, model: str = "", provider: str | None = None,
             base_url=_UNSET) -> None:
        platform = "deepseek" if provider is None else provider
        if not valid_model(platform, model) or (api_key is not None and not valid_key(api_key)):
            raise ApiError("unprocessable", "请检查提供商、模型名称和 API Key 格式")
        try:
            override = clean_base_url(base_url, resolve=True) if base_url is not _UNSET else None
        except ValueError as exc:
            raise ApiError("unprocessable", str(exc)) from None
        if override == DEFAULT_BASE_URL[platform]:
            override = None
        with self.lock:
            if api_key is None:
                existing = self.read()
                if base_url is _UNSET and existing is not None:
                    override = existing.base_url
                if existing is None or existing.provider != platform or existing.base_url != override:
                    raise ApiError("unprocessable", "请为所选平台和服务地址输入 API Key")
                api_key = existing.api_key
            value = {"api_key": api_key, "model": model, "revision": uuid4().hex}
            if provider is not None or override:
                value["provider"] = platform
            if override:
                value["base_url"] = override
            raw = json.dumps(value).encode("utf-8")
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
            if not current.legacy_format:
                status.update(provider=current.provider, base_url=current.base_url)
            if current.migrated_from:
                status["migrated_from"] = current.migrated_from
            return status
