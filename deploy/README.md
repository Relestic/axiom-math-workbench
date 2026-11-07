# Deployment

This directory contains the deployable form of Axiom. The temporary
`trycloudflare.com` URL used during development is **not** a deployment: it is a
tunnel to the developer machine and disappears when that machine or tunnel stops.

## What is included

- `Dockerfile` — builds the React frontend with same-origin API, installs the
  Flask backend, and serves both from one container on port 8080.
- `docker-compose.yml` — one app service, a persistent SQLite volume at
  `/app/backend/var-online`, restart policy and healthcheck.
- `deploy/start.sh` — idempotent migrations + demo seed on every start.
- `deploy/.env.example` — production/DeepSeek settings. Never commit real values.

## Transfer the offline bundle

The repository root contains `axiom-deploy.tar.gz` (source + Docker files, no
secrets, node_modules, dist or database). On your machine:

```bash
scp axiom-deploy.tar.gz user@SERVER_IP:/opt/
ssh user@SERVER_IP
sudo mkdir -p /opt/axiom && sudo tar -xzf /opt/axiom-deploy.tar.gz -C /opt/axiom
cd /opt/axiom
sudo bash deploy/install.sh
```

`install.sh` generates strong secrets into `deploy/.env`, asks for a DeepSeek
key (press Enter to skip AI), builds the container, starts it, and waits for
`/api/health`.

## Deploy to a VPS

Requirements: a Linux VPS with Docker Engine + Compose; `install.sh` also uses
`python3`, `openssl` and `curl` (standard on Ubuntu/Debian), and optionally a domain.

## 腾讯云 Lighthouse / CVM

推荐 **轻量应用服务器 Lighthouse 2 vCPU / 4 GB / Ubuntu 22.04 或 24.04 / 40 GB SSD**；
CVM 标准型同样可用。Docker 构建会跑 Node 与 Python，2 GB 内存建议加 swap 或预构建镜像。

1. **地域与 ICP**
   - 中国内地地域绑定域名对外提供网站服务，需要完成 ICP 备案；没有备案时先用
     `http://服务器公网IP:8080/` 做内测，或选择中国香港/新加坡地域。
   - 域名在 DNSPod / 腾讯云 DNS 添加 A 记录，指向 Lighthouse/CVM 公网 IP。
   - 备案通过后再开放 80/443 并配置 HTTPS。

2. **防火墙 / 安全组**
   - 22：只允许你的固定 IP；
   - 80/443：对公网开放，给 Caddy/Nginx；
   - 8080：只允许你的 IP（临时测试），不要对全网开放。
   - Lighthouse 在控制台“防火墙”配置；CVM 在“安全组”配置。

3. **安装 Docker**

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

重新登录后确认 `docker compose version`。如果 Docker Hub 拉取慢，可在腾讯云内网使用
容器镜像加速（TCR/镜像加速地址以控制台为准）：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{"registry-mirrors":["https://mirror.ccs.tencentyun.com"]}
EOF
sudo systemctl restart docker
```

4. **使用腾讯云镜像构建**

在 `deploy/.env` 中取消注释：

```dotenv
NPM_REGISTRY=https://mirrors.cloud.tencent.com/npm/
PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
```

`install.sh` 使用 `--env-file deploy/.env`，构建参数会读取这两个值。

5. **启动**

```bash
cd /opt/axiom
sudo bash deploy/install.sh
curl http://127.0.0.1:8080/api/health
```

6. **HTTPS + 域名**

将域名解析到服务器公网 IP，开放 80/443 后使用 Caddy：

```bash
sudo apt install -y caddy
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo sed -i 's/axiom.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

中国内地未备案域名在 80/443 上会被拦截；请先完成备案，或选择香港地域。

7. **运维**
   - SQLite 数据在 Docker volume `./data`；升级前做快照。
   - 保持单容器实例；横向扩容前迁移到 PostgreSQL。
   - DeepSeek Key 只放 `deploy/.env`；共享过预览地址后建议轮换。
   - 在服务器上验证 `curl https://api.deepseek.com` 可通。

## Generic Docker steps

```bash
git clone <your-repo> axiom && cd axiom
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env`:

- generate `AXIOM_SECRET_KEY` with `openssl rand -base64 48`;
- set a strong `AXIOM_ADMIN_PASSWORD`;
- set a random `AXIOM_DEMO_INVITE_CODE`;
- set `AI_API_KEY` to your DeepSeek key;
- set `AXIOM_ADMIN_EMAIL` to your own address.

Then:

```bash
docker compose --env-file deploy/.env up -d --build
docker compose logs -f axiom
curl http://127.0.0.1:8080/api/health
```

Open `http://SERVER_IP:8080/`. For production, put Caddy/Nginx in front of port
8080 and use HTTPS; do not expose the container port directly to the internet.
Example Caddy:

```caddyfile
axiom.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Set `AXIOM_CORS_ORIGINS=https://axiom.example.com` only if you split the frontend
to a different origin. The bundled frontend uses relative `/api` requests.

## Deploy to Render / Railway / Fly.io

Use the repository root as the Docker build context. The app listens on `8080`.
Attach a persistent disk/volume at:

```text
/app/backend/var-online
```

Set the same environment variables as `deploy/.env`, and set
`AXIOM_ONLINE_HOST=0.0.0.0` if the platform requires it. Keep exactly one
instance while using SQLite. A managed PostgreSQL migration is required before
horizontal scaling.

## Security checklist

- Change the default admin password and invite code; never deploy with demo values.
- Keep `deploy/.env` out of git and out of screenshots.
- Rotate the DeepSeek API key after sharing a preview URL.
- Put HTTPS in front; do not expose port 8080 publicly without a proxy/firewall.
- Back up the `data/`/`var-online` volume; SQLite is a single-writer database.
- The public demo allows shared writes. For a real class, use separate accounts and
  a real database, and review privacy/retention requirements.

## Why not just use a tunnel?

A Quick Tunnel is useful for a reviewer to see a running build, but it depends on
the developer machine staying awake and online. It has no uptime guarantee and
no stable domain. A deployable container on a host is the boundary between
"local preview" and "online service".
