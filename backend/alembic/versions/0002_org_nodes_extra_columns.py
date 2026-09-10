"""org_nodes: add avg_salary_usd/performance_rating/recent_training_hours/recent_ot_hours

These 4 columns were referenced by frontend/src/lib/orgStore.js's toRow()/fromRow() but never
existed in backend/supabase/schema.sql either — PostgREST would have rejected any upsert that
set one of them, so this was a pre-existing bug predating the self-hosted DB port, not something
this migration introduces. All nullable, no backfill needed.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("org_nodes", sa.Column("avg_salary_usd", sa.Numeric(), nullable=True))
    op.add_column("org_nodes", sa.Column("performance_rating", sa.Numeric(), nullable=True))
    op.add_column("org_nodes", sa.Column("recent_training_hours", sa.Numeric(), nullable=True))
    op.add_column("org_nodes", sa.Column("recent_ot_hours", sa.Numeric(), nullable=True))


def downgrade() -> None:
    op.drop_column("org_nodes", "recent_ot_hours")
    op.drop_column("org_nodes", "recent_training_hours")
    op.drop_column("org_nodes", "performance_rating")
    op.drop_column("org_nodes", "avg_salary_usd")
