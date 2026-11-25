# Phase 1 运行与验收

## 启动

当前 Windows 项目可双击根目录的 `启动工作台.cmd`，使用本机浏览器访问 `http://127.0.0.1:5186/`。第一次从源码检出时，在项目根目录执行以下命令。运行期间保持后端窗口打开。

```powershell
python -m pip install -r backend/requirements.txt tzdata
cd frontend
npm ci
node scripts/build-portable.mjs
cd ..
python backend/portable_server.py
```

要生成内置 Python 的 Windows x64 分享包，在 frontend 目录执行 `npm run package:windows`，解压 releases 下的 ZIP 后双击包内的 `启动 Axiom.cmd`。

## M1 · 本地工作台

首次打开直接进入本地学习空间。在个人设置中可以切换到服务器并登录。练习、记录、进度和身份各自管理本域数据，进度从作答推导，保留原答案。浏览器沿用原有本地存储键。

Chrome 使用空白用户上下文、阻断 API 和外网，逐一打开 12 个入口，并完成笔记创建、搜索、删除、刷新恢复，练习提交、自评、复盘以及二维平移、三维旋转。后端原有 102 项测试通过。

前端 22 项测试及 TypeScript 编译通过。使用临时 SQLite 演示账号登录后退出，可返回原本的本地空间。

## M2 · 布局和主题

教材或图像页的「讲义与图像对照」可开启双栏。宽度低于 1024 像素时使用「讲义」「图像」标签。切换期间两个面板持续挂载，桌面收窄会自动收起伴学栏。顶栏的月亮／太阳按钮切换本地记忆的主题。

Chrome 在 1440 像素下同时显示两个面板，缩至 900 像素后，切回的公式输入框仍是同一个 DOM 节点，未提交的文本仍在。切换中间路由后，伴学栏节点相同。主题切换及刷新恢复通过。12 个页面在桌面、平板和 390 像素手机宽度检查通过。

## M3 · 离线公式

教学内容、作答、复盘与对话共用 KaTeX。可输入 Unicode 数学符号或以美元符号包围的 LaTeX。练习、二维与三维提问框均支持替换选区、光标插入和预览。

生产构建通过。KaTeX 字体随包提供 WOFF2，未生成重复的 TTF 或 WOFF。Chrome 验证选区替换、分式排版、未完成的分式回退为原文及证明页行内排版。

## M4 · DeepSeek 接入和学习存档

点击顶栏 AI 徽章添加个人 Key、选择模型、测试或清除。Windows 使用当前用户的 DPAPI 保护凭据，POSIX 使用仅属主可读写的文件。便携入口绑定本机回环地址。界面不会读取已保存的明文。设置中的完整 ZIP 包含 SQLite 一致性备份、浏览器学习数据及已上传的 PDF 附件。纯前端运行时可使用浏览器 JSON 存档。恢复前会检查格式、版本和场景，并提示覆盖范围。

后端套件通过 126 项，覆盖密钥保存、重启读取、清除、访问范围和存档往返。使用模拟上游验证无效密钥、402、超时和网络失败分类。临时 SQLite 验证记录恢复，损坏文件拒绝，PDF 附件回迁。未调用真实付费模型。

## M5 · Hiyori 舞台

先在开发服务器的 `/spikes/hiyori.html` 验证 React 19、Vite 7、PixiJS 6.5.10 与 pixi-live2d-display 0.4.0。Chrome WebGL 采样得到 ParamEyeLOpen 和 ParamBreath 均在 0–1 之间变化；点击后 TapBody 返回成功。[独立验证截图](frontend/docs/hiyori-spike.png)。

通过独立验证后接入右栏。生产构建包含本地 Cubism Core、模型、原始 2048 贴图、动作及许可证。Chrome 在工作台与证明页之间切换时保留同一 canvas，Application 创建一次。收起和展开后的实际 ticker.maxFPS 分别为 10 和 30。无 Key、无语音服务时模型仍可互动。

## M6 · 上下文讲解、联动与语音

在证明页选择某一步，点击右栏的「解释这一步」。未配置 Key 时，伴学可以展示并朗读当前步骤、本地反例或提示。配置后可在输入框提问，模型接收当前知识点，以及所在页面提供的证明步骤、二维或三维场景、练习草稿。讲解分别生成排版公式和中文口语稿。证明步骤或参数联动经过页面校验；使用图像工作区的「撤销修改」可以撤销同一回复中的二维参数改动。

Chrome 验证了本地讲义、公式气泡、快捷提问、静音、390 像素宽度下的输入以及 TapBody。模拟模型响应验证了步骤高亮、同批修改两个参数、撤销还原、非法参数拒绝，以及切页后迟到回复不会更改新页面。前后端共用数学朗读规则，覆盖量词、希腊字母、分数与积分。

基础朗读实测使用 Windows 的 Microsoft Huihui 中文本地语音，浏览器触发 start、boundary 和 end，测得嘴部开度峰值约 0.76，结束时为 0。CosyVoice 通道使用测试 PCM 验证 24 kHz 流解码、真实 AudioWorklet 和 wlipsync 口型；实测嘴部开度峰值约 0.50。真实 DeepSeek 账号及运行中的 CosyVoice 模型尚待联调。

## 最终验收

前端 `npm test` 通过 30 项，后端 `python -m pytest -q` 通过 131 项。Windows x64 便携 ZIP 逐文件校验 SHA-256，通过后在临时目录解压，使用随包 Python 独立启动。在阻断外网的 Chrome 中验证了 12 个页面、公式、Hiyori 动作以及无 Key 的本地讲解。[工作台截图](frontend/docs/phase1-workbench.png)。
