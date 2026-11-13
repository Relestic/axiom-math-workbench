# 前端架构与迭代指南

这次重构把原来的“登录后原地替换模块常量 + localStorage 镜像”改成了**单一数据源**：

```text
backend API
   │
   ▼
domain/dto.ts          服务端原始结构（snake_case）
   │
   ▼
domain/mappers.ts      纯映射，无 React、无副作用
   │
   ▼
app/DataProvider.tsx   加载、缓存、选择、写入、刷新
   │
   ▼
pages/**               只消费 useAppData()，不直接读写服务端数据
```

## 目录职责

| 路径 | 职责 | 修改时注意 |
| --- | --- | --- |
| `src/domain/types.ts` | 页面使用的视图模型 | 页面字段的单一类型来源 |
| `src/domain/dto.ts` | 后端响应结构 | 改后端契约时先改这里 |
| `src/domain/mappers.ts` | DTO → 视图模型 | 纯函数，最容易单测和复用 |
| `src/data/offline/` | 离线/演示回退数据 | 只由 DataProvider 读取 |
| `src/app/DataProvider.tsx` | 服务端/离线数据、选择、mutation | 新业务写操作放这里 |
| `src/lib/session.tsx` | 登录、注册、令牌、用户资料 | 不承载学习数据 |
| `src/lib/api.ts` | HTTP、Bearer、刷新令牌 | 页面不直接拼 URL |
| `src/pages/learning/` | 教材学习、练习题库；正反例/证明/完整解答/复盘已并入教材或题内 | 布局改动只动对应文件 |
| `src/modules/visualization/embedded/` | 教材内嵌图像、正反例、上下文 AI | 复用二维场景引擎与 AI 请求 |
| `src/pages/maps/` | 星图、热力矩阵 | 同上 |
| `src/modules/visualization/` | 二维/三维可视化、场景校验、AI 请求 | 人工控件与 AI 修改共用 Scene 入口 |
| `src/pages/Dashboard.tsx` 等 | 工作台、笔记、诊断、PDF | 从 App 壳中拆出 |

## 新增一个页面的流程

1. 在 `navigation.ts` 注册路由和导航文案。
2. 在 `src/pages/` 新建页面组件，使用 `useAppData()`。
3. 如果需要新接口，先在 `lib/api.ts` 加请求函数，再在 `DataProvider` 增加状态或 mutation。
4. 不要在页面里直接 `fetch`，也不要再次引入离线数组做“服务端覆盖”。

## 改一个后端字段的流程

1. 更新 `domain/dto.ts` 的字段名。
2. 更新 `domain/mappers.ts` 的映射。
3. 类型检查会指出所有受影响的页面。
4. 如果字段影响工作台/图谱，补 `mapDashboard`、`mapGraph`、`mapPractice`。

这比旧方案多了一步映射，但换来的是：不会出现“后端改了、某个页面忘了”、“刷新后图谱回到静态数据”、“退出登录还看到上一位用户笔记”这类问题。

## 写操作约定

- 所有服务端写操作只能通过 `DataProvider`：
  - `submitAttempt`
  - `rateAttempt`
  - `saveNote` / `deleteNote`
  - `toggleBookmark`
  - `submitDiagnostic`
  - `loadHint` / `loadSolution`（读取并记录查看行为）
- 页面只负责收集输入、展示 loading/error、调用 mutation。
- 写成功后 Provider 更新对应领域；工作台/图谱/热力矩阵由 `refreshDerived` 增量刷新。
- 离线模式使用 `data/offline/`，写操作落在 `axiom-offline-*`，不会伪装成服务端数据。

## 当前仍保留的本地状态

这些是**界面偏好**，不是业务数据，因此仍允许 localStorage：

- `axiom-last-page`：工作台“继续上次学习”
- `axiom-exercise-variant-*`：当前参数变式
- `axiom-draft-*`：未提交草稿
- `axiom-assistance-*`：提示/解答查看状态，用于判断是否独立作答
- `axiom-function-scene` / `axiom-function-chat`：自由函数工作区
- `axiom-explore-request`：从教材跳转到图像工作区时的一次性上下文

后续如果要做多设备同步，再把这些逐项迁到后端，而不是继续增加 `axiom-*-snapshot` 镜像。

## 验证

```powershell
cd frontend
node node_modules/typescript/bin/tsc -b
npm test
npm run build
```

后端测试：

```powershell
cd backend
python -m pytest -q
```

浏览器验证至少覆盖：登录 → 工作台 → 教材 → 练习提交 → 复盘 → 图谱 → 热力矩阵 → 笔记 → 退出/离线。
