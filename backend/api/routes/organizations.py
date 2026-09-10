"""
routes/organizations.py — replaces frontend/src/lib/inviteStore.js's direct
`supabase.from("organizations"/"invites")` calls. Bespoke RLS, not the generic "own rows only"
pattern (see backend/supabase/migration_add_engagement.sql):
  - organizations: select = owner OR a linked Profile.organization_id member; insert = caller
    becomes owner; update = owner-only. No delete policy existed, so no delete route here either.
  - invites: select = invited_by == caller ONLY (never the invitee — they authenticate via the
    invite token in the URL, not a row read); insert requires caller owns the target
    organization_id. No update/delete policy existed either (accept/revoke isn't implemented
    server-side today, same limitation inviteStore.js's own docstring already states).
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import Invite, Organization
from api.db.session import get_db

router = APIRouter(tags=["organizations"])


class InviteOut(BaseModel):
    id: str
    email: str
    role: str
    status: str
    bonus_tokens: int
    created_at: datetime
    accepted_at: datetime | None = None

    class Config:
        from_attributes = True


class SendInviteBody(BaseModel):
    email: str
    organization_name: str | None = None
    role: str = "admin"
    bonus_tokens: int = 20


async def _get_or_create_own_organization(user_id: str, fallback_name: str | None, db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.owner_user_id == user_id))
    org = result.scalar_one_or_none()
    if org is not None:
        return org
    org = Organization(owner_user_id=user_id, name=fallback_name or "My organization")
    db.add(org)
    await db.flush()
    return org


@router.get("/invites", response_model=list[InviteOut])
async def get_my_invites(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(Invite).where(Invite.invited_by == user_id).order_by(Invite.created_at.desc())
    )
    return result.scalars().all()


@router.post("/invites", response_model=InviteOut)
async def send_invite(
    body: SendInviteBody,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    org = await _get_or_create_own_organization(user_id, body.organization_name, db)
    invite = Invite(
        organization_id=org.id,
        invited_by=user_id,
        email=body.email,
        role=body.role,
        bonus_tokens=body.bonus_tokens,
    )
    db.add(invite)
    await db.flush()
    await db.refresh(invite)
    return invite
