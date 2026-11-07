# Axiom 在线预览

> 这是**临时预览**：服务仍跑在开发机上，通过 Cloudflare Quick Tunnel 暴露。它不是独立部署；机器/隧道关闭即失效。真正上线请使用 [`deploy/`](deploy/README.md) 的 Docker/VPS 方案。

**地址：** <https://connections-wants-post-animation.trycloudflare.com/>

**演示账号：** `demo@axiom.local` / `axiom-demo-2026`

## 说明

- 这是当前机器上的临时公网预览，通过 **Cloudflare Quick Tunnel（HTTP/2）** 暴露；电脑休眠、断网、Cloudflare 进程或在线服务关闭后地址失效。
- 地址每次重启隧道可能变化；最新地址以本文件或对话中的回复为准。
- 访问者共用同一个在线演示数据库，作答/笔记可能被其他访问者看到或改动。不要把真实数据放进来。
- 管理员密码、邀请码已改为随机值，不对外公开；API 文档已关闭。
- 前端使用同源 `/api`，所以不需要额外配置 CORS；首次加载走 `/api/v1/bootstrap` 单请求。

## 重要：本机代理

这台机器的系统代理 `127.0.0.1:7892` 曾停止，但 Windows 仍把它当作代理，导致 Chrome 打不开外网/预览页。已临时关闭系统代理：

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ProxyEnable = 0
```

如果重新打开 Clash / V2Ray 后网页又打不开，请二选一：

1. 等代理软件完全启动并确认 `7892` 端口在监听；或
2. 暂时关闭系统代理，再打开预览地址。

预览域名 `*.trycloudflare.com` 也已加入代理绕过列表。

## 重新启动

```powershell
cd frontend
npm run build:online

cd ..\backend
python online_server.py
```

另开终端：

```powershell
tools\cloudflared.exe tunnel --url http://127.0.0.1:8080 --protocol http2 --no-autoupdate
```

命令会输出 `https://xxxx.trycloudflare.com`，用该地址访问。当前 Cloudflare 使用 HTTP/2；如果 QUIC 网络可用也可以去掉 `--protocol http2`。

在线配置在 `backend/.env.online`（已 gitignore），在线数据库在 `backend/var-online/online.db`。不要把这两个文件发给别人。

## 练习批改与稳定本地预览

- 练习题库提交后自动批改：计算题检查最终表达式，证明题给出关键步骤结构分、逐项覆盖/缺失和参考结果。
- 结构分不判定证明数学正确性，提交后仍保留人工复核提示。
- 稳定本地预览：双击根目录 [`启动本地预览.cmd`](启动本地预览.cmd)，打开 <http://127.0.0.1:8080/>；不依赖隧道、公网或系统代理。停止用 [`停止本地预览.cmd`](停止本地预览.cmd)。详见 [`LOCAL_PREVIEW.md`](LOCAL_PREVIEW.md)。

## 三维曲面实验室

导航“可视化视图 → 三维曲面实验室”现在支持：

- 人工输入任意 `z=f(x,y)`、拖动旋转、滚轮缩放、调范围/网格密度/高度/透明度/配色/坐标轴。
- 通过 DeepSeek 对话修改曲面、视角、范围和显示项；例如“换成 sin(x)cos(y)，视角转到 60°/35°”。
- 三维场景经过后端 `SurfaceScene` 与表达式白名单校验，失败时保留当前曲面。
- 实测：DeepSeek 返回 `sin(x)*cos(y)` 并调整视角；页面的人工拖动从 45°/28° 到 96°/42°。

## 接入 DeepSeek API

在线版**已经配置 DeepSeek API Key**（密钥只存在于 `backend/.env.online`，不写在此文档、不进入前端包）。已实测：

- `/api/v1/ai/test` 返回 200，模型显示 `deepseek-flash`，约 1.3–2.8 秒；
- `/api/ai/plot` 成功把 `x^2` 改成 `sin(x)`，场景结构通过校验；
- 在线页面显示 `DeepSeek · deepseek-chat`，测试连接成功，聊天改图实际生效。
- 公开预览设置了较低的 AI 配额（登录用户 60 次/天，匿名旧接口 60 次/天），避免共享 key 被无限消耗。

更换或轮换密钥时：

1. 打开 `backend/.env.online`，替换 `AI_API_KEY=...`。
2. 重启 `python online_server.py`。
3. 打开图像探索，在“连接 AI”面板点“测试连接”。

```dotenv
AXIOM_AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_JSON_MODE=true
AXIOM_LEGACY_AI=true
```

不要把 `.env.online` 发给别人，也不要提交到代码仓库。

## 永久上线

Quick Tunnel 只适合预览。正式上线需要域名 + 具名 Cloudflare Tunnel，或部署到有持久磁盘的托管平台；后端 SQLite 还需要改成持久化数据库和正式进程管理。
