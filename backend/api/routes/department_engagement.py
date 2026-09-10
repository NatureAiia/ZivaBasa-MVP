"""
routes/department_engagement.py — replaces frontend/src/lib/departmentEngagement.js's direct
`supabase.from("department_report_views")` calls. Generic "own rows only" RLS -> explicit
`.where(DepartmentReportView.user_id == user_id)` via api.auth.require_user().

The structure-completeness half of departmentEngagement.js's summary comes from org_nodes
(already fetched separately via routes/org_nodes.py) — this route only serves the
last-viewed-per-department half, same split as before.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import DepartmentReportView
from api.db.session import get_db

router = APIRouter(prefix="/department-views", tags=["department_engagement"])


class DepartmentViewBody(BaseModel):
    department: str


class DepartmentViewOut(BaseModel):
    department: str
    viewed_at: datetime

    class Config:
        from_attributes = True


@router.post("", status_code=204)
async def record_department_view(
    body: DepartmentViewBody,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    db.add(DepartmentReportView(user_id=user_id, department=body.department))


@router.get("", response_model=list[DepartmentViewOut])
async def list_department_views(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(DepartmentReportView)
        .where(DepartmentReportView.user_id == user_id)
        .order_by(DepartmentReportView.viewed_at.desc())
    )
    return result.scalars().all()
