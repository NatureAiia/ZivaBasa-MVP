"""
db/session.py — async SQLAlchemy engine + FastAPI session dependency.

Replaces Supabase's PostgREST/Auth HTTP APIs (backend/api/supabase_auth.py, tokens.py) and the
supabase-py SDK (agent_graph.py) as the backend's one path to Postgres. DATABASE_URL must use the
asyncpg driver, e.g. postgresql+asyncpg://user:pass@host:5432/zivabasa — see
backend/api/.env.example.

Read fresh via a module-level lazy singleton (not at import time) so tests can point
DATABASE_URL at an in-memory SQLite engine (aiosqlite) before the first real connection is made.
"""
from __future__ import annotations

import os
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Example: "
            "postgresql+asyncpg://zivabasa:password@localhost:5432/zivabasa"
        )
    return url


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(_database_url(), pool_pre_ping=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _sessionmaker


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: yields a session, committing on success and rolling back on error."""
    session_factory = get_sessionmaker()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def reset_engine_for_tests() -> None:
    """Test-only hook: drop the cached engine/sessionmaker so a new DATABASE_URL (e.g. a fresh
    in-memory SQLite engine per test) takes effect on the next get_engine() call."""
    global _engine, _sessionmaker
    _engine = None
    _sessionmaker = None
