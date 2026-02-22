from __future__ import annotations

from pydantic import BaseModel


class AdminUserOut(BaseModel):
    id: int
    username: str
    email: str | None = None
    is_admin: bool
    locked: bool
    failed_login_count: int


class SignupRequestOut(BaseModel):
    id: int
    username: str
    email: str
    status: str
    created_at: int
