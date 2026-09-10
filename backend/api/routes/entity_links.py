"""
routes/entity_links.py — replaces frontend/src/lib/entityLinksStore.js's direct
`supabase.from("entity_links")` calls. Generic "own rows only" RLS -> explicit
`.where(EntityLink.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import EntityLink
from api.db.session import get_db

router = APIRouter(prefix="/entity-links", tags=["entity_links"])


class EntityLinkOut(BaseModel):
    golden_id: str
    task: str
    row_label: str
    match_score: float | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ClusterMember(BaseModel):
    task: str
    row_label: str
    match_score: float | None = None


class ConfirmClusterBody(BaseModel):
    members: list[ClusterMember]
    golden_id: str


@router.get("", response_model=list[EntityLinkOut])
async def list_entity_links(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(EntityLink).where(EntityLink.user_id == user_id).order_by(EntityLink.created_at.desc())
    )
    return result.scalars().all()


@router.put("", status_code=204)
async def confirm_cluster(
    body: ConfirmClusterBody,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    for member in body.members:
        existing = await db.execute(
            select(EntityLink).where(
                EntityLink.user_id == user_id,
                EntityLink.task == member.task,
                EntityLink.row_label == member.row_label,
            )
        )
        row = existing.scalar_one_or_none()
        if row is None:
            db.add(
                EntityLink(
                    user_id=user_id,
                    golden_id=body.golden_id,
                    task=member.task,
                    row_label=member.row_label,
                    match_score=member.match_score,
                )
            )
        else:
            row.golden_id = body.golden_id
            row.match_score = member.match_score


@router.delete("", status_code=204)
async def remove_link(
    task: str,
    row_label: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(EntityLink).where(
            EntityLink.user_id == user_id, EntityLink.task == task, EntityLink.row_label == row_label
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
