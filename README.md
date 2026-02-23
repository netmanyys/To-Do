# NextFast

Template: **Next.js + FastAPI + Tailwind v4 + shadcn/ui + PostgreSQL + Redis**

This repo is a small, LAN-bindable to-do app with same-origin auth (httpOnly cookie sessions) and persistent storage in PostgreSQL.

## Paths
- Project root: `/Users/yan/dev/NextFast`

## Ports / host bind
- Frontend (Next.js): http://0.0.0.0:3001
- Backend (FastAPI):  http://0.0.0.0:8001
- Postgres/Redis are bound to localhost only (127.0.0.1) by default.

## Run
```bash
cd /Users/yan/dev/NextFast
docker compose up -d --build
```

Stop:
```bash
docker compose down
```

## Health checks
Web:
```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://0.0.0.0:3001/
```

API:
```bash
curl -sS http://0.0.0.0:8001/health
```

## Features
- **Auth**: same-origin login/logout with **httpOnly cookie session** (login auto-creates user on first sign-in).
- **Todos**:
  - Create / list
  - Toggle done/undo
  - Delete
  - `created_at` displayed in UI
- **Priority** per todo:
  - Field: `priority` ∈ `High | Medium | Low` (default **Medium**)
  - Create with priority
  - Change priority via dropdown (auto-submit)
- **Filtering (UI)**:
  - Filter by `priority` (All/High/Medium/Low)
  - Filter by `status` (All/Not done/Done)
- **Theme** (UI):
  - Dark blue (current default)
  - Light theme with black text
  - Selector sits under Logout, stored in `theme` cookie

## API
Base: http://0.0.0.0:8001

- `GET /health`
- `POST /api/login` `{ "username": "...", "password": "..." }` (creates user if missing)
- `POST /api/logout`
- `GET /api/me`
- `GET /api/todos`
- `POST /api/todos` `{ "title": "...", "priority": "High|Medium|Low" }`
- `POST /api/todos/{id}/toggle`
- `POST /api/todos/{id}/priority` `{ "priority": "High|Medium|Low" }`
- `POST /api/todos/{id}/delete`

### Swagger
- FastAPI docs: http://0.0.0.0:8001/docs
- Convenience redirect from web: http://0.0.0.0:3001/api-docs

## Notes
- DB tables are created on startup.
- Lightweight migrations run on API startup to add missing columns.
- Do **not** use port 8080 (reserved). We use 3001 + 8001.


## Build personal CICD flow

方案 A（推荐）：Ubuntu 上跑 Self-hosted Runner + docker-compose 部署
1) Ubuntu 上准备环境（一次性）
# 1) 安装 docker / docker compose（如果已装可跳过）
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker

# 2) 准备部署目录
sudo mkdir -p /opt/todo
sudo chown -R $USER:$USER /opt/todo
```

2) 在 GitHub 仓库里注册 Runner（一次性）

进入你的 GitHub Repo：
Settings → Actions → Runners → New self-hosted runner → Linux

它会给你一段命令，照抄在 Ubuntu 上执行。一般长这样（以页面为准）：
```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-*.tar.gz -L <URL>
tar xzf actions-runner-linux-x64-*.tar.gz
./config.sh --url https://github.com/<you>/<repo> --token <TOKEN>

# 然后启动 runner：

./run.sh

# 想让它后台常驻（强烈建议）：

sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```
到这里，你的 GitHub Repo 就“有一台自己的 runner 服务器”了。

3) Ubuntu 上放一个部署脚本（推荐）

在 Ubuntu 上创建 /opt/todo/deploy.sh：
```bash
cat >/opt/todo/deploy.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/netmanyys/To-Do.git"
APP_DIR="/opt/todo/app"

mkdir -p "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin
git checkout main
git reset --hard origin/main

# Build & deploy (compose v2)
docker compose pull || true
docker compose build
docker compose up -d --remove-orphans

# Optional: clean old images
docker image prune -f
EOF

chmod +x /opt/todo/deploy.sh
```
这个脚本会在服务器上把代码同步到 /opt/todo/app，然后 docker compose build && up -d。

4) 写 GitHub Actions workflow（每次 commit 自动触发）

在你的 repo 里创建：.github/workflows/deploy.yml
```yaml
name: Build & Deploy (Ubuntu Self-hosted)

on:
  push:
    branches: [ "main" ]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - name: Deploy via server-local script
        run: |
          /opt/todo/deploy.sh
```
提交并 push：
```bash
git add .github/workflows/deploy.yml
git commit -m "Add CI/CD deploy workflow"
git push
```
之后每次你 push 到 main，GitHub Actions 会自动触发，然后在你的 Ubuntu 上执行部署脚本。