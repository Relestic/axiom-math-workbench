"""Personal model transport through the public Codex CLI."""

import os
import re
import shutil
import signal
import subprocess
import tempfile
import time
from contextlib import ExitStack
from pathlib import Path

from .image_input import MAX_IMAGES, decode_image_url
from .llm_types import LLMError, LLMResult

INSTRUCTIONS = "Important: Do NOT run any shell commands, file reads, or tools. Reply directly based ONLY on the prompt below."
JSON_INSTRUCTIONS = "Output ONLY a raw valid JSON object without markdown code fences or extra text."
NOT_INSTALLED = "未检测到本机 Codex CLI，请先安装并登录 Codex"
CODEX_EFFORTS = ("auto", "none", "low", "medium", "high")
REASONING_PURPOSES = frozenset({
    "card_proof", "card_exercises", "exercise_variant", "attempt_review", "attempt_feedback", "exercise_generation",
})


def resolve_effort(effort: str | None, purpose: str = "") -> str:
    if purpose == "connection_test":
        return "none"
    mode = effort or "auto"
    if mode == "auto":
        return "medium" if purpose in REASONING_PURPOSES else "none"
    return mode if mode in CODEX_EFFORTS else "none"


def find_codex_binary() -> Path | None:
    override = os.environ.get("AXIOM_CODEX_BIN")
    if override:
        path = Path(override)
        try:
            return path if path.is_file() else None
        except OSError:
            return None
    which = shutil.which("codex")
    if which:
        return Path(which)
    if os.name != "nt":
        return None
    candidates = []
    for variable, pattern in (
        ("LOCALAPPDATA", "OpenAI/Codex/bin/*/codex.exe"),
        ("APPDATA", "npm/codex.cmd"),
        ("USERPROFILE", ".vscode/extensions/openai.chatgpt-*/bin/**/codex.exe"),
        ("USERPROFILE", ".cursor/extensions/openai.chatgpt-*/bin/**/codex.exe"),
    ):
        if root := os.environ.get(variable):
            for path in Path(root).glob(pattern):
                try:
                    if path.is_file():
                        candidates.append((path.stat().st_mtime_ns, path))
                except OSError:
                    continue  # An editor or desktop update may have replaced the binary.
    return max(candidates)[1] if candidates else None


def _prompt(messages, directory, json_mode):
    sections = [INSTRUCTIONS]
    if json_mode:
        sections.append(JSON_INSTRUCTIONS)
    images = []
    for message in messages:
        content = message["content"]
        if isinstance(content, list):
            parts = []
            for part in content:
                if part["type"] == "text":
                    parts.append(part["text"])
                elif part["type"] == "image_url":
                    if len(images) >= MAX_IMAGES:
                        raise LLMError(f"单次最多支持 {MAX_IMAGES} 张图片", kind="invalid")
                    try:
                        suffix, image = decode_image_url(part["image_url"]["url"])
                    except (KeyError, TypeError, ValueError):
                        raise LLMError("请提供不超过 4 MB 的有效 JPEG 或 PNG 图片", kind="invalid") from None
                    path = directory / f"image_{len(images) + 1}.{suffix}"
                    path.write_bytes(image)
                    images.append(path)
                    parts.append(f"[Attached {path.name}]")
                else:
                    raise LLMError("本机 Codex 不支持此消息内容", kind="invalid")
            content = "\n".join(parts)
        sections.append(f"{message['role']}:\n{content}")
    return "\n\n".join(sections), images


def _run(args, prompt, work, timeout):
    windows = os.name == "nt"
    env = None
    if windows and Path(args[0]).suffix.lower() in {".cmd", ".bat"}:
        # cmd.exe parses batch arguments. Expand quoted values once with delayed
        # expansion off so spaces and shell characters in paths stay literal.
        env = os.environ.copy()
        variables = []
        for index, value in enumerate(args):
            name = f"AXIOM_CLI_ARG_{index}"
            env[name] = value
            variables.append(f'"%{name}%"')
        shell = os.path.join(os.environ["SystemRoot"], "System32", "cmd.exe")
        command = " ".join(variables)
        args = f'"{shell}" /d /v:off /s /c "{command}"'
    with ExitStack() as stack:
        input_bytes = prompt.encode("utf-8")
        stdin = subprocess.PIPE
        if windows:
            import ctypes
            from ctypes import wintypes

            kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
            kernel.CreateJobObjectW.restype = wintypes.HANDLE
            kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
            kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            job = kernel.CreateJobObjectW(None, None)
            if not job:
                raise ctypes.WinError(ctypes.get_last_error())
            stack.callback(kernel.CloseHandle, job)

            # Windows communicate() synchronously writes to pipes before checking
            # its timeout. A delete-on-close stdin lets even a stalled startup
            # time out when the conversation is larger than a pipe buffer.
            stdin = stack.enter_context(tempfile.TemporaryFile(dir=work.parent))
            stdin.write(input_bytes)
            stdin.seek(0)
            input_bytes = None
        process = stack.enter_context(subprocess.Popen(
            args, cwd=work, env=env, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if windows else 0, start_new_session=not windows,
        ))
        if windows:
            # Kill npm/batch descendants as a unit, before closing their pipes.
            if not kernel.AssignProcessToJobObject(job, int(process._handle)):
                error = ctypes.get_last_error()
                if process.poll() is None:
                    process.kill()
                    raise ctypes.WinError(error)
            stack.callback(kernel.TerminateJobObject, job, 1)
        try:
            stdout, stderr = process.communicate(input_bytes, timeout=timeout)
        except subprocess.TimeoutExpired:
            if not windows:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            raise LLMError("本机 Codex 响应超时，请稍后重试", kind="timeout", retryable=True) from None
    return process.returncode, stdout.decode("utf-8", "replace"), stderr.decode("utf-8", "replace")


def _failure(output):
    text = output.lower()
    if any(marker in text for marker in ("login", "auth", "401", "unauthorized")):
        return LLMError("本机 Codex 尚未登录或登录已过期，请先运行 codex login", kind="auth")
    if any(marker in text for marker in ("rate limit", "429", "quota", "usage limit")):
        return LLMError("本机 Codex 调用额度受限，请稍后再试", kind="rate_limit", retryable=True)
    return LLMError("本机 Codex 调用失败")


def complete(messages, *, model: str, json_mode: bool, timeout: int, purpose: str = "",
             reasoning_effort: str = "auto") -> LLMResult:
    binary = find_codex_binary()
    if binary is None:
        raise LLMError(NOT_INSTALLED, kind="unconfigured")
    started = time.perf_counter()
    effort = resolve_effort(reasoning_effort, purpose)
    with tempfile.TemporaryDirectory(prefix="axiom-codex-") as temp:
        directory = Path(temp)
        work = directory / "work"
        work.mkdir()
        out = directory / "out.txt"
        prompt, images = _prompt(messages, directory, json_mode)
        args = [str(binary.absolute()), "exec", "-C", str(work), "--skip-git-repo-check", "--ephemeral",
                "--ignore-user-config", "-s", "read-only", "--color", "never", "-o", str(out)]
        if effort != "none":
            args.extend(["-c", f"model_reasoning_effort={effort}"])
        if model and model != "auto":
            args.extend(["-m", model])
        for image in images:
            args.extend(["-i", str(image)])
        try:
            code, stdout, stderr = _run([*args, "-"], prompt, work, timeout)
        except FileNotFoundError:
            raise LLMError(NOT_INSTALLED, kind="unconfigured") from None
        except OSError:
            raise LLMError("无法启动本机 Codex CLI") from None
        # Some CLI versions send their banner and usage to stderr, echoing stdin.
        stdout = stdout.replace("\r\n", "\n").replace(prompt, "")
        stderr = stderr.replace("\r\n", "\n").replace(prompt, "")
        if code:
            raise _failure(stderr + "\n" + stdout)
        if not out.is_file() or out.stat().st_size > 400_000:
            raise LLMError("本机 Codex 未返回有效回复", kind="invalid")
        try:
            answer = out.read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            raise LLMError("无法读取本机 Codex 回复", kind="invalid") from None
        if not answer:
            raise LLMError("本机 Codex 未返回有效回复", kind="invalid")
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer, flags=re.MULTILINE).strip()
        if cleaned:
            answer = cleaned
        # Ignore a copy of the actual answer when reading CLI metadata.
        if stdout.strip() == answer:
            stdout = ""
        header = re.search(r"^model:[ \t]*([\w.-]+)[ \t]*$", stdout[:4096] + "\n" + stderr[:4096], re.MULTILINE)
        tokens = re.search(r"^tokens used[:\s]+(\d[\d,]{0,18})\s*$", stdout + "\n" + stderr,
                           re.MULTILINE | re.IGNORECASE)
        return LLMResult(
            text=answer, provider="codex", model=header[1] if header else model or "codex-auto",
            output_tokens=int(tokens[1].replace(",", "")) if tokens else 0,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
