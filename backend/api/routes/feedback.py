"""
routes/feedback.py — replaces frontend/src/lib/feedbackStore.js's and modelHealthStore.js's
direct `supabase.from("prediction_feedback")` calls. Two RLS policies existed: "own rows only"
(all ops) plus "admins can view all feedback" (select only) — reimplemented here as: every
handler always scopes writes/single-row reads to the caller's own user_id, while GET "" (the
list used by modelHealthStore.js's getModelHealth) returns every user's rows for an admin/
superadmin caller and only the caller's own rows otherwise, exactly mirroring the RLS split.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import PredictionFeedback
from api.db.session import get_db

router = APIRouter(prefix="/prediction-feedback", tags=["prediction_feedback"])

_ADMIN_ROLES = {"admin", "superadmin"}


class FeedbackOut(BaseModel):
    id: str
    predict_history_id: str | None = None
    task: str
    rating: str
    category: str | None = None
    note: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FeedbackSubmit(BaseModel):
    predict_history_id: str | None = None
    task: str
    rating: str
    category: str | None = None
    note: str | None = None


@router.get("", response_model=list[FeedbackOut])
async def list_feedback(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    """Backs modelHealthStore.js's getModelHealth: admins/superadmins see every user's feedback,
    everyone else sees only their own — the app-level replacement for the "admins can view all
    feedback" + "own rows only" RLS pair."""
    user_id, role = identity
    query = select(PredictionFeedback).order_by(PredictionFeedback.created_at.desc())
    if role not in _ADMIN_ROLES:
        query = query.where(PredictionFeedback.user_id == user_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{predict_history_id}", response_model=FeedbackOut | None)
async def get_feedback(
    predict_history_id: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(PredictionFeedback).where(
            PredictionFeedback.user_id == user_id,
            PredictionFeedback.predict_history_id == predict_history_id,
        )
    )
    return result.scalar_one_or_none()


@router.put("", response_model=FeedbackOut)
async def submit_feedback(
    body: FeedbackSubmit,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    existing = await db.execute(
        select(PredictionFeedback).where(
            PredictionFeedback.user_id == user_id,
            PredictionFeedback.predict_history_id == body.predict_history_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row is None:
        row = PredictionFeedback(user_id=user_id, **body.model_dump())
        db.add(row)
    else:
        row.task = body.task
        row.rating = body.rating
        row.category = body.category
        row.note = body.note
    await db.flush()
    await db.refresh(row)
    return row
