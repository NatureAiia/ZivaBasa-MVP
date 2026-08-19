"""initial schema — replaces backend/supabase/schema.sql + migration_add_*.sql

Revision ID: 0001
Revises:
Create Date: 2026-08-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)

    op.create_table(
        "organizations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("owner_user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "profiles",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("full_name", sa.Text(), nullable=True),
        sa.Column("organization", sa.Text(), nullable=True),
        sa.Column("job_title", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("department", sa.Text(), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("requested_role", sa.Text(), nullable=False, server_default="viewer"),
        sa.Column("role", sa.Text(), nullable=False, server_default="viewer"),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("requested_role in ('viewer','admin','superadmin')", name="profiles_requested_role_check"),
        sa.CheckConstraint("role in ('viewer','admin','superadmin')", name="profiles_role_check"),
    )

    op.create_table(
        "org_nodes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("department", sa.Text(), nullable=True),
        sa.Column("parent_id", sa.String(36), sa.ForeignKey("org_nodes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("current_skills", sa.JSON(), nullable=False),
        sa.Column("target_role", sa.Text(), nullable=True),
        sa.Column("target_skills", sa.JSON(), nullable=False),
        sa.Column("seniority_years", sa.Numeric(), nullable=True),
        sa.Column("headcount", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_org_nodes_user_id", "org_nodes", ["user_id"])
    op.create_index("ix_org_nodes_parent_id", "org_nodes", ["parent_id"])

    op.create_table(
        "assignments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.String(36), sa.ForeignKey("org_nodes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("role_title", sa.Text(), nullable=True),
        sa.Column("from_role", sa.Text(), nullable=True),
        sa.Column("to_role", sa.Text(), nullable=True),
        sa.Column("cosine_similarity_score", sa.Numeric(), nullable=True),
        sa.Column("missing_skills", sa.JSON(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("recommended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status in ('pending','approved','rejected')", name="assignments_status_check"),
        sa.UniqueConstraint("user_id", "role_id", "to_role", name="assignments_role_target_uniq"),
    )
    op.create_index("ix_assignments_user_id", "assignments", ["user_id"])
    op.create_index("ix_assignments_status", "assignments", ["user_id", "status"])

    op.create_table(
        "batch_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "task", name="batch_results_user_task_uniq"),
    )
    op.create_index("ix_batch_results_user_id", "batch_results", ["user_id"])

    op.create_table(
        "sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=True),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("task", sa.Text(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sources_user_id", "sources", ["user_id"])

    op.create_table(
        "usage_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Numeric(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_usage_log_user_created", "usage_log", ["user_id", "created_at"])

    op.create_table(
        "cost_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_key", sa.Text(), nullable=False),
        sa.Column("monthly_usd", sa.Numeric(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "item_key", name="cost_entries_user_item_uniq"),
    )
    op.create_index("ix_cost_entries_user_id", "cost_entries", ["user_id"])

    op.create_table(
        "chat_sessions",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("messages", sa.JSON(), nullable=False),
        sa.Column("tool_call_log", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "predict_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_predict_history_user_created", "predict_history", ["user_id", "created_at"])

    op.create_table(
        "token_balances",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("monthly_grant", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cycle_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "token_ledger",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=True),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_token_ledger_user_created", "token_ledger", ["user_id", "created_at"])

    op.create_table(
        "onboarding_progress",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("connected_data_source", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ran_first_prediction", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("opened_first_shap", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("invited_teammate", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exported_first_report", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "feature_discovery",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("feature_key", sa.Text(), primary_key=True),
        sa.Column("first_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "milestone_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("milestone_key", sa.Text(), nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "milestone_key", name="milestone_events_user_key_uniq"),
    )

    op.create_table(
        "department_report_views",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("department", sa.Text(), nullable=False),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_department_report_views_user_dept",
        "department_report_views",
        ["user_id", "department", "viewed_at"],
    )

    op.create_table(
        "invites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False, server_default="admin"),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("token", sa.String(36), nullable=False, unique=True),
        sa.Column("bonus_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role in ('viewer','admin')", name="invites_role_check"),
        sa.CheckConstraint("status in ('pending','accepted','revoked')", name="invites_status_check"),
    )
    op.create_index("ix_invites_token", "invites", ["token"], unique=True)
    op.create_index(
        "ix_invites_org_email_pending",
        "invites",
        ["organization_id", "email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    op.create_table(
        "entity_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("golden_id", sa.String(36), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("row_label", sa.Text(), nullable=False),
        sa.Column("match_score", sa.Numeric(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "task", "row_label", name="entity_links_user_task_row_uniq"),
    )
    op.create_index("ix_entity_links_user_id", "entity_links", ["user_id"])
    op.create_index("ix_entity_links_golden_id", "entity_links", ["golden_id"])

    op.create_table(
        "prediction_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("predict_history_id", sa.String(36), sa.ForeignKey("predict_history.id", ondelete="CASCADE"), nullable=True),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("rating", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("rating in ('up','down')", name="prediction_feedback_rating_check"),
        sa.UniqueConstraint("user_id", "predict_history_id", name="prediction_feedback_user_history_uniq"),
    )
    op.create_index("ix_prediction_feedback_user_id", "prediction_feedback", ["user_id"])
    op.create_index("ix_prediction_feedback_task", "prediction_feedback", ["task", "rating"])

    op.create_table(
        "review_queue",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("predicted_value", sa.JSON(), nullable=False),
        sa.Column("confidence_score", sa.Numeric(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("source in ('classification','forecast')", name="review_queue_source_check"),
        sa.CheckConstraint("status in ('pending','approved','overridden','rejected')", name="review_queue_status_check"),
    )
    op.create_index("ix_review_queue_user_id", "review_queue", ["user_id"])
    op.create_index("ix_review_queue_status", "review_queue", ["user_id", "status"])


def downgrade() -> None:
    for table in [
        "review_queue",
        "prediction_feedback",
        "entity_links",
        "invites",
        "department_report_views",
        "milestone_events",
        "feature_discovery",
        "onboarding_progress",
        "token_ledger",
        "token_balances",
        "predict_history",
        "chat_sessions",
        "cost_entries",
        "usage_log",
        "sources",
        "batch_results",
        "assignments",
        "org_nodes",
        "profiles",
        "organizations",
        "refresh_tokens",
        "users",
    ]:
        op.drop_table(table)
