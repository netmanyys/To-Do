from __future__ import annotations

from fastapi import Cookie, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth_sessions import SessionRow, now_s
from .models import User


def get_user_from_session_cookie(engine, sid: str | None) -> User:
    if not sid:
        raise HTTPException(status_code=401, detail="not logged in")
    with Session(engine) as s:
        row = s.execute(select(SessionRow).where(SessionRow.sid == sid)).scalars().first()
        if row is None or int(row.expires_at) < now_s():
            raise HTTPException(status_code=401, detail="session expired")
        u = s.get(User, int(row.user_id))
        if u is None:
            raise HTTPException(status_code=401, detail="user missing")
        return u
