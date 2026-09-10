"""
routes/token_balance.py — replaces frontend/src/lib/tokenStore.js's direct
`supabase.from("token_balances"/"token_ledger")` reads. Deliberately READ-ONLY: the original RLS
only ever granted SELECT on these two tables (no client insert/update/delete policy existed —
every write happened through the `spend_tokens()` SECURITY DEFINER RPC). That's now
api/token_service.py's spend_tokens()/api/tokens.py's gate, both untouched by this file — this
route only adds the two GET endpoints the frontend needs to read what those already write.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import TokenBalance, TokenLedger
from api.db.session import get_db

router = APIRouter(prefix="/tokens", tags=["tokens"])


class TokenBalanceOut(BaseModel):
    balance: int
    monthly_grant: int
    cycle_started_at: datetime

    class Config:
        from_attributes = True


class TokenLedgerEntryOut(BaseModel):
    delta: int
    reason: str
    endpoint: str | None = None
    balance_after: int
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/balance", response_model=TokenBalanceOut | None)
async def get_token_balance(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    """No row yet (gate never granted this user tokens) reads as "unlimited/not tracked" (null)
    rather than "zero" — same distinction tokenStore.js's getTokenBalance already made."""
    user_id, _role = identity
    result = await db.execute(select(TokenBalance).where(TokenBalance.user_id == user_id))
    return result.scalar_one_or_none()


@router.get("/ledger", response_model=list[TokenLedgerEntryOut])
async def get_token_ledger(
    limit: int = 50,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(
        select(TokenLedger)
        .where(TokenLedger.user_id == user_id)
        .order_by(TokenLedger.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
