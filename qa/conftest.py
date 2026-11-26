"""Run the portable entry point with a private SQLite database and headless Chrome."""
import io
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen

import pytest
from playwright.sync_api import sync_playwright


REPO = Path(__file__).resolve().parents[1]


def workstation_env(port):
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith(("AXIOM_", "AI_", "DEEPSEEK_", "OPENAI_"))}
    env.update(AXIOM_PORT=str(port), AXIOM_NO_OPEN="1", PYTHONUTF8="1")
    return env

# The real Flask entry point and migrations run normally. Block external sockets
# in the child process as well as in the browser, even when a model is configured.
BOOT = """
import runpy, sys
from pathlib import Path
def offline(event, args):
    if event == 'socket.getaddrinfo':
        host = args[0]
    elif event == 'socket.connect' and isinstance(args[1], tuple):
        host = args[1][0]
    else:
        return
    if host not in ('127.0.0.1', 'localhost', '::1', None):
        raise PermissionError('External network disabled by portable acceptance tests')
sys.addaudithook(offline)
server = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(server.parent))
if (server.parent.parent / "model-rules.json").is_file():
    runpy.run_path(sys.argv[2])["install"](server.parent.parent)
runpy.run_path(str(server), run_name='__main__')
"""


class PortableServer:
    def __init__(self, root, web, python, source=REPO / "backend"):
        self.root = root
        self.python = python
        self.process = None
        backend = root / "backend"
        backend.mkdir()
        for folder in ("app", "migrations"):
            shutil.copytree(source / folder, backend / folder,
                            ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        shutil.copy2(source / "portable_server.py", backend)
        if not (web / "index.html").is_file():
            raise ValueError(f"Build frontend/dist-portable first. Missing {web / 'index.html'}")
        shutil.copytree(web, root / "web")
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            self.port = reserved.getsockname()[1]
        self.url = f"http://127.0.0.1:{self.port}"

    def start(self):
        env = workstation_env(self.port)
        log_path = self.root / "server.log"
        embedded = any(Path(self.python).parent.glob("python*._pth"))
        options = ["-s", "-B"] if embedded else ["-B"]
        with log_path.open("ab") as log:
            self.process = subprocess.Popen(
                [self.python, *options, "-c", BOOT, str(self.root / "backend" / "portable_server.py"),
                 str(Path(__file__).with_name("fake_deepseek.py"))],
                cwd=self.root, env=env, stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline and self.process.poll() is None:
            try:
                with urlopen(self.url + "/api/v1/ai/key/status", timeout=1) as response:
                    if response.status == 200:
                        return
            except (OSError, URLError):
                time.sleep(0.1)
        raise RuntimeError("Portable startup failed.\n" + log_path.read_text(errors="replace")[-3000:])

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=15)

    def restart(self):
        self.stop()
        self.start()

    def use_mock_deepseek(self, rules):
        """Use the real local credential store; substitute only upstream HTTPS."""
        (self.root / "model-rules.json").write_text(json.dumps(rules), encoding="utf-8")
        self.restart()

    def model_requests(self):
        log = self.root / "model-requests.jsonl"
        return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []


def pytest_addoption(parser):
    parser.addoption("--portable-backend", default=str(REPO / "backend"),
                     help="Backend (app, migrations and portable_server.py) from the checkout or extracted ZIP")
    parser.addoption("--portable-web", default=str(REPO / "frontend" / "dist-portable"),
                     help="Built portable web folder to copy into the isolated workstation")
    parser.addoption("--portable-python", default=sys.executable,
                     help="Python interpreter containing the portable server dependencies")
    parser.addoption("--chrome-binary", default=os.environ.get("AXIOM_QA_CHROME"),
                     help="Use this Chrome/Chromium executable instead of the installed Chrome channel")
    parser.addoption("--release-root", help="Root of the freshly extracted Windows ZIP containing runtime and web")
    parser.addoption("--screenshot-dir", type=Path, help="Save acceptance screenshots to this directory")


@pytest.fixture
def capture(pytestconfig):
    directory = pytestconfig.getoption("--screenshot-dir")

    def save(page, filename):
        if directory is not None:
            directory.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=directory / filename, animations="disabled")
    return save


@pytest.fixture
def server(pytestconfig):
    with tempfile.TemporaryDirectory(prefix="axiom-acceptance-") as temp:
        instance = PortableServer(Path(temp), Path(pytestconfig.getoption("--portable-web")),
                                  pytestconfig.getoption("--portable-python"), Path(pytestconfig.getoption("--portable-backend")))
        try:
            instance.start()
            yield instance
        finally:
            instance.stop()


@pytest.fixture(scope="session")
def browser(pytestconfig):
    with sync_playwright() as playwright:
        executable = pytestconfig.getoption("--chrome-binary")
        options = {"executable_path": executable} if executable else {"channel": "chrome"}
        chrome = playwright.chromium.launch(**options, headless=True, args=[
            "--enable-unsafe-swiftshader", "--disable-background-networking",
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
        ])
        try:
            yield chrome
        finally:
            chrome.close()


@pytest.fixture
def page(browser, server):
    context = browser.new_context(viewport={"width": 1600, "height": 900}, service_workers="block")
    origin = urlsplit(server.url).netloc
    def offline(route):
        if urlsplit(route.request.url).netloc == origin:
            route.continue_()
        else:
            route.abort("blockedbyclient")
    context.route("**/*", offline)
    context.add_init_script(
        "if (location.protocol === 'http:') localStorage.setItem('axiom-companion-muted', 'true')"
    )
    tab = context.new_page()
    errors = []
    tab.on("pageerror", lambda error: errors.append(str(error)))
    try:
        yield tab
        assert not errors, errors
    finally:
        context.close()


@pytest.fixture
def sample_pdf():
    from workstation import SOURCE_A, SOURCE_B
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    for text in (SOURCE_A, SOURCE_B, None):
        page = writer.add_blank_page(width=560, height=780)
        if text:
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 12 Tf 36 700 Td ({text}) Tj ET".encode("ascii"))
            page.replace_contents(stream)
    data = io.BytesIO()
    writer.write(data)
    reader = PdfReader(io.BytesIO(data.getvalue()))
    assert [p.extract_text().strip() for p in reader.pages] == [SOURCE_A, SOURCE_B, ""]
    return data.getvalue()
