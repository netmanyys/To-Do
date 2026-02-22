from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Any

import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_SECONDS = int(os.environ.get("JWT_TTL_SECONDS", "604800"))  # 7d

PBKDF2_ITERS = int(os.environ.get("PBKDF2_ITERS", "200000"))


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")


def _b64d(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def hash_password(pw: str) -> str:
    # Format: pbkdf2_sha256$iters$salt$hash
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, PBKDF2_ITERS, dklen=32)
    return f"pbkdf2_sha256${PBKDF2_ITERS}${_b64(salt)}${_b64(dk)}"


def verify_password(pw: str, pw_hash: str) -> bool:
    try:
        algo, iters_s, salt_s, hash_s = pw_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters_s)
        salt = _b64d(salt_s)
        expected = _b64d(hash_s)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, iters, dklen=len(expected))
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def make_token(user_id: int, username: str) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
