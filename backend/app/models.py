from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), nullable=False, unique=True)
    email = Column(String(255), nullable=True, unique=True)
    password_hash = Column(String(255), nullable=False)

    is_admin = Column(Boolean, nullable=False, default=False)

    # security / login throttling
    locked = Column(Boolean, nullable=False, default=False)
    failed_login_count = Column(Integer, nullable=False, default=0)
    failed_login_window_start = Column(BigInteger, nullable=True)  # unix seconds

    # force password change (e.g. bootstrap admin)
    must_change_password = Column(Boolean, nullable=False, default=False)

    # email/identity verification (step-up)
    email_verified = Column(Boolean, nullable=False, default=True)
    email_verification_code_hash = Column(String(255), nullable=True)
    email_verification_expires_at = Column(BigInteger, nullable=True)  # unix seconds


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(256), nullable=False)
    done = Column(Boolean, nullable=False, default=False)
    priority = Column(String(8), nullable=False, default="Medium")  # High|Medium|Low
    created_at = Column(BigInteger, nullable=False)  # unix seconds
