# AI 改图：配置与使用

自由函数工作区使用 React + TypeScript、Math.js、Plotly.js 和 Zod。浏览器负责计算与交互；AI 请求通过 `VITE_API_BASE` 指向的后端 `/api/ai/status`、`/api/ai/plot` 转发，密钥只保存在 `backend/.env`（在线版是 `backend/.env.online`）。AI 生成表达式与场景配置，不生成并执行 JavaScript 或 Python。

## 配置 DeepSeek

1. 在 `backend` 目录复制 `.env.example` 为 `.env`（在线版编辑 `.env.online`）。
2. 填写 DeepSeek 配置；DeepSeek 使用 OpenAI-compatible Chat Completions。
3. 重新启动后端（本地 `python run.py`；在线版重启 `python online_server.py`）。
4. 打开登录后的“图像探索”，点“模型已配置”旁的设置面板，再点“测试连接”做一次最小真实调用。

```dotenv
AXIOM_AI_PROVIDER=deepseek
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
AI_API_KEY=sk-你的密钥
AI_JSON_MODE=true
AXIOM_LEGACY_AI=true
```

`AI_BASE_URL` 填写基础地址，服务端会追加 `/chat/completions`。DeepSeek 官方地址可写 `https://api.deepseek.com`，也可以写 `https://api.deepseek.com/v1`。`AI_MODEL` 可选 `deepseek-flash` 或 `deepseek-v4-pro`。

改图提示词要求模型返回 JSON，服务端会校验返回结构。改图请求显式关闭思考，将输出预算留给场景数据。

其他 OpenAI 兼容服务也可以继续使用：

```dotenv
AXIOM_AI_PROVIDER=openai
AI_BASE_URL=https://你的服务地址/v1
AI_MODEL=你的模型名称
AI_API_KEY=你的密钥
AI_JSON_MODE=true
```

如果服务商不支持 `response_format: {type: "json_object"}`，把 `AI_JSON_MODE` 改为 `false` 后重启。关闭 JSON 模式后仍要求模型输出 JSON，并执行相同的结构和表达式校验。输出是否符合约定取决于模型能力。

`.env` 被忽略，不应提交到代码仓库。不要使用 `VITE_` 前缀存放密钥。页面不要求输入密钥，也不返回密钥。每次发送会向配置的服务商提供当前函数场景、当前消息、最近最多 8 条对话和操作说明；教材、作答和笔记不会被该接口一并发送。

> 旧的 `frontend/server/ai.ts` Vite 中间件仍保留作为独立前端预览的兼容实现，但联调页面不会再调用它。离线演示下 AI 按钮会提示后端未连接；公式编辑与绘图不受影响。

## 使用示例

- “把函数换成 sin(a*x²)，让 a 在 0.5 到 5 之间变化。”
- “保留原曲线，添加 exp(-x²)，把 y 轴显示范围改为 -2 到 2。”
- “画 x<0 时为 -x，否则为 x² 的分段函数，观察 0 点附近。”
- “切换到导数工具，把基准点改为 1，再缩小割线步长。”
- “在 [0,1] 上显示中点 Riemann 和，分成 50 段。”

模型生成完整场景，通过校验才替换当前图像。可以连续追问、取消请求或撤销最近修改；失败时保留原图。手动公式有未应用修改时，先点击“应用公式与范围”。公式、参数和最近 20 条消息保存在当前浏览器；撤销历史仅在本次工作区会话内保留。

## 表达式与数学边界

- 自变量为 `x`，常数用 `pi`、`e`，乘法用 `*`，幂用 `^`，自然对数用 `log`。支持 `sin`、`cos`、`tan`、反三角、双曲函数、`exp`、`sqrt`、`abs`、`floor`、`ceil`、`round`、`sign`、`min`、`max`。
- 分段函数使用条件表达式，例如 `x < 0 ? -x : x^2`。参数使用 a–d、f–w、z 的单个小写字母，自动识别并生成滑块。
- 最多 4 条曲线、8 个参数；每条公式最多 300 字符和 120 个语法节点。禁止赋值、对象、数组、属性访问和任意代码执行。
- 函数定义域与坐标显示范围分别设置。实数域之外、除零或非有限结果不绘制；采样算法会尝试断开不稳定片段，但不能保证发现所有间断和快速振荡。
- 连续性工具展示当前基准点的有限邻域采样，不自动判定连续或一致连续。导数工具检查左右差商，稳定时绘制数值切线；检测到尖点或未定义取值时不给出切线。
- 积分工具展示中点有限 Riemann 和（4–200 段），不证明可积，也不提供精确积分或反常积分判定。Taylor 工具支持部分光滑表达式的 1–5 阶系数，分段和非光滑函数暂不展开，不提供一般余项界。
- 当前不支持自由输入的一元隐函数、微分方程；三维曲面由独立的三维曲面实验室提供（变量限定 x、y）。“经典教学与三维示例”保留原有固定示例、专用误差检查和本地规则对话。

## 三维曲面实验室

“可视化视图 → 三维曲面实验室”提供独立的二维参数域上的曲面：

- 人工：输入 `z=f(x,y)`、x/y 范围、网格密度、高度缩放、透明度、配色、网格线、坐标轴；拖动旋转、滚轮缩放、双击复位。
- AI：调用 `POST /api/v1/ai/surface`，返回新的 `scene` 前先经过 Pydantic 与表达式白名单校验；失败保留当前曲面。
- 支持 `sin(x)*cos(y)`、`x^2+y^2`、`x^2-y^2`、`exp(-(x^2+y^2))`、`sqrt(x^2+y^2)` 等；变量只能是 x、y，最多 300 字符。
- 场景与最近对话保存在 `axiom-surface-scene` / `axiom-surface-chat`；撤销栈在当前页面会话内。
- 三维投影是前端 SVG 教学可视化，不是 Three.js/Plotly 3D，也不构成数学证明。

示例：

- “把曲面换成 sin(x)cos(y)，保留范围”
- “把视角转到方位角 60 度、俯仰角 35 度”
- “高度放大到 1.5 倍，换成高斯曲面”
- “换成马鞍面，打开网格线，配色改成青色”

## 请求与部署

`GET /api/ai/status` 返回是否已配置、服务商域名与模型名。`POST /api/ai/plot` 接收消息、当前场景与有限历史，返回 `{message, scene}`；纯解释时 scene 可以为空。三维曲面使用鉴权接口 `POST /api/v1/ai/surface`，请求/响应结构与二维 plot 类似。请求限制 40 KB，最多同时处理 2 个请求，单次调用超时 60 秒，错误不自动重试。

API 注册在 Vite 开发服务和构建预览服务内，均只监听本机。`npm run dev` 使用 5174 端口；`npm run build` 后 `npm run preview` 使用 5175 端口。只复制 `dist` 到静态托管不会包含 API。正式发布需部署独立服务，并补齐账号、鉴权、限额和持久化记录。

Windows 免安装包另外提供独立的 Node HTTP 服务，复用相同的 AI 中间件，并附带运行环境。解压后双击 `启动 Axiom.cmd`；配置文件放在启动文件旁，具体操作见包内的 `使用说明.txt`。该包同样只监听本机，不是互联网托管服务。

## 验证情况

`npm test` 包含原有数学边界测试以及新表达式、场景校验、奇点处理和兼容 API 的本地模拟服务测试。2026-11-06/07 已用真实 DeepSeek key 验证：`/api/v1/ai/test` 返回 200，二维改图 `x^2 → sin(x)`，三维改图 `x^2+y^2 → sin(x)*cos(y)` 并调整视角 60°/35°。模型输出质量仍需按具体模型与提示词持续评估。
