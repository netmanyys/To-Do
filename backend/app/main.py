from __future__ import annotations

import os

import redis
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password, verify_password
from .auth_sessions import SessionRow, new_sid, now_s
from .db import get_engine
from .models import Base, Todo, User
from .schemas import AuthIn, ChangePasswordIn, LoginOut, SignupIn, TodoCreate, TodoOut, TodoPriority, TodoUpdate, VerifyEmailCodeIn
from .signup_requests import BaseSignup, SignupRequestRow
from .admin_schemas import AdminUserOut, SignupRequestOut

app = FastAPI(title="NextFast API")

# CORS for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = None

SESSION_COOKIE = os.environ.get("SESSION_COOKIE", "sid")
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", "604800"))  # 7 days

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
r = redis.Redis.from_url(redis_url, decode_responses=True)


@app.on_event("startup")
def _startup():
    # Postgres in docker-compose might not be ready when API boots.
    # Retry a few times before failing hard.
    import time

    global engine
    last_exc: Exception | None = None
    for _ in range(30):
        try:
            engine = get_engine()
            Base.metadata.create_all(bind=engine)

            # Ensure sessions table exists (cookie session mode)
            SessionRow.metadata.create_all(bind=engine)

            # lightweight migrations for template iterations
            from sqlalchemy import text

            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        DO $$
                        BEGIN
                          -- todos
                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='todos' AND column_name='user_id'
                          ) THEN
                            ALTER TABLE todos ADD COLUMN user_id INTEGER;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='todos' AND column_name='priority'
                          ) THEN
                            ALTER TABLE todos ADD COLUMN priority VARCHAR(8);
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='todos' AND column_name='created_at'
                          ) THEN
                            ALTER TABLE todos ADD COLUMN created_at BIGINT;
                          END IF;

                          -- users
                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='email'
                          ) THEN
                            ALTER TABLE users ADD COLUMN email VARCHAR(255);
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='is_admin'
                          ) THEN
                            ALTER TABLE users ADD COLUMN is_admin BOOLEAN;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='locked'
                          ) THEN
                            ALTER TABLE users ADD COLUMN locked BOOLEAN;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='failed_login_count'
                          ) THEN
                            ALTER TABLE users ADD COLUMN failed_login_count INTEGER;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='failed_login_window_start'
                          ) THEN
                            ALTER TABLE users ADD COLUMN failed_login_window_start BIGINT;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='must_change_password'
                          ) THEN
                            ALTER TABLE users ADD COLUMN must_change_password BOOLEAN;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='email_verified'
                          ) THEN
                            ALTER TABLE users ADD COLUMN email_verified BOOLEAN;
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='email_verification_code_hash'
                          ) THEN
                            ALTER TABLE users ADD COLUMN email_verification_code_hash VARCHAR(255);
                          END IF;

                          IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='email_verification_expires_at'
                          ) THEN
                            ALTER TABLE users ADD COLUMN email_verification_expires_at BIGINT;
                          END IF;
                        END $$;
                        """
                    )
                )

                # backfill defaults
                conn.execute(
                    text(
                        """
                        UPDATE todos
                        SET
                          user_id = COALESCE(user_id, 1),
                          priority = COALESCE(priority, 'Medium'),
                          created_at = COALESCE(created_at, EXTRACT(EPOCH FROM NOW())::BIGINT)
                        WHERE user_id IS NULL OR created_at IS NULL OR priority IS NULL;

                        UPDATE users
                        SET
                          is_admin = COALESCE(is_admin, false),
                          locked = COALESCE(locked, false),
                          failed_login_count = COALESCE(failed_login_count, 0),
                          must_change_password = COALESCE(must_change_password, false),
                          email_verified = COALESCE(email_verified, true)
                        WHERE is_admin IS NULL OR locked IS NULL OR failed_login_count IS NULL OR must_change_password IS NULL OR email_verified IS NULL;
                        """
                    )
                )

            # signup requests
            BaseSignup.metadata.create_all(bind=engine)

            # bootstrap admin (option B)
            # In dev, default to admin/admin but force password change.
            app_env = os.environ.get("APP_ENV", "dev")
            admin_user = os.environ.get("ADMIN_BOOTSTRAP_USERNAME", "").strip()
            admin_pw = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD", "").strip()
            admin_email = os.environ.get("ADMIN_BOOTSTRAP_EMAIL", "").strip() or None
            if app_env == "dev":
                admin_user = admin_user or "admin"
                # default dev password must satisfy policy; still force change
                admin_pw = admin_pw or "Admin1234"

            if admin_user and admin_pw:
                with Session(engine) as s:
                    u = s.execute(select(User).where(User.username == admin_user)).scalars().first()
                    if u is None:
                        u = User(
                            username=admin_user,
                            email=admin_email,
                            password_hash=hash_password(admin_pw),
                            is_admin=True,
                            locked=False,
                            failed_login_count=0,
                            failed_login_window_start=None,
                            must_change_password=True,
                        )
                        s.add(u)
                        s.commit()
                    else:
                        # ensure admin flag is set
                        if not bool(u.is_admin):
                            u.is_admin = True
                            if admin_email and not u.email:
                                u.email = admin_email
                            u.must_change_password = True
                            s.add(u)
                            s.commit()

            return
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            time.sleep(1.0)
    raise RuntimeError(f"DB init failed after retries: {last_exc}")


@app.get("/health")
def health():
    try:
        r.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {"ok": True, "redis": redis_ok}

@app.get("/healthz")
async def healthz():
    # super cheap liveness probe
    return {"ok": True}


@app.post("/api/login", response_model=LoginOut)
def login(body: AuthIn, response: Response):
    """Login only. If user does not exist, they must submit a signup request."""
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    username = body.username.strip()
    password = body.password
    if not username or not password:
        raise HTTPException(status_code=400, detail="username/password required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 characters")

    LOCK_WINDOW_SECONDS = 3600
    LOCK_MAX_FAILS = 5

    with Session(engine) as s:
        u = s.execute(select(User).where(User.username == username)).scalars().first()
        if u is None:
            raise HTTPException(status_code=404, detail="user not found")

        if bool(getattr(u, "locked", False)):
            raise HTTPException(status_code=423, detail="account locked")

        now = now_s()
        win_start = int(getattr(u, "failed_login_window_start", 0) or 0)
        fail_count = int(getattr(u, "failed_login_count", 0) or 0)

        # reset window if expired
        if win_start == 0 or (now - win_start) > LOCK_WINDOW_SECONDS:
            win_start = now
            fail_count = 0

        if not verify_password(password, u.password_hash):
            fail_count += 1
            u.failed_login_window_start = win_start
            u.failed_login_count = fail_count
            if fail_count >= LOCK_MAX_FAILS:
                u.locked = True
            s.add(u)
            s.commit()
            if bool(getattr(u, "locked", False)):
                raise HTTPException(status_code=423, detail="account locked")
            raise HTTPException(status_code=401, detail="invalid credentials")

        # success: reset counters
        u.failed_login_window_start = None
        u.failed_login_count = 0
        s.add(u)

        # create session row
        sid = new_sid()
        exp = now_s() + SESSION_TTL_SECONDS
        s.add(SessionRow(sid=sid, user_id=int(u.id), expires_at=exp))
        s.commit()

    # httpOnly cookie, Lax for form posts
    response.set_cookie(
        key=SESSION_COOKIE,
        value=sid,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
        max_age=SESSION_TTL_SECONDS,
    )
    return LoginOut(ok=True)


def _validate_strong_password(pw: str) -> None:
    # >=8, at least 1 digit, 1 uppercase, 1 lowercase
    import re

    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters")
    if not re.search(r"[a-z]", pw):
        raise HTTPException(status_code=400, detail="password must include a lowercase letter")
    if not re.search(r"[A-Z]", pw):
        raise HTTPException(status_code=400, detail="password must include an uppercase letter")
    if not re.search(r"\d", pw):
        raise HTTPException(status_code=400, detail="password must include a number")


@app.post("/api/signup")
def signup(body: SignupIn):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    username = body.username.strip()
    email = body.email.strip()
    password = body.password

    if not username or not email or not password:
        raise HTTPException(status_code=400, detail="username/email/password required")
    _validate_strong_password(password)
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="invalid email")

    with Session(engine) as s:
        # block if already exists
        existing = s.execute(select(User).where(User.username == username)).scalars().first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="username already exists")
        existing_e = s.execute(select(User).where(User.email == email)).scalars().first()
        if existing_e is not None:
            raise HTTPException(status_code=409, detail="email already exists")

        # avoid duplicate pending requests
        dup = (
            s.execute(
                select(SignupRequestRow).where(
                    SignupRequestRow.username == username,
                    SignupRequestRow.status == "pending",
                )
            )
            .scalars()
            .first()
        )
        if dup is not None:
            return {"ok": True, "status": "pending"}

        from sqlalchemy import text

        created_at = int(s.execute(text("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT")).scalar_one())
        req = SignupRequestRow(
            username=username,
            email=email,
            password_hash=hash_password(password),
            status="pending",
            created_at=created_at,
        )
        s.add(req)
        s.commit()

    return {"ok": True, "status": "pending"}


@app.post("/api/change_password")
def change_password(request: Request, body: ChangePasswordIn):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    old_pw = body.old_password
    new_pw = body.new_password

    if not old_pw or not new_pw:
        raise HTTPException(status_code=400, detail="old_password/new_password required")

    with Session(engine) as s:
        dbu = s.get(User, int(u.id))
        if dbu is None:
            raise HTTPException(status_code=401, detail="user missing")
        if not verify_password(old_pw, dbu.password_hash):
            raise HTTPException(status_code=401, detail="invalid credentials")

        _validate_strong_password(new_pw)

        dbu.password_hash = hash_password(new_pw)
        dbu.must_change_password = False
        dbu.failed_login_count = 0
        dbu.failed_login_window_start = None
        dbu.locked = False
        s.add(dbu)

        # Force logout (A): delete all sessions for this user.
        s.query(SessionRow).filter(SessionRow.user_id == int(dbu.id)).delete()
        s.commit()

    return {"ok": True}


@app.post("/api/verify_email_code")
def verify_email_code(request: Request, body: VerifyEmailCodeIn):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    code = (body.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code required")

    now = now_s()
    with Session(engine) as s:
        dbu = s.get(User, int(u.id))
        if dbu is None:
            raise HTTPException(status_code=401, detail="user missing")

        if bool(getattr(dbu, "email_verified", True)):
            return {"ok": True}

        exp = int(getattr(dbu, "email_verification_expires_at", 0) or 0)
        if exp and now > exp:
            raise HTTPException(status_code=400, detail="code expired")

        h = getattr(dbu, "email_verification_code_hash", None)
        if not h or not verify_password(code, h):
            raise HTTPException(status_code=400, detail="invalid code")

        dbu.email_verified = True
        dbu.email_verification_code_hash = None
        dbu.email_verification_expires_at = None
        s.add(dbu)
        s.commit()

    return {"ok": True}


@app.post("/api/logout")
def logout(request: Request, response: Response):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    sid = request.cookies.get(SESSION_COOKIE)
    if sid:
        with Session(engine) as s:
            s.query(SessionRow).filter(SessionRow.sid == sid).delete()
            s.commit()
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return {"ok": True}


def _require_admin(request: Request) -> User:
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)
    if not bool(getattr(u, "is_admin", False)):
        raise HTTPException(status_code=403, detail="admin required")
    return u


@app.get("/api/admin/signup_requests", response_model=list[SignupRequestOut])
def admin_list_signup_requests(request: Request, status: str = "pending"):
    _require_admin(request)
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    status = status.strip().lower()
    if status not in {"pending", "approved", "rejected", "all"}:
        raise HTTPException(status_code=400, detail="invalid status")

    with Session(engine) as s:
        q = select(SignupRequestRow)
        if status != "all":
            q = q.where(SignupRequestRow.status == status)
        rows = s.execute(q.order_by(SignupRequestRow.id.desc())).scalars().all()
        return [
            SignupRequestOut(
                id=r.id,
                username=r.username,
                email=r.email,
                status=r.status,
                created_at=int(r.created_at),
            )
            for r in rows
        ]


@app.post("/api/admin/signup_requests/{req_id}/approve")
def admin_approve_signup_request(req_id: int, request: Request):
    _require_admin(request)
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    with Session(engine) as s:
        r = s.get(SignupRequestRow, req_id)
        if r is None:
            raise HTTPException(status_code=404, detail="request not found")
        if r.status != "pending":
            return {"ok": True}

        # create user (and require verification)
        import secrets

        code = f"{secrets.randbelow(1_000_000):06d}"
        u = User(
            username=r.username,
            email=r.email,
            password_hash=r.password_hash,
            is_admin=False,
            locked=False,
            failed_login_count=0,
            failed_login_window_start=None,
            must_change_password=False,
            email_verified=False,
            email_verification_code_hash=hash_password(code),
            email_verification_expires_at=now_s() + 15 * 60,
        )
        s.add(u)
        r.status = "approved"
        s.add(r)
        s.commit()
    return {"ok": True, "verification_code": code}


@app.post("/api/admin/signup_requests/{req_id}/reject")
def admin_reject_signup_request(req_id: int, request: Request):
    _require_admin(request)
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    with Session(engine) as s:
        r = s.get(SignupRequestRow, req_id)
        if r is None:
            raise HTTPException(status_code=404, detail="request not found")
        if r.status == "pending":
            r.status = "rejected"
            s.add(r)
            s.commit()
    return {"ok": True}


@app.get("/api/admin/users", response_model=list[AdminUserOut])
def admin_list_users(request: Request):
    _require_admin(request)
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    with Session(engine) as s:
        rows = s.execute(select(User).order_by(User.id.asc())).scalars().all()
        return [
            AdminUserOut(
                id=int(u.id),
                username=u.username,
                email=u.email,
                is_admin=bool(u.is_admin),
                locked=bool(getattr(u, "locked", False)),
                failed_login_count=int(getattr(u, "failed_login_count", 0) or 0),
            )
            for u in rows
        ]


@app.post("/api/admin/users/{user_id}/unlock")
def admin_unlock_user(user_id: int, request: Request):
    _require_admin(request)
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")

    with Session(engine) as s:
        u = s.get(User, user_id)
        if u is None:
            raise HTTPException(status_code=404, detail="user not found")
        u.locked = False
        u.failed_login_count = 0
        u.failed_login_window_start = None
        s.add(u)
        s.commit()
    return {"ok": True}


@app.get("/api/me")
def me(request: Request):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)
    return {
        "id": int(u.id),
        "username": u.username,
        "is_admin": bool(getattr(u, "is_admin", False)),
        "must_change_password": bool(getattr(u, "must_change_password", False)),
        "email_verified": bool(getattr(u, "email_verified", True)),
    }


@app.get("/api/todos", response_model=list[TodoOut])
def list_todos(request: Request):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    with Session(engine) as s:
        rows = (
            s.execute(select(Todo).where(Todo.user_id == int(u.id)).order_by(Todo.id.desc()))
            .scalars()
            .all()
        )
        return [
            TodoOut(
                id=t.id,
                title=t.title,
                done=bool(t.done),
                priority=str(t.priority or "Medium"),
                created_at=int(t.created_at),
            )
            for t in rows
        ]


@app.post("/api/todos", response_model=TodoOut)
def create_todo(request: Request, body: TodoCreate):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    pr = (body.priority or "Medium").strip().capitalize()
    if pr not in {"High", "Medium", "Low"}:
        raise HTTPException(status_code=400, detail="priority must be High|Medium|Low")

    with Session(engine) as s:
        from sqlalchemy import text

        created_at = int(s.execute(text("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT")).scalar_one())
        t = Todo(user_id=int(u.id), title=title, done=False, priority=pr, created_at=created_at)
        s.add(t)
        s.commit()
        s.refresh(t)
        return TodoOut(id=t.id, title=t.title, done=bool(t.done), priority=str(t.priority), created_at=int(t.created_at))


@app.post("/api/todos/{todo_id}/priority")
def set_priority(todo_id: int, request: Request, body: TodoPriority):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    pr = (body.priority or "").strip().capitalize()
    if pr not in {"High", "Medium", "Low"}:
        raise HTTPException(status_code=400, detail="priority must be High|Medium|Low")

    with Session(engine) as s:
        t = s.get(Todo, todo_id)
        if not t or int(t.user_id) != int(u.id):
            raise HTTPException(status_code=404, detail="todo not found")
        t.priority = pr
        s.add(t)
        s.commit()
        return {"ok": True}


@app.post("/api/todos/{todo_id}/toggle")
def toggle_todo(todo_id: int, request: Request):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    with Session(engine) as s:
        t = s.get(Todo, todo_id)
        if not t or int(t.user_id) != int(u.id):
            raise HTTPException(status_code=404, detail="todo not found")
        t.done = not bool(t.done)
        s.add(t)
        s.commit()
        return {"ok": True}


@app.post("/api/todos/{todo_id}/delete")
def delete_todo(todo_id: int, request: Request):
    if engine is None:
        raise HTTPException(status_code=503, detail="db not ready")
    from .session_deps import get_user_from_session_cookie

    sid = request.cookies.get(SESSION_COOKIE)
    u = get_user_from_session_cookie(engine, sid)

    with Session(engine) as s:
        t = s.get(Todo, todo_id)
        if not t or int(t.user_id) != int(u.id):
            raise HTTPException(status_code=404, detail="todo not found")
        s.delete(t)
        s.commit()
        return {"ok": True}
