# Phase 2 验收记录

基线为 Phase 1 的 `76330de`。验收使用独立临时目录、SQLite 数据库和新的浏览器上下文。下文以 `axiom-deploy` 为项目根目录，前后端单元测试分别在对应子目录运行。

## M7 · 学习书桌与四项导航

从左侧进入学习主页、学习书桌、知识星图或书架与笔记。学习书桌左侧选择知识点和学习环节，右侧切换二维函数、三维曲面或课本原文。窄屏可在学习内容和黑板间切换；桌面可以收起黑板。顶栏头像提供个人设置，「高级连接选项」中保留服务器登录入口。

旧地址及旧存档中的页名沿用原有 `axiom-last-page` 键，读取时转换为二级地址。直接打开旧地址只替换当前浏览器历史项，前进与后退仍访问原来的相邻页面。

前端在 `frontend` 下运行 `npm test`，38 项通过。便携构建含 TypeScript 编译，通过。后端在 `backend` 下运行 `python -m pytest -q`，131 项通过。导航回归用例在 Phase 1 上实测得到 12 个左栏入口，修改后相同检查测得 4 个。

Chrome 在 1600、900 和 390 像素宽度下检查了书桌布局。切换步骤后，Plotly 节点、三维 SVG 与参数值保持；窄屏切换可恢复练习及公式草稿。自动用例连续发出九次提问，待本地回复超过一屏后滚动记录，舞台和输入框的位置均保持不变。

运行 `python -m pytest -q qa/phase2/test_m7.py`，17 项浏览器验收通过（76.11 秒）。覆盖 12 个旧地址、前进后退、精确恢复子视图、固定舞台和跨签操作。最后一次构建对冷启动和上下文的改动单独重跑了联动用例，通过（6.44 秒）。

## M8 · 本机 PDF 书架与原页对照

在「书架与笔记 → 教材书架」拖入 PDF。文字和扫描页按页区分；两者都能在书桌黑板阅读。使用个人 Key 在一段连续的文字页上生成卡片，点击卡片上的页码即可回到原文。入口支持重命名与删除。未配置 Key 时仍可上传和翻页。

文本提取使用纯 Python 包 `pypdf==7.1.1`。文件按 SHA-256 存放，SQLite 保存逐页文字、识别状态和页码。启动、刷新及教材变更后从 `/api/v1/local/bootstrap-extras` 读取书架和知识卡片。同源 PDF 文件路由允许原生 iframe 加载，其余端点保持原有嵌入限制。

边界测试复现了单个 50 MiB 教材连同数据库导出时原有的 HTTP 413。现在 ZIP 将较大的数据写入临时文件，总容量上限为 256 MiB，附件逐一核对摘要。满额附件导出与恢复预检均通过。

运行 `python -m pytest -q qa/phase2/test_m8.py`，2 项端到端流程通过（22.79 秒）。测试拖入包含两页文字和一张空白页的 PDF，重启服务后仍可读取。测试专用模型仅收到第 2 页原文；重新打开浏览器后，生成的卡片仍可定位第 2 页。实际 iframe 请求没有 Origin 或 Authorization 头，响应为 HTTP 200、inline。ZIP 恢复到新库后，卡片和原始 PDF 字节一致；目标库仍为无 Key 状态。M7 的 17 项浏览器回归也通过（77.90 秒）。

本卡最终前端 39 项测试、TypeScript 便携构建和后端 136 项测试全部通过。后端用例另覆盖重复文件、数据归属、数字页有效文本、共享附件保留、页码越界和模型返回超范围页码。

## M9 · 本机批改、错因变式与自拟反例

免登录提交计算题得到 SymPy 符号判分。证明题得到结构分和待复核说明。用户配置个人 Key 后可选用逐步审阅，原始作答和确定性判分先写入 SQLite。模拟上游失败时仍能恢复这两项；对同一错因同时发起三次变式请求，仅生成一道题并调用一次模型。变式保留原作答 ID、错因与模型名。

正反例页按表达式绘图。Dirichlet 函数使用两层稠密点示意。检验 `1/x` 时，系统分别指出开区间 `(0,1)` 排除零点、函数在零点右侧无界，以及闭区间 `[0,1]` 包含未定义点。笔记保留「符号推导」「数值辅助检验，非严格证明」等逐条依据。可选的模型解释有独立标签。

运行 `python -m pytest -q qa/phase2/test_m9.py`，4 项真实 Chrome 流程通过（35.46 秒）。模拟上游生成逐步讲评后，本机 Microsoft Huihui 中文语音发出朗读开始事件；生成的变式题重启后仍能继续作答。M7、M8 的 19 项浏览器回归通过（101.49 秒）。

从基线 `76330de` 启动 Phase 1 原版服务、导出真实旧 ZIP，通过当前界面导入后，旧作答 ID 与内容均保留，旧证明页位置恢复为 `#desk/proof`。另一项验收把 Phase 2 完整存档恢复至空工作台，逐项比对 PDF 字节、卡片页码、原错答、完整 AI 讲评、变式来源和反例笔记依据。恢复先在临时副本上执行 `0004`，预检不会修改待导入文件。

本卡前端 42 项单元测试及 TypeScript 便携构建通过。后端全量运行 `python -m pytest -q`，157 项通过（58.42 秒）。

## M10 · Windows 启动与免安装包

验收环境为 Windows x64、Chrome 158.0.8127.37、Playwright 1.64.1、Node.js 26.13.1 与 CPython 3.12.7。浏览器只放行当前工作台同源请求。功能验收另外在后端阻断非回环 DNS 解析与连接。需要模型的用例保留真实的 Key 存取、提示词、响应校验及 SQLite 持久化，仅替换上游传输；未使用个人密钥或付费额度。

从源码双击 `启动工作台.cmd` 启动，旧版前端因缺少 Phase 2 构建标记会自动重建。更新源码后也可运行 `启动工作台.cmd --rebuild`。免安装版完整解压后运行包内的 `启动 Axiom.cmd`。两者默认使用 `http://127.0.0.1:5186/`，学习数据保存在各自的 `data/`。启动验收使用 Windows 的 `cmd.exe` 执行实际脚本，指定独立的 `AXIOM_DATA_DIR`，由无头 Chrome 打开启动后的回环地址。

旧版依赖缓存包含 Flask 却遗漏 pypdf。在已安装 pypdf 的电脑上，旧嵌入式解释器还能从当前用户的 Python 目录导入该库。新包分别核对 wheel 清单、文件位置及许可，并从内嵌 Python 运行 PDF 上传。无 Key 的讲义朗读也在断网的 Chrome 中触发了 Microsoft Huihui 的原生语音开始事件；其他机器的可用声音取决于系统已安装的中文语音。

源码启动实测覆盖三次运行：正常启动一次，面对旧版 HTML 与旧资源时默认重建一次，有构建标记时显式 `--rebuild` 再重建一次。两次真实 TypeScript/Vite 构建均替换旧资源，重建前后的教材 ID 相同。每次测试结束均确认测试端口已释放。

最终前端在 `frontend` 下执行 `npm test`，42 项通过。后端在 `backend` 下执行 `python -m pytest -q`，159 项通过（61.59 秒），包括安装清单、pypdf 纯 wheel 和许可校验。便携构建命令为 `node scripts/build-portable.mjs`，完整 Windows 打包命令为 `npm run package:windows`，两者均在 `frontend` 下运行。

### 交付物

| 项目 | 核验结果 |
| --- | --- |
| Windows x64 ZIP | [Axiom-Windows-Full-20261126T005627Z.zip](releases/Axiom-Windows-Full-20261126T005627Z.zip)，北京时间 2026-11-26 08:56 构建 |
| 压缩体积 | 47,288,040 字节（45.10 MiB），比 Phase 1 完整包增加 468,538 字节 |
| ZIP SHA-256 | `89c88a05877be9ce9c9794a3a42876d76d58ee03fc44216e9dc288ed70e5cad9` |
| 内容清单 | 从 ZIP 解压后逐一核对 `manifest.json` 中 4,431 个文件的 SHA-256。包内前端和后端代码与工作树匹配 |
| PDF 运行时 | 27 个 Python 依赖中包含 `pypdf-7.1.1-py3-none-any.whl`，代码与安装元数据在 ZIP 中占 412,771 字节。wheel 的 SHA-256 为 `04c5680d4b4cfa04ab505b09393fc949860c34a4dad6565284d11a2f5c3ce8b1`，许可见包内 `licenses/pypdf-LICENSE.txt`。已核查清单，未引入 Pillow、pdfplumber 或 PyMuPDF |
| 源码预览 | 已刷新 `frontend/dist-portable/`。ZIP 与该目录的前端文件内容一致。运行数据、个人配置、前端依赖和发布产物均由 Git 忽略 |

### 发布包实测结果

完整运行得到 **27 passed in 245.53s**，全部用例执行通过。源码启动专项使用源码入口，其余功能回归从本次 ZIP 读取 `web/`、`backend/` 和 `runtime/python.exe`。旧存档兼容用例额外运行 Phase 1 基线服务生成输入文件。

| 实测范围 | 通过数 | 观察到的结果 |
| --- | ---: | --- |
| Windows 启动脚本 | 3 | 源码正常启动、两种重建路径，以及解压包自身启动。新包从自身运行时加载 pypdf，实际拖入 PDF 后能辨别文字页和扫描空页 |
| 四栏导航、书桌与伴学 | 17 | 12 个旧地址、历史回退、常驻画布、窄屏草稿、长对话和跨签联动通过 |
| PDF 书架与原页 | 2 | 重启后书目仍在，生成卡片可跳到对应原页，恢复后 PDF 字节一致 |
| 批改、反例与存档 | 4 | 无 Key 确定性判分、模拟上游逐步审阅、变式持久化、开闭端点、带依据的笔记，以及两代存档恢复通过 |
| 无 Key 讲义朗读 | 1 | 无模型请求，系统中文语音实际开始朗读。模拟上游的错因讲评也触发了同一原生语音事件 |

### 复现发布包验收

在项目根目录打开 PowerShell。以下命令将 ZIP 解压至新的临时目录，并将解压出的后端、前端与解释器传给验收程序。测试使用本机 Chrome、Playwright、pytest 和 Git 历史中的 Phase 1 基线。源码启动脚本的重建用例另使用已安装的前端构建依赖。

```powershell
$zip = Get-Item 'releases/Axiom-Windows-Full-20261126T005627Z.zip'
$testRoot = Join-Path $env:TEMP ('axiom-check-' + [guid]::NewGuid())
Expand-Archive -LiteralPath $zip.FullName -DestinationPath $testRoot
$r = Join-Path $testRoot $zip.BaseName
python -m pytest -q -s qa/phase2 --portable-backend "$r/backend" --portable-python "$r/runtime/python.exe" --portable-web "$r/web" --release-root "$r" --tb=short
```
