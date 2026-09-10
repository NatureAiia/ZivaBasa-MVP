# Architecture Design Document
## ZivaBasa — AI Workforce Intelligence Platform

**Status:** Draft v1.0
**Companion document:** `docs/BRD.md` (Business Requirements Document)
**Prepared:** 2026-09-10

---

## 1. Purpose & Scope

This document describes the current (as-built) architecture of ZivaBasa, plus the near-term architectural direction implied by the codebase's own roadmap notes. It is intended for engineers onboarding to the project and for anyone evaluating readiness for a production/regulated deployment. Where the current architecture is mid-transition (notably auth), this document states both the target design and the residual gap.

## 2. Architecture Overview

ZivaBasa is a two-tier web application — a React SPA frontend and a Python/FastAPI backend — backed by a self-hosted PostgreSQL database, with an ML subsystem (training pipeline, model registry, explainability, causal inference, forecasting, federated learning) embedded inside the backend service rather than run as separate microservices.

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Vite + React 19 + React Router 7 + Tailwind)          │
│  - ChiedzaDashboard (module picker) → ZivaBasa pages             │
│  - Domain "stores" (lib/*Store.js) ~1:1 with backend tables      │
│  - Auth: JWT access token (memory/short-lived) + refresh cookie  │
└───────────────────────────┬───────────────────────────────────────┘
                            │ HTTPS / JSON (fetch)
┌───────────────────────────▼───────────────────────────────────────┐
│  Backend: FastAPI app (backend/api/main.py, ~30 routes)          │
│  ┌───────────────┬───────────────┬───────────────┬─────────────┐ │
│  │ Auth &        │ Prediction &   │ Chat / Agent  │ Reports /   │ │
│  │ Profiles      │ Explainability │ (LLM gateway) │ Export      │ │
│  ├───────────────┼───────────────┼───────────────┼─────────────┤ │
│  │ Org/Field      │ Causal Uplift │ Federated      │ Batch CSV   │ │
│  │ Extraction     │ (EconML)      │ Learning Sim   │ Upload      │ │
│  ├───────────────┼───────────────┼───────────────┼─────────────┤ │
│  │ Skill Match /  │ Forecasting   │ Image Gen      │ Token/Cost  │ │
│  │ Redeployment   │ (LSTM/GRU)    │ (multi-vendor) │ Metering    │ │
│  └───────────────┴───────────────┴───────────────┴─────────────┘ │
│  SQLAlchemy (async) + Alembic migrations                          │
└───────────────────────────┬───────────────────────────────────────┘
                            │ asyncpg
┌───────────────────────────▼───────────────────────────────────────┐
│  PostgreSQL (self-hosted)                                          │
│  users/profiles/orgs/invites · org_nodes · assignments ·           │
│  batch_results · sources · chat_sessions · predict_history ·       │
│  token_balances/ledger · onboarding/milestones · entity_links ·    │
│  prediction_feedback · review_queue · cost_entries/usage_log       │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│  ML Layer (backend/src/*) — offline training + on-request serving  │
│  Shared-trunk multi-task Keras network → 5 task heads              │
│  (employment · skills · productivity · skill_match · human_capital)│
│  + SHAP explainability + EconML causal forest + LSTM/GRU forecast  │
│  + Flower federated-learning simulation + MLflow experiment log    │
│  Artifacts: backend/models/ (per-task model, scaler, SHAP outputs) │
└─────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│  External LLM/Vision providers (pluggable via CHAT_PROVIDER):      │
│  Anthropic (default) · NVIDIA NIM · Gemini · Groq · Azure OpenAI   │
│  (image gen + edit)                                                │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Frontend Architecture

- **Stack**: Vite build, React 19, React Router 7 for client-side routing, Tailwind CSS 3 for styling, Framer Motion / GSAP for animation, `cmdk` for command-palette UX, `react-markdown` for rendering chat/report content.
- **Entry surface**: `ChiedzaDashboard.jsx` acts as a module picker for the broader ChiedzaAI platform; ZivaBasa's own pages live under `pages/zivabasa/`.
- **State management pattern**: rather than a single global store, the app uses a set of domain-scoped "store" modules under `src/lib/` (e.g. `orgStore`, `assignmentStore`, `batchStore`, `tokenStore`, `costStore`, `reviewQueueStore`, `modelHealthStore`, `inviteStore`, `entityLinksStore`, `feedbackStore`, `milestoneStore`, `onboardingStore`, `sourcesStore`). Each store corresponds closely to one backend table, keeping the client-side data model traceable to the persistence model.
- **Key user-facing surfaces** (`pages/zivabasa/`): Simple/Advanced Predict, Chat, Corporate View, Dashboard, Employee Mirror View (self-service, consent-gated), Entity Resolution, Forecast, History, Manager Action Inbox (flagship screen), My Organization, National Evidence View, Organizational Structure, Review Queue, Roster.
- **Admin surface** (`pages/system/`): Model Health, Models, Settings, Users — a separate console from the day-to-day workforce views.
- **Prediction UX flow**: `hooks/usePredictionFlow.js` chains Employment → Skills → Productivity → Summary as a guided sequence rather than exposing each task as an isolated form.
- **Auth on the client**: a legacy `@supabase/supabase-js` client (`lib/supabaseClient.js`) still exists alongside the newer self-hosted JWT flow — see §7 Known Architectural Gap.

## 4. Backend Architecture

- **Framework**: FastAPI (async), Pydantic for request/response schemas, Uvicorn as ASGI server; the whole HTTP surface is one app (`backend/api/main.py`, ~747 lines) composed of feature modules rather than separate services.
- **Layering within `backend/api/`**:
  - *Auth layer*: `auth.py` (dependencies, role enforcement), `auth_routes.py` (signup/login/refresh/logout/admin promote-role), `auth_service.py`, `token_service.py` / `tokens.py` (metering, distinct from JWT auth tokens — naming overlap to be aware of).
  - *Domain routers*: `routes/profiles.py`, `routes/avatar.py`, `batch.py`, `reports.py` (1,201 lines — Markdown/PDF/Excel export), `org_extract.py`, `field_extract.py`, `upskilling_ai.py`, `image_gen.py`/`azure_image.py`/`image_router.py`.
  - *Chat/agent*: `chat.py` (676 lines), `agent_graph.py` (tool-calling loop), `llm_gateway.py` (provider abstraction).
  - *Persistence*: `db/models.py` (SQLAlchemy ORM, one class per table), `db/session.py` (async session factory).
  - *Cross-cutting*: `model_registry.py` (which trained model artifact serves which task/version), `redact.py` (PII redaction), `schemas.py` (shared Pydantic types).
- **ML layer** (`backend/src/`): separate from the API layer by design — `config.py` (task definitions, feature/target columns, leakage-prevention `drop_cols`), `features.py`, `model.py` (shared-trunk multi-task network), `evaluate.py`, `causal_xai.py`, `uplift.py` (EconML CausalForestDML), `forecast.py`/`tsmixer_forecast.py`/`chronos_forecast.py`, `skill_matching.py`, `worldbank.py` (macro-indicator ingestion), `ple_model.py`.
- **Model artifacts**: trained Keras models, scalers, and precomputed SHAP outputs live under `backend/models/`, organized per task, loaded at serving time rather than retrained per-request.
- **Experiment tracking**: MLflow, run locally, for offline training runs (notebooks `01`–`06` under `backend/notebooks/`).
- **Data**: `backend/data/{raw,processed,schema}/` holds the Kaggle proxy CSVs, the one real (human-capital) dataset, and a documented data dictionary (`human_capital_dictionary.md`) including join strategy for macro/context features.

## 5. Data Architecture

- **Database**: self-hosted PostgreSQL in production, SQLite for automated tests (`conftest.py` swaps the engine), accessed exclusively through SQLAlchemy's async engine via the `asyncpg` driver.
- **Migrations**: Alembic, run as part of the deployment pipeline (`.cpanel.yml` invokes migrations on deploy).
- **Schema shape** (see BRD §7 for the full table list) falls into five clusters:
  1. **Identity/tenancy**: `users`, `refresh_tokens`, `profiles`, `organizations`, `invites`.
  2. **Org & redeployment domain**: `org_nodes` (org chart + skills + headcount), `assignments` (redeployment decisions with similarity scores and status).
  3. **Prediction & data lifecycle**: `batch_results`, `sources`, `predict_history`, `entity_links` (cross-dataset identity resolution), `prediction_feedback`, `review_queue`.
  4. **Conversational/reporting**: `chat_sessions` (with an embedded tool-call log), plus report generation reading from the above.
  5. **Monetization & engagement**: `token_balances`, `token_ledger`, `usage_log`, `cost_entries`, `onboarding_progress`, `feature_discovery`, `milestone_events`, `department_report_views`.
- **Design note carried over from the Supabase era**: column names/semantics were deliberately kept identical to the original Supabase schema (`backend/supabase/schema.sql`, retained as historical reference) during migration, to keep the original localStorage → Postgres field mapping traceable. New engineers should treat `supabase/schema.sql` as historical documentation, not a live schema source.
- **Tenant isolation**: because the platform no longer runs on a database with built-in row-level security (Supabase/Postgres RLS), every query must filter by `user_id`/organization explicitly in application code. This is called out in-repo as the single highest-risk correctness property to get right when adding a new endpoint or store, and should be treated as an architectural invariant enforced in code review, not just convention.

## 6. ML / AI Subsystem Architecture

- **Model design**: a shared-trunk multi-task neural network (Keras) branches into task-specific heads for `employment` (classification: automation risk), `skills` (classification: attrition), `productivity` (regression: AI-adoption), `skill_match` (classification: redeployment fit), and `human_capital` (classification: turnover, the one real-data task). Sharing a trunk lets tasks that see less labeled data benefit from representations learned on the others.
- **Explainability**: SHAP `KernelExplainer` specifically — the codebase documents that `GradientExplainer` is incompatible with the Keras 3 runtime in use, so this is a deliberate, documented constraint rather than an oversight.
- **Causal inference**: EconML's `CausalForestDML` estimates individualized treatment effects (uplift) for candidate interventions, layered on top of (not replacing) the correlational predictions — this is the architectural basis for the BRD's "cost-per-decision-avoided" and intervention-ROI claims.
- **Forecasting**: LSTM/GRU networks with Monte-Carlo dropout for confidence intervals are the shipped forecasting approach; TSMixer and Chronos-2 exist as evaluated spikes with a separate, heavier requirements file (`requirements-forecasting.lock.txt`) so they don't burden the default deployment.
- **Macro-context enrichment**: `worldbank.py` joins live World Bank indicators (unemployment rate, labor force participation) and a CPI/food-inflation panel (FAO/IMF) by year into the productivity/forecast feature set, so forecasts reflect macroeconomic conditions rather than only firm-level history.
- **Federated learning**: implemented via Flower (FedAvg) simulating multiple "institutions" training locally and aggregating centrally, on a single machine — an architectural proof-of-concept for the target production design (real institutions each keeping raw data local, only sharing model updates), not yet that production design itself.
- **Leakage prevention**: task configs explicitly enumerate columns to drop as direct precursors of the target (e.g., dropping a pre-existing automation-risk score column when predicting automation risk) — a deliberate anti-leakage control baked into `config.py` rather than left to individual model authors.
- **Model registry**: `model_registry.py` tracks which trained artifact version serves which task, decoupling "which model is live" from "which code computes features" so models can be updated independently of API code.

## 7. Authentication & Authorization Architecture

- **Current (target) design**: self-hosted JWT authentication — short-lived access tokens plus rotating, hashed (SHA-256) refresh tokens stored server-side and individually revocable (`refresh_tokens` table), issued/verified by `auth_service.py`/`token_service.py`.
- **Authorization model**: a three-tier role hierarchy (`viewer` < `admin` < `superadmin`) enforced via a single `require_role(min_role)` dependency applied to routes, so role checks are centralized rather than duplicated per-handler. Role escalation is only possible through a dedicated superadmin-only endpoint, never through the general profile-update path — a deliberate control against privilege escalation via a mass-assignment-style bug.
- **Multi-tenancy**: `Organization` + `Invite` model supports inviting teammates by email with a pre-assigned role and optional bonus token grant; an organization's members are the unit of data isolation (see §5 tenant isolation note).
- **Known architectural gap — auth migration is incomplete**: the system originally ran on Supabase (managed Postgres + Supabase Auth + Row-Level Security + PostgREST). A recent, major refactor (commit `2ddd994`, merged in `33a3e10`) replaced this with self-hosted Postgres + custom JWT auth. However, at the time of this document:
  - The frontend still bundles a Supabase client (`lib/supabaseClient.js`) and `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` env vars.
  - The deployment pipeline (`.cpanel.yml`) still bakes a live Supabase project URL into the frontend build.
  - The root `README.md` setup instructions are still partly Supabase-oriented.
  This should be treated as **technical debt to close, not a dual-auth architecture to design around**: the recommended direction is to finish removing the Supabase client/env vars/build step once the self-hosted JWT path is confirmed as the sole auth mechanism in production, and update onboarding docs accordingly.

## 8. Integration Architecture

- **LLM/vision providers**: abstracted behind `llm_gateway.py` and selected via a `CHAT_PROVIDER` environment variable — Anthropic (default), NVIDIA NIM (OpenAI-compatible), Gemini, Groq for chat; Azure OpenAI specifically for image generation *and* editing (the only provider wired for image edit). This provider-agnostic gateway is the key architectural seam protecting the product from single-vendor lock-in (NFR-7 in the BRD).
- **No payment, SMS, or geolocation integrations** exist or are referenced in configuration — any future billing integration would be a net-new architectural addition, not an extension of an existing seam.
- **World Bank data**: pulled live (not vendored) for macro-indicator enrichment — an external dependency the forecasting feature relies on at training/refresh time.

## 9. Deployment Architecture

- **Hosting**: shared-hosting-style deployment via cPanel's Git Version Control feature (`.cpanel.yml`), not a container-orchestration platform. Deploys pull the repo, install dependencies, run Alembic migrations, rebuild the frontend, and restart the backend process.
- **Process management**: PM2 manages the backend Python process in production (restart-on-crash, log management), with nginx in front for static assets/caching (deploy scripts explicitly clear the nginx cache on deploy).
- **Backend dependency footprint is split for deployability**: `pyproject.toml` + `requirements.lock.txt` is the full pinned dependency set; `requirements-serving.txt` is a slimmed, deploy-only set (notably excluding PyTorch) for the always-on API process; `requirements-forecasting.lock.txt` is an opt-in heavier set for the TSMixer/Chronos-2 spikes. This split exists specifically to keep the always-on production process lean on shared/limited hosting.
- **Containerization**: a `Dockerfile` exists for the backend, suggesting a container-based deployment path is available/being explored alongside the current cPanel pipeline, though cPanel Git-VC is the currently active mechanism (per recent commit history focused on cPanel/PM2 hardening).
- **Secrets handling**: an `admin/` directory holds deploy scripts and SSH keys and is explicitly git-ignored; secret-scrubbing was called out in recent commit history as an active concern (untracking `.pyc`/`node_modules`, excluding admin scripts from git).

## 10. Testing & Quality Architecture

- **Backend**: pytest, 21 real test modules under `backend/tests/` plus `conftest.py`, covering auth, token metering, batch upload, reports, forecasting, causal uplift, the federated-learning endpoint, MLOps status, org/field extraction, chat, the agent graph, and macro-feature ingestion. Tests run against SQLite rather than the production Postgres, removing an external-service dependency from CI/local test runs.
- **Frontend**: no automated test suite was found in the explored structure; UI validation currently appears to rely on manual verification. This is a gap worth addressing before scaling the frontend surface further, especially given the number of interdependent "store" modules.
- **Notebooks as a research/validation record**: `backend/notebooks/01`–`06` form an EDA-through-sanity-check pipeline, functioning as the audit trail for how each task's proxy dataset was explored and validated before being wired into the shared-trunk model.

## 11. Roadmap-Implied Architectural Direction

Architectural items already named in the codebase/docs as forward direction, not yet built:

1. **Complete the Supabase decommission** described in §7 — remove residual client code, env vars, and deployment references once confidence in the self-hosted JWT path is established.
2. **Production federated learning**: move from the current single-machine Flower simulation to a design where genuinely separate institutions run local training and only exchange model updates — this has real infrastructure implications (network topology between institutions, update-aggregation service, key management) not yet designed in this repo.
3. **FFIMS integration** (Africa University's Fleet & Facilities Integrated Management System): a planned integration point for deeper shift/workforce-scheduling capability, owned by an external project — will need an explicit integration contract (API or data-exchange format) once scoped.
4. **Real-data model validation pipeline**: as real Zimbabwean banking-sector data becomes available, the architecture should support swapping a task's training data source without changing the serving API contract — the existing `config.py`/`model_registry.py` separation already supports this, but a formal validation gate (compare real-data model performance to the proxy-data baseline before promoting it to serving) does not yet exist and should be designed before the first real-data cutover.
5. **Frontend automated testing**: introduce a test framework (e.g., component + integration tests) proportional to the growing number of interdependent domain stores and pages.

## 12. Architectural Risks

- **Tenant-isolation correctness now lives entirely in application code** (no DB-level RLS backstop) — a single missed `user_id`/org filter in a new endpoint is a direct data-leak risk across tenants. Recommend a lightweight automated check (e.g., a lint rule or test helper asserting every query against a multi-tenant table includes a scoping filter) as the codebase grows.
- **Dual-auth residue** (§7) is an active security-hygiene risk (stale credentials/config pointing at a real external Supabase project) until fully removed.
- **Single always-on process on shared hosting** (PM2 + cPanel, no orchestration/auto-scaling) — acceptable for current MVP load, but a scaling ceiling to flag before any real customer-traffic commitment.
- **ML artifacts and code are versioned together in one repo/deploy** — there is a model registry to track which artifact serves which task, but no described rollback mechanism if a newly promoted model regresses in production; worth formalizing alongside the "real-data validation gate" item above.
