"""
routes/review_queue.py — replaces frontend/src/lib/reviewQueueStore.js's direct
`supabase.from("review_queue")` calls. Same 2-policy shape as prediction_feedback (see
routes/feedback.py): "own rows only" for writes, "admins can view all review items" for the
list read — reimplemented here as a role-branch on GET "".
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import ReviewQueueItem
from api.db.session import get_db

router = APIRouter(prefix="/review-queue", tags=["review_queue"])

_ADMIN_ROLES = {"admin", "superadmin"}


class ReviewQueueOut(BaseModel):
    id: str
    task: str
    source: str
    subject: str | None = None
    predicted_value: dict
    confidence_score: float | None = None
    status: str
    note: str | None = None
    created_at: datetime
    decided_at: datetime | None = None

    class Config:
        from_attributes = True


class ReviewQueueCreate(BaseModel):
    task: str
    source: str
    subject: str | None = None
    predicted_value: dict
    confidence_score: float | None = None


class ReviewQueueDecision(BaseModel):
    status: str
    note: str = ""


@router.get("", response_model=list[ReviewQueueOut])
async def list_review_queue(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, role = identity
    query = select(ReviewQueueItem).order_by(ReviewQueueItem.created_at.desc())
    if role not in _ADMIN_ROLES:
        query = query.where(ReviewQueueItem.user_id == user_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", status_code=204)
async def create_review_item(
    body: ReviewQueueCreate,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    db.add(ReviewQueueItem(user_id=user_id, **body.model_dump()))


@router.patch("/{item_id}", response_model=list[ReviewQueueOut])
async def decide_review_item(
    item_id: str,
    body: ReviewQueueDecision,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, role = identity
    result = await db.execute(
        select(ReviewQueueItem).where(ReviewQueueItem.id == item_id, ReviewQueueItem.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if row is not None:
        row.status = body.status
        row.note = body.note
        row.decided_at = datetime.now(timezone.utc)
    query = select(ReviewQueueItem).order_by(ReviewQueueItem.created_at.desc())
    if role not in _ADMIN_ROLES:
        query = query.where(ReviewQueueItem.user_id == user_id)
    result = await db.execute(query)
    return result.scalars().all()
