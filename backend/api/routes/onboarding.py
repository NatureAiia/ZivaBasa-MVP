"""
routes/onboarding.py — replaces frontend/src/lib/onboardingStore.js's direct
`supabase.from("onboarding_progress")` calls (one row per user). Generic "own row only" RLS ->
explicit `.where(OnboardingProgress.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import OnboardingProgress
from api.db.session import get_db

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

STEP_KEYS = {
    "connected_data_source",
    "ran_first_prediction",
    "opened_first_shap",
    "invited_teammate",
    "exported_first_report",
}


class OnboardingOut(BaseModel):
    connected_data_source: bool = False
    ran_first_prediction: bool = False
    opened_first_shap: bool = False
    invited_teammate: bool = False
    exported_first_report: bool = False
    completed_at: datetime | None = None

    class Config:
        from_attributes = True


class StepBody(BaseModel):
    step_key: str


@router.get("", response_model=OnboardingOut | None)
async def get_onboarding_progress(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(select(OnboardingProgress).where(OnboardingProgress.user_id == user_id))
    return result.scalar_one_or_none()


@router.post("/step", response_model=OnboardingOut)
async def mark_onboarding_step(
    body: StepBody,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    if body.step_key not in STEP_KEYS:
        # Unknown step keys are silently ignored rather than rejected, matching the old
        # client-side upsert which would have just written an extra unused column.
        pass
    user_id, _role = identity
    result = await db.execute(select(OnboardingProgress).where(OnboardingProgress.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is None:
        row = OnboardingProgress(user_id=user_id)
        db.add(row)
        await db.flush()

    if body.step_key in STEP_KEYS and not getattr(row, body.step_key):
        setattr(row, body.step_key, True)
        if row.completed_at is None and all(getattr(row, k) for k in STEP_KEYS):
            row.completed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(row)
    return row
