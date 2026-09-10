"""
routes/assignments.py — replaces frontend/src/lib/assignmentStore.js's direct
`supabase.from("assignments")` calls. Generic "own rows only" RLS -> explicit
`.where(Assignment.user_id == user_id)` via api.auth.require_user() on every query.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import Assignment
from api.db.session import get_db

router = APIRouter(prefix="/assignments", tags=["assignments"])


class AssignmentOut(BaseModel):
    id: str
    role_id: str | None = None
    role_title: str | None = None
    from_role: str | None = None
    to_role: str | None = None
    cosine_similarity_score: float | None = None
    missing_skills: list = []
    status: str
    note: str | None = None
    recommended_at: datetime
    decided_at: datetime | None = None

    class Config:
        from_attributes = True


class AssignmentRecommend(BaseModel):
    role_id: str | None = None
    role_title: str | None = None
    from_role: str | None = None
    to_role: str | None = None
    cosine_similarity_score: float | None = None
    missing_skills: list = []


class AssignmentDecision(BaseModel):
    status: str
    note: str = ""


async def _list(user_id: str, db: AsyncSession) -> list[Assignment]:
    result = await db.execute(
        select(Assignment)
        .where(Assignment.user_id == user_id)
        .order_by(Assignment.recommended_at.desc())
    )
    return result.scalars().all()


@router.get("", response_model=list[AssignmentOut])
async def list_assignments(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    return await _list(user_id, db)


@router.post("", response_model=list[AssignmentOut])
async def recommend_assignment(
    body: AssignmentRecommend,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    """Insert-ignore-duplicates on (user_id, role_id, to_role) — same "don't spam a new row for
    the same role -> target pair" behavior the Supabase upsert used to implement. Checked in
    Python rather than a DB-level ON CONFLICT so this also works against SQLite in tests (see
    db/models.py's docstring on why these models must stay dialect-portable)."""
    user_id, _role = identity
    existing = await db.execute(
        select(Assignment).where(
            Assignment.user_id == user_id,
            Assignment.role_id == body.role_id,
            Assignment.to_role == body.to_role,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(
            Assignment(
                user_id=user_id,
                role_id=body.role_id,
                role_title=body.role_title,
                from_role=body.from_role,
                to_role=body.to_role,
                cosine_similarity_score=body.cosine_similarity_score,
                missing_skills=body.missing_skills or [],
                status="pending",
            )
        )
    return await _list(user_id, db)


@router.patch("/{assignment_id}", response_model=list[AssignmentOut])
async def decide_assignment(
    assignment_id: str,
    body: AssignmentDecision,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(Assignment).where(Assignment.id == assignment_id, Assignment.user_id == user_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is not None:
        assignment.status = body.status
        assignment.note = body.note
        assignment.decided_at = datetime.now(timezone.utc)
    return await _list(user_id, db)


@router.delete("", status_code=204)
async def clear_assignments(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    await db.execute(delete(Assignment).where(Assignment.user_id == user_id))
