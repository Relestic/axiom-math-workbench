# 腾讯云部署步骤（Lighthouse / CVM）

推荐规格：2 vCPU、4 GB 内存、Ubuntu 22.04/24.04、40 GB SSD。  
中国内地地域绑定域名需要 ICP 备案；没有备案先用 `http://公网IP:8080/` 内测，或使用中国香港地域。

## 1. 服务器与网络

腾讯云控制台创建 Lighthouse（或 CVM），系统选择 Ubuntu。

防火墙 / 安全组：

| 端口 | 来源 | 用途 |
| --- | --- | --- |
| 22 | 你的固定 IP | SSH |
| 80/443 | 0.0.0.0/0 | HTTPS（备案后） |
| 8080 | 你的固定 IP | 临时验收，不对全网开放 |

## 2. 添加部署公钥

在腾讯云网页终端（OrcaTerm）或本地 SSH 登录服务器后执行：

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat >> ~/.ssh/authorized_keys <<'EOF'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIISXhJy5u1rD8vgVi6o6ASlZsnqiZEwyo0Wd/BtLc6hp axiom-deploy
EOF
chmod 600 ~/.ssh/authorized_keys
```

## 3. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

退出 SSH 再重新登录，确认：

```bash
docker compose version
```

如果拉取镜像慢，在腾讯云内网配置镜像加速：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{"registry-mirrors":["https://mirror.ccs.tencentyun.com"]}
EOF
sudo systemctl restart docker
```

## 4. 上传部署包

在你的 Windows 电脑执行（路径按实际修改）：

```powershell
scp -i "C:\Users\admim\Desktop\求职简历相关\vibe coding demo2.0\deploy\keys\axiom_deploy" `
  "C:\Users\admim\Desktop\求职简历相关\vibe coding demo2.0\axiom-deploy.tar.gz" `
  ubuntu@服务器公网IP:/opt/
```

如果使用网页终端，也可以通过“文件上传”把 `axiom-deploy.tar.gz` 上传到 `/home/ubuntu`，然后：

```bash
sudo mkdir -p /opt/axiom
sudo mv /home/ubuntu/axiom-deploy.tar.gz /opt/
sudo tar -xzf /opt/axiom-deploy.tar.gz -C /opt/axiom
```

## 5. 启动

```bash
cd /opt/axiom
sudo bash deploy/install.sh
```

脚本会：

- 生成强 `AXIOM_SECRET_KEY`、管理员密码、邀请码；
- 提示输入 DeepSeek API Key（直接回车可先跳过 AI）；
- 构建并启动容器；
- 等待 `/api/health`；
- 把管理员密码写入 `deploy/.env`。

成功后可先访问：

```text
http://服务器公网IP:8080/
```

演示学生：`demo@axiom.local` / `axiom-demo-2026`。  
管理员账号和密码在 `deploy/.env` 里，不要发到公开聊天。

## 6. 域名与 HTTPS

1. 在 DNSPod / 腾讯云 DNS 添加 A 记录：`axiom.example.com -> 服务器公网IP`。
2. 中国内地服务器确认域名已完成 ICP 备案。
3. 开放 80/443。
4. 安装 Caddy：

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

5. 配置反向代理：

```bash
sudo cp /opt/axiom/deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo sed -i 's/axiom.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

6. 验证：

```bash
curl -I https://你的域名/
curl https://你的域名/api/health
```

## 7. 验收

- 打开 `https://你的域名/`，登录演示账号；
- 进入“三维曲面实验室”，拖动旋转，输入“把曲面换成 sin(x)cos(y)”；
- 在图像探索里测试 DeepSeek 对话；
- 检查数据库持久化：

```bash
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env logs --tail=100 axiom
ls -lh data/
```

## 8. 常见问题

**8080 打不开**：检查腾讯云防火墙/安全组是否放行你的 IP，容器是否 `Up`。

**构建卡在 npm/pip**：在 `deploy/.env` 取消注释：

```dotenv
NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/
PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
```

然后重新：

```bash
sudo docker compose --env-file deploy/.env up -d --build
```

**域名 80/443 被拦截**：中国内地未备案域名不能对外提供网站服务；先备案或改用香港地域。

**DeepSeek 未连接**：检查 `deploy/.env` 的 `AI_API_KEY`，重启容器：

```bash
sudo docker compose --env-file deploy/.env restart axiom
```

**修改管理员密码后不生效**：种子数据是幂等的；演示阶段可在控制台修改数据库或重建卷，正式环境应通过管理员 API/密码修改接口处理。

## 最短路径（已有服务器和 SSH）

```bash
scp axiom-deploy.tar.gz ubuntu@IP:/opt/
ssh ubuntu@IP
sudo mkdir -p /opt/axiom && sudo tar -xzf /opt/axiom-deploy.tar.gz -C /opt/axiom
cd /opt/axiom && sudo bash deploy/install.sh
```

然后把域名 A 记录指向 IP，按第 6 节配置 Caddy。
