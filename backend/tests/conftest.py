"""
conftest.py — shared fixtures for the pytest integration suite.

api/main.py imports as `from api.schemas import ...` / `from src import ...`, i.e. it expects
`backend/` itself (not the repo root) on sys.path — same assumption tests/api_smoke_test.py
makes. Anchoring this insert to conftest.py's own location makes it work regardless of the
cwd pytest is invoked from.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from api.main import app

TASKS = ["employment", "skills", "productivity", "skill_match", "human_capital"]


@pytest.fixture(scope="session")
def client():
    """Session-scoped: runs the app's real lifespan once (loads the committed model artifacts
    from backend/models + backend/data/processed) and reuses it across the whole suite, since
    that load is the expensive part and none of these tests mutate registry state."""
    with TestClient(app) as c:
        yield c
