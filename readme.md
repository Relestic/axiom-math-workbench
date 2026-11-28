# Axiom 公理 · 数学交互学习工作台

面向大学数学系（数学分析、偏微分方程等核心课程）的**本地优先（Local-First）AI 数学学习工作台**。打通「PDF 教材原文 → 结构化知识卡片 → 四画板可视化联动 → 分步证明拆解 → 配套练习与批改 → 知识星图」完整闭环，帮助学习者从图像直觉走向严谨证明。

---

## 快速开始

### 方式一：Windows 免安装完整便携包（推荐）

无需预装 Python 或 Node.js：

1. 前往 [**GitHub Releases**](https://github.com/Relestic/axiom-math-workbench/releases/latest) 下载最新的 `Axiom-Windows-Full-*.zip`；
2. **完整解压**到本地任意目录，双击运行 **`启动 Axiom.cmd`**；
3. 浏览器将自动打开 `http://127.0.0.1:5186/`（包内已自带隔离的 Python 3.12 运行时、前端静态资源、KaTeX 数学字体与 Live2D 伴学模型；所有个人数据仅保存在解压目录内的 `data/` 文件夹，默认免登录）。

### 方式二：从源码启动（开发模式）

环境要求：Windows 10/11 x64、Python 3.12+、Node.js 20+。

```powershell
# 1. 安装后端与前端依赖
python -m pip install -r backend/requirements.txt
cd frontend
npm.cmd ci
cd ..

# 2. 一键编译便携前端并启动本地服务（默认 http://127.0.0.1:5186/）
.\启动工作台.cmd

# 后续修改前端源码后可强制重新构建：
.\启动工作台.cmd --rebuild
```

---

## 核心特性

### 1. 三通道个人 AI 接入（支持免填 Key 直连本机 Codex）
点击工作台顶栏右侧 **AI 状态徽章** 即可自由切换三种个人模型通道：
- **本机 Codex（免填 Key）**：自动检索这台电脑已安装并登录的官方 `codex.exe`，通过安全只读无痕模式（`codex exec --ephemeral -s read-only`）直接复用本机 Codex 额度。内置**按学习环节自动换挡**：提卡、扫描识图与实时聊天使用极速档（`none`），定理证明拆解、出题与作答批改自动切换中度思考（`medium`），也支持手动指定 `none / low / medium / high`。
- **ChatGPT (OpenAI)**：支持 `gpt-4o-mini`、`gpt-4o`、`gpt-4.1-mini`、`gpt-4.1`、`o3-mini` 及任意自定义模型名，支持自定义公网 HTTPS Base URL 与系统代理。
- **DeepSeek**：原生支持 `deepseek-flash`（含多模态视觉识图）与 `deepseek-v4-pro`。
- **隐私与离线兜底**：个人 API Key 仅存储在本地并通过 Windows 当前用户 **DPAPI** 加密，绝不随学习存档导出；**未配置任何 AI 时，内置 8 讲数学分析课程、交互画板、SymPy 计算题符号批改与证明结构自查仍可 100% 离线使用**。

### 2. 扫描版 PDF 看图识公式 + 200+ 页分段「快速建书」
- **扫描版电子书原生支持**：前端内置离线 `pdfjs-dist` 选页渲染引擎，自动将无文字层的影印/扫描页转为高清图像交由视觉模型转写中文与标准 LaTeX 公式，结果**永久写入本机 SQLite 缓存**，同一页绝不重复识别计费。
- **长书接力提取**：支持输入任意页码范围、一键 **「选整本书」** 或 **「接续未提页码」**。系统自动跳过空白扉页与无实质概念的目录页，每批卡片生成后立即落盘入库；中途点击「停止后续生成」也会完整保留已识别页面与已入库卡片。

### 3. 学习书桌：一书一栏翻卡 + 「翻到哪张精配哪张」
- **清爽两级导航**：书桌左栏按教材聚合栏目，支持 `上一张卡片 / 下一页卡片` 按钮、章节速跳下拉框及 `Alt + ← / →` 快捷键翻页。
- **1.5 秒停留防抖自动精配**：开启「翻到卡片自动精配」后，连续快速翻卡 **0 请求发出、绝不浪费额度**；在某张未配齐的卡片上停留满 **1.5 秒**，后台自动按需补齐该卡缺失的**结构化证明拆解、配套练习题与专属图像**（亦支持点击「一键精配本卡」立即补齐）。

### 4. 四画板图卡自动联动 + Hiyori 伴学控图
右侧黑板内置四类可视化工作区，切换学习卡片时自动打开对应画板并加载本卡默认配图（单卡手动调参独立记忆，阅读课本原文时不强切打断）：
- **2D 函数（`#desk/explore`）**：基于 Math.js 与 Plotly，支持自由表达式、单字母滑块参数、多曲线对比及连续性 $\varepsilon$-$\delta$ 带、导数割线、Taylor 逼近、Riemann 和分析。
- **3D 曲面（`#desk/surface`）**：支持 `z = f(x, y)` 交互旋转缩放、定义域裁剪与网格视角调节。
- **文字图解（`#desk/diagram`）**：基于受控声明式 JSON 图元（`curve / segment / point / pattern / region / label`）的安全 SVG 渲染引擎，专门表达 Dirichlet 函数、Thomae 函数、中值辅助构造等无法由初等公式直接导出的概念图。
- **课本原文（`#desk/pdf`）**：精准跳转到当前知识卡片对应的原书 PDF 页码对照研读。
- **Hiyori 对话控图与语音**：右栏伴学助手可结合当前讲义、证明步骤或作答草稿答疑，用自然语言直接修改二维曲线、三维曲面或文字图解（配备 15 步撤销栈），支持系统离线中文语音或本机 `127.0.0.1:50000` CosyVoice 朗读。

### 5. 高容错数学排版与完整学习存档迁移
- **精排讲义卡片与公式引擎**：定义框、条件核对条、定理强调框与分步推导卡片分区呈现；公式渲染器兼容显式 LaTeX 定界符与偏微分方程常见符号（`∂, ∇, ∬, ∭, ∮`、多重连续上下标），自动处理中英公式呼吸留白与长连等式独立居中展示。
- **一键打包迁移**：在「书架与笔记 → 学习存档」或个人设置中可将本机 SQLite 数据库、浏览器笔记/作答记录与上传的私有 PDF 教材一键导出为单个 `.zip` 存档，跨电脑校验恢复。

---

## 项目结构

```text
axiom-deploy/
├── frontend/               # React 19 + TypeScript + Vite 前端工作台
│   ├── src/components/Math # KaTeX 安全数学公式解析与混排渲染层
│   ├── src/modules/        # 六大业务模块（ai / companion / teaching / practice / visualization / records）
│   └── scripts/            # 便携前端构建（build-portable.mjs）与完整免安装包打包脚本（package-full-portable.mjs）
├── backend/                # Flask + SQLAlchemy + Pydantic 本地与服务端共用后端
│   ├── app/adapters/       # DeepSeek / OpenAI / 本机 Codex CLI 适配层、DPAPI 密钥库与 PDF 解析
│   ├── app/modules/        # 本地书架抽卡、扫描页识图缓存、配题补证、图卡预设与 SymPy/规则批改
│   ├── migrations/         # SQLite / PostgreSQL 数据库迁移脚本
│   └── portable_server.py  # 单机免安装模式入口（端口独占锁 + 静态资源同源托管）
├── qa/                     # Playwright 端到端浏览器验收测试套件（Phase 1–5）
└── 启动工作台.cmd          # 源码目录一键构建与启动入口
```

---

## 测试与打包命令

```powershell
# 前端类型检查与单元测试（Node Test Runner）
cd frontend
npm.cmd test
node node_modules/typescript/bin/tsc -b

# 后端全量单元测试（Pytest）
cd ../backend
python -m pytest -q

# 生成 Windows x64 免安装完整发布包（输出至 releases/Axiom-Windows-Full-*.zip）
cd ../frontend
node scripts/build-portable.mjs
node scripts/package-full-portable.mjs
```

---

## 架构与阶段验收文档

- 模块边界与契约说明：[MODULES.md](MODULES.md)
- 容器化与服务器部署说明：[deploy/README.md](deploy/README.md) · [docker-compose.yml](docker-compose.yml)
- 历次里程碑验收记录：[PHASE5.md](PHASE5.md) · [PHASE4.md](PHASE4.md) · [PHASE3.md](PHASE3.md) · [PHASE2.md](PHASE2.md) · [PHASE1.md](PHASE1.md)
