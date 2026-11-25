# Axiom 业务模块边界

这份文档是拆分项目的总契约。代码可以逐步迁移，但模块的“负责范围、对外接口、数据归属、验收标准”以本文为准。

## 0. 模块地图

| 模块 | 负责 | 当前前端入口 | 当前后端 |
| --- | --- | --- | --- |
| 教学内容 | 教材、知识点、定义、定理、证明、经典正反例、出处 | `pages/Learning.tsx`、`pages/Exploration.tsx` 中的经典内容 | `content`/`catalog`/`exercises` 的知识内容接口 |
| 数学可视化 | 二维函数、三维曲面、参数、场景、撤销、AI 对话改图 | `modules/visualization/` | `api/ai.py`、`schemas/visual.py`、`schemas/surface.py` |
| 练习与复盘 | 出题、提示、完整解答、作答、反馈、复盘 | `pages/learning/Exercises.tsx`、`Review.tsx` | `api/exercises.py`、`modules/exercise_service.py` |
| 学习进度 | 掌握度、诊断、复习计划、工作台、图谱学习状态 | `pages/Dashboard.tsx`、`Diagnostic.tsx`、`maps/` | `modules/progress_service.py`、`graph_service.py` |
| 个人记录 | 笔记、收藏、观察记录、导出 | `pages/Notes.tsx`、复盘/观察入口 | `api/notes.py`、`api/bookmarks.py`、`visual` 观察接口 |
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

- **负责范围**：教材、章节、知识点、定义/条件/定理/证明步骤、经典案例与正反例、引用出处。
- **对外接口**：`GET /api/v1/catalog`、`GET /api/v1/concepts/{id}`、`GET /api/v1/sections/{id}`、`GET /api/v1/proofs/{id}`；前端只读卡片与导航。
- **数据归属**：教学内容模块/管理员可写；其他模块只读。其他模块只能引用 `concept_id` 或 `proof_step_ref`，不能复制正文作为第二数据源。
- **验收**：未发布内容对普通学生不可见；引用不存在的证明步骤失败；卡片/证明步骤可追溯到出处；搜索不返回越权内容。

## 2. 数学可视化

- **负责范围**：二维函数场景（曲线、参数、范围、分析工具）、三维曲面、视角、显示项、人工编辑、AI 改图、撤销、刷新恢复。
- **对外接口**：页面入口 `FunctionWorkspace`/`SurfaceWorkspace`；场景统一入口 `applyFunctionScene` / `normalizeSurfaceScene`；AI 请求 `requestPlotChange` / `requestSurfaceChange`；状态查询 `fetchAIStatus`。
- **数据归属**：浏览器 localStorage 保存当前场景和最近 20 条对话，撤销栈只在当前会话；AI 只返回候选场景，不能直接写 React 状态或服务器场景，必须过校验入口。用户保存的“观察记录”属于个人记录模块。
- **验收**：人工和 AI 修改共用校验；非法范围/表达式保留原图；撤销与刷新恢复一致；三维拖动与视角更新不重采样；AI 失败保留原场景；连续追问有上限且可取消。

## 3. 练习与复盘

- **负责范围**：模板/变式出题、提示、完整解答、作答提交、自动批改、反馈、错因、自评与复盘。
- **对外接口**：`GET /api/v1/exercises`、`/hint`、`/solution`、`POST /api/v1/attempts`、`PATCH /api/v1/attempts/{id}`、`GET /api/v1/attempts`；批改结果字段 `status`、`score`、`feedback.criteria`、`feedback.correct`、`feedback.reference_answer`。
- **数据归属**：练习模块是 `Exercise` 与 `Attempt` 的唯一写入者；用户只能写自己的 Attempt。进度模块只读 Attempt 计算掌握度；个人记录模块只读 Attempt 生成笔记。
- **验收**：计算题最终表达式错误返回 0 分与参考结果；无法解析不强行判错；证明题返回结构分和逐项覆盖，且 `needs_review=true`；幂等键重复提交返回同一 Attempt；越权读取返回 404。

## 4. 学习进度

- **负责范围**：掌握度、诊断、复习队列/计划、工作台聚合、知识图谱中的学习状态。
- **对外接口**：`GET /api/v1/dashboard`、`/progress/summary`、`/progress/review-queue`、`/progress/heatmap`、`POST /api/v1/diagnostic`、`GET /api/v1/graph`。
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
- **数据归属**：账号模块是 User/Session/Invite 的唯一写入者；其他模块的数据必须带 `user_id` 并由授权层校验归属。管理员写操作必须留审计记录。
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

1. **可视化工作区（已完成第一步）**：`FunctionWorkspace` 拆为 `components/` + `hooks/useFunctionWorkspace` + `scene/` + `two-d/`；三维页面迁入 `three-d/`；AI 请求集中到 `api.ts`。页面入口保留 `pages/FunctionWorkspace.tsx` 兼容导出。
2. **数据管理（下一步）**：把 `DataProvider` 的练习、记录、进度、身份操作提取为模块 hooks；`DataProvider` 只保留组合、刷新和错误边界。
3. **公共接口**：统一场景/题目/作答/知识点的字段与编号；前后端契约同一次变更、同一次验收。
4. **任务与版本**：源码用 Git，每次任务一个可验收提交；发布 ZIP 由独立打包脚本生成，不把 `node_modules`、数据库、`.env` 或密钥放入版本库。现有命令是 `cd frontend && npm run package:windows`，产物写在 `releases/` 并且不进入 Git。
