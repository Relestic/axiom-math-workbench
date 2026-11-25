"""A small self-contained browser console for trying the backend by hand.

It is not part of the product UI. It exists so a reviewer can log in, call the
real endpoints and inspect real responses without installing an API client.
"""

from __future__ import annotations

from flask import Blueprint

bp = Blueprint("demo_console", __name__)


CONSOLE_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Axiom 后端试用台</title>
<style>
  :root {
    color-scheme: light;
    --ink: #1b1d2a;
    --muted: #6c7188;
    --line: #e3e6f1;
    --panel: #ffffff;
    --bg: #f4f5fb;
    --brand: #4c56d8;
    --brand-soft: #eceeff;
    --ok: #1f7a4d;
    --bad: #aa2f3f;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  header {
    background: #14172b; color: #fff; padding: 22px 28px;
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
  }
  header h1 { font-size: 20px; margin: 0; }
  header p { margin: 0; color: #aeb7d8; font-size: 13px; }
  header a { color: #b9c2ff; font-size: 13px; margin-left: auto; }
  main { max-width: 1180px; margin: 22px auto 50px; padding: 0 18px; }
  .card {
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    padding: 18px; box-shadow: 0 2px 10px rgba(20, 23, 43, .04);
  }
  .login { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .login h2 { margin: 0 8px 0 0; font-size: 15px; }
  label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 3px; }
  input, select, textarea {
    border: 1px solid #d5d9e9; border-radius: 9px; padding: 9px 10px;
    font: inherit; font-size: 13px; background: #fff; color: var(--ink);
  }
  input:focus, select:focus, textarea:focus { outline: 2px solid #c9cdff; border-color: #8f97f0; }
  input.email { width: 210px; } input.password { width: 170px; }
  button {
    border: 1px solid #d5d9e9; background: #fff; color: var(--ink);
    border-radius: 9px; padding: 9px 13px; font: inherit; font-size: 13px;
    cursor: pointer; text-align: left;
  }
  button:hover { border-color: #9aa2ed; background: #f8f9ff; }
  button.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  button.primary:hover { background: #3d47c9; }
  .status { font-size: 12px; padding: 4px 9px; border-radius: 99px; background: #f1f2f8; color: var(--muted); }
  .status.on { background: #e9f7ef; color: var(--ok); }
  .status.off { background: #fdecef; color: var(--bad); }
  .grid { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 16px; margin-top: 16px; }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  h2 { font-size: 15px; margin: 0 0 12px; }
  h3 { font-size: 12px; letter-spacing: .06em; color: var(--muted); margin: 18px 0 8px; text-transform: uppercase; }
  .actions { display: grid; gap: 7px; }
  .actions button { display: flex; justify-content: space-between; gap: 8px; }
  .actions button code { color: var(--muted); font-size: 10px; font-weight: 400; }
  .custom { display: grid; gap: 8px; }
  .row { display: flex; gap: 8px; }
  .row select { width: 92px; }
  .row input { flex: 1; min-width: 0; }
  textarea { min-height: 88px; resize: vertical; font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; }
  .response-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }
  .response-head strong { font-size: 14px; }
  #meta { font-size: 12px; color: var(--muted); }
  pre {
    margin: 0; background: #f7f8fd; border: 1px solid #eceef7; border-radius: 10px;
    padding: 13px; overflow: auto; max-height: 620px; min-height: 280px;
    font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; line-height: 1.55;
    white-space: pre-wrap; word-break: break-word;
  }
  .hint { font-size: 12px; color: var(--muted); line-height: 1.6; margin: 10px 0 0; }
  .pill { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 99px; background: var(--brand-soft); color: var(--brand); margin-right: 5px; }
  footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 22px; }
  footer code { color: #4b5068; }
</style>
</head>
<body>
<header>
  <h1>Axiom 公理 · 后端试用台</h1>
  <p>真实接口 · 真实数据库 · 演示账号已预填</p>
  <a href="/api/docs">API 清单 →</a>
</header>
<main>
  <section class="card login">
    <h2>登录</h2>
    <div><label>邮箱</label><input class="email" id="email" value="demo@axiom.local" autocomplete="username" /></div>
    <div><label>密码</label><input class="password" id="password" type="password" value="axiom-demo-2026" autocomplete="current-password" /></div>
    <button class="primary" id="loginBtn" onclick="login()">登录</button>
    <span class="status" id="authStatus">未登录</span>
    <span class="hint" style="margin:0 0 0 auto">管理员：admin@axiom.local / axiom-admin-2026</span>
  </section>

  <div class="grid">
    <section class="card">
      <h2>快速调用</h2>
      <div class="actions" id="actions">
        <button onclick="quick('GET','/api/v1/dashboard')">学习工作台 <code>dashboard</code></button>
        <button onclick="quick('GET','/api/v1/catalog')">教材目录与工具 <code>catalog</code></button>
        <button onclick="quick('GET','/api/v1/concepts/uniform')">一致连续知识卡 <code>concept</code></button>
        <button onclick="quick('GET','/api/v1/graph')">知识地图 <code>graph</code></button>
        <button onclick="quick('GET','/api/v1/graph/gaps')">前置缺口 <code>gaps</code></button>
        <button onclick="quick('GET','/api/v1/graph/path?from_node=real&to_node=uniform')">可追溯路径 <code>path</code></button>
        <button onclick="quick('GET','/api/v1/exercises?topic=uniform')">一致连续练习 <code>exercises</code></button>
        <button onclick="quick('GET','/api/v1/exercises/uniform-2/hint')">查看提示 <code>hint</code></button>
        <button onclick="quick('GET','/api/v1/exercises/uniform-2/solution')">完整解答 <code>solution</code></button>
        <button onclick="quick('POST','/api/v1/attempts', attemptBody())">提交一次作答 <code>attempt</code></button>
        <button onclick="quick('GET','/api/v1/progress/practice-map')">练习热力矩阵 <code>practice-map</code></button>
        <button onclick="quick('GET','/api/v1/progress/review-queue')">待复习队列 <code>review</code></button>
        <button onclick="quick('GET','/api/v1/diagnostic')">前置诊断 <code>diagnostic</code></button>
        <button onclick="quick('GET','/api/v1/notes')">我的笔记 <code>notes</code></button>
        <button onclick="quick('GET','/api/v1/ai/status')">模型状态 <code>ai/status</code></button>
      </div>

      <h3>自定义请求</h3>
      <div class="custom">
        <div class="row">
          <select id="method">
            <option>GET</option><option>POST</option><option>PATCH</option><option>DELETE</option>
          </select>
          <input id="path" value="/api/v1/catalog" spellcheck="false" />
        </div>
        <textarea id="body" placeholder="请求体 JSON，可留空">{}</textarea>
        <button class="primary" onclick="custom()">发送请求</button>
      </div>
      <p class="hint">提示：先登录。路径必须以 <code>/api/</code> 开头；会话只保存在当前页面内存中。</p>
    </section>

    <section class="card">
      <div class="response-head">
        <strong>响应</strong>
        <span id="meta">尚未请求</span>
      </div>
      <pre id="output">点击左侧任意按钮开始。</pre>
    </section>
  </div>
  <footer>Axiom 后端演示 · 打开 <code>/api/docs</code> 查看完整契约 · 数据为项目自编示例内容</footer>
</main>
<script>
let accessToken = "";

function el(id) { return document.getElementById(id); }

function setAuth(ok, text) {
  const badge = el("authStatus");
  badge.textContent = text;
  badge.className = "status " + (ok ? "on" : "off");
}

function show(status, data, extra) {
  el("meta").textContent = "HTTP " + status + (extra ? " · " + extra : "");
  let text;
  if (typeof data === "string") text = data;
  else text = JSON.stringify(data, null, 2);
  el("output").textContent = text;
}

async function login() {
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || !password) { show(0, { error: "请填写邮箱与密码" }); return; }
  try {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      setAuth(false, "登录失败");
      show(response.status, data);
      return;
    }
    accessToken = data.access_token;
    setAuth(true, "已登录：" + data.user.display_name + "（" + data.user.role + "）");
    show(response.status, {
      message: "登录成功。可以点击左侧接口，或继续自定义请求。",
      user: data.user
    });
  } catch (error) {
    setAuth(false, "无法连接");
    show(0, String(error));
  }
}

function attemptBody() {
  return JSON.stringify({
    exercise_id: "uniform-2",
    answer_text: "任给 ε>0，取 δ=ε/4。若 |x−y|<δ，则 |x²−y²|≤4|x−y|<ε，因此函数在 [0,1] 上一致连续。在 ℝ 上取 xₙ=n，yₙ=n+1/n，函数值差大于 2，所以不一致连续。",
    hints_used: 0,
    solution_viewed: false
  }, null, 2);
}

async function request(method, path, body) {
  if (!accessToken) {
    show(0, { error: "请先登录" });
    return;
  }
  if (!path.startsWith("/api/")) {
    show(0, { error: "路径必须以 /api/ 开头" });
    return;
  }
  const options = { method, headers: { "Authorization": "Bearer " + accessToken } };
  if (body !== undefined && body !== null && String(body).trim() !== "") {
    try { JSON.parse(body); } catch (error) {
      show(0, { error: "请求体不是有效 JSON", detail: String(error) });
      return;
    }
    options.headers["Content-Type"] = "application/json";
    options.body = body;
  }
  try {
    const response = await fetch(path, options);
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await response.json() : await response.text();
    show(response.status, data, path);
  } catch (error) {
    show(0, String(error), path);
  }
}

function quick(method, path, body) {
  request(method, path, body);
}

function custom() {
  request(el("method").value, el("path").value.trim(), el("body").value);
}

el("password").addEventListener("keydown", function (event) {
  if (event.key === "Enter") login();
});
el("loginBtn").focus();
</script>
</body>
</html>
"""


@bp.get("/demo")
@bp.get("/api/console")
def demo_console():
    return CONSOLE_HTML
