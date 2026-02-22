from __future__ import annotations

from pydantic import BaseModel


class AuthIn(BaseModel):
    username: str
    password: str


class SignupIn(BaseModel):
    username: str
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class VerifyEmailCodeIn(BaseModel):
    code: str


class AuthOut(BaseModel):
    token: str


# cookie session mode (preferred for same-origin SSR)
class LoginOut(BaseModel):
    ok: bool


class TodoCreate(BaseModel):
    title: str
    priority: str | None = None  # High|Medium|Low


class TodoUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None


class TodoPriority(BaseModel):
    priority: str


class TodoOut(BaseModel):
    id: int
    title: str
    done: bool
    priority: str
    created_at: int
