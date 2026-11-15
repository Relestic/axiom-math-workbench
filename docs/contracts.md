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
| `reader/api.analyzeDocument` | `POST /api/v1/ai/reader/analyze` | `ReaderAnalyzeRequest` |
| `reader/api.fetchReaderSettings` | `GET /api/v1/reader/settings` | reader settings |
| `reader/api.saveReaderRule` | `PUT /api/v1/reader/rules/{task}` | `ReaderRuleUpdate` |

## 7. 修改流程

1. 先改 `backend/app/schemas/*.py` 与 serializer，补后端测试；
2. 同一次提交改 `frontend/src/domain/dto.ts` / `types.ts` / `mappers.ts` 和模块 API；
3. 运行 `python -m pytest -q`、`npm test`、`npm run build`；
4. 在验收记录写明字段变更、兼容策略和手工回归结果；
5. 一次提交只包含一个可验收功能，ZIP 由 `npm run package:windows` 生成，不提交产物。

## 8. Word 原讲义、自动链接与 AI 规则

### 8.1 文档与阅读状态（浏览器 IndexedDB）

| 字段 | 作用 |
| --- | --- |
| `userId` | 当前账号；离线/演示使用独立键 |
| `docId` | 由 DOCX 内容指纹生成；演示文件使用固定 ID |
| `fingerprint` | SHA-256，同名不同版本不误用旧链接 |
| `format` | `"docx"`；旧记录缺省按 `"pdf"` 辨认 |
| `blob` | 本机原文件；不上传整本讲义 |
| `blocks` | 由 `docxAdapter` 解析的章节、段落、表格、公式、图片与警告；按解析版本重建 |
| `blockId` | 同一文件与解析版本内稳定；不可把 Word 段落塞进旧 `pageIndex` |
| `start`, `end`, `exactText` | 原文范围，UTF-16 半开区间 `[start,end)` |
| `fontSize`, `blockId`, `viewportOffset` | 阅读位置；窗口变化后按段落恢复 |

### 8.2 原文链接与自动识别

```text
ReaderLink {
  id, blockId, start, end, exactText, pageIndex: 0,
  label, description, conceptId, visualizationId, caseId, focus,
  origin: builtin | manual | auto | local | correction,
  status: candidate | verified | needs_review,
  rulesVersion?
}
```

- `local` 是本地词库候选，`auto` 是模型候选；两者都要经过程序校验。
- 校验：块存在、`exactText` 真实出现、`occurrence` 消歧、目标在可用清单、范围不重叠、否定/人物介绍语境拒绝。
- 点击先把 `docId/blockId/start` 写入阅读状态，再进入 `#image`；来源通过 sessionStorage 传递。
- 返回和浏览器后退回到 `#textbook`，按 `blockId` 滚动并聚焦原链接。
- 旧 PDF 仍走 `#pdf-reader`，使用 `pageIndex`；新旧状态不得混用。

### 8.3 AI 规则与示例

| 接口 | 用途 |
| --- | --- |
| `GET /api/v1/reader/settings` | 读取识别/图像/问答规则与当前用户示例 |
| `PUT /api/v1/reader/rules/{task}` | 保存一个新版本并停用旧版本 |
| `DELETE /api/v1/reader/rules/{task}` | 恢复默认 |
| `POST /api/v1/reader/examples` | 保存纠正示例，含原文、目标或“不链接”与理由 |
| `DELETE /api/v1/reader/examples/{id}` | 删除示例 |

规则和示例按用户隔离。保存示例只改变识别参考，不训练外部模型；重新识别不覆盖用户明确否定的链接。

### 8.4 自动识别接口

`POST /api/v1/ai/reader/analyze` 请求有限块批次：

```text
document_name, doc_id, parser_version,
blocks[{block_id, section_title, text}],
visualizations[{id, label, concept_id, case_id, focus}],
max_candidates
```

响应：`{ candidates, rejected, rules_version, provider, model, status }`。

- 服务端组装固定输出契约 + 当前用户识别规则 + 最近示例 + 原文块 + 可用目标清单。
- 模型只返回候选文本/目标；字符范围、歧义、重叠和目标有效性由程序校验。
- 无 Key 时返回真实错误，前端保留本地词库候选并明确“未运行模型识别”。

### 8.5 阅读问答

`POST /api/v1/ai/reader/discuss` 在旧 PDF 字段外增加：

```text
source_type: "pdf" | "docx",
block_id, section_title, document_id
```

- Word 只发送当前章节/段落文字与用户选段，不发送整本文件。
- 响应 `page_text_available=false` 时必须说明无法读取该段，不得假装已读整份文档。
- 教学问答使用用户保存的 `qa` 规则；阅读和图像修改都不能取消程序校验/权限。
