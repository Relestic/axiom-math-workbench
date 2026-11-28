import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/modules/ai/api.ts"], bundle: true, write: false, platform: "node", format: "esm",
  define: { "import.meta.env.VITE_API_BASE": JSON.stringify("__SAME_ORIGIN__") },
});
const { saveKey, testKey, keyError } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64")
);

test("Codex saves only the provider and model even if a previous draft held a key and URL", async t => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "/api/v1/ai/key");
    assert.deepEqual(JSON.parse(init.body), { provider: "codex", model: "auto" });
    return Response.json({ configured: true });
  });
  assert.equal((await saveKey("auto", "previous-key", "codex", "https://previous.example")).configured, true);
});

test("Codex displays the backend's installation and login errors", async t => {
  const failures = [
    [401, "invalid_key", "本机 Codex 尚未登录或登录已过期，请先运行 codex login"],
    [503, "unconfigured", "未检测到本机 Codex CLI，请先安装并登录 Codex"],
  ];
  t.mock.method(globalThis, "fetch", async () => {
    const [status, code, message] = failures.shift();
    return Response.json({ error: { code, message } }, { status });
  });
  for (const [, , message] of [...failures]) {
    await assert.rejects(testKey(), error => keyError(error, "连接测试失败", "codex") === message);
  }
});
