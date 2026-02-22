from __future__ import annotations

import secrets
import time

from sqlalchemy import Column, ForeignKey, Integer, String

from .models import Base


class SessionRow(Base):
    __tablename__ = "sessions"

    sid = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(Integer, nullable=False)  # unix seconds


def new_sid() -> str:
    return secrets.token_hex(32)


def now_s() -> int:
    return int(time.time())
