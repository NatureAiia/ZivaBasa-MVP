"""
routes/profiles.py — replaces frontend/src/lib/profileStore.js's direct `supabase.from("profiles")`
calls. Every RLS guarantee that table used to rely on is reimplemented explicitly here:
  - "own profile select"/"own profile update" -> queries always filter on the token's own user_id
    (api.auth.require_user()), never a client-supplied id.
  - "admins can view all profiles" -> GET /profiles gated on require_role("admin").
  - lock_profile_role trigger -> ProfileUpdate below has no `role` field at all, so there's no
    way to even attempt setting it through this endpoint; the only write path for role is
    POST /auth/admin/promote-role (api/auth_routes.py), gated on require_role("superadmin").
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import Profile
from api.db.session import get_db

router = APIRouter(prefix="/profiles", tags=["profiles"])


class ProfileOut(BaseModel):
    user_id: str
    full_name: str | None = None
    organization: str | None = None
    job_title: str | None = None
    phone: str | None = None
    department: str | None = None
    avatar_url: str | None = None
    requested_role: str
    role: str

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    organization: str | None = None
    job_title: str | None = None
    phone: str | None = None
    department: str | None = None


@router.get("/me", response_model=ProfileOut)
async def get_my_profile(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    return profile


@router.patch("/me", response_model=ProfileOut)
async def update_my_profile(
    body: ProfileUpdate,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(select(Profile).where(Profile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    return profile


@router.get("", response_model=list[ProfileOut])
async def list_all_profiles(
    _role: str = Depends(auth.require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Systems -> Users page. require_role("admin") is the direct replacement for the
    "admins can view all profiles" RLS policy's is_admin_or_superadmin() check."""
    result = await db.execute(select(Profile).order_by(Profile.created_at.desc()))
    return result.scalars().all()
