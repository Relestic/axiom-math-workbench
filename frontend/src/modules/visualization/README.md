# 可视化模块（visualization）

负责二维函数工作区、三维曲面和它们共享的场景/AI 修改边界。AI 提示词与结果校验属于本模块；模型连接、超时、错误结构与用量统计属于共享 `backend/app/adapters/llm.py`。

## 目录

```text
visualization/
  components/        公式编辑器、参数面板、图表、AI 对话、模型设置
  two-d/             二维函数工作区页面（组合组件与 hook）
  three-d/           三维曲面、SVG 投影、视角、人工/AI 修改
  scene/             场景类型、加载、统一校验入口
  hooks/             页面状态、撤销、AI 请求、localStorage 恢复
  api.ts             可视化相关 AI 请求
  README.md          本文件
```

## 对外接口

| 入口 | 输入 | 输出 | 说明 |
| --- | --- | --- | --- |
| `two-d/FunctionWorkspace` | `onNavigate`、`onSaveNote`、`notify` | 页面 | 现有 `/explore` 页面入口；`pages/FunctionWorkspace.tsx` 仅重新导出 |
| `three-d/SurfaceWorkspace` | 无 | 页面 | 现有 `/surface` 页面入口 |
| `scene/functionScene` | `unknown` | 已校验的 `Scene` | `applyFunctionScene` 是唯一写入口 |
| `api.requestPlotChange` | 消息、当前 `Scene`、历史、`AbortSignal` | `{message, scene}` | 调 `/api/ai/plot` |
| `api.requestSurfaceChange` | 消息、当前 `SurfaceScene`、历史 | `{message, scene}` | 调 `/api/v1/ai/surface` |
| `api.fetchAIStatus` / `testAIConnection` | — | 状态/延迟 | `/api/ai/status`、`/api/v1/ai/test` |

`Scene` 的规范定义仍在共享的 `frontend/src/lib/plotScene.ts`（二维）和
`three-d/types.ts`（三维）；本模块只负责加载、校验和更新，不复制第二套契约。

## 数据归属

- **可写**：本模块在浏览器 `localStorage` 中保存当前函数场景、三维场景和最近对话；
  撤销栈只存在于当前页面会话。
- **只读**：模型状态、模型用量由共享 AI 适配器读取；可视化模块不能修改用户、练习
  或学习进度数据。
- **跨模块**：`onSaveNote` 交给个人记录模块；`onNavigate` 只做导航；AI 改图的结果
  必须经过 `applyFunctionScene` / `normalizeSurfaceScene` 才能进入状态。

## 统一校验与更新入口

人工编辑、AI 返回、撤销和刷新恢复都经过同一个函数：

```text
人工输入 ─┐
AI 返回  ─┼─> applyFunctionScene / normalizeSurfaceScene ─> React 状态 / localStorage
撤销     ─┘
```

因此：

- 非法范围和非法表达式不会替换当前图；
- AI 返回未通过校验时保留原场景；
- 每次成功修改进入同一撤销栈；
- 刷新时只加载通过校验的持久化场景。

## 验收

1. `npm test`：共享场景校验与表达式测试。
2. `npm run build:online`：二维/三维懒加载 chunk 正常。
3. 手动回归：
   - 打开 `/explore`，修改公式/参数后应用，撤销恢复；
   - 刷新页面恢复最近场景；
   - 输入非法范围，图像保持不变并显示错误；
   - AI 改图后，公式、参数、范围和撤销栈一起更新；
   - 打开 `/surface`，拖动旋转、AI 改曲面与视角。
4. 当前实测记录见 [`frontend/docs/verification.md`](../../../docs/verification.md)。

## 不负责

- 题目、作答、批改（练习与复盘模块）；
- 掌握度、诊断、复习计划（学习进度模块）；
- 笔记、收藏、观察导出（个人记录模块）；
- 登录、权限、数据归属（账号与权限模块）。

## 后续拆分

`components/` 目前按“编辑器 / 图表 / AI / 设置 / 下一步”拆分；`two-d/` 页面只负责组合。
下一步可以把三维 `SurfacePlot3D` 的投影计算抽到纯函数，并为二/三维场景增加同一套
`SceneAdapter` 契约测试。
