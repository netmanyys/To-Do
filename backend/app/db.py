from __future__ import annotations

import os

from sqlalchemy import create_engine


def get_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required")
    # Keep it simple: sync engine is fine for a starter template.
    return create_engine(url, pool_pre_ping=True)
