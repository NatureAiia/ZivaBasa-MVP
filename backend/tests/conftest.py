"""
conftest.py — shared fixtures for the pytest integration suite.

api/main.py imports as `from api.schemas import ...` / `from src import ...`, i.e. it expects
`backend/` itself (not the repo root) on sys.path — same assumption tests/api_smoke_test.py
makes. Anchoring this insert to conftest.py's own location makes it work regardless of the
cwd pytest is invoked from.
"""
from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Must be set before api.db.session's engine is first created (lazily, on first get_engine()
# call from any test) — a file-backed SQLite DB (not :memory:) so every connection in the pool
# sees the same tables; JWT_SECRET is required by api/auth_service.py once it's imported.
_TEST_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_TEST_DB_PATH}")
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-production")

import pytest
from fastapi.testclient import TestClient

from api.db import models  # noqa: F401 — populates Base.metadata before create_all below
from api.db.session import Base, get_engine
from api.main import app

TASKS = ["employment", "skills", "productivity", "skill_match", "human_capital"]


@pytest.fixture(scope="session", autouse=True)
def _test_database():
    """Session-scoped, autouse: creates every table (SQLAlchemy metadata, not Alembic — faster
    and dialect-agnostic for SQLite) once before any test runs, and removes the SQLite file
    afterward so a stale schema never leaks into the next run."""
    if os.path.exists(_TEST_DB_PATH):
        os.remove(_TEST_DB_PATH)

    async def _create_all():
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create_all())
    yield
    if os.path.exists(_TEST_DB_PATH):
        os.remove(_TEST_DB_PATH)


@pytest.fixture(scope="session")
def client():
    """Session-scoped: runs the app's real lifespan once (loads the committed model artifacts
    from backend/models + backend/data/processed) and reuses it across the whole suite, since
    that load is the expensive part and none of these tests mutate registry state."""
    with TestClient(app) as c:
        yield c
