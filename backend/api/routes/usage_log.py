"""
routes/usage_log.py — replaces frontend/src/lib/usageStore.js's direct
`supabase.from("usage_log")` calls. Generic "own rows only" RLS -> explicit
`.where(UsageLog.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import UsageLog
from api.db.session import get_db

router = APIRouter(prefix="/usage-log", tags=["usage_log"])

MAX_ENTRIES = 500  # matches usageStore.js's old query limit


class UsageLogIn(BaseModel):
    provider: str
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0


class UsageLogOut(UsageLogIn):
    created_at: datetime

    class Config:
        from_attributes = True


async def _list(user_id: str, db: AsyncSession) -> list[UsageLog]:
    result = await db.execute(
        select(UsageLog)
        .where(UsageLog.user_id == user_id)
        .order_by(UsageLog.created_at.desc())
        .limit(MAX_ENTRIES)
    )
    return result.scalars().all()


@router.get("", response_model=list[UsageLogOut])
async def list_usage_log(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    return await _list(user_id, db)


@router.post("", response_model=list[UsageLogOut])
async def log_usage(
    body: UsageLogIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    db.add(UsageLog(user_id=user_id, **body.model_dump()))
    return await _list(user_id, db)


@router.delete("", status_code=204)
async def clear_usage_log(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    await db.execute(delete(UsageLog).where(UsageLog.user_id == user_id))
