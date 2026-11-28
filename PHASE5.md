# Phase 5 验收记录

- 验收日期：2026-11-28（Asia/Shanghai）
- 基线与里程碑：M19（ChatGPT 与 DeepSeek 双接口 + 扫描版 PDF 看图识公式本地缓存）、M20（200+ 页及全书分段接力「快速建书」 + 书桌「翻到哪张精配哪张」）、M21（便携预览包刷新与全量回归验证）
- 数据与安全基线：零新建数据库表、零 SQLite Schema 迁移、零新增 `dangerouslySetInnerHTML`，完整兼容既有 `data/axiom.db` 与学习存档导入导出；无 Key 状态下 100% 保持优雅离线可用。

## 1. M19 · ChatGPT / DeepSeek 双平台个人接口与扫描版看图识公式

- **双平台个人 AI 连接（BYOK）**：顶部 AI 设置面板支持一键切换 **DeepSeek**（`deepseek-flash`、`deepseek-v4-pro`）与 **ChatGPT（OpenAI）**（内置 `gpt-4o-mini`、`gpt-4o`、`gpt-4.1-mini`、`gpt-4.1`、`o3-mini` 及自定义模型名输入，支持可选自定义 HTTPS Base URL 与本机系统代理直连，`o1/o3/o4/gpt-5*` 自动切换 `max_completion_tokens` 且不发送 DeepSeek 专属 `thinking` 字段）。个人 Key 模式下彻底解除每日 200 次本地调用软上限。
- **扫描版 PDF 离线选页渲染与公式识图永久缓存**：前端内置离线 `pdfjs-dist`（Apache-2.0，独立懒加载 Worker）按需将扫描页渲染为清晰 JPEG，后端新增 `POST /api/v1/local/textbooks/<book_id>/ocr-pages` 调用多模态视觉接口提取中文与标准 LaTeX 数学公式，写回 SQLite `Textbook.parse_meta["pages"]`（标记 `ocr_source: "vision_llm"`、`needs_ocr: false`）。同一扫描页只需识别一次，永久本地复用、绝不重复计费。

## 2. M20 · 200+ 页分段接力「快速建书」与书桌「翻到哪张精配哪张」

- **书架分段接力「快速建书」**：解除单次 15 页硬限制，支持输入 `1` 至整书总页数的任意连续页码范围（支持 200+ 页及整本书），新增 **「选整本书」** 与 **「接续未提页码」** 快捷按钮。提取时按每 10 页自动分窗接力（含待识别扫描页时按每组最多 3 页先看图识公式并落盘缓存），自动跨过封面、目录或纯空白页，每出一批卡片立即入库并刷新书架与书桌；点击 **「停止后续生成」** 后在当前小批结束时干净停下，已缓存的扫描页文字与已生成的学习卡片全部保留。
- **学习书桌「翻到哪张精配哪张」**：书桌左栏卡片导航下方新增紧凑精配控制栏，默认开启 **「翻到卡片自动精配」**（持久化于 `localStorage["axiom-auto-enrich"]` 并同步纳入本地存档白名单）。内置 **1500ms 停留防抖**：连续按 `← / →` 快速翻卡或切走时零请求发出、绝不浪费额度；在未配齐的本地卡片上停留满 1.5 秒后，后台自动按需补齐当前卡片缺失的富证明拆解、配套练习题与专属黑板配图，同时提供 **「一键精配本卡」** 手动立即补齐/重试按钮。

## 3. M21 · 自动化测试与便携预览交付

- 前端单元测试：`npm.cmd test` **76 / 76 通过**，TypeScript `tsc -b` 零错误。
- 后端单元测试：原生 Windows 环境（含真实 Windows DPAPI 凭据加解密）`python -m pytest -q` **244 / 244 通过**。
- 浏览器端到端回归：含 203 页长 PDF 分窗提取、扫描与空白混合页跨过、中途停止与接续、书桌 1499ms 快速连翻零请求与 1500ms 停留自动精配等 **13 / 13 全部通过**。
- 便携预览同步：`node scripts/build-portable.mjs` 已重新构建 `frontend/dist-portable`（含离线 PDF 渲染 Worker 与字库资源）并写入 `phase5.ready` 启动标记，双击根目录 `启动工作台.cmd` 即可直接体验全部 Phase 5 功能。
