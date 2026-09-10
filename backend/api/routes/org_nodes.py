"""
routes/org_nodes.py — replaces frontend/src/lib/orgStore.js's direct `supabase.from("org_nodes")`
calls. RLS was a single generic "own rows only" (`user_id = auth.uid()`) policy applied to every
operation — reimplemented here as an explicit `.where(OrgNode.user_id == user_id)` on every query,
via api.auth.require_user().

removeNode() used to be 3 client round-trips (select parent_id, re-parent children, delete) —
folded into one DB transaction here instead, so a crash between steps can't leave children
orphaned or re-parented without the node actually being deleted.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import OrgNode
from api.db.session import get_db

router = APIRouter(prefix="/org-nodes", tags=["org_nodes"])


class OrgNodeIn(BaseModel):
    id: str | None = None
    title: str
    department: str | None = None
    parent_id: str | None = None
    current_skills: list = []
    target_role: str | None = None
    target_skills: list = []
    seniority_years: float | None = None
    headcount: int = 1
    avg_salary_usd: float | None = None
    performance_rating: float | None = None
    recent_training_hours: float | None = None
    recent_ot_hours: float | None = None


class OrgNodeOut(OrgNodeIn):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[OrgNodeOut])
async def list_org_nodes(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(OrgNode).where(OrgNode.user_id == user_id).order_by(OrgNode.created_at)
    )
    return result.scalars().all()


@router.put("", response_model=OrgNodeOut)
async def upsert_org_node(
    body: OrgNodeIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    node = None
    if body.id:
        result = await db.execute(
            select(OrgNode).where(OrgNode.id == body.id, OrgNode.user_id == user_id)
        )
        node = result.scalar_one_or_none()

    fields = body.model_dump(exclude={"id"})
    if node is None:
        node = OrgNode(user_id=user_id, **fields)
        if body.id:
            node.id = body.id
        db.add(node)
    else:
        for field, value in fields.items():
            setattr(node, field, value)

    await db.flush()
    await db.refresh(node)
    return node


@router.delete("/{node_id}", status_code=204)
async def remove_org_node(
    node_id: str,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(OrgNode).where(OrgNode.id == node_id, OrgNode.user_id == user_id)
    )
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=404, detail="Org node not found.")

    # Re-parent this node's children to its own parent before deleting it, rather than
    # orphaning a whole subtree — same behavior orgStore.js's removeNode used to implement as
    # 3 separate client round-trips, now one transaction.
    await db.execute(
        update(OrgNode)
        .where(OrgNode.parent_id == node_id, OrgNode.user_id == user_id)
        .values(parent_id=node.parent_id)
    )
    await db.execute(delete(OrgNode).where(OrgNode.id == node_id, OrgNode.user_id == user_id))


@router.delete("", status_code=204)
async def clear_org_nodes(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    await db.execute(delete(OrgNode).where(OrgNode.user_id == user_id))
