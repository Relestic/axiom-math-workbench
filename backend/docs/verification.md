# 后端验证记录

- 验证日期：2026-11-05（Asia/Shanghai）
- 环境：Windows，Python 3.12.7，Node 未参与后端
- 依赖：Flask 3.0.3、Werkzeug 3.0.3、SQLAlchemy 2.0.34、Pydantic 2.8.2、PyJWT 2.8.0、httpx 0.27.0、SymPy 1.13.2、NumPy 1.26.4、pytest 7.4.4
- 网络：评审环境无法访问 PyPI/npm；后端只使用本机已安装依赖，未在验证中下载任何包
- 数据库：SQLite（WAL + 外键），数据库文件位于 `backend/var/`，未提交

## 1. 自动测试

```powershell
cd backend
python -m pytest -q
```

结果：

```text
........................................................................ [ 80%]
.................                                                        [100%]
110 passed in 32.42s
```

按文件：

| 文件 | 数量 | 覆盖内容 |
| --- | --- | --- |
| `test_math_adapter.py` | 27 | 支持/拒绝的表达式、参数推断、数值分析、符号等价、安全边界 |
| `test_auth.py` | 12 | 登录、刷新轮换/重放、邀请码、改密、权限、CORS、请求 ID、限流 |
| `test_security.py` | 10 | 错误结构、SQL 注入式输入、哈希存储、篡改令牌、越权、草稿隔离、危险表达式 |
| `test_admin_ai.py` | 8 | 邀请/账号、内容发布门禁、题目审核、图谱、教材上传与文本导入、AI/任务/用量、旧接口 |
| `test_catalog.py` | 9 | 目录、概念卡、证明/案例/命题、搜索、工具解锁、草稿隔离 |
| `test_exercises.py` | 7 | 列表筛选、提示/解答、作答记录、幂等、符号检查、越权、变式生成 |
| `test_ai_credentials.py` | 2 | 用户 Key 加密保存/读取、末四位提示、测试调用使用个人凭据、移除回退、跨用户隔离 |
| `test_ai_discussion.py` | 2 | AI 讨论不创建 Attempt、提交时 AI 评分并落库、空答案拒绝 |
| `test_reader_discussion.py` | 2 | 原讲义阅读 AI 只发送当前页与选段、无文字页不假装已读 |
| `test_reader_analysis.py` | 2 | 规则/示例持久化并进入识别请求、无效/否定候选被拒绝 |
| `test_grading.py` | 3 | 证明结构分、错误最终答案 0 分与参考结果、从文字中提取最终表达式 |
| `test_progress_notes.py` | 7 | 仪表盘、热力矩阵、活动、复习队列、诊断、笔记导出、收藏、纠错处理 |
| `test_visual.py` | 6 | 模板、校验、分析、版本冲突、撤销、观察、所有权、模板建场景 |
| `test_graph.py` | 5 | 课程视图、扩展节点、解锁过滤、节点依赖、路径 |
| `test_conversations.py` | 2 | 对话动作、状态版本、撤销、所有权 |

## 2. 原讲义阅读 AI 验证

- `POST /api/v1/ai/reader/discuss` 接收当前页文字、用户选段、问题与有限历史；只生成解释，不写 Attempt、不改讲义。
- 有文字页面：请求中保留 `page_number`、`page_text`、`selected_text`；响应 `page_text_available=true`。
- 无文字页面：上下文显式 `page_text_available=false`，提示模型说明无法读取，不能假装已解析 PDF。
- 真实模型实测（2026-11-15）：第 2 页提取 346 字，AI 正确解释 ε-δ 定义中的量词顺序及 δ 对 x₀ 的依赖。
- PDF worker 由 Flask 以 `text/javascript` 提供；否则浏览器动态导入 worker 失败。

## 3. Word 识别与规则验证

- `POST /api/v1/ai/reader/analyze` 接收有限段落批次；真实 DeepSeek 接口返回 200，候选由程序重新计算 `start/end`，不信任模型自报字符下标。
- 候选必须通过：块存在、原文逐字存在、重复词 occurrence、目标白名单、非否定/人物介绍语境、范围不重叠。
- 规则与示例按用户保存；后端测试确认自定义规则正文和纠正理由实际进入模型请求。
- 无效原文和不存在的图像目标被记录到 `rejected`，不会生成链接。
- 无 Key / 模型失败时接口返回真实错误，前端保留本地词库候选，不伪装模型分析成功。

## 4. 练习批改验证

- AI 讨论：`POST /api/v1/ai/exercises/discuss` 只调用模型并返回追问，前后 Attempt 数量不变；讨论历史进入下一轮上下文。
- AI 提交：`POST /api/v1/ai/exercises/submit` 用一个最终评分调用生成 `ai_reviewed` Attempt，`feedback.ai` 包含 verdict/strengths/gaps/next_steps；答案、讨论和提示/解答使用记录写入同一条 Attempt。
- 确定性符号/结构批改仍保留在通用 `POST /api/v1/attempts`，但练习页现在默认走 AI 讨论+提交。
- 计算题、证明题和 AI 批改的边界测试见 `test_ai_discussion.py`、`test_grading.py`。
- 计算题：从作答最后一行/“答案/得到”等标记提取最终表达式；`primitive-2` 的
  `F(x)=exp(2*x)*(2*x-1)/4+C` 返回 `auto_checked`、100 分；错误表达式返回 0 分、
  `correct=false` 和参考结果；无法解析时保留 `needs_review`，不强行判错。
- 证明题：`uniform-3` 返回 `needs_review`、结构分、`criteria` 五项、`checker=rubric+keywords`；
  关键词只检查步骤是否出现，不宣称数学正确，`needs_review=true` 保留人工复核。
- 前端实测：证明题显示 100/100 和五项 ✓；计算题显示 100/100、“自动批改通过”、参考结果。
- 截图：`frontend/docs/grading-proof.png`、`frontend/docs/grading-computation.png`。

## 3. 种子数据验证

```powershell
python -m app.cli seed --demo
```

输出（节选）：

```text
教材： analysis-4e-sample （新建）
chapters: 12
sections: 3
concepts: 8
proofs: 8
classics: 8
graph_nodes: 20
graph_edges: 28
exercises: 32
visual_templates: 8
管理员： admin@axiom.local
演示邀请码： AXIOM-DEMO-2026
演示账号： demo@axiom.local / axiom-demo-2026
```

种子内容由项目自编，教材标题、页码和 PDF 元数据只作导航示例；`textbook.parse_meta.origin = project_written_sample` 明确记录，不冒充出版社原文。

## 4. 服务启动与真实 HTTP 检查

```powershell
cd backend
$env:AXIOM_PORT="8011"
python run.py
```

`GET /api/health`：

```json
{
  "status": "ok",
  "service": "axiom-backend",
  "version": "0.2.0",
  "environment": "development",
  "database": "ok",
  "worker": "enabled",
  "ai": {"provider": "none", "configured": false, "active": false}
}
```

`GET /api/docs`：200，自带无外部依赖的 HTML 接口浏览页。
`GET /api/openapi.json`：200，100 个路径。
`GET /demo`：200，自包含的浏览器试用台（已预填演示账号）。
`POST /api/v1/auth/login`（演示账号）：200。
`GET /api/v1/dashboard`：200；8 条示例作答、8 个知识点、教材标题正确。
`GET /api/v1/graph`：200；17 个课程节点、25 条边、4 个已掌握、5 个缺口。
`GET /api/v1/progress/practice-map`：200；`8 concepts / 40 cells / 8 covered / 32 blank / 32 exercises`。
`POST /api/v1/attempts`（真实 HTTP）：201，返回 `needs_review` 规则反馈。
`POST /api/v1/ai/plot` 未配置模型时：503，错误信息明确要求配置服务端密钥，未静默失败或伪造结果。

验证结束后已停止监听 8011/8014 的进程。

## 5. 已验证的安全行为
1. 密码使用 scrypt 哈希；数据库中不保存明文。
2. 刷新令牌只保存 SHA-256 摘要；重复使用旧 token 会撤销整个令牌族。
3. 邀请码只保存 HMAC 摘要；单次使用，`UPDATE ... WHERE used_at IS NULL` 防并发重复使用。
4. 所有个人资源（场景、观察、对话、作答、笔记、收藏）按 `user_id` 检查归属；越权返回 404/403，不泄露存在性。
5. 学生看不到 draft/withdrawn 内容；管理员可预览；发布前检查定义、证明步骤、解答和案例性质。
6. 用户/模型表达式不执行 Python/JavaScript；白名单 + SymPy 解析 + 运算数上限；`__import__`、属性访问、数组、lambda、积分命令等被拒绝。
7. 旧版 `/api/ai/*` 检查 Origin；输入场景重新校验；模型输出未经结构校验不会保存。
8. 上传只接受带 `%PDF-` 魔数的文件，限制大小，拒绝加密 PDF；文件名清洗，内容按 SHA-256 落盘。
9. JWT 篡改、过期、错误 audience/issuer 均被拒绝；错误响应不区分“账号不存在”和“密码错误”。
10. 登录、注册、刷新、AI、旧接口与全局请求均有进程内滑动窗口限流。
11. 用户级 DeepSeek Key 使用 `AXIOM_SECRET_KEY` 派生的 Fernet 加密存储；API 只返回末四位提示，响应/日志/ModelCall 记录不含明文；跨用户不可读取或覆盖。

## 6. 未验证 / 未实现

- **真实模型联调**：DeepSeek 已用真实 Key 验证连接测试、二维改图和三维改图；用户级 Key 的保存、测试、移除和回退也已验证。其他供应商仍需各自验证。
- **真实教材 PDF 解析**：环境没有 pdfplumber/pypdf；上传与页数估计已验证，文本提取代码路径未实测。正式内容必须人工核对。
- **PostgreSQL**：模型使用通用 SQLAlchemy 类型，但未在本机 PostgreSQL 上跑迁移与并发测试。
- **Celery/RabbitMQ/Alembic**：未安装；由单机线程、自带迁移器替代，接口可后续替换。
- **多进程/高并发**：限流与 Worker 都是单进程实现；未做压测。
- **前端逐页联调**：已于 2026-11-05 接入（登录、内容、练习、作答、笔记、诊断、图谱、热力矩阵）；自由函数场景仍保存在浏览器。详见 [`frontend/docs/verification.md`](../../frontend/docs/verification.md)。
- **数学审核与学习效果**：8 个示例单元为项目自编，未经过外部数学教师审核；没有试用数据。
- **形式化验证/自动证明**：未实现；反馈仅做符号检查与可解释结构提示，证明题保留人工复核。

## 7. 与 readme 验收项的差距

| readme 验收项 | 当前状态 |
| --- | --- |
| 连续性至定积分所有模块具有可用内容 | 有 8 个示例单元/32 道变式，未达到完整教材与 40–60 个核对单元 |
| 已发布知识点保留定义、条件、符号、来源 | 已实现，示例内容页码为项目示例 |
| 每个知识点有经典索引 | 已实现，8 个示例知识点均有案例关联 |
| 正反例对应准确命题 | 数据结构与示例已实现；数学正确性仍需人工审核 |
| 图像与证明步骤连接 | 证明步骤带引用工具与页码；数值分析明确非证明 |
| 每道交付练习有完整解答 | 32 道模板变式均有完整解答与校验记录 |
| 不同证明路径不因不匹配参考解答被判错 | 规则反馈保留 `needs_review`，仅在显式 `answer_check` 时做符号判定 |
| 完整学习流程 | 后端接口与前端主流程均已接入；自由函数场景仍为浏览器本地。 |
| 对话操作与界面一致、可撤销 | 13 种受控动作、场景版本与撤销已实现；前端 AI 改图已接入 `/api/ai/*`。 |
| 题目版本、作答、反馈可恢复 | 已实现版本、事件与历史保存 |
| 私有文件/记录/任务权限 | 已实现并测试 |
| 任务状态持久化、有限重试 | 已实现，单进程 |
| 导入不阻塞交互 | Worker 线程与任务表已实现；未做并发压测 |
| 电脑/安卓流程测试 | 桌面 Chrome 已完成联调验证；未做安卓与跨浏览器完整认证。 |

## 8. 在线预览与 bootstrap（2026-11-06）

- 新增 `GET /api/v1/bootstrap`（需登录），一次返回目录、详情、练习、作答、笔记、收藏、工作台、图谱、热力矩阵和诊断；本地实测 147 KB、0.13 s。
- 新增 `online_server.py`，同一端口提供 API 与 `frontend/dist-online` SPA；Cloudflare Quick Tunnel 公网实测首页、资源、健康检查、登录和浏览器工作台通过。
- 在线使用独立 `var-online/online.db`，生产环境强密钥与随机管理员密码/邀请码；API 文档关闭。
- 该在线形态是临时预览，不是正式部署；Quick Tunnel 无可用性保证。
- DeepSeek 适配：新增 provider preset、`/api/v1/ai/test`、`deepseek-reasoner` 参数降级、402 余额错误和 JSON 空内容重试；`tests/test_deepseek_adapter.py` 用模拟 HTTP 响应覆盖请求 URL、鉴权头、JSON 参数、reasoner 参数和余额错误。**2026-11-06 已用真实 DeepSeek key 实测**：`/api/v1/ai/test` 200（模型回落 `deepseek-flash`，约 2.2 s），`/api/ai/plot` 成功返回 `sin(x)` 场景。
- 三维曲面：新增 `POST /api/v1/ai/surface`、`SurfaceScene` 校验和 `compile_surface_expression`；真实 DeepSeek 将 `x^2+y^2` 改为 `sin(x)*cos(y)` 并调整视角为 60°/35°，返回 200。`tests/test_surface_adapter.py` 覆盖表达式校验、未知符号拒绝和 mock 接口。
| 备份恢复、成本记录 | 未做备份演练；成本仅记录 token 与调用次数，未接入真实单价 |
