"""
db/models.py — SQLAlchemy models, one per table in the former Supabase schema
(backend/supabase/schema.sql + migration_add_*.sql). Column names/semantics are kept identical
to that schema so the original localStorage -> Postgres field mapping documented there stays
traceable; only two structural changes were made switching off Postgres-only features so the
same models also run against SQLite in tests (see backend/tests/conftest.py):

  - `uuid` primary/foreign keys are plain String(36) holding a str(uuid.uuid4()), not the
    Postgres-native UUID type. Generated in Python (default=lambda: str(uuid.uuid4())), not by
    a DB-side gen_random_uuid()/pgcrypto call.
  - `text[]` columns (current_skills, target_skills, missing_skills) become JSON lists.

What used to be Postgres Row-Level-Security ("own rows only" / admin-can-view-all policies) is
NOT expressed here at all — there is no RLS equivalent at the ORM layer. Every query that used to
rely on a policy must now filter by user_id explicitly in the route/service that runs it (see
backend/api/routes/). That is the single most important thing to get right when adding a new
endpoint against these models.

auth.users (Supabase-managed) is replaced by the local `User` model below; `RefreshToken` is new
infrastructure with no Supabase equivalent, needed because auth is no longer "ask Supabase's Auth
API if this token is valid" — see backend/api/auth_service.py.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.db.session import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user_fk() -> Mapped[str]:
    return mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


# ---------------------------------------------------------------------------
# users — replaces Supabase's auth.users. Everything else FK's to this.
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RefreshToken(Base):
    """One row per issued refresh token, so a token can be revoked (logout) or rotated
    (refresh) without trusting the client to have discarded the old one. `token_hash` stores a
    SHA-256 hash of the actual token value, never the token itself — same principle as password
    hashing, in case the table is ever read by something other than the auth service."""

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    token_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# profiles — role is what require_role() gates on; only ever changed via the superadmin-only
# promote-role endpoint (api/auth.py), never accepted on the plain profile-update endpoint.
# ---------------------------------------------------------------------------
class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("requested_role in ('viewer','admin','superadmin')", name="profiles_requested_role_check"),
        CheckConstraint("role in ('viewer','admin','superadmin')", name="profiles_role_check"),
    )

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    organization: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_role: Mapped[str] = mapped_column(Text, default="viewer", server_default="viewer")
    role: Mapped[str] = mapped_column(Text, default="viewer", server_default="viewer")
    organization_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# org_nodes — orgStore.js
# ---------------------------------------------------------------------------
class OrgNode(Base):
    __tablename__ = "org_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    title: Mapped[str] = mapped_column(Text, nullable=False)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("org_nodes.id", ondelete="SET NULL"), nullable=True
    )
    current_skills: Mapped[list] = mapped_column(JSON, default=list)
    target_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_skills: Mapped[list] = mapped_column(JSON, default=list)
    seniority_years: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    headcount: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ---------------------------------------------------------------------------
# assignments — assignmentStore.js
# ---------------------------------------------------------------------------
class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint("status in ('pending','approved','rejected')", name="assignments_status_check"),
        UniqueConstraint("user_id", "role_id", "to_role", name="assignments_role_target_uniq"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    role_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("org_nodes.id", ondelete="CASCADE"), nullable=True
    )
    role_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    cosine_similarity_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    missing_skills: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# batch_results — batchStore.js (latest batch-upload KPI result, one per task)
# ---------------------------------------------------------------------------
class BatchResult(Base):
    __tablename__ = "batch_results"
    __table_args__ = (UniqueConstraint("user_id", "task", name="batch_results_user_task_uniq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    task: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# sources — sourcesStore.js
# ---------------------------------------------------------------------------
class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str | None] = mapped_column(Text, nullable=True)
    size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    task: Mapped[str | None] = mapped_column(Text, nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# usage_log — usageStore.js
# ---------------------------------------------------------------------------
class UsageLog(Base):
    __tablename__ = "usage_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cost_usd: Mapped[float] = mapped_column(Numeric, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# cost_entries — costStore.js
# ---------------------------------------------------------------------------
class CostEntry(Base):
    __tablename__ = "cost_entries"
    __table_args__ = (UniqueConstraint("user_id", "item_key", name="cost_entries_user_item_uniq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    item_key: Mapped[str] = mapped_column(Text, nullable=False)
    monthly_usd: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ---------------------------------------------------------------------------
# chat_sessions — chatSessionStore.js (one live session per user)
# ---------------------------------------------------------------------------
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    tool_call_log: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ---------------------------------------------------------------------------
# predict_history — history.js
# ---------------------------------------------------------------------------
class PredictHistory(Base):
    __tablename__ = "predict_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    results: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# token_balances / token_ledger — tokenStore.js + api/tokens.py's spend_tokens gate
# ---------------------------------------------------------------------------
class TokenBalance(Base):
    __tablename__ = "token_balances"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    monthly_grant: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cycle_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class TokenLedger(Base):
    __tablename__ = "token_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    endpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# onboarding_progress — onboardingStore.js
# ---------------------------------------------------------------------------
class OnboardingProgress(Base):
    __tablename__ = "onboarding_progress"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    connected_data_source: Mapped[bool] = mapped_column(default=False, server_default="0")
    ran_first_prediction: Mapped[bool] = mapped_column(default=False, server_default="0")
    opened_first_shap: Mapped[bool] = mapped_column(default=False, server_default="0")
    invited_teammate: Mapped[bool] = mapped_column(default=False, server_default="0")
    exported_first_report: Mapped[bool] = mapped_column(default=False, server_default="0")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ---------------------------------------------------------------------------
# feature_discovery — not yet exposed by any *Store.js file, ported for schema completeness
# ---------------------------------------------------------------------------
class FeatureDiscovery(Base):
    __tablename__ = "feature_discovery"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    feature_key: Mapped[str] = mapped_column(Text, primary_key=True)
    first_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# milestone_events — milestoneStore.js
# ---------------------------------------------------------------------------
class MilestoneEvent(Base):
    __tablename__ = "milestone_events"
    __table_args__ = (UniqueConstraint("user_id", "milestone_key", name="milestone_events_user_key_uniq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    milestone_key: Mapped[str] = mapped_column(Text, nullable=False)
    fired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# department_report_views — departmentEngagement.js
# ---------------------------------------------------------------------------
class DepartmentReportView(Base):
    __tablename__ = "department_report_views"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    department: Mapped[str] = mapped_column(Text, nullable=False)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# organizations / invites — inviteStore.js
# ---------------------------------------------------------------------------
class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    owner_user_id: Mapped[str] = _user_fk()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Invite(Base):
    __tablename__ = "invites"
    __table_args__ = (
        CheckConstraint("role in ('viewer','admin')", name="invites_role_check"),
        CheckConstraint("status in ('pending','accepted','revoked')", name="invites_status_check"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    invited_by: Mapped[str] = _user_fk()
    email: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, default="admin", server_default="admin")
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")
    token: Mapped[str] = mapped_column(String(36), default=_uuid, unique=True)
    bonus_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# entity_links — entityLinksStore.js
# ---------------------------------------------------------------------------
class EntityLink(Base):
    __tablename__ = "entity_links"
    __table_args__ = (UniqueConstraint("user_id", "task", "row_label", name="entity_links_user_task_row_uniq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    golden_id: Mapped[str] = mapped_column(String(36), default=_uuid)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    row_label: Mapped[str] = mapped_column(Text, nullable=False)
    match_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# prediction_feedback — feedbackStore.js / modelHealthStore.js
# ---------------------------------------------------------------------------
class PredictionFeedback(Base):
    __tablename__ = "prediction_feedback"
    __table_args__ = (
        CheckConstraint("rating in ('up','down')", name="prediction_feedback_rating_check"),
        UniqueConstraint("user_id", "predict_history_id", name="prediction_feedback_user_history_uniq"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    predict_history_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("predict_history.id", ondelete="CASCADE"), nullable=True
    )
    task: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ---------------------------------------------------------------------------
# review_queue — reviewQueueStore.js
# ---------------------------------------------------------------------------
class ReviewQueueItem(Base):
    __tablename__ = "review_queue"
    __table_args__ = (
        CheckConstraint("source in ('classification','forecast')", name="review_queue_source_check"),
        CheckConstraint("status in ('pending','approved','overridden','rejected')", name="review_queue_status_check"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = _user_fk()
    task: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    predicted_value: Mapped[dict] = mapped_column(JSON, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="pending", server_default="pending")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
