from __future__ import annotations

from fastapi import Header, HTTPException

from .auth import decode_token


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="missing auth")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="invalid auth")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")
