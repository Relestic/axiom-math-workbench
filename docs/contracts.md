# 公共接口契约

前后端修改同一字段时，以本表为准；一次任务必须同时更新类型、Pydantic schema、页面/API
测试，不能只改一端。

## 1. 统一 ID

| 对象 | 字段 | 形式 | 写入方 | 读取方 |
| --- | --- | --- | --- | --- |
| 知识点 | `concept.id` / `concept_id` | 字符串，如 `uniform` | 教学内容/管理员 | 教学、练习、进度、记录 |
| 题目 | `exercise.id` / `exercise_id` | 字符串，如 `uniform-3` | 练习模块 | 练习、进度、记录 |
| 作答 | `attempt.id` / `attempt_id` | UUID/字符串 | 练习模块 | 练习、进度、记录 |
| 场景 | `scene.id` + `scene.version` | 字符串 + 正整数 | 可视化/场景 API | 可视化、个人记录 |
| 笔记 | `note.id` / `note_id` | UUID/字符串 | 个人记录 | 个人记录 |
| 用户 | `user.id` / `user_id` | UUID/字符串 | 账号模块 | 所有业务模块（授权过滤） |

规则：跨模块只传 ID 或明确 DTO，不把另一个模块的内部 ORM/React 状态直接传出。

## 2. 可视化场景

二维 `Scene`（前端 `frontend/src/lib/plotScene.ts`，后端 `SceneModel`）：

```text
mode, curves[], parameters[], activeId,
xMin, xMax, yMin, yMax,
x0, h, epsilon, delta, integralStart, integralEnd,
subdivisions, order, band, neighborhood, danger
```

三维 `SurfaceScene`（前端 `three-d/types.ts`，后端 `backend/app/schemas/surface.py`）：

```text
expression,
xMin, xMax, yMin, yMax, resolution,
view { azimuth, elevation, heightScale, zoom },
display { opacity, wireframe, showAxes, palette }
```

验收：

- 人工编辑、AI 返回、撤销、刷新恢复都经过同一校验入口；
- 非法值保留原场景；
- 前后端字段名和范围一致（camelCase JSON）；
- `scene.version` 冲突返回 409，不覆盖他人修改；
- 教材内 AI 请求额外携带 `context`：`conceptId`、`chapter`、`title`、`definition`、`formula`、`case`、`caseClaim`、`caseTags`、`source`，后端把它放进模型上下文而不是只拼接在用户消息里。

## 3. 题目与作答

`Exercise` 对外字段：

```text
id, code, topic_id, title, statement, domain,
difficulty, skill, exercise_type, allowed_refs,
hint, solution_available, checks, common_errors
```

`Attempt` 对外字段：

```text
id, exercise_id, exercise_version, answer_text,
assistance { hints_used, solution_viewed, solution_viewed_before_submit },
self_rating, status, score, error_types,
feedback {
  status, summary, observations[],
  correct?, criteria[]?, reference_answer?,
  grading_scope, needs_review, checker
}
```

验收：

- `POST /api/v1/attempts` 必须接收幂等键并返回同一 Attempt；
- 计算题 `score=100/0`，不能解析时 `score=null` 且 `needs_review=true`；
- 证明题 `score=0..100`、`grading_scope=structural`、`needs_review=true`；
- 越权读取/修改 Attempt 返回 404；
- 前端 DTO 类型、mapper 与后端 serializer 同步更新。

## 4. 练习讨论与 AI 提交

| 动作 | 接口 | 是否落库 | 输入 | 输出 |
| --- | --- | --- | --- | --- |
| 实时讨论 | `POST /api/v1/ai/exercises/discuss` | 否 | exercise_id、当前答案、消息、最近讨论 | `{message, provider, model}` |
| 提交答案 | `POST /api/v1/ai/exercises/submit` | 是，一条 Attempt | exercise_id、最终答案、讨论、提示/解答使用 | Attempt（`status=ai_reviewed`） |

`Attempt.feedback` 的 AI 字段：

```text
feedback.ai {
  verdict: strong | partial | needs_work,
  strengths[], gaps[], next_steps[],
  provider, model
}
```

验收：

- 讨论前后 Attempt 数量不变；
- 讨论不返回分数；
- 提交才创建 Attempt，score 0–100，`feedback.grading_scope="ai"`；
- AI 不可用时不创建 Attempt，保留答案；
- 讨论历史只作为上下文，不把 AI 的话当成学生答案。

## 5. 用户 AI 凭据

| 字段 | 方向 | 说明 |
| --- | --- | --- |
| `api_key` | 仅写入 | 只接受 `sk-` 开头、12–200 字符；不在响应返回 |
| `model` | 写入/读取 | `deepseek-chat` 或 `deepseek-reasoner` |
| `source` | 读取 | `user` / `system` / `none` |
| `using_user_key` | 读取 | 当前请求是否使用个人凭据 |
| `key_hint` | 读取 | 仅末四位，如 `…7890` |
| `encrypted_api_key` | 仅数据库 | Fernet 加密，不进入任何 API/日志 |

验收：

- 两个用户各自保存 Key，互相不能读取或覆盖；
- 保存后 `/api/v1/ai/test` 使用用户 Key；
- 移除后回退系统 Key；
- 响应和日志中不出现明文；
- 修改 `AXIOM_SECRET_KEY` 后旧 Key 解密失败并提示重新填写，不静默使用系统 Key。

## 6. 接口与 schema 对照

| 前端调用 | 后端路由 | Schema |
| --- | --- | --- |
| `api.requestPlotChange` | `POST /api/ai/plot` | `AIPlotRequest` |
| `visualization/api.requestSurfaceChange` | `POST /api/v1/ai/surface` | `SurfaceAIRequest` |
| `practice/api.submitAttemptTyped` | `POST /api/v1/attempts` | `AttemptCreateRequest` |
| `practice/api.rateAttemptTyped` | `PATCH /api/v1/attempts/{id}` | `AttemptPatchRequest` |
| `records/api.createNoteTyped` | `POST /api/v1/notes` | `NoteCreateRequest` |
| `progress/api.submitDiagnosticTyped` | `POST /api/v1/diagnostic` | `DiagnosticSubmitRequest` |
| `identity/api.useSession` | `/api/v1/auth/*` | auth schemas |
| `reader/api.requestReaderQuestion` | `POST /api/v1/ai/reader/discuss` | `ReaderDiscussionRequest` |

## 7. 修改流程

1. 先改 `backend/app/schemas/*.py` 与 serializer，补后端测试；
2. 同一次提交改 `frontend/src/domain/dto.ts` / `types.ts` / `mappers.ts` 和模块 API；
3. 运行 `python -m pytest -q`、`npm test`、`npm run build`；
4. 在验收记录写明字段变更、兼容策略和手工回归结果；
5. 一次提交只包含一个可验收功能，ZIP 由 `npm run package:windows` 生成，不提交产物。

## 8. 原讲义、图像链接与阅读 AI

### 8.1 原讲义状态（浏览器 IndexedDB）

| 字段 | 作用 |
| --- | --- |
| `userId` | 当前账号；离线/演示使用独立键 |
| `docId` | 由 PDF 内容指纹生成的稳定文档 ID；演示文件使用固定 ID |
| `fingerprint` | SHA-256，用于同名文件不误用旧链接 |
| `name`, `size`, `lastModified` | 文件元数据，仅用于显示与排查 |
| `blob` | 本机 PDF 字节；不上传整本文件 |
| `pageIndex`, `zoom`, `scrollTop` | 阅读位置，按用户 + docId 保存 |

### 8.2 页级图像链接

```text
{ linkId, pageIndex, label, description, conceptId, caseId, builtIn? }
```

- `pageIndex` 从 0 开始，界面显示时 +1。
- 链接按 `docId` 保存；文件指纹改变后不自动继承旧链接。
- 演示讲义带固定链接；用户自己的讲义初始为空，可在当前页手工添加。
- 点击链接先把阅读状态写入 IndexedDB，再进入隐藏路由 `#image`；来源页、文件名、`pageIndex`、`docId` 由 sessionStorage 传递，不在 URL 中放本地绝对路径或全文。
- 返回按钮和浏览器后退都回到 `#textbook`，由 IndexedDB 恢复文件、页码、缩放与滚动位置。
- 无来源直接打开 `#image` 时显示“还没有打开讲义来源”，不展示无关图像。

### 8.3 阅读页 AI

`POST /api/v1/ai/reader/discuss` 请求：

```text
document_name, page_index, page_count,
page_text (max 20000), selected_text (max 4000),
question, history (max 10)
```

响应：`{ message, provider, model, page_text_available }`。

- 只发送当前页文字与用户选段；没有文本时 `page_text_available=false`，提示模型明确说明无法读取，不得假装读过整份 PDF。
- 不写 Attempt、不修改讲义或场景；失败保留输入和阅读位置。
- API 变更必须同步前端 `modules/reader/api.ts`、`backend/app/schemas/ai.py` 与测试。
