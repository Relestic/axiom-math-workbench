"""Exercise both user-facing Windows launchers without creating a user workstation."""
from contextlib import closing, contextmanager
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
from urllib.request import urlopen

import pytest
from playwright.sync_api import expect

from conftest import PortableServer, REPO, workstation_env
from workstation import drag_pdf


pytestmark = pytest.mark.skipif(os.name != "nt", reason="These entry points require Windows cmd.exe")


@contextmanager
def run_batch(root, filename, port, private_data, *arguments):
    env = workstation_env(port)
    env.update(AXIOM_DATA_DIR=str(private_data), PYTHONDONTWRITEBYTECODE="1", npm_config_offline="true")
    # A source checkout launches the host Python. The packaged CMD uses its own absolute runtime path.
    env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + env["PATH"]
    url = f"http://127.0.0.1:{port}"
    log_path = root / "launcher.log"
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [os.environ["COMSPEC"], "/d", "/c", "call", filename, *arguments], cwd=root,
            creationflags=subprocess.CREATE_NO_WINDOW, env=env, stdin=subprocess.DEVNULL,
            stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline and process.poll() is None:
                try:
                    with urlopen(url + "/api/v1/local/bootstrap-extras", timeout=1) as response:
                        if response.status == 200:
                            break
                except OSError:
                    time.sleep(0.1)
            else:
                raise AssertionError("Batch file did not start the local app.\n" +
                                     log_path.read_text(encoding="utf-8", errors="replace")[-2000:])
            yield url
        finally:
            # cmd.exe owns the synchronously launched Python child. Terminate
            # only this test's process tree and verify its listener disappears.
            if process.poll() is None:
                subprocess.run(["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                               capture_output=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
            process.wait(timeout=15)
            with socket.socket() as probe:
                probe.settimeout(1)
                assert probe.connect_ex(("127.0.0.1", port)) != 0, "The test's server still holds its port"


def inspect_launched_app(browser, url, sample_pdf, private_data, existing_book=None):
    context = browser.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
    context.route("**/*", lambda route: route.continue_()
                  if route.request.url.startswith(url + "/") else route.abort("blockedbyclient"))
    try:
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url + "/#proof")
        expect(page).to_have_url(re.compile("#desk/proof$"))
        page.goto(url + "/#examples")
        expect(page).to_have_url(re.compile("#desk/textbook$"))
        expect(page.get_by_role("tablist", name="学习步骤").get_by_role("tab")).to_have_text(
            ["讲义定义", "证明思路", "练习与复盘"])
        board = page.locator("#desk-board")
        expect(board.locator(".fw-plot-canvas .plot-container")).to_be_visible(timeout=15000)
        expect(board.locator("textarea")).to_have_count(0)
        board.get_by_role("tab", name="3D 曲面").click()
        expect(board.locator("#surface-expression")).to_be_visible()
        expect(board.locator("textarea")).to_have_count(1)
        nav = page.get_by_role("navigation", name="主导航")
        expect(nav.get_by_role("button")).to_have_count(4)
        nav.get_by_role("button", name="知识星图").click()
        expect(page.locator("[data-graph-viewport]")).to_be_visible()
        page.get_by_role("textbox", name="搜索节点").fill("中值定理")
        expect(page.locator('[data-node-id="mvt"]')).to_have_attribute("aria-pressed", "true")
        page.get_by_role("button", name="定位当前学习").click()
        expect(page.locator('[data-node-id="uniform"]')).to_have_attribute("aria-pressed", "true")
        nav.get_by_role("button", name="书架与笔记").click()
        expect(page).to_have_url(re.compile("#shelf/books$"))
        if existing_book is None:
            book = drag_pdf(page, sample_pdf)
        else:
            book = existing_book
            expect(page.get_by_role("article", name=book["title"], exact=True)).to_be_visible()
            records = page.request.get(url + "/api/v1/local/bootstrap-extras")
            assert records.ok and book in records.json()["textbooks"]
        pdf = page.request.get(f"{url}/api/v1/local/textbooks/{book['id']}/file")
        assert pdf.ok and pdf.body() == sample_pdf
        assert [row["needs_ocr"] for row in book["pages"]] == [False, False, True]
        evidence = private_data / "axiom.db"
        assert evidence.is_file(), "The launcher ignored AXIOM_DATA_DIR"
        with closing(sqlite3.connect(evidence)) as db:
            assert db.execute("SELECT title FROM textbooks WHERE id=?", (book["id"],)).fetchone() == (book["title"],)
            assert "ai_review" in {row[1] for row in db.execute("PRAGMA table_info(attempts)")}
        assert not errors, errors
        return book
    finally:
        context.close()


def stage_source(tmp_path):
    root = tmp_path / "源码检验"
    root.mkdir()
    staged = PortableServer(root, REPO / "frontend" / "dist-portable", sys.executable)
    (root / "frontend").mkdir()
    (root / "web").rename(root / "frontend" / "dist-portable")
    script = "启动工作台.cmd"
    shutil.copy2(REPO / script, root / script)
    return root, script, staged.port


def test_source_windows_launcher(browser, sample_pdf, tmp_path):
    root, script, port = stage_source(tmp_path)
    private = tmp_path / "source-data"
    with run_batch(root, script, port, private) as url:
        inspect_launched_app(browser, url, sample_pdf, private)
    assert not (root / "data").exists()


def test_stale_bundle_and_explicit_rebuild_keep_learning_data(browser, sample_pdf, tmp_path):
    import _winapi

    root, script, port = stage_source(tmp_path)
    frontend = root / "frontend"
    source = REPO / "frontend"
    for folder in ("src", "server", "public"):
        shutil.copytree(source / folder, frontend / folder)
    for name in ("tsconfig.json", "index.html", "vite.config.ts", "package.json", "package-lock.json"):
        shutil.copy2(source / name, frontend / name)
    (frontend / "scripts").mkdir()
    shutil.copy2(source / "scripts" / "build-portable.mjs", frontend / "scripts")
    # Leave Vite's scratch files in the private node_modules, while sharing the
    # existing packages. This test never invokes an online dependency install.
    modules = frontend / "node_modules"
    modules.mkdir()
    linked = []
    try:
        for package in (source / "node_modules").iterdir():
            if package.is_dir() and not package.name.startswith("."):
                link = modules / package.name
                _winapi.CreateJunction(str(package), str(link))
                linked.append(link)
        dist = frontend / "dist-portable"
        marker = dist / "phase4.ready"
        assert marker.is_file(), "Build the current portable frontend before launcher QA"
        private = tmp_path / "rebuild-data"
        with run_batch(root, script, port, private) as url:
            original = inspect_launched_app(browser, url, sample_pdf, private)
        marker.unlink()
        obsolete = dist / "phase3.ready"
        obsolete.write_text("Phase 3\n", encoding="utf-8")
        for arguments in ((), ("--rebuild",)):
            (dist / "index.html").write_text("<html>旧版书桌：正反例</html>", encoding="utf-8")
            stale_asset = dist / "old-workbench-only.js"
            stale_asset.write_text("/* obsolete chunk */", encoding="ascii")
            with run_batch(root, script, port, private, *arguments) as url:
                assert marker.read_text(encoding="utf-8").strip() == "Phase 4"
                assert not obsolete.exists() and not stale_asset.exists()
                inspect_launched_app(browser, url, sample_pdf, private, existing_book=original)
        assert not (root / "data").exists()
    finally:
        # Remove junctions themselves without traversing a shared dependency.
        for link in linked:
            assert link.is_junction() and link.resolve() == (source / "node_modules" / link.name).resolve()
            link.rmdir()


def test_extracted_windows_launcher(browser, sample_pdf, pytestconfig, tmp_path):
    source = pytestconfig.getoption("--release-root")
    if not source:
        pytest.skip("Use --release-root with the unzipped Windows distribution for this release test")
    release = Path(source).resolve()
    root = tmp_path / "免安装分享包"
    root.mkdir()
    staged = PortableServer(root, release / "web", sys.executable, release / "backend")
    shutil.copytree(release / "runtime", root / "runtime")
    script = "启动 Axiom.cmd"
    shutil.copy2(release / script, root / script)
    # Ensure the reader really ships in the embedded runtime and has no dependency on the host site.
    check = subprocess.run([str(root / "runtime" / "python.exe"), "-s", "-B", "-c",
                            "import pypdf, sys, json; print(json.dumps([pypdf.__version__, pypdf.__file__, sys.version_info[:2]]))"],
                           cwd=root, capture_output=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    version, location, python_version = json.loads(check.stdout)
    assert version == "7.1.1" and python_version == [3, 12]
    assert Path(location).is_relative_to(root / "runtime" / "site-packages")
    private = tmp_path / "package-data"
    with run_batch(root, script, staged.port, private) as url:
        inspect_launched_app(browser, url, sample_pdf, private)
    assert not (root / "data").exists()
