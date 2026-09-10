"""
routes/batch_results.py — replaces frontend/src/lib/batchStore.js's direct
`supabase.from("batch_results")` calls. "One row per (user_id, task), latest wins" — enforced
here the same way the unique(user_id, task) constraint + upsert used to, via an explicit
check-then-insert-or-update (see routes/assignments.py for why this is Python-side, not a
DB-level ON CONFLICT: these models must also run against SQLite in tests).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import BatchResult
from api.db.session import get_db

router = APIRouter(prefix="/batch-results", tags=["batch_results"])


class BatchResultIn(BaseModel):
    task: str
    result: dict


class BatchResultOut(BaseModel):
    result: dict
    saved_at: datetime

    class Config:
        from_attributes = True


@router.put("", response_model=BatchResultOut)
async def save_batch_result(
    body: BatchResultIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    existing = await db.execute(
        select(BatchResult).where(BatchResult.user_id == user_id, BatchResult.task == body.task)
    )
    row = existing.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if row is None:
        row = BatchResult(user_id=user_id, task=body.task, result=body.result, saved_at=now)
        db.add(row)
    else:
        row.result = body.result
        row.saved_at = now
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/{task}", response_model=BatchResultOut | None)
async def get_batch_result(
    task: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(BatchResult).where(BatchResult.user_id == user_id, BatchResult.task == task)
    )
    return result.scalar_one_or_none()


@router.delete("/{task}", status_code=204)
async def clear_batch_result(
    task: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(BatchResult).where(BatchResult.user_id == user_id, BatchResult.task == task)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
