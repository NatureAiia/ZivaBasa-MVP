"""
auth_routes.py — /auth/* endpoints. Replaces Supabase Auth's signUp/signInWithPassword/
signOut/onAuthStateChange (frontend/src/lib/authStore.jsx) and the `promote_user_role` RPC
(backend/supabase/schema.sql) with backend-owned equivalents (see api/auth_service.py).

Session model: the access token is returned in the response body only (frontend keeps it in
memory — see authStore.jsx); the refresh token is set as an httpOnly, SameSite cookie and never
appears in a JSON body, so frontend JS can't read or leak it.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth, auth_service
from api.db.models import Profile, User
from api.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "zb_refresh"
_VALID_ROLES = {"viewer", "admin", "superadmin"}


def _cookie_kwargs() -> dict:
    # Overridable for local HTTP dev (COOKIE_SECURE=0) and for a frontend on a different
    # registrable domain than the API (COOKIE_SAMESITE=none, which itself requires secure=True
    # per browser spec) — see backend/api/.env.example.
    return {
        "httponly": True,
        "secure": os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        "samesite": os.environ.get("COOKIE_SAMESITE", "lax"),
        "path": "/auth",
    }


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        raw_token,
        max_age=auth_service.REFRESH_TOKEN_TTL_DAYS * 24 * 3600,
        **_cookie_kwargs(),
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/auth")


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    organization: str | None = None
    job_title: str | None = None
    requested_role: str = "viewer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    role: str
    user_id: str


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)):
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    requested_role = body.requested_role if body.requested_role in _VALID_ROLES else "viewer"

    existing = await auth_service.get_user_by_email(db, body.email)
    if existing is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(email=body.email, hashed_password=auth_service.hash_password(body.password))
    db.add(user)
    await db.flush()  # assigns user.id without ending the transaction

    db.add(
        Profile(
            user_id=user.id,
            full_name=body.full_name,
            organization=body.organization,
            job_title=body.job_title,
            requested_role=requested_role,
            role="viewer",  # never trust the caller for the role that's actually gated on
        )
    )

    access_token = auth_service.create_access_token(user.id, "viewer")
    refresh_token = await auth_service.issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_token)
    return AuthResponse(access_token=access_token, role="viewer", user_id=user.id)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await auth_service.get_user_by_email(db, body.email)
    if user is None or not auth_service.verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    role = await auth_service.get_role(db, user.id) or "viewer"
    access_token = auth_service.create_access_token(user.id, role)
    refresh_token = await auth_service.issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, refresh_token)
    return AuthResponse(access_token=access_token, role=role, user_id=user.id)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    response: Response,
    db: AsyncSession = Depends(get_db),
    zb_refresh: str | None = Cookie(default=None),
):
    if not zb_refresh:
        raise HTTPException(status_code=401, detail="No session.")
    rotated = await auth_service.rotate_refresh_token(db, zb_refresh)
    if rotated is None:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Session expired or revoked. Please sign in again.")

    user_id, new_refresh_token = rotated
    role = await auth_service.get_role(db, user_id) or "viewer"
    access_token = auth_service.create_access_token(user_id, role)
    _set_refresh_cookie(response, new_refresh_token)
    return AuthResponse(access_token=access_token, role=role, user_id=user_id)


@router.post("/logout")
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    zb_refresh: str | None = Cookie(default=None),
):
    if zb_refresh:
        await auth_service.revoke_refresh_token(db, zb_refresh)
    _clear_refresh_cookie(response)
    return {"ok": True}


class PromoteRoleRequest(BaseModel):
    target_user_id: str
    new_role: str


@router.post("/admin/promote-role")
async def promote_role(
    body: PromoteRoleRequest,
    _role: str = Depends(auth.require_role("superadmin")),
    db: AsyncSession = Depends(get_db),
):
    """Backend equivalent of the old `promote_user_role` Postgres RPC — require_role("superadmin")
    above is the server-side re-check that RPC did internally via SECURITY DEFINER, so this isn't
    a client-trust boundary despite being reachable from the browser (Systems -> Users page)."""
    if body.new_role not in _VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role: {body.new_role}")
    result = await db.execute(select(Profile).where(Profile.user_id == body.target_user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile found for that user.")
    profile.role = body.new_role
    return {"ok": True}
