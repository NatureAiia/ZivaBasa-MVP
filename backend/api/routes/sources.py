"""
routes/sources.py — replaces frontend/src/lib/sourcesStore.js's direct
`supabase.from("sources")` calls. Generic "own rows only" RLS -> explicit
`.where(Source.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import Source
from api.db.session import get_db

router = APIRouter(prefix="/sources", tags=["sources"])


class SourceIn(BaseModel):
    name: str
    kind: str | None = None
    size: int | None = None
    task: str | None = None
    row_count: int | None = None


class SourceOut(SourceIn):
    id: str
    added_at: datetime

    class Config:
        from_attributes = True


async def _list(user_id: str, db: AsyncSession) -> list[Source]:
    result = await db.execute(
        select(Source).where(Source.user_id == user_id).order_by(Source.added_at.desc())
    )
    return result.scalars().all()


@router.get("", response_model=list[SourceOut])
async def list_sources(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    return await _list(user_id, db)


@router.post("", response_model=list[SourceOut])
async def add_source(
    body: SourceIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    db.add(Source(user_id=user_id, **body.model_dump()))
    return await _list(user_id, db)


@router.delete("/{source_id}", response_model=list[SourceOut])
async def remove_source(
    source_id: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(Source).where(Source.id == source_id, Source.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        await db.delete(row)
    return await _list(user_id, db)
