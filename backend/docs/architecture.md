# 后端架构说明

## 1. 形态

单机可运行的**模块化单体**。API、业务服务、后台任务共享同一套模型与业务代码；任务通过数据库中的 `jobs` 表排队，单进程 Worker 消费。生产扩展时只替换部署层，不改变领域边界。

```text
浏览器 / 前端
   │  HTTPS + Bearer JWT
   ▼
Flask API（api/）
   │  权限、参数校验、统一错误、限流、请求 ID
   ▼
业务服务（modules/）
   ├─ content_service      教材、概念、证明、案例、搜索、工具解锁
   ├─ graph_service        图谱状态、前置缺口、路径
   ├─ visual_service       模板、场景版本、观察
   ├─ conversation_service 受控对话动作
   ├─ exercise_service     练习、作答、反馈、变式
   ├─ progress_service     仪表盘、热力图、诊断、复习
   └─ ai_service           改图、解释、反馈、已审核案例
   │
   ├─ adapters/            数学（SymPy）、模型（OpenAI 兼容）、文件、PDF
   ├─ workers/queue.py     jobs 表 + Worker + 用量
   └─ models/              SQLAlchemy 2.0（37 张表）
   ▼
SQLite（默认）/ PostgreSQL        私有文件目录
```

## 2. 请求生命周期

1. `before_request` 生成/校验 `X-Request-ID`，执行全局 IP 限流；OPTIONS 直接返回 CORS 预检。
2. `require_auth()` 解析 Bearer JWT（HS256、issuer/audience 固定），加载用户并检查角色；所有个人资源再检查 `user_id`。
3. 路由解析路径参数，`parse_json`/`parse_query` 用 Pydantic 校验；校验失败统一返回 422 与字段级 `details`。
4. 业务服务执行查询/写入；SQLite 事务在请求结束前提交。
5. 错误统一为 `{error:{code,message,details}, request_id}`；`ApiError`、HTTP 异常、完整性冲突和未捕获异常分别处理。
6. `after_request` 添加安全头、CORS、请求 ID；`teardown_appcontext` 关闭请求 session。

## 3. 身份与权限

- access token 30 分钟；refresh token 14 天、只存 SHA-256 摘要、每次使用轮换；检测到旧 token 重放时撤销用户全部活跃刷新令牌。
- 邀请码注册：HMAC-SHA256 摘要 + `UPDATE ... WHERE used_at IS NULL` 条件更新，避免并发双用。
- 角色只有 `student` / `admin`。管理员端点统一 `require_admin`；学生只看到 `status=published` 且审核状态可交付的内容。
- 私有资源不共享：场景、观察、对话、作答、笔记、收藏都带 `user_id`；越权按 404 处理，避免泄露存在性。

## 4. 内容生命周期

```text
教材元数据 / PDF 上传
  → 结构检查（PDF 魔数、大小、加密标记、页数估计）
  → 可选文本提取（有 pdfplumber/pypdf 时）
  → 人工导入/修订章节与片段（草稿）
  → 知识点、证明、命题、经典案例（草稿）
  → 发布检查（定义、步骤、性质、完整解答）
  → published + ContentRevision 快照
  → 撤回（withdrawn），历史快照保留
```

`content_revisions` 保存目标类型、ID、版本、快照、状态和审核人；发布/撤回都会写入一条新快照，不修改旧快照。当前没有“一键恢复旧版本”的 UI/接口，这是已知差距。

## 5. 练习与学习证据

- 32 道种子变式来自 8 个已审核模板，每个变式带 `provenance`（模板、参数、模型/提示词版本为 null）与 `validation`（模板规则、解答存在、是否符号可检、证明不自动判分）。
- 提交作答时：
  - 幂等键避免重复提交；
  - 合并客户端申报的提示/解答使用与后端记录的查看事件；
  - 若有 `answer_check`，用 SymPy 判定等价（积分题忽略加法常数）；
  - 否则给出可解释的结构提示，状态固定 `needs_review`，不判定“错误”。
- 事件表分离“查看提示/解答/提交/自评/反馈”，便于复盘与学习证据分析。
- 掌握度是加权估计：自评理解 1.0、待定 0.35、需复习 0.1；看过解答 ×0.35、用过提示 ×0.8。它只用于排序复习，不是能力标签。

## 6. 图与状态

- 节点类型：概念、前置、案例、正式版扩展；关系 11 种，带条件、证据、来源页、出处类型与审核状态。
- 用户状态：`current`（最近学习）、`mastered`（掌握度 ≥60）、`unlocked_not_started`、`locked`、`locked_extension`、`counterexample`。
- 前置缺口：沿 `prerequisite_for` / `uses_in_proof` / `implies` 入边，统计“被当前或已学节点引用但未掌握”的源节点；返回引用数与引用者，不冒充证明数量。
- 路径：只走有向边，BFS 有最大深度；找不到返回 404，不伪造关联。

## 7. 图像与数学

- `Scene` 契约与前端 camelCase 一致，Pydantic 校验结构与范围；`validate_and_normalize_scene` 再解析表达式，自动补齐单字母参数（最多 8 个），删除未使用参数。
- SymPy 解析前：长度 ≤300、运算数 ≤300、禁用语法列表、标识符白名单；`parse_expr` 只提供数学函数与常量，禁止内建函数。
- 条件表达式 `x<0 ? -x : x^2` 转换为 `Piecewise`；`and/or/not` 转布尔运算。
- 分析接口返回：符号导数、二阶导数、ε–δ 数值偏差、导数幅值上界、数值 δ 上界、Taylor 系数与数值余项界、三种 Riemann 和、连续性诊断。所有数值结论都带 `proof: false` 和免责声明。
- 场景保存带 `expected_version`，冲突返回 409 与当前版本；撤销基于历史版本生成新版本，不删除历史。

## 8. 任务与模型

- `jobs`：类型、状态、payload、result、错误、尝试次数、最大尝试、超时、幂等键、取消标记。状态 `queued/running/succeeded/failed/cancelled`。
- Worker 每 0.5 s claim 一条 queued 任务，在 Flask app context 中执行；失败在未达上限时重回队列。取消在任务结束后生效（无法中断阻塞中的 HTTP 调用）。
- 处理器：`textbook.parse`、`exercises.generate`、`attempt.feedback`。
- `model_calls` 记录每次调用：用途、模型、prompt 版本、token、耗时、状态、错误；失败也写记录（会提交当前事务）。
- AI 输出必须经严格 JSON + Pydantic + 场景/题目校验；不符合时返回 502/422，不覆盖当前状态。

## 9. 数据库与迁移

- 默认 SQLite，开启外键、WAL、`synchronous=NORMAL`；每个请求一个 session，Worker 使用独立 `session_scope()`。
- `migrations/runner.py` 按文件名顺序执行版本模块，`schema_migrations` 记录已应用版本；`0001_initial` 由 SQLAlchemy metadata 建表，`0002_indexes` 增加队列/进度复合索引。
- 迁移是前进式的；没有自动降级。正式发布前应在 PostgreSQL 上重建基线并切换到 Alembic（见下）。

## 10. 替换为完整产品技术栈

| 当前 | 目标 | 替换方式 |
| --- | --- | --- |
| Flask | FastAPI | 路由与错误处理替换为 FastAPI 依赖注入；`modules/` 与 `models/` 不改 |
| 单机线程 Worker | Celery + RabbitMQ | `jobs` 表保留为业务任务状态；Worker 改为 Celery task，claim 逻辑改为原子更新 |
| 自带迁移器 | Alembic | 用同一 metadata 生成 baseline，之后写 Alembic revision；删除 runner 调用 |
| SQLite | PostgreSQL | 设置 `AXIOM_DB_URL=postgresql+psycopg://...`，补充连接池配置，重跑迁移与并发测试 |
| 进程内限流 | Redis | 替换 `SlidingWindowLimiter` 实现，保留 `limit(name,key)` 接口 |
| 本地目录 | 私有对象存储 | 替换 `adapters/files.py` 的保存/读取，数据库只存 key 与权限 |
| mock/OpenAI 兼容 | 多模型适配层 | 扩展 `adapters/llm.py`，保留 prompt 版本、用量与校验接口 |

## 11. 性能与容量备注

- 种子规模下接口响应通常 <100 ms；`/visualizations/analyze` 因 SymPy 求导与采样约 100–300 ms。
- 全量练习热力矩阵在 8 个概念 × 5 个能力下为常数级；扩展到数万条作答时应改为 SQL 聚合与索引。
- 任务线程与请求共享同一 SQLite 文件；写并发高时会出现锁等待，生产必须换 PostgreSQL 与独立队列。
- 没有做压测；`readme.md` 的并发与试用验收尚未进行。
