"""
routes/cost_entries.py — replaces frontend/src/lib/costStore.js's direct
`supabase.from("cost_entries")` calls. Generic "own rows only" RLS -> explicit
`.where(CostEntry.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import CostEntry
from api.db.session import get_db

router = APIRouter(prefix="/cost-entries", tags=["cost_entries"])


class CostEntryIn(BaseModel):
    item_key: str
    monthly_usd: float | None = None
    note: str | None = None


class CostEntryOut(BaseModel):
    item_key: str
    monthly_usd: float | None = None
    note: str | None = None

    class Config:
        from_attributes = True


async def _list(user_id: str, db: AsyncSession) -> list[CostEntry]:
    result = await db.execute(select(CostEntry).where(CostEntry.user_id == user_id))
    return result.scalars().all()


@router.get("", response_model=list[CostEntryOut])
async def list_cost_entries(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    return await _list(user_id, db)


@router.put("", response_model=list[CostEntryOut])
async def set_cost_entry(
    body: CostEntryIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    existing = await db.execute(
        select(CostEntry).where(CostEntry.user_id == user_id, CostEntry.item_key == body.item_key)
    )
    row = existing.scalar_one_or_none()
    if row is None:
        db.add(CostEntry(user_id=user_id, **body.model_dump()))
    else:
        row.monthly_usd = body.monthly_usd
        row.note = body.note
        row.updated_at = datetime.now(timezone.utc)
    return await _list(user_id, db)


@router.delete("", status_code=204)
async def clear_cost_entries(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    await db.execute(delete(CostEntry).where(CostEntry.user_id == user_id))
