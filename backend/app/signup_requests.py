from __future__ import annotations

from sqlalchemy import BigInteger, Column, Integer, String
from sqlalchemy.orm import declarative_base

# use separate base so we can create table explicitly without touching other metadata
BaseSignup = declarative_base()


class SignupRequestRow(BaseSignup):
    __tablename__ = "signup_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    status = Column(String(16), nullable=False, default="pending")  # pending|approved|rejected
    created_at = Column(BigInteger, nullable=False)  # unix seconds
