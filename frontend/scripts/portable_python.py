"""Prepare and verify the isolated CPython runtime used in the Windows distribution."""

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from email.parser import Parser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen

PROJECT = Path(__file__).resolve().parents[2]
CACHE = PROJECT / ".portable-cache"
REQUIREMENTS = PROJECT / "backend/requirements.txt"
PYTHON = "3.12.7"
ARCHIVE = f"python-{PYTHON}-embed-amd64.zip"
URL = f"https://www.python.org/ftp/python/{PYTHON}/{ARCHIVE}"
# messageSignature.messageDigest in the official python.org .zip.sigstore attestation.
EMBED_SHA256 = "0d57bb6cb078b74d23dbfe91f77d6780d45bed328911609f1f7ee2ba1606bf44"
DENIED = {"pdfplumber", "pillow", "pymupdf"}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def canon(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def requirement_pins():
    pins = {}
    for line in REQUIREMENTS.read_text(encoding="utf8").splitlines():
        line = line.partition("#")[0].strip()
        if line:
            name, version = line.split("==")
            pins[canon(name)] = version
    if "pypdf" not in pins:
        raise ValueError("pypdf must be pinned in backend/requirements.txt")
    return pins


def verify_install(site, report, pins):
    resolved = {}
    for entry in report:
        name = canon(entry["metadata"]["name"])
        version = entry["metadata"]["version"]
        download = entry["download_info"]
        wheel = Path(unquote(urlsplit(download["url"]).path)).name
        checksum = download["archive_info"]["hashes"]["sha256"]
        if (
            name in DENIED
            or name in resolved
            or not wheel.endswith(".whl")
            or not re.fullmatch(r"[0-9a-f]{64}", checksum)
        ):
            raise ValueError(f"Unexpected wheel for {name}")
        resolved[name] = {"name": name, "version": version, "wheel": wheel, "sha256": checksum}
    for name, version in pins.items():
        if resolved.get(name, {}).get("version") != version:
            raise ValueError(f"Missing required wheel {name}=={version}")
    seen = set()
    for folder in sorted(site.glob("*.dist-info")):
        meta = Parser().parsestr((folder / "METADATA").read_text(encoding="utf8"), headersonly=True)
        name = canon(meta["Name"])
        record = resolved.get(name)
        if not record or name in seen or meta["Version"] != record["version"]:
            raise ValueError(f"Unexpected installed distribution {name}")
        seen.add(name)
        wheel = Parser().parsestr((folder / "WHEEL").read_text(encoding="utf8"))
        if name == "pypdf" and (
            wheel["Root-Is-Purelib"].lower() != "true"
            or "py3-none-any" not in wheel.get_all("Tag", [])
            or not record["wheel"].endswith("-py3-none-any.whl")
        ):
            raise ValueError("pypdf must come from the pure py3-none-any wheel")
        licenses = [
            file.relative_to(site).as_posix()
            for file in sorted(folder.rglob("*"))
            if file.is_file()
            and re.match(r"^(licen[cs]e|copying|notice|copyright)([._-]|$)", file.name, re.I)
            and file.stat().st_size
        ]
        if not licenses:
            raise ValueError(f"Missing packaged license for {name}")
        record["licenses"] = licenses
    if seen != set(resolved):
        raise ValueError("Distributions missing from site-packages: " + ", ".join(set(resolved) - seen))
    return [resolved[name] for name in sorted(resolved)]


def tree_digest(root):
    result = hashlib.sha256()
    for file in sorted(root.rglob("*")):
        if file.is_symlink() or file.is_junction():
            raise ValueError("Unexpected linked file in portable runtime")
        if file.is_file():
            result.update(file.relative_to(root).as_posix().encode("utf8") + b"\0")
            result.update(bytes.fromhex(digest(file)))
    return result.hexdigest()


def checked_archive(workdir):
    archive = CACHE / ARCHIVE
    if not archive.exists() or digest(archive) != EMBED_SHA256:
        staged = workdir / ARCHIVE
        with urlopen(URL, timeout=90) as response, staged.open("wb") as output:
            shutil.copyfileobj(response, output)
        if digest(staged) != EMBED_SHA256:
            raise ValueError("CPython embed ZIP checksum does not match the pinned release")
        os.replace(staged, archive)
    return archive


def smoke_check(runtime):
    probe = """import importlib, pathlib, struct, sys
root = pathlib.Path(sys.executable).resolve().parent
assert sys.version_info[:3] == (3,12,7) and struct.calcsize('P') == 8
for name in ('flask','werkzeug','sqlalchemy','pydantic','pydantic_core','jwt','httpx','sympy','numpy','dotenv','tzdata','pypdf'):
    module = importlib.import_module(name)
    assert pathlib.Path(module.__file__).resolve().is_relative_to(root/'site-packages'), name
from pypdf import PdfWriter, PdfReader
from io import BytesIO
doc = BytesIO()
w = PdfWriter()
w.add_blank_page(width=72, height=72)
w.write(doc)
assert len(PdfReader(doc).pages) == 1
"""
    subprocess.run([str(runtime / "python.exe"), "-I", "-s", "-B", "-c", probe], check=True)


def content_key():
    inputs = [EMBED_SHA256, digest(REQUIREMENTS), digest(Path(__file__))]
    return hashlib.sha256("\n".join(inputs).encode("ascii")).hexdigest()


def check_cache(directory, key, pins):
    marker = json.loads((directory / "verified.json").read_text(encoding="utf8"))
    runtime = directory / "runtime"
    report_file = directory / "pip-report.json"
    if marker["key"] != key or marker["report_sha256"] != digest(report_file):
        raise ValueError("Dependency report changed")
    if marker["runtime_sha256"] != tree_digest(runtime):
        raise ValueError("Cached runtime contents changed")
    dependencies = verify_install(
        runtime / "site-packages", json.loads(report_file.read_text(encoding="utf8"))["install"], pins
    )
    if not any(entry["name"] == "tzdata" for entry in dependencies):
        raise ValueError("Missing Windows time zone data")
    return {
        "runtime": str(runtime),
        "dependencies": dependencies,
        "python": PYTHON,
        "embed_sha256": EMBED_SHA256,
        "runtime_sha256": marker["runtime_sha256"],
        "requirements_sha256": digest(REQUIREMENTS),
    }


def prepare():
    if sys.platform != "win32" or platform.machine().lower() not in {"amd64", "x86_64"}:
        raise ValueError("A Windows x64 build host is required")
    if sys.implementation.name != "cpython" or sys.version_info[:2] != (3, 12):
        raise ValueError("Run the packaging resolver with CPython 3.12")
    CACHE.mkdir(exist_ok=True)
    key = content_key()
    pins = requirement_pins()
    destination = CACHE / ("win-amd64-" + key)
    if destination.exists():
        try:
            return check_cache(destination, key, pins)
        except (OSError, ValueError, KeyError) as error:
            print(f"Rebuilding invalid portable cache: {error}", file=sys.stderr)
    with tempfile.TemporaryDirectory(prefix="prepare-", dir=CACHE) as temp:
        workdir = Path(temp)
        candidate = workdir / "candidate"
        runtime = candidate / "runtime"
        candidate.mkdir()
        with zipfile.ZipFile(checked_archive(workdir)) as source:
            source.extractall(runtime)
        site = runtime / "site-packages"
        report = candidate / "pip-report.json"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "--disable-pip-version-check",
                "install",
                "--ignore-installed",
                "--only-binary=:all:",
                "--platform",
                "win_amd64",
                "--implementation",
                "cp",
                "--python-version",
                "3.12",
                "--abi",
                "cp312",
                "--no-compile",
                "--target",
                str(site),
                "--report",
                str(report),
                "-r",
                str(REQUIREMENTS),
                "tzdata",
            ],
            check=True,
            stdout=sys.stderr,
        )
        verify_install(site, json.loads(report.read_text(encoding="utf8"))["install"], pins)
        # The wheel scripts below embed the build host's interpreter path.
        for scripts in ("bin", "Scripts"):
            if (site / scripts).is_dir():
                shutil.rmtree(site / scripts)
        (runtime / "python312._pth").write_text(
            "python312.zip\n.\nsite-packages\n../backend\n", encoding="ascii"
        )
        smoke_check(runtime)
        marker = {"key": key, "report_sha256": digest(report), "runtime_sha256": tree_digest(runtime)}
        (candidate / "verified.json").write_text(json.dumps(marker), encoding="utf8")
        if destination.exists():
            try:
                return check_cache(destination, key, pins)  # Another builder finished first.
            except (OSError, ValueError, KeyError):
                destination.rename(workdir / "obsolete")
        try:
            candidate.rename(destination)
        except FileExistsError:
            pass
        return check_cache(destination, key, pins)


if __name__ == "__main__":
    print(json.dumps(prepare(), ensure_ascii=True))
