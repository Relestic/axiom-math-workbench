Axiom 公理 · 完整版 Windows x64 免安装分享包

【启动】
完整解压 ZIP，再双击“启动 Axiom.cmd”。不要在压缩包内直接运行。
首次启动会创建本机数据库和全新的演示数据，稍等几秒浏览器会打开。
默认地址：http://127.0.0.1:5186/
使用时保留启动窗口；关闭窗口或按 Ctrl+C 停止服务。
若端口被占用，可在 backend/.env 中设置 AXIOM_PORT=5187，然后重启。
包内自带 Python 和所需依赖，不需安装 Python、Node.js 或下载依赖。
仅支持 Windows x64 电脑；通过本机浏览器使用，不会自动公开到互联网。

【登录】
学生：demo@axiom.local
密码：axiom-demo-2026

管理员：admin@axiom.local
密码：axiom-admin-2026

【包含的功能】
教材示例、证明与正反例、练习与作答、笔记、知识地图、二维自由函数、三维曲面。
手动绘图、参数交互、练习和本机保存无需联网。
AI 对话需要联网，并由使用者配置自己的模型服务与密钥。
课程仍为代表性示例，有限采样和数值图像不能代替数学证明。

【配置 AI】
1. 打开 backend 文件夹，把 .env.example 复制为 .env。
   开启资源管理器“文件扩展名”，确保没有保存成 .env.txt。
2. 用记事本编辑 .env。默认模板用于 DeepSeek，填写自己的 AI_API_KEY。
3. 其他服务商需设置 AXIOM_AI_PROVIDER=openai，填入其 AI_BASE_URL 和 AI_MODEL。
   接口须兼容 Chat Completions，AI_BASE_URL 不要包含 /chat/completions。
4. 关闭启动窗口再启动，在图像工作区点击“测试连接”。
   不支持 JSON 模式的服务商可设置 AI_JSON_MODE=false。
模型调用按服务商账户规则计费，包内不提供密钥或免费额度。
原始分享包没有携带开发者的密钥、数据库或学习记录。

【保存和分享】
登录后的笔记、作答等保存在本文件夹新建的 data/ 中。
图像场景和部分界面偏好保存在当前浏览器中。
需要迁移记录时，可在停止程序后备份整个使用目录；浏览器中的场景不随文件复制。
转发给其他人请使用原始 ZIP，不要把使用后的 data/ 和 backend/.env 一并压缩分享。
包内保留第三方依赖许可。Python 依赖许可位于 runtime/site-packages 的各包和 dist-info 目录。

当前不包含完整教材课程、任意 PDF 自动解析、跨设备账号服务或公开网站托管。
已在开发机上使用包内环境完成独立启动检查；其他 Windows 电脑仍需实际验证。
