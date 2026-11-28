"""Exercise the public CLI boundary with a local executable and no model account."""

import json
import os
import sys
import time
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters import codex_cli, llm
from app.db import session_scope
from app.models import ModelCall
from test_workstation_books import JPEG, PNG, textbook_pdf, upload

KEY = "/api/v1/ai/key"
INSTRUCTIONS = "Important: Do NOT run any shell commands, file reads, or tools. Reply directly based ONLY on the prompt below."
JSON_INSTRUCTIONS = "Output ONLY a raw valid JSON object without markdown code fences or extra text."
FAKE = """
import base64, json, os, sys, time
from pathlib import Path
args = sys.argv[1:]
if os.environ.get('FAKE_BLOCK_STDIN'):
    time.sleep(6)
images = [Path(args[i+1]) for i, arg in enumerate(args) if arg == '-i']
work = Path(args[args.index('-C')+1])
report = dict(args=args, prompt=sys.stdin.buffer.read().decode('utf-8'),
              cwd=str(Path.cwd()), empty=not any(work.iterdir()),
              images=[base64.b64encode(p.read_bytes()).decode() for p in images])
with Path(os.environ['FAKE_REPORT']).open('a', encoding='utf-8') as stream:
    print(json.dumps(report), file=stream)
if os.environ.get('FAKE_SLEEP'):
    time.sleep(60)
if os.environ.get('FAKE_ERROR'):
    sys.exit(os.environ['FAKE_ERROR'])
Path(args[args.index('-o')+1]).write_text(os.getenv('FAKE_ANSWER', 'OK'), encoding='utf-8')
if not os.environ.get('FAKE_NO_METADATA'):
    print('model: detected-model')
    print('tokens used\\n1,234')
"""


@pytest.fixture
def cli(tmp_path, monkeypatch):
    script = tmp_path / "fake codex.py"
    script.write_text(FAKE, encoding="utf-8")
    monkeypatch.setenv("FAKE_PYTHON", sys.executable)
    monkeypatch.setenv("FAKE_SCRIPT", str(script))
    if os.name == "nt":
        binary = tmp_path / "fake codex.cmd"
        binary.write_text('@echo off\n"%FAKE_PYTHON%" "%FAKE_SCRIPT%" %*\n', encoding="ascii")
    else:
        binary = tmp_path / "fake codex"
        binary.write_text('#!/bin/sh\nexec "$FAKE_PYTHON" "$FAKE_SCRIPT" "$@"\n', encoding="ascii")
        binary.chmod(0o700)
    log = tmp_path / "calls.jsonl"
    monkeypatch.setenv("AXIOM_CODEX_BIN", str(binary))
    monkeypatch.setenv("FAKE_REPORT", str(log))
    return log


@pytest.fixture
def local(app, client):
    app.config["AXIOM"].local_mode = True
    return client


def calls(log):
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]


def test_discovery_override_path_and_windows_installations(tmp_path, monkeypatch):
    explicit = tmp_path / "pinned"
    explicit.touch()
    via_path = tmp_path / "on-path"
    via_path.touch()
    monkeypatch.setattr(codex_cli.shutil, "which", lambda command: str(via_path))
    monkeypatch.setenv("AXIOM_CODEX_BIN", str(explicit))
    assert codex_cli.find_codex_binary() == explicit
    explicit.unlink()
    assert codex_cli.find_codex_binary() is None
    monkeypatch.setenv("AXIOM_CODEX_BIN", "")
    assert codex_cli.find_codex_binary() == via_path
    monkeypatch.setattr(codex_cli.shutil, "which", lambda command: None)
    if os.name == "nt":
        for variable in ("LOCALAPPDATA", "APPDATA", "USERPROFILE"):
            monkeypatch.setenv(variable, str(tmp_path))
        for i, pattern in enumerate(("OpenAI/Codex/bin/abc/codex.exe", "npm/codex.cmd",
                                     ".vscode/extensions/openai.chatgpt-2/bin/win/codex.exe",
                                     ".cursor/extensions/openai.chatgpt-1/bin/codex.exe")):
            path = tmp_path / pattern
            path.parent.mkdir(parents=True)
            path.touch()
            os.utime(path, (1000 + i, 1000 + i))
            assert codex_cli.find_codex_binary() == path
    else:
        assert codex_cli.find_codex_binary() is None


@pytest.mark.parametrize("model,expected", [("", "codex-auto"), ("auto", "auto"), ("o3", "o3")])
def test_metadata_fallback(cli, monkeypatch, model, expected):
    monkeypatch.setenv("FAKE_NO_METADATA", "1")
    result = codex_cli.complete([{"role": "user", "content": "OK?"}], model=model, json_mode=False, timeout=5)
    assert (result.text, result.model, result.input_tokens, result.output_tokens) == ("OK", expected, 0, 0)
    [call] = calls(cli)
    assert ("-m" in call["args"]) == (model == "o3")


@pytest.mark.parametrize("urls", [[JPEG] * 4, ["data:image/jpeg;base64,!!!!"],
                                  ["https://example.com/pic"], [JPEG + "A" * (6 * 1024**2)]],
                         ids=["too_many", "malformed", "remote", "too_large"])
def test_bad_attachments_never_start_codex(cli, urls):
    content = [{"type": "image_url", "image_url": {"url": url}} for url in urls]
    with pytest.raises(llm.LLMError) as error:
        codex_cli.complete([{"role": "user", "content": content}], model="auto", json_mode=True, timeout=5)
    assert error.value.kind == "invalid" and not cli.exists()


def test_timeout_includes_cli_startup_before_it_reads_stdin(cli, monkeypatch):
    monkeypatch.setenv("FAKE_BLOCK_STDIN", "1")
    started = time.monotonic()
    with pytest.raises(llm.LLMError) as error:
        codex_cli.complete([{"role": "user", "content": "x" * 200_000}], model="auto", json_mode=False, timeout=1)
    assert error.value.kind == "timeout" and error.value.retryable
    assert time.monotonic() - started < 4
    assert not cli.exists()


def test_codex_keyless_lifecycle_and_switching(local, cli):
    store = local.application.extensions["axiom_local_key"]
    assert local.get(KEY + "/status").json["codex_detected"] is True
    assert local.put(KEY, json={"provider": "openai", "model": "o3",
                                "api_key": "previous-openai-key", "base_url": "https://8.8.8.8/v1"}).status_code == 200
    saved = local.put(KEY, json={"provider": "codex"})
    assert saved.json == {"provider": "codex", "model": "auto", "state": "ready",
                          "configured": True, "base_url": None, "codex_detected": True}
    first = store.read()
    assert first.api_key == "" and first.model == "auto" and first.base_url is None
    if os.name == "nt":
        assert b'"provider": "codex"' not in store.path.read_bytes()
    assert local.put(KEY, json={"provider": "codex", "api_key": "", "model": "o3", "base_url": ""}).status_code == 200
    assert store.read().revision != first.revision
    assert store.read().model == "o3"
    legacy = local.get("/api/ai/status").json
    assert (legacy["provider_label"], legacy["endpoint_host"]) == ("本机 Codex CLI", "codex-cli")
    for payload in ({"provider": "codex", "base_url": "https://example.com"},
                    {"provider": "codex", "model": "bad/model"},
                    {"provider": "deepseek", "model": "deepseek-flash"},
                    {"provider": "openai", "api_key": "", "model": "o3"}):
        assert local.put(KEY, json=payload).status_code == 422
        assert store.read().model == "o3"
    assert local.delete(KEY).json["state"] == "unset"
    assert store.read() is None


def test_connection_and_json_companion(local, cli, monkeypatch):
    assert local.put(KEY, json={"provider": "codex"}).status_code == 200
    timeouts = []
    complete = codex_cli.complete

    def record_timeout(*args, **kwargs):
        timeouts.append(kwargs["timeout"])
        return complete(*args, **kwargs)

    monkeypatch.setattr(codex_cli, "complete", record_timeout)
    assert local.post(KEY + "/test").json == {"ok": True}
    reply = "取任意正数 $x$。"
    monkeypatch.setenv("FAKE_ANSWER", json.dumps({"display_markdown": reply, "actions": []}))
    answer = local.post("/api/v1/ai/companion", json={"question": "量词顺序？", "context": {}})
    assert answer.json["display_markdown"] == reply
    assert timeouts == [30, 90]
    probe, companion = calls(cli)
    for call in (probe, companion):
        work = Path(call["cwd"])
        assert work.name == "work" and work.parent.name.startswith("axiom-codex-")
        assert call["empty"] and not work.parent.exists()
        assert call["args"] == ["exec", "-C", str(work), "--skip-git-repo-check", "--ephemeral",
                                "--ignore-user-config", "-s", "read-only", "--color", "never",
                                "-o", str(work.parent / "out.txt"), "-"]
        assert call["prompt"].startswith(INSTRUCTIONS)
    assert JSON_INSTRUCTIONS not in probe["prompt"]
    assert JSON_INSTRUCTIONS in companion["prompt"] and "量词顺序？" in companion["prompt"]
    with session_scope() as session:
        call = session.scalars(select(ModelCall).where(ModelCall.purpose == "companion")).one()
        assert call.model == "detected-model" and call.input_tokens + call.output_tokens == 1234


def test_codex_ocr_and_extract_cards(local, cli, monkeypatch):
    book = upload(local, textbook_pdf(b"")).json
    url = "/api/v1/local/textbooks/" + book["id"]
    assert local.put(KEY, json={"provider": "codex", "model": "o3"}).status_code == 200
    monkeypatch.setenv("FAKE_ANSWER", json.dumps({"pages": [{"page": 1, "text": "定义 $x^2$"},
                                                           {"page": 2, "text": ""}]}))
    pages = {"pages": [{"page": n, "image_data_url": image} for n, image in [(1, JPEG), (2, PNG)]]}
    result = local.post(url + "/ocr-pages", json=pages)
    assert result.status_code == 200, result.json
    assert local.post(url + "/ocr-pages", json=pages).json == result.json
    card = {"title": "平方", "definition": "定义 $x^2$", "page_start": 1, "page_end": 1}
    monkeypatch.setenv("FAKE_ANSWER", json.dumps({"cards": [card]}))
    result = local.post(url + "/extract-cards", json={"page_start": 1, "page_end": 2})
    assert result.status_code == 201 and result.json["cards"][0]["title"] == "平方", result.json
    ocr, extract = calls(cli)
    for call in (ocr, extract):
        assert call["args"][call["args"].index("-m") + 1] == "o3"
        assert JSON_INSTRUCTIONS in call["prompt"]
    assert ocr["images"] == [image.partition(",")[2] for image in (JPEG, PNG)]
    files = [Path(ocr["args"][i+1]) for i, arg in enumerate(ocr["args"]) if arg == "-i"]
    assert [f.name for f in files] == ["image_1.jpg", "image_2.png"]
    assert "PDF 第 1 页\n[Attached image_1.jpg]\nPDF 第 2 页\n[Attached image_2.png]" in ocr["prompt"]
    assert all(not f.parent.exists() for f in files)
    assert "$x^2$" in extract["prompt"]


@pytest.mark.parametrize("failure,code,status,message", [
    ("missing", "unconfigured", 503, "未检测到本机 Codex CLI，请先安装并登录 Codex"),
    ("401 unauthorized", "invalid_key", 401, "本机 Codex 尚未登录或登录已过期，请先运行 codex login"),
    ("usage limit", "rate_limited", 429, "本机 Codex 调用额度受限，请稍后再试"),
    ("unrelated failure", "upstream_error", 502, "本机 Codex 调用失败"),
    ("timeout", "timeout", 504, "本机 Codex 响应超时，请稍后重试"),
])
def test_codex_connection_errors(local, cli, monkeypatch, failure, code, status, message):
    if failure == "missing":
        monkeypatch.setenv("AXIOM_CODEX_BIN", str(cli.parent / "absent"))
        assert local.get(KEY + "/status").json["codex_detected"] is False
    elif failure == "timeout":
        local.application.config["AXIOM"].ai_timeout_seconds = 1
        monkeypatch.setenv("FAKE_SLEEP", "1")
    else:
        monkeypatch.setenv("FAKE_ERROR", failure)
    assert local.put(KEY, json={"provider": "codex"}).status_code == 200
    started = time.monotonic()
    response = local.post(KEY + "/test")
    if failure == "timeout":
        assert time.monotonic() - started < 10
    assert response.status_code == status
    assert response.json["error"] == {"code": code, "message": message}
    assert local.get(KEY + "/status").json["state"] == "error"
    if failure != "missing":
        [attempt] = calls(cli)
        assert not Path(attempt["cwd"]).parent.exists()
