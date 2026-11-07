# 稳定本地预览

不依赖 Cloudflare、localhost.run、系统代理或外网。

## 启动

双击项目根目录的 [`启动本地预览.cmd`](启动本地预览.cmd)。

脚本会：

1. 检查 `http://127.0.0.1:8080/api/health` 是否已经在运行；
2. 如果没运行，启动 `backend/online_server.py`；
3. 等健康检查通过后打印地址；窗口会保留 10 秒供你复制。

然后在浏览器打开 <http://127.0.0.1:8080/>（也可以直接访问）。本地地址不经过系统代理，不会出现隧道导致的空白页。

登录：

```text
demo@axiom.local
axiom-demo-2026
```

## 停止

双击 [`停止本地预览.cmd`](停止本地预览.cmd)。脚本先确认 8080 的 `/api/health` 是 Axiom，再停止对应的 Python 进程，不会误杀其他程序。

## 重新构建前端

正常启动使用已经构建好的 `frontend/dist-online`。改了前端代码后：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-local-preview.ps1 -Rebuild
```

或在命令行运行：

```powershell
cd frontend
npm run build:online
```

## 日志

- `tools/local-preview-out.log`
- `tools/local-preview-err.log`

启动失败时先看这两个文件。

## 和公网预览的区别

- 本地预览：只在本机访问，稳定，不需要代理/隧道；适合开发和演示。
- `trycloudflare.com`：本机服务通过临时隧道暴露，电脑关闭或隧道停止就失效；不是正式部署。
- 腾讯云：真正独立在线运行，需要 ECS/Lighthouse；见 [`deploy/TENCENT_DEPLOY.md`](deploy/TENCENT_DEPLOY.md)。

## 批改

本地预览使用后端批改：

- 计算题：从作答最后一行/“答案”标记提取最终表达式，做符号等价检查。
- 证明题：按关键步骤给 0–100 的结构分，并逐项显示已覆盖/缺失步骤。
- 结构分不判断证明是否数学正确，不代替人工复核；不同证明路径同样有效。

离线模式（不启动后端）只保存草稿，不做批改。
