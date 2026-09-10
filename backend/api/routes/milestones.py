"""
routes/milestones.py — replaces frontend/src/lib/milestoneStore.js's direct
`supabase.from("milestone_events")` insert. A unique(user_id, milestone_key) constraint means a
duplicate insert used to fail with Postgres code 23505, treated as "already fired" — replicated
here as a plain pre-check (portable across SQLite/Postgres, see routes/assignments.py's comment
on why these models must stay dialect-agnostic).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import MilestoneEvent
from api.db.session import get_db

router = APIRouter(prefix="/milestones", tags=["milestones"])


class MilestoneBody(BaseModel):
    milestone_key: str


class MilestoneResult(BaseModel):
    fired: bool


@router.post("", response_model=MilestoneResult)
async def check_and_fire_milestone(
    body: MilestoneBody,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    existing = await db.execute(
        select(MilestoneEvent).where(
            MilestoneEvent.user_id == user_id, MilestoneEvent.milestone_key == body.milestone_key
        )
    )
    if existing.scalar_one_or_none() is not None:
        return MilestoneResult(fired=False)  # already fired before
    db.add(MilestoneEvent(user_id=user_id, milestone_key=body.milestone_key))
    return MilestoneResult(fired=True)
