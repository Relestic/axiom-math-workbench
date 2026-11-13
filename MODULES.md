# Axiom 业务模块边界

这份文档是拆分项目的总契约。代码可以逐步迁移，但模块的“负责范围、对外接口、数据归属、验收标准”以本文为准。

## 0. 模块地图

| 模块 | 负责 | 当前前端入口 | 当前后端 |
| --- | --- | --- | --- |
| 教学内容 | 教材、知识点、定义、定理、证明、经典正反例、出处 | `pages/learning/Textbook.tsx` + `modules/visualization/embedded/` | `content`/`catalog`/`exercises` 的知识内容接口 |
| 数学可视化 | 二维函数、教材内嵌图像、三维曲面、参数、场景、撤销、AI 对话改图 | `modules/visualization/` | `api/ai.py`、`schemas/visual.py`、`schemas/surface.py` |
| 练习与复盘 | 出题、提示、完整解答、作答、AI 讨论/批改、历史作答 | `pages/learning/Exercises.tsx`（复盘在题内） | `api/exercises.py`、`modules/exercise_service.py`、`exercise_discussion.py` |
| 学习进度 | 掌握度、复习计划、工作台、图谱学习状态 | `pages/Dashboard.tsx`、`maps/` | `modules/progress_service.py`、`graph_service.py` |
| 个人记录 | 笔记、收藏、观察记录、导出 | `pages/Notes.tsx`、题内保存入口 | `api/notes.py`、`api/bookmarks.py`、`visual` 观察接口 |
| 账号与权限 | 登录、用户身份、管理员权限、数据归属 | `pages/Auth.tsx`、`app/DataProvider.tsx` 的会话部分 | `api/auth.py`、`auth.py`、`api/admin.py` |

共享能力：

- AI 连接、超时、错误结构、用量：`backend/app/adapters/llm.py`，`api/ai.py` 中的 status/test。
- 数学计算与表达式：`backend/app/adapters/math.py`、`frontend/src/lib/functionEngine.ts`、`lib/plotScene.ts`。
- 数据库、事务、迁移：`backend/app/db.py`、`models/`。
- 公共 UI：`styles.css`、`components/`、`pages/learning.css`。

边界规则：

1. **AI 改图的提示词、场景校验归可视化模块**；AI 出题、批改提示词归练习模块；两者只共享模型连接与用量。
2. **写数据只能发生在所属模块**。练习模块提交 `Attempt`，进度模块只读取 Attempt 并更新派生掌握度，不能改 `answer_text`。
3. **跨模块只通过接口**：页面不能直接改另一模块的存储；需要时由模块提供 command/query。
4. **统一编号**：`concept_id`、`exercise_id`、`attempt_id`、`scene_id`、`note_id` 在前后端使用同一字符串主键；场景/题目的 JSON 字段变更必须前后端同一次验收。

## 1. 教学内容

- **负责范围**：教材学习主页面、章节/知识点、定义/条件/定理/证明步骤、教材内嵌的正反例、引用出处。独立的正反例实验室、证明思路页面不再存在，内容以教材内按需展开呈现。
- **对外接口**：`GET /api/v1/catalog`、`GET /api/v1/concepts/{id}`、`GET /api/v1/sections/{id}`、`GET /api/v1/proofs/{id}`；教材页通过 `TeachingFigure` 使用可视化模块，不复制图像引擎。
- **数据归属**：教学内容模块/管理员可写；其他模块只读。其他模块只能引用 `concept_id` 或 `proof_step_ref`，不能复制正文作为第二数据源。
- **验收**：首屏可见当前知识点、定义起始、AI 入口；证明可在定理下展开；图像和正反例在教材内切换；未发布内容对学生不可见；引用不存在的证明步骤失败；不伪造教材页码。

## 2. 数学可视化

- **负责范围**：二维函数场景（曲线、参数、范围、分析工具）、教材内嵌图像、三维曲面、视角、显示项、人工编辑、AI 改图、撤销、刷新恢复。
- **对外接口**：页面入口 `FunctionWorkspace`/`SurfaceWorkspace`/`TeachingFigure`；场景统一入口 `applyFunctionScene` / `normalizeSurfaceScene`；AI 请求 `requestPlotChange`（支持教材 `context`）/ `requestSurfaceChange`；状态查询 `fetchAIStatus`。
- **数据归属**：浏览器 localStorage 按用户+知识点保存教材场景和最近 20 条对话，撤销栈只在当前会话；AI 只返回候选场景，不能直接写 React 状态或服务器场景，必须过校验入口。用户保存的“观察记录”属于个人记录模块。
- **验收**：人工和 AI 修改共用校验；非法范围/表达式保留原图；撤销与刷新恢复一致；三维拖动与视角更新不重采样；AI 失败保留原场景；教材上下文（知识点/定义/案例）随请求发送；连续追问有上限且可取消。

## 3. 练习与复盘

- **负责范围**：模板/变式出题、提示、完整解答、AI 实时讨论、作答提交、AI 最终批改、反馈、错因、自评与复盘。**讨论不等于提交**：讨论不落库、不评分；只有提交答案才创建 Attempt。
- **对外接口**：`GET /api/v1/exercises`、`/hint`、`/solution`、`POST /api/v1/attempts`、`PATCH /api/v1/attempts/{id}`、`GET /api/v1/attempts`；AI 讨论 `POST /api/v1/ai/exercises/discuss`；AI 提交 `POST /api/v1/ai/exercises/submit`。批改结果字段 `status`、`score`、`feedback.criteria`、`feedback.ai`、`feedback.reference_answer`。
- **数据归属**：练习模块是 `Exercise` 与 `Attempt` 的唯一写入者；用户只能写自己的 Attempt。进度模块只读 Attempt 计算掌握度；个人记录模块只读 Attempt 生成笔记。
- **验收**：讨论不创建 Attempt、不评分；提交答案才创建一条 `ai_reviewed` Attempt，带 AI 优点/缺口/下一步；AI 不可用时保留答案且不落库；幂等键重复提交返回同一 Attempt；越权读取返回 404；历史作答只在题内查看。

## 4. 学习进度

- **负责范围**：掌握度、复习队列/计划、工作台聚合、知识图谱中的学习状态。诊断数据保留但不再有独立页面或自动触发流程。
- **对外接口**：`GET /api/v1/dashboard`、`/progress/summary`、`/progress/review-queue`、`/progress/heatmap`、`GET /api/v1/graph`；旧诊断 API 作为数据兼容保留，不接回用户流程。
- **数据归属**：进度模块可写派生表/诊断结果与复习状态；不能改练习原文、答案或用户笔记。练习提交只发领域事件，进度模块消费事件更新派生数据。
- **验收**：提交/自评后工作台和热力图更新；越权用户的 Attempt 不进入统计；诊断答案正确性由诊断数据决定；重复提交幂等；图谱状态能解释来源。

## 5. 个人记录

- **负责范围**：笔记、收藏、观察记录、导出。
- **对外接口**：`GET/POST/PATCH/DELETE /api/v1/notes`、`/bookmarks`、观察记录接口；导出由模块生成文件。
- **数据归属**：只允许本人写自己的记录；练习/可视化只能通过 command 请求保存，不能直接改记录表。笔记可引用 `concept_id`/`attempt_id`，但删除来源不级联删除笔记正文。
- **验收**：跨用户读写 404；删除后可恢复/审计策略明确；导出内容与页面一致；笔记保存失败不丢草稿。

## 6. 账号与权限

- **负责范围**：注册/登录/刷新、用户身份、管理员权限、数据归属、邀请码、限流。
- **对外接口**：`/api/v1/auth/*`、`/api/v1/admin/*`、当前用户 `GET /api/v1/auth/me`；其他模块只接收已验证的 `User`，不自行解析 token。
- **数据归属**：账号模块是 User/Session/Invite 的唯一写入者；其他模块的数据必须带 `user_id` 并由授权层校验归属。用户级 DeepSeek 凭据 `user_ai_credentials` 归属账号模块，可视化/AI 只通过 `llm` 适配器读取解密后的临时凭据，不直接读写该表。管理员写操作必须留审计记录。
- **验收**：刷新令牌重放被拒绝；越权访问返回 404/403；管理员操作有审计；注销/改密使旧会话失效；密钥不进入前端、不写入日志。

## 7. 共享能力

| 能力 | 位置 | 约定 |
| --- | --- | --- |
| AI 连接/超时/错误/用量 | `backend/app/adapters/llm.py` | 业务模块只提交 prompt + validator + purpose；不自行发 HTTP |
| 数学解析/数值/符号 | `backend/app/adapters/math.py`、前端 `lib/functionEngine.ts` | 所有表达式先白名单校验；符号失败保留不确定性 |
| 数据库 | `backend/app/db.py`、`models/` | 事务由 API 层控制；跨模块只通过服务函数 |
| 公共 UI | `styles.css`、`components/` | 业务模块不复制全局按钮/表单样式；模块 CSS 只加命名空间 |

## 8. 任务格式

以后每个任务按下面格式提交，必须能独立验收：

```text
任务：给二维函数增加参数范围编辑。
范围：可视化模块。
接口变化：参数包含名称、当前值、最小值和最大值。
验收：手动和 AI 修改使用相同校验；非法范围保留原图；支持撤销与刷新恢复。
交付：代码、验证结果、涉及的接口变更。
```

## 9. 迁移顺序与当前状态

1. **可视化工作区（已完成）**：`FunctionWorkspace` 拆为 `components/` + `hooks/useFunctionWorkspace` + `scene/` + `two-d/`；三维页面迁入 `three-d/`；AI 请求集中到 `api.ts`。页面入口保留 `pages/FunctionWorkspace.tsx` 兼容导出。
2. **数据管理（已完成主要提取）**：`DataProvider` 的练习、记录、进度写操作已迁入 `modules/practice/usePracticeActions`、`modules/records/useRecordActions`、`modules/progress/useProgressActions`；DataProvider 从 594 行降到 326 行，只保留组合、加载、刷新、错误边界和 context。
3. **公共接口（已完成基础契约）**：`frontend/src/modules/contracts.ts` 统一 ID/领域类型；[docs/contracts.md](docs/contracts.md) 记录场景、题目、作答、知识点字段及前后端 schema 对照；离线/服务端校验入口一致。
4. **任务与版本（已完成）**：源码已用 Git 管理，每次任务一个可验收提交；发布 ZIP 由 `cd frontend && npm run package:windows` 生成，产物写入 `releases/` 且不入库；本次产物是 `Axiom-Windows-Full-20261113T152953Z.zip`（44,671,800 字节，4,335 个文件）。`node_modules`、数据库、`.env` 和密钥均在忽略列表。

### Git 备份约定

改动前先留备份标签：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/git-backup.ps1 -Label "before-layout-fix"
```

脚本会创建 `backup/<label>-<timestamp>` annotated tag，并打印回退命令。每个可验收功能单独提交；发布前额外打 `release/<version>` 标签。不要用 `git reset --hard` 覆盖未提交内容。

本次排版修复前的备份：

```text
tag/branch: backup/pre-layout-fix-20261107
```

修复提交后再打 `release/2026-11-07-layout-fix`。

