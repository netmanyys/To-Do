# NextFast

Template: **Next.js + FastAPI + Tailwind v4 + shadcn/ui + PostgreSQL + Redis**

This repo is a small, LAN-bindable to-do app with same-origin auth (httpOnly cookie sessions) and persistent storage in PostgreSQL.

## Paths
- Project root: `/Users/yan/dev/NextFast`

## Ports / host bind
- Frontend (Next.js): http://192.168.50.170:3001
- Backend (FastAPI):  http://192.168.50.170:8001
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
curl -sS -o /dev/null -w '%{http_code}\n' http://192.168.50.170:3001/
```

API:
```bash
curl -sS http://192.168.50.170:8001/health
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
Base: http://192.168.50.170:8001

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
- FastAPI docs: http://192.168.50.170:8001/docs
- Convenience redirect from web: http://192.168.50.170:3001/api-docs

## Notes
- DB tables are created on startup.
- Lightweight migrations run on API startup to add missing columns.
- Do **not** use port 8080 (reserved). We use 3001 + 8001.
