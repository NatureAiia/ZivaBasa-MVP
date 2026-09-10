"""
routes/chat_sessions.py — replaces frontend/src/lib/chatSessionStore.js's direct
`supabase.from("chat_sessions")` calls (one row per user, PK=user_id). Generic "own row only"
RLS -> explicit `.where(ChatSession.user_id == user_id)` via api.auth.require_user().
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api import auth
from api.db.models import ChatSession
from api.db.session import get_db

router = APIRouter(prefix="/chat-sessions", tags=["chat_sessions"])


class ChatSessionIn(BaseModel):
    messages: list = []
    tool_call_log: list = []


class ChatSessionOut(ChatSessionIn):
    class Config:
        from_attributes = True


@router.get("", response_model=ChatSessionOut)
async def get_chat_session(
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(select(ChatSession).where(ChatSession.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is None:
        return ChatSessionOut(messages=[], tool_call_log=[])
    return row


@router.put("", status_code=204)
async def save_chat_session(
    body: ChatSessionIn,
    identity: tuple[str, str] = Depends(auth.require_user()),
    db: AsyncSession = Depends(get_db),
):
    user_id, _role = identity
    result = await db.execute(select(ChatSession).where(ChatSession.user_id == user_id))
    row = result.scalar_one_or_none()
    if row is None:
        db.add(ChatSession(user_id=user_id, messages=body.messages, tool_call_log=body.tool_call_log))
    else:
        row.messages = body.messages
        row.tool_call_log = body.tool_call_log
