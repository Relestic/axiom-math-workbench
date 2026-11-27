# Axiom 公理 · 前端演示

根据项目根目录的 `readme.md` 与 8 张原型图实现的 React + TypeScript 前端。保留深色导航、紫色主色、讲义卡片、交互图像、练习热力矩阵与知识星图。

本次交付覆盖“连续性 → 定积分”的 8 个示例单元，并且已经与 [`backend/`](../backend/README.md) 联调：登录、内容卡片、练习、作答、笔记、收藏、诊断、图谱与练习热力图都读取/写入后端。它仍不等同于产品需求文档中的完整 MVP 验收。

## 启动

### 稳定本地预览（推荐）

双击项目根目录的 **启动本地预览.cmd**。它用 `backend/online_server.py` 在 `http://127.0.0.1:8080/` 同时提供前端与 API，不依赖 Cloudflare、隧道或系统代理；双击 **停止本地预览.cmd** 停止。详见 [LOCAL_PREVIEW.md](../LOCAL_PREVIEW.md)。

### 一键启动前后端

Windows 下双击项目根目录的 **启动完整演示.cmd**。它会：

1. 在独立窗口启动后端（首次运行会建库并写入演示数据）；
2. 等待 `http://127.0.0.1:8000/api/health` 就绪；
3. 启动前端并打开 <http://127.0.0.1:5174/>。

登录演示账号：

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 学生 | `demo@axiom.local` | `axiom-demo-2026` |
| 管理员 | `admin@axiom.local` | `axiom-admin-2026` |

### 分别启动

后端：

```powershell
cd backend
copy .env.example .env
python -m app.cli init
python -m app.cli seed --demo
python run.py
```

前端：

```powershell
cd frontend
npm ci
npm run dev
```

前端的 API 地址默认是 `http://127.0.0.1:8000`，可在 `frontend/.env` 中覆盖：

```text
VITE_API_BASE=http://127.0.0.1:8000
```

如果后端不在运行，登录页会显示连接错误，并提供 **“暂不连接后端，查看离线演示”**。离线模式继续使用原静态内容与浏览器存储。

## 文件分享：完整免安装版

`releases/Axiom-Windows-Full-*.zip` 包含当前前端、业务后端和独立 Python 环境。接收者在 Windows x64 上完整解压后，双击 `启动 Axiom.cmd` 即可使用，不需要安装 Node.js、Python 或依赖。默认地址为 `http://127.0.0.1:5186/`，使用上面的演示学生账号登录。

首次启动生成全新的演示数据库，保存到包内 `data/`；不会复制开发者的数据库、学习记录或模型密钥。AI 由接收者在包内 `backend/.env` 配置。操作说明见 [完整免安装版说明](docs/portable-full-readme.txt)。维护者运行 `npm run package:windows` 可重新打包；首次打包需联网获取运行环境和依赖，使用者启动无需下载。

## 前后端联调

- 登录页调用 `POST /api/v1/auth/login`，会话保存在 `axiom-api-session`；刷新令牌由 `lib/api.ts` 自动轮换。
- 登录成功后 `app/DataProvider.tsx` 一次性拉取目录、8 个知识点详情、32 道练习、图谱、练习热力矩阵、笔记、作答、收藏和诊断，经 `domain/mappers.ts` 转成页面视图模型。页面只读 `useAppData()`，不再原地替换模块常量。
- **学习工作台**：作答数、掌握度、复习数、前置缺口、连续学习天数来自 `GET /api/v1/dashboard`。
- **教材/证明/练习**：定义、步骤、提示与题目来自后端；点击“查看提示/完整解答”会调用后端并记录查看行为。
- **保存作答与批改**：写入 `POST /api/v1/attempts`；计算题从最终表达式做 SymPy 符号检查，证明题按 5 个关键步骤给 0–100 结构分，并返回逐项覆盖/缺失、参考结果与人工复核提示。复盘页的自评通过 `PATCH /api/v1/attempts/{id}` 保存，工作台/图谱/热力矩阵增量刷新。
- **笔记/收藏**：调用 `/api/v1/notes` 与 `/api/v1/bookmarks`。
- **前沿诊断**：提交到 `/api/v1/diagnostic`，结果写入服务端。
- **正反例实验室**：命题陈述、条件、缺失条件与反例反驳文案由后端覆盖；图形与性质矩阵仍是前端教学示意。
- **数学总地图/练习热力矩阵**：节点状态、边、练习量与掌握度来自后端；提交作答或自评后自动刷新，不再依赖刷新页面。
- **AI 改图**：调用后端的 `/api/ai/status` 与 `/api/ai/plot`；模型密钥只保存在 `backend/.env`。
- **DeepSeek** 后端设置 `AXIOM_AI_PROVIDER=deepseek` 后默认使用 `deepseek-flash`。也可选择 `deepseek-v4-pro`。配置 `AI_API_KEY` 后可在图像工作区点“测试连接”。

详细的数据流、目录职责和“新增页面/字段”的步骤见 [前端架构与迭代指南](docs/architecture.md)。

数据边界：登录模式的数据在服务端；退出登录会清空 Provider 内存并重新加载，避免下一位使用者看到上一位的笔记。离线模式使用 `data/offline/` 与 `axiom-offline-*` 键，只保存在当前浏览器。

## 功能与验证

默认地址：<http://127.0.0.1:5174/>。若端口被占用，请先关闭此前的服务；开发服务器不会自动切换端口。

环境：Node.js 22.12 以上或 Node.js 24；本机验证使用 Node.js 24.19.0。依赖版本由 `package-lock.json` 固定。

```powershell
npm test          # 数学、表达式与 AI 接口测试
npm run build     # TypeScript 检查及生产构建
npm run preview   # 预览 dist 中的构建结果
npm run format    # 格式化源码
```

已验证（2026-11-05）：真实无头 Chrome 完成登录 → 工作台 → 教材 → 练习 → 查看服务端解答 → 提交作答 → 笔记；后端作答数从 8 增至 9、笔记写入成功。截图见 `docs/integration-*.png`。

`npm run build` 在本机需要允许 esbuild 启动子进程；沙箱环境可能报 `spawn EPERM`，这不是代码错误。构建产物 `dist/` 已生成。

## 可以体验的功能

| 页面 | 已实现交互 |
| --- | --- |
| 登录 | 演示学生/管理员登录、邀请码注册、错误提示、离线降级 |
| 学习工作台 | 卡片与紧凑视图、继续上次页面、服务端作答数、掌握度、复习与缺口 |
| 教材定义与条件 | 8 单元切换、服务端定义/条件/符号、收藏到后端、证明入口、保存笔记 |
| 自由函数工作区 | 自定义表达式、参数识别、比较曲线、定义域与显示范围、ε–δ 采样、割线与切线、Taylor 系数、中点 Riemann 和 |
| 三维拓展 | 单位圆盘上 z=x²+y² 的 SVG 投影、夹层与邻域、视角滑块 |
| 三维曲面实验室 | 任意 f(x,y) 曲面、拖动旋转、滚轮缩放、范围/高度/透明度/配色控制、AI 改曲面与视角 |
| 对话改图 | 后端模型接口，校验返回的表达式和完整场景，支持连续追问、取消、撤销与错误保护 |
| 正反例实验室 | 3 组命题辨析、性质矩阵、反例笔记与经典索引（命题文案来自后端） |
| 证明思路 | 分步阅读、条件说明、完整证明、笔记保存 |
| 练习题库 | 8 主题 × 4 个参数变式、服务端提示/完整解答、草稿、作答提交、符号/结构批改、自查 |
| 完整解答与复盘 | 对照答案、独立/辅助标记、自评写回后端、JSON 导出 |
| 练习可视化 | 服务端掌握度热力矩阵、条形图、时间线、空白格定位、CSV 导出 |
| 数学总地图 | 20 节点、28 条边、服务端节点状态、前置缺口、关系筛选、对应单元跳转 |
| 诊断与笔记 | 3 道诊断题提交后端、笔记搜索/新增/删除、Markdown 导出 |

推荐演示路径：登录 → 教材选择“一致连续” → 图像调整 ε、δ → 正反例 → 证明 → 作答 → 复盘。

AI 改图指令示例：`换成 sin(a*x)，让 a 在 0.5 到 5 之间变化`、`保留这条曲线，再加入 exp(-x^2)`、`改成 x<0 时为 -x，否则为 x^2 的分段函数`、`显示 x=1 处的切线`。三维功能目前仅在“经典教学与三维示例”内提供预设投影。

## 当前边界

- **模型配置由后端提供**：AI 适配器已实现，离线环境只验证 mock/未配置状态；真实供应商输出质量仍需配置密钥后验证。练习不自动判分，证明题保留人工复核。
- **教材仍为示例内容**：8 个自编示例单元，不是完整教材；后端只做 PDF 结构检查，不自动提取任意 PDF 公式。前端“打开本地教材”仍是浏览器本地预览。
- **正反例图形是教学示意**：命题与反驳文案可来自后端，性质矩阵与曲线绘制仍是前端内置示例。
- **自由函数场景仍保存在浏览器**：后端已有场景/观察接口，本次联调优先覆盖学习记录与练习主流程，图像场景尚未迁移到服务端。
- **图谱和热力矩阵**：登录后由后端数据填充；离线模式回退到内置示例。
- **数学内容为代表性样例**：不包含需求文档中所有定理、题型、案例与审核流程。
- **绘图与计算有范围限制**：自由函数由 Plotly.js 绘制，Math.js 提供受限表达式求值、符号求导和部分 Taylor 系数。数值切线、有限采样与 Riemann 和不构成可导、连续或可积的证明。窄小间断、快速振荡可能被漏采样。尚未接入 MathJax；3D 为经典示例的可调视角投影。

## 模块结构

六个业务模块的边界见 [MODULES.md](../MODULES.md)。可视化已落地到 [`src/modules/visualization/`](src/modules/visualization/README.md)，页面入口 `pages/FunctionWorkspace.tsx` 仅兼容导出；其他模块已有边界说明和数据访问适配器，状态逻辑按顺序迁移。

## 源码结构

```text
src/
  Root.tsx                   登录/数据门禁、错误与离线入口
  App.tsx                    应用壳、导航、搜索、弹窗
  navigation.ts              路由与侧栏元数据
  app/DataProvider.tsx       服务端/离线数据、选择、mutation、增量刷新
  domain/types.ts            页面视图模型
  domain/dto.ts              后端原始 DTO
  domain/mappers.ts          DTO → 视图模型的纯映射
  data/offline/              离线课程、图谱、热力矩阵、诊断与练习
  lib/api.ts                 API 客户端、令牌、刷新与业务请求
  lib/session.tsx            登录状态与用户资料
  lib/download.ts            文本/JSON 下载
  lib/explorationMath.ts     图像误差、临界 δ、Taylor 多项式
  lib/functionEngine.ts      受限表达式、采样、数值差商与符号计算
  lib/plotScene.ts           场景结构与前后端共用校验
  pages/Auth.tsx             登录/注册/离线
  pages/Dashboard.tsx        工作台
  pages/Diagnostic.tsx       前置诊断
  pages/Notes.tsx            笔记
  pages/LocalTextbook.tsx    本地 PDF 预览
  pages/learning/            教材、正反例、证明、练习、复盘
  pages/maps/                星图、热力矩阵
  modules/visualization/     二维/三维可视化、场景校验、AI 请求与模块边界
  modules/contracts.ts       跨模块 ID 与领域类型导出
  pages/FunctionWorkspace.tsx 兼容导出到 visualization/two-d
  pages/FunctionPlot.tsx     Plotly 绘图和分析工具
  pages/Exploration.tsx      保留的经典教学示例与规则对话
server/ai.ts                 可选的 Vite 本地 AI 中间件（未启动后端时使用）
tests/                       数学、表达式与本地模拟服务测试
docs/                        验证记录、截图与架构指南
```

浏览器存储分为两类：`axiom-api-session`（登录令牌）和界面偏好/草稿（`axiom-draft-*`、`axiom-last-page` 等）。学习记录不再镜像到 localStorage；离线模式单独使用 `axiom-offline-*`。

## 参考资料

讲义卡片链接到 John K. Hunter 的 UC Davis 分析讲义，供进一步阅读。产品中的短释义与练习为项目独立编写，并未复制整章原文。

- [连续函数，第 7 章](https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch7.pdf)
- [可微函数，第 8 章](https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch8.pdf)
- [Riemann 积分，第 11 章](https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch11.pdf)
- [积分性质与应用，第 12 章](https://www.math.ucdavis.edu/~hunter/intro_analysis_pdf/ch12.pdf)

验证细节见 [验收记录](docs/verification.md)。
