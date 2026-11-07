# Axiom 公理 · 后端

面向大学数学系本科生的数学学习工作台后端。根据项目根目录 `readme.md` 与 `design-reference/` 的 8 张原型图实现，覆盖从教材、定义与条件、图像探索、正反例、证明、练习与完整解答、复盘、练习热力图、知识地图、前置诊断到笔记与内容纠错的业务后端。

> 这是可运行的**演示级 MVP 后端**，不是完整产品验收。内容为 8 个示例学习单元，不是完整教材；数值图像分析不构成数学证明；任务队列为单机线程版，部署形态与完整产品目标仍有差距。具体边界见文末。

## 1. 已实现的能力

| 领域 | 实现 |
| --- | --- |
| 账号 | 邀请码注册、登录、JWT access token、刷新令牌轮换与重放检测、登出、改密、学生/管理员角色、资源归属检查 |
| 教材 | 教材/章节/片段、页码与定位锚点、PDF 上传与结构检查、页数估计、可选 PDF 文本提取、管理员按结构化文本导入、编辑与发布/撤回、修订快照 |
| 知识卡片 | 定义、公式、量词拆解、符号表、条件逐项核对、证明思路与步骤、引用工具、教材页码、审核状态与版本 |
| 经典案例 | 正例/反例/定理/构造、性质矩阵、被反驳命题、来源、图像类型与许可、展示限制、扩展标记 |
| 知识图谱 | 20 节点/28 条关系、11 种受控关系、来源与条件、按用户的当前/已掌握/未学/前置缺口状态、节点依赖、可追溯路径 |
| 图像 | 8 个模板（含 3D 视角元数据）、场景保存/版本/冲突检测/撤销、观察记录、服务端受限表达式校验、导数/Taylor/Riemann 和/ε–δ 数值分析、对话动作 |
| 练习 | 8 个已审核模板 × 4 个参数变式 = 32 道题；按需变式生成；提示/完整解答分入口并记录查看；常见错误；校验记录 |
| 作答 | 原始作答、提示与解答使用、独立/辅助标记、自我评级、幂等提交、符号等价检查、证明结构分与不确定性保留 |
| 进度 | 仪表盘聚合、练习热力矩阵、活动热力图、复习队列、前置缺口、诊断题与诊断记录、最近学习位置 |
| 笔记 | 增删改查、按知识点筛选、Markdown 导出、收藏 |
| 纠错 | 学生上报、管理员查看/处理、审核记录 |
| 任务 | 任务表、尝试次数、超时、幂等键、取消/重试、单机 Worker、教材解析与 AI 反馈任务 |
| 用量 | 模型调用次数、输入/输出 token、耗时、失败、按用途统计；每日调用限额 |
| 管理 | 邀请码、账号、教材、知识点、证明、命题、经典案例、题目、图谱、发布/撤回、修订历史、审计日志 |
| 文档 | `/api/openapi.json`、`/api/docs`、`docs/verification.md` |

接口总数 100（含 2 个与既有前端兼容的本地 AI 接口）。没有实现的前端专用功能（如浏览器本地草稿、Plotly 绘制）仍由前端负责。

## 2. 技术栈与离线说明

| 层 | 实现 |
| --- | --- |
| Web | Flask 3.0 + Werkzeug |
| 校验 | Pydantic 2（请求体/查询参数），统一 422 错误结构 |
| 数据 | SQLAlchemy 2.0；默认 SQLite，`AXIOM_DB_URL` 可切换 PostgreSQL |
| 迁移 | 自带 `migrations/` 前进式迁移器 + `schema_migrations` 台账（Alembic 的等价操作界面，见 §10） |
| 认证 | PyJWT（HS256）+ Werkzeug scrypt 密码哈希 + 哈希存储的刷新令牌/邀请码 |
| 数学 | SymPy 1.13 + NumPy；白名单解析器，不执行用户或模型代码 |
| 模型 | 任意 OpenAI 兼容 Chat Completions；另有明确标记的 `mock` 离线 Provider |
| 任务 | SQLite 任务表 + 单进程线程 Worker；接口与 Celery 任务处理函数同形 |
| PDF | 内置结构检查与页数估计；`pdfplumber`/`pypdf` 存在时才提取文本 |
| 测试 | pytest 7 |

**为什么不是 FastAPI？** 根 `readme.md` 把 FastAPI 列为候选方案，同时要求“工程阶段选择受支持的组合”。本机评审环境完全离线，没有 FastAPI/uvicorn/starlette 与 Celery/Alembic/pdfplumber，无法安装。因此使用同一台机器已具备的 Flask + Pydantic + SQLAlchemy 实现同样的模块化单体边界：`api/`（入口）→ `modules/`（业务）→ `adapters/`（模型、数学、文件、PDF）→ `models/`（持久化）。业务层不依赖 Flask 的请求对象，迁移到 FastAPI 时主要替换 API 层与错误处理，数据库和业务服务可以保留。

## 3. 快速启动

要求 Python 3.11+。当前验证环境为 Python 3.12.7，已安装 Flask 3.0.3、SQLAlchemy 2.0.34、Pydantic 2.8.2、PyJWT 2.8.0、httpx 0.27.0、SymPy 1.13.2、pytest 7.4.4。

```powershell
cd backend
copy .env.example .env
python -m app.cli init
python -m app.cli seed --demo
python run.py
```

打开：

- **浏览器试用台（推荐先看这个）**：<http://127.0.0.1:8000/demo>，已预填演示账号，点按钮即可登录、查目录、看知识卡、提交作答
- 健康检查：<http://127.0.0.1:8000/api/health>
- API 文档：<http://127.0.0.1:8000/api/docs>
- OpenAPI JSON：<http://127.0.0.1:8000/api/openapi.json>

Windows 下也可以双击项目根目录的 `启动后端.cmd`。它会检查依赖、初始化数据库、写入种子数据并启动服务。

种子数据默认创建：

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `admin@axiom.local` | `axiom-admin-2026` | 管理员 |
| `demo@axiom.local` | `axiom-demo-2026` | 学生（仅 `--demo`） |

演示邀请码 `AXIOM-DEMO-2026` 只保存哈希，明文仅用于本地演示。部署前必须通过 `.env` 更换管理员密码、`AXIOM_SECRET_KEY` 和邀请码。

`seed` 是幂等的：已有教材时不会重复写入内容，但仍会补齐管理员和演示邀请码。`reset --yes` 会删除本地 SQLite 数据库并重建，仅用于演示环境。

### 常用命令

```powershell
python -m app.cli init                # 建库/迁移
python -m app.cli seed                # 只写内容与管理员，不写演示学习记录
python -m app.cli seed --demo         # 另建演示学生、8 条示例作答、示例场景/笔记
python -m app.cli stats               # 内容与使用统计
python -m app.cli invite --role student --days 7
python -m app.cli reset --yes --demo  # 演示环境重置
python -m pytest -q                   # 102 项测试
```

## 4. 配置

所有配置来自 `.env` 或环境变量，示例见 `.env.example`。关键项：

| 变量 | 说明 |
| --- | --- |
| `AXIOM_ENV` | `development` / `production`；production 会强制检查密钥与管理员密码 |
| `AXIOM_SECRET_KEY` | JWT 与邀请码 HMAC 密钥；生产必须随机且保密 |
| `AXIOM_DB_URL` | 默认 `sqlite:///.../backend/var/axiom.db`；可换 PostgreSQL |
| `AXIOM_CORS_ORIGINS` | 允许的前端来源，逗号分隔 |
| `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` | 模型服务；HTTPS，本机模型允许 localhost HTTP。DeepSeek 可用 `AXIOM_AI_PROVIDER=deepseek` 并省略 BASE，默认 `https://api.deepseek.com` / `deepseek-chat` |
| `AXIOM_AI_PROVIDER` | `none` / `openai` / `deepseek` / `mock`；mock 明确标记为模拟 |
| `AI_JSON_MODE` | 请求 JSON 输出；`deepseek-reasoner` 会自动跳过 `response_format` |
| `AXIOM_AI_DAILY_CALL_LIMIT` | 每用户每日模型调用上限 |
| `AXIOM_WORKER_ENABLED` | 是否启动单机任务线程 |
| `AXIOM_WORKER_SYNC` | `true` 时同步执行任务（测试/单步演示） |
| `AXIOM_MAX_UPLOAD_MB` | PDF 大小上限，默认 50 MB |
| `AXIOM_TIMEZONE` | “今天”、连续打卡与活动热力图的时区，默认 `Asia/Shanghai` |

模型密钥只在服务端读取；不会进入前端包、日志或 API 响应。

DeepSeek 配置示例：

```dotenv
AXIOM_AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
AI_API_KEY=sk-你的密钥
AI_JSON_MODE=true
AXIOM_LEGACY_AI=true
```

`AI_MODEL` 可改为 `deepseek-reasoner` 或其他账户可用模型；推理模型会自动跳过 `temperature` 与 `response_format`，仍由提示词和结构校验保证 JSON。配置后可用 `POST /api/v1/ai/test` 做一次最小真实调用，或在前端图像工作区点“测试连接”。

## 5. 目录结构

```text
backend/
  app/
    __init__.py          create_app、CORS、请求 ID、限流、错误处理
    config.py            环境配置与生产校验
    db.py                engine / request session / worker session
    errors.py            ApiError 与统一 JSON 错误
    auth.py              JWT、邀请码、刷新轮换、权限装饰器
    serializers.py       领域对象 → API 结构
    openapi.py           从 Flask URL map + Pydantic 生成 OpenAPI 3.1
    cli.py               init / seed / invite / stats / reset
    models/              37 张表（用户、内容、图谱、图像、练习、任务）
    schemas/             请求校验模型
    api/                 auth、catalog、graph、visual、exercises、progress、
                         notes、reports、ai、admin、health
    modules/             内容、图谱、练习、进度、图像、对话、AI 业务服务
    adapters/            math（SymPy 白名单）、llm、files、pdf
    workers/queue.py     任务表、Worker、处理器、用量统计
    seed/                8 单元内容、图、模板、32 道练习、诊断题
  migrations/            迁移器与版本（0001 baseline、0002 索引）
  tests/                 102 项 pytest
  docs/verification.md   验证记录与限制
  run.py                 开发服务入口
```

## 6. 接口概览

完整契约见 `/api/docs` 或 `/api/openapi.json`。请求体使用 JSON；认证接口返回 `{access_token, refresh_token, user}`，业务接口使用 `Authorization: Bearer <access_token>`。错误统一为：

```json
{
  "error": {"code": "unprocessable", "message": "请求参数校验失败", "details": []},
  "request_id": "..."
}
```

### 与 8 张原型图的对应

| 原型 | 主要接口 |
| --- | --- |
| 教材定义与条件 | `GET /api/v1/catalog`、`GET /api/v1/concepts/{id}`、`GET /api/v1/sections/{id}`、`GET /api/v1/tools` |
| 正反例实验室 | `GET /api/v1/concepts/{id}`（classics/propositions）、`GET /api/v1/classics/{id}`、`POST /api/v1/ai/counterexamples` |
| 学习工作台 | `GET /api/v1/dashboard`、`GET /api/v1/progress/summary`、`GET /api/v1/progress/review-queue` |
| 图像探索（2D/3D） | `GET /api/v1/visualizations/templates`、`POST /api/v1/visualizations/validate`、`GET /api/v1/visualizations/analyze`、场景与观察接口 |
| 三维曲面实验室 | `POST /api/v1/ai/surface`（鉴权、场景/表达式校验）、`POST /api/v1/ai/test` |
| 练习可视化 | `GET /api/v1/progress/practice-map`、`GET /api/v1/progress/heatmap` |
| 数学总地图 | `GET /api/v1/graph`、`GET /api/v1/graph/gaps`、`GET /api/v1/graph/nodes/{id}`、`GET /api/v1/graph/path` |
| 证明思路 | `GET /api/v1/proofs/{id}`、`POST /api/v1/visualizations/conversations/{id}/actions`（`open_proof_step`） |
| 练习/完整解答/复盘 | `GET /api/v1/exercises`、`GET /api/v1/exercises/{id}/hint`、`/solution`、`POST /api/v1/attempts`、`PATCH /api/v1/attempts/{id}` |

### 关键请求示例

```powershell
# 登录
curl -X POST http://127.0.0.1:8000/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"demo@axiom.local\",\"password\":\"axiom-demo-2026\"}'

# 保存图像场景
curl -X POST http://127.0.0.1:8000/api/v1/visualizations/scenes `
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" `
  -d '{\"title\":\"ε–δ\",\"template_slug\":\"eps-delta-square\"}'
```

保存场景时可以只给 `template_slug`，服务端会使用该模板的默认场景；给了 `scene` 时以用户提交的配置为准并重新校验。服务端不会替用户悄悄改数学配置。

```powershell
# 提交作答（幂等）
curl -X POST http://127.0.0.1:8000/api/v1/attempts `
  -H "Authorization: Bearer <token>" -H "Idempotency-Key: uniform-answer-1" `
  -H "Content-Type: application/json" `
  -d '{\"exercise_id\":\"uniform-2\",\"answer_text\":\"任给 ε>0，取 δ=ε/4……\"}'
```

## 7. 数据模型

37 张表，按领域分组：

- **账号**：`users`、`invites`、`refresh_tokens`、`auth_events`
- **教材与内容**：`textbooks`、`chapters`、`sections`、`concepts`、`proofs`、`propositions`、`classics`、`tools`、`assets`、`content_revisions`
- **图谱**：`graph_nodes`、`graph_edges`
- **图像**：`visual_templates`、`visual_scenes`、`scene_versions`、`observations`、`conversations`、`conversation_messages`
- **学习**：`exercise_templates`、`exercises`、`attempts`、`attempt_events`、`notes`、`bookmarks`、`study_events`、`course_progress`、`diagnostic_questions`、`diagnostic_runs`
- **运维**：`jobs`、`model_calls`、`reports`、`idempotency_records`、`audit_logs`

内容、个人记录和任务分别保存；所有个人资源带 `user_id` 并在服务层检查归属。内容版本通过 `content_revisions` 保存快照，发布/撤回不会静默覆盖旧快照。

## 8. 数学与 AI 边界

- 用户函数先经过长度、标识符、禁用语法、自由符号与运算数量检查，再交给 SymPy 白名单解析；不执行 JavaScript/Python 字符串。
- 所有采样分析都返回 `proof: false`，并在响应中说明“数值检查不构成证明”。Darboux 上下和不以采样极值冒充。
- 练习反馈只有在模板提供 `answer_check` 时才做符号等价检查；一般证明保留 `needs_review`，明确说明不同但有效的证明不应因不匹配参考解答被判错。
- AI 图像修改返回严格 JSON，经 Pydantic + 场景校验后才可保存；保存失败会返回 409/422，不会覆盖当前场景。
- 离线 `mock` Provider 只返回规则化结果，`/api/v1/ai/status` 和 ModelCall 记录会标明 `mock`；不能当作真实模型质量验证。
- AI 生成的新反例/新题不会自动进入正式内容；接口只返回已审核经典案例，题目变式来自已审核模板并记录 `auto_checked` 校验。

## 9. 安全与运维

- 密码 scrypt 哈希；刷新令牌和邀请码只存 SHA-256/HMAC 摘要；登录失败与刷新重放写 `auth_events`。
- JWT 30 分钟、刷新令牌 14 天；刷新轮换，检测到重放会撤销整个令牌族。
- CORS 白名单；旧版 `/api/ai/*` 额外检查 Origin，仅用于本地前端兼容。
- 请求 ID、结构化错误、限流（登录、注册、AI、旧接口、全局限流）、上传大小/类型/魔数检查。
- 生产启动强制要求非默认 `AXIOM_SECRET_KEY` 与管理员密码；管理员关键操作写 `audit_logs`。
- SQLite 已开启外键、WAL、`synchronous=NORMAL`；备份数据库与上传目录，并验证恢复。

## 10. 与完整产品目标的差距

| 目标 | 当前状态 |
| --- | --- |
| FastAPI / Celery / RabbitMQ / Alembic / PostgreSQL | 未验证；用 Flask / 单机线程 / 自带迁移器 / SQLite 替代；接口和表结构可迁移 |
| 任意 PDF 自动解析公式 | 未实现；只做结构检查、页数估计与可选纯文本提取，之后必须人工核对 |
| 真实模型联调 | DeepSeek 已用真实 key 实测：`/api/v1/ai/test` 与 `/api/ai/plot` 通过，模型回落显示 `deepseek-flash`。其他 OpenAI-compatible 供应商仍需各自验证。 |
| AI 生成新题与反例 | 不自动交付；模板变式可交付，AI 候选需进入审核流程（当前未建独立审核 UI） |
| 完整教材与数学审核 | 只有 8 个示例单元；正式内容需替换、核对与审核 |
| 学习效果、跨设备、PWA、移动端 | 未实现 |
| 多进程任务队列与高并发 | 单进程限制，Worker 不支持水平扩展；生产需 Celery/Redis/RabbitMQ |
| 形式化验证 | 未实现，也不声称模型自检等于人工或形式化审核 |

## 11. 验证

```powershell
cd backend
python -m pytest -q
```

当前结果：**102 passed**。覆盖账号/权限/刷新重放、内容与发布门禁、图谱、场景版本与冲突、受限表达式安全、数值分析、练习/作答/幂等/反馈、进度热力图、诊断、笔记/收藏/纠错、AI mock、任务、上传解析、OpenAPI 与安全用例。详细记录见 [`docs/verification.md`](docs/verification.md)。

## 12. 与前端的关系

前端已在 2026-11-05 接入本后端，不再只是“契约预留”：

- `frontend/src/pages/Auth.tsx` 提供登录、邀请码注册和离线降级；会话由 `frontend/src/lib/api.ts` 管理并自动刷新。
- 登录成功后 `frontend/src/app/DataProvider.tsx` 拉取目录、知识点、练习、图谱、热力图、笔记、作答、收藏和诊断，经 `frontend/src/domain/mappers.ts` 映射给页面。页面只消费 `useAppData()`，不再原地替换模块常量。
- 作答写入 `POST /api/v1/attempts`，复盘自评写入 `PATCH /api/v1/attempts/{id}`，笔记/收藏调用对应 API，诊断提交到 `/api/v1/diagnostic`。
- AI 改图改用本后端的 `/api/ai/status` 与 `/api/ai/plot`；模型密钥只在 `backend/.env`。
- 未连接后端时，登录页提供“离线演示”，回退到原有静态内容与 localStorage。
- 仍未接入的前端部分：自由函数场景/观察的服务端保存、正反例曲线与性质矩阵的完全动态化、管理员内容界面。

启动前后端：稳定本地预览双击项目根目录的 `启动本地预览.cmd`（`http://127.0.0.1:8080/`），完整演示双击 `启动完整演示.cmd`；或分别运行后端 `python run.py` 与前端 `npm run dev`。已验证无头 Chrome 登录、教材、练习、提交批改、写笔记和所有页面渲染，见 [`frontend/docs/verification.md`](../frontend/docs/verification.md)。

## 13. 在线预览（单端口 + 临时隧道）

`online_server.py` 用于临时公网预览：它让 Flask API 与构建后的 SPA 共用同一个端口，所以隧道只需要转发一个地址，不需要额外 CORS 或反代配置。

先构建 **同源 API** 版本（不能使用默认的 `http://127.0.0.1:8000`）：

```powershell
cd frontend
npm run build:online
```

准备独立的在线数据库和强密钥（不要复用本地演示库）：

```powershell
cd backend
# .env.online 至少包含：
# AXIOM_ENV=production
# AXIOM_SECRET_KEY=<至少 32 字符随机值>
# AXIOM_ADMIN_PASSWORD=<至少 12 字符随机值>
# AXIOM_DEMO_INVITE_CODE=<随机邀请码>
# AXIOM_DB_URL=sqlite:///.../var-online/online.db
# AXIOM_DATA_DIR=.../var-online
# AXIOM_DOCS_ENABLED=false
# AXIOM_LEGACY_AI=false
python -m app.cli init
python -m app.cli seed --demo
python online_server.py
```

另开一个终端建立临时 HTTPS 隧道（需要联网）：

```powershell
cloudflared tunnel --url http://127.0.0.1:8080
```

输出中的 `https://...trycloudflare.com` 就是预览地址。演示学生仍是 `demo@axiom.local` / `axiom-demo-2026`；管理员密码和邀请码使用 `.env.online` 中的随机值，不对外公开。

注意：

- Quick Tunnel 没有可用性保证，地址会变化；电脑或隧道进程关闭即失效。永久上线需要域名、具名隧道或正式托管，不属于本次演示。
- 公开地址上的作答/笔记会写进**在线专用数据库**；不要把真实用户数据或真实密钥放进去。
- `online_server.py` 不替代生产部署；生产仍需 HTTPS、反向代理、进程管理和数据库备份。
- `.env.online`、`var-online/` 已被 gitignore；不要把 `.env.online` 发给他人。
