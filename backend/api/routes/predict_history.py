"""
routes/predict_history.py — replaces frontend/src/lib/history.js's direct
`supabase.from("predict_history")` calls. Generic "own rows only" RLS -> explicit
`.where(PredictHistory.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import PredictHistory
from api.db.session import get_db

router = APIRouter(prefix="/predict-history", tags=["predict_history"])

DISPLAY_LIMIT = 50  # matches history.js's old query limit


class HistoryEntryIn(BaseModel):
    results: dict


class HistoryEntryOut(BaseModel):
    id: str
    results: dict
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[HistoryEntryOut])
async def get_history(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(PredictHistory)
        .where(PredictHistory.user_id == user_id)
        .order_by(PredictHistory.created_at.desc())
        .limit(DISPLAY_LIMIT)
    )
    return result.scalars().all()


@router.post("", response_model=HistoryEntryOut)
async def log_history_entry(
    body: HistoryEntryIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    """Plain insert — the "skip if identical to the last entry" dedupe stays client-side in
    history.js (it already fetches the list first to render), same as before."""
    user_id, _role = identity
    row = PredictHistory(user_id=user_id, results=body.results)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/{entry_id}", response_model=list[HistoryEntryOut])
async def delete_history_entry(
    entry_id: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(PredictHistory).where(PredictHistory.id == entry_id, PredictHistory.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
    result = await db.execute(
        select(PredictHistory)
        .where(PredictHistory.user_id == user_id)
        .order_by(PredictHistory.created_at.desc())
        .limit(DISPLAY_LIMIT)
    )
    return result.scalars().all()


@router.delete("", status_code=204)
async def clear_history(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    await db.execute(delete(PredictHistory).where(PredictHistory.user_id == user_id))
