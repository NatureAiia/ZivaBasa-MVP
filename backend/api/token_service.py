"""
token_service.py — atomic token-balance check-and-deduct, backing api/tokens.py's gate.
Replaces the Postgres `spend_tokens()` SECURITY DEFINER RPC (backend/supabase/migration_add_engagement.sql)
called over PostgREST — same atomicity guarantee (a single `UPDATE ... WHERE balance + :delta >= 0`
so two concurrent requests can't both pass a pre-check and overdraw the balance), now expressed
as one SQL statement via SQLAlchemy instead of a round trip to Supabase's REST API.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.models import TokenBalance, TokenLedger


async def spend_tokens(
    db: AsyncSession, user_id: str, amount: int, reason: str, endpoint: Optional[str] = None
) -> Optional[int]:
    """`amount` is negative to spend, positive to grant. Returns the new balance, or None if a
    spend would take the balance below zero (nothing is deducted in that case)."""
    existing = await db.execute(select(TokenBalance).where(TokenBalance.user_id == user_id))
    if existing.scalar_one_or_none() is None:
        db.add(TokenBalance(user_id=user_id, balance=0))
        await db.flush()

    result = await db.execute(
        update(TokenBalance)
        .where(TokenBalance.user_id == user_id, TokenBalance.balance + amount >= 0)
        .values(balance=TokenBalance.balance + amount, updated_at=datetime.now(timezone.utc))
        .returning(TokenBalance.balance)
    )
    row = result.first()
    if row is None:
        return None  # insufficient balance, nothing was deducted

    new_balance = row[0]
    db.add(
        TokenLedger(
            user_id=user_id, delta=amount, reason=reason, endpoint=endpoint, balance_after=new_balance
        )
    )
    return new_balance


async def get_balance(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(select(TokenBalance.balance).where(TokenBalance.user_id == user_id))
    balance = result.scalar_one_or_none()
    return balance if balance is not None else 0
