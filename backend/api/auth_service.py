"""
auth_service.py — local JWT auth (replaces api/supabase_auth.py). Owns password hashing,
access/refresh token issuance, and verification — everything that used to be "ask Supabase's
Auth API if this token is valid" now happens against our own DATABASE_URL Postgres.

Two token types, deliberately different lifetimes and storage:
  - Access token: short-lived (ACCESS_TOKEN_TTL_MINUTES) signed JWT carrying {sub: user_id,
    role}. Verified locally (no DB round trip) by decoding + checking the signature/expiry —
    this is what require_role() in api/auth.py checks on every request. Kept in memory by the
    frontend (frontend/src/lib/authStore.jsx), never persisted, so a stolen one expires fast.
  - Refresh token: a random opaque string, NOT a JWT — its hash is stored in the `refresh_tokens`
    table so it can be revoked (logout) or rotated (refresh) server-side, which a stateless JWT
    can't be. Sent to the browser only as an httpOnly cookie (see api/auth_routes.py) so
    frontend JS can never read it.
"""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import Profile, RefreshToken, User

ACCESS_TOKEN_TTL_MINUTES = 15
REFRESH_TOKEN_TTL_DAYS = 30
JWT_ALGORITHM = "HS256"

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError(
            "JWT_SECRET is not set. Generate one with `python -c \"import secrets; "
            "print(secrets.token_urlsafe(48))\"` and set it in backend/api/.env."
        )
    return secret


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return _pwd_context.verify(password, hashed)


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Returns the decoded payload ({"sub", "role", ...}), or None if the token is missing,
    expired, or has an invalid signature. Never raises — every caller treats "can't verify" and
    "invalid" identically (reject), so there's no reason to force each call site to catch a
    dedicated exception type."""
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def _hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def issue_refresh_token(db: AsyncSession, user_id: str) -> str:
    raw_token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=_hash_refresh_token(raw_token),
            created_at=now,
            expires_at=now + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
        )
    )
    return raw_token


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> Optional[tuple[str, str]]:
    """Validates `raw_token`, revokes it, and issues a replacement. Returns (user_id,
    new_raw_token), or None if the presented token is unknown, already revoked, or expired —
    rotation (not just validation) means a stolen-and-reused refresh token gets invalidated the
    moment the legitimate client also tries to use it, since only one rotation can win."""
    token_hash = _hash_refresh_token(raw_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    row = result.scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at < datetime.now(timezone.utc):
        return None

    row.revoked_at = datetime.now(timezone.utc)
    new_token = await issue_refresh_token(db, row.user_id)
    return row.user_id, new_token


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    token_hash = _hash_refresh_token(raw_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    row = result.scalar_one_or_none()
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)


async def get_role(db: AsyncSession, user_id: str) -> Optional[str]:
    result = await db.execute(select(Profile.role).where(Profile.user_id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()
