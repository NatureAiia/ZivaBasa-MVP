# 🕴️🤔 ZivaBasa 😶‍🌫️
### AI-Powered Workforce Intelligence Platform — MVP (Kaggle-Data Phase)

**Module:** ZivaBasa (part of the ChiedzaAI platform — jobs, employment, productivity & skills forecasting)
**Phase:** MVP prototype using public Kaggle datasets as a stand-in for real banking-sector data
**Status:** Working end-to-end prototype (frontend + API + models) on proxy data — not a real-world findings phase

---

## 1. Purpose of This Phase

This MVP validates the **explainable multi-task deep learning architecture** proposed for ZivaBasa
(shared representation trunk → Employment / Productivity / Skills task heads → SHAP explainability layer),
served through a real API and dashboard, before real Zimbabwean banking-sector data is available.

**What this phase proves:**
- The multi-task neural network trains and produces sensible per-task predictions
- The feature engineering pipeline (raw → engineered → learned → fusion) works end-to-end
- SHAP explainability runs correctly against a multi-output Keras model
- The full stack — FastAPI serving predictions/explanations, a React dashboard consuming them,
  batch CSV upload, and an LLM-backed chat interface — works together as a real product, not just notebooks

**What this phase does NOT prove:**
- Anything about actual Zimbabwean bank employment/productivity/skills dynamics
- Real predictive accuracy on the target population — Kaggle data is a **proxy**, not ground truth

> ⚠️ Every dataset used here is a substitute for real banking HR/operational/AI-system data.
> All findings from this phase are **methodological**, not empirical. This must be stated
> explicitly in any write-up, thesis chapter, or stakeholder demo that references this phase.

---

## 2. What's Real vs. Prototype (read before demoing)

- **Predict → Upload & Analyze** — real. Upload a CSV per task (Employment/Skills/Productivity),
  the backend matches columns by name, engineers features automatically, scores every row, and
  returns KPI cards, a department/segment breakdown, and a top-risk list. This is the CEO-facing flow.
- **Predict → Single-role (advanced)** — real. Manual feature entry, chained Employment → Skills →
  Productivity → Summary, with a full SHAP explanation ledger per prediction.
- **Corporate dashboard** — real, pulls from whatever batch uploads have been run in the current
  browser session. Honestly labeled as not including "jobs created" (no model predicts that yet),
  and skills-gap *recommendations* (as opposed to attrition risk) aren't built yet.
- **Chat tab** — real, wired to the backend's `/chat` endpoint, which can call the actual
  `predict_task`/`explain_task` tools. Requires `ANTHROPIC_API_KEY` or `NVIDIA_API_KEY` on the backend.
- **History** — real, backed by Postgres (see Section 8) — syncs across devices/sessions once
  signed in, no longer tied to one browser.
- **Report generation** — real, exports a `.md` summary from a completed advanced-mode run (not PDF yet).
- **Auth + database** — real as of this session. Supabase Auth (email/password) gates the app;
  every user-generated record (org chart, roster decisions, batch results, sources, chat usage,
  cost entries, chat session, predict history) is Postgres-backed with Row Level Security, not
  browser-local state. Model serving (FastAPI: predict/explain/schema/batch/chat/reports) is
  still in-memory and stateless — see Section 8 for setup.

See `backend/README.md` and `frontend/README.md` for the full, current, module-level detail — this
root file is the map, those are the ground truth for each half of the stack.

---

## 3. Tech Stack (actual, not aspirational)

| Layer | Technology |
|---|---|
| Frontend | Vite + React 19 + React Router 7 + Tailwind CSS + Framer Motion + lucide-react |
| Backend | FastAPI (Python) + Pydantic + Uvicorn |
| ML | TensorFlow/Keras (multi-task shared-trunk network) + scikit-learn/XGBoost baselines |
| Explainability | SHAP (KernelExplainer — see `backend/README.md` for why, not GradientExplainer) |
| Experiment tracking | MLflow (local) |
| Chat | Anthropic or NVIDIA NIM (OpenAI-compatible), called from the FastAPI `/chat` endpoint |
| Database | None yet — file-based (`data/raw/`, `data/processed/`) + browser `localStorage` for history |

---

## 4. Datasets Used (Proxy Data)

No single Kaggle dataset covers employment + productivity + skills for a banking workforce, so
three datasets are combined, each feeding a different task head. They are **not** the same
population — this is a known limitation, documented, not hidden.

| Task Head | Dataset | Kaggle Source | Proxy Role |
|---|---|---|---|
| Employment / Automation Risk | AI Automation Risk by Job Role | `khushikyad001/ai-automation-risk-by-job-role` | Job-role-level automation exposure |
| Skills / Readiness | IBM HR Analytics Employee Attrition & Performance | `pavansubhasht/ibm-hr-analytics-attrition-dataset` | Training hours, tenure, satisfaction, role, promotion history |
| Productivity / AI Adoption | Future of Work in the Age of AI (2020–2026) | `algozee/future-of-work-in-the-age-of-ai-20202026` | AI adoption level, salary trend, skill gap by industry |
| Skill Match / Redeployment | Synthetic banking roster fixture | generated, see `backend/scripts/generate_skill_match_fixture.py` | Staff skill-tag sets vs. target-role requirements, cosine-matched |
| Human Capital / Turnover | HRDataset_v14-style employee roster | landed at `backend/data/raw/human_capital.csv` (source: `davidepolizzi/hr-data-set-based-on-human-resources-data-set`) | **Real HR data, not a proxy** — department, tenure, pay, performance, turnover, 3,310 employees. See `backend/data/schema/human_capital_dictionary.md` for the full column mapping and confirmed-missing fields (no training-hours or revenue-per-employee columns exist in this file) |

Raw files live in `backend/data/raw/`. Do not edit raw files in place — all cleaning happens in the
feature engineering notebook (or, for `skill_match`/`human_capital`, the dedicated
`scripts/generate_skill_match_fixture.py` / `scripts/load_human_capital.py`) and writes to
`backend/data/processed/`.

---

## 5. Repository Structure

```
ZivaBasa-MVP/
├── README.md                     # this file
├── Documentation/                 # proposal + presentation PDFs
├── dashboard/                     # standalone static dashboard shell
├── backend/
│   ├── README.md                  # backend-specific docs — read this before touching the API
│   ├── api/
│   │   ├── main.py                 # FastAPI app: /health, /schema, /predict, /explain
│   │   ├── batch.py                 # CSV batch upload/scoring
│   │   ├── chat.py                  # LLM chat endpoint (Anthropic/NVIDIA)
│   │   ├── model_registry.py        # loads all task models + scalers at startup
│   │   └── schemas.py               # Pydantic request/response models
│   ├── src/
│   │   ├── config.py                 # per-task config: target column, leakage-column drops
│   │   ├── features.py               # feature engineering pipeline
│   │   ├── model.py                  # multi-task Keras model definition
│   │   └── evaluate.py               # metrics + SHAP helpers
│   ├── notebooks/                   # 01 EDA → 02 features → 03 baselines → 04 multitask NN → 05 SHAP → 06 sanity check
│   ├── data/{raw,processed}/         # Kaggle proxy datasets + engineered outputs
│   ├── models/                      # saved Keras models, scalers, SHAP outputs per task
│   └── requirements.txt
└── frontend/
    ├── README.md                     # frontend-specific docs — read this before touching the UI
    └── src/
        ├── lib/                        # API client, theme, motion variants, report builder, history
        ├── hooks/                       # usePredictionFlow (Employment→Skills→Productivity→Summary chain)
        ├── components/
        │   ├── layout/                    # Sidebar, Shell, ThemeToggle
        │   ├── common/                     # Card, Badge, Button, Skeleton, EmptyState, ClarityRing
        │   ├── predict/                     # TaskForm, PredictionResult, ShapLedger, OverallSummary
        │   └── chat/                        # ChatPane, StudioPanel, SourcesPanel, HistoryStrip
        └── pages/
            ├── ChiedzaDashboard.jsx           # top-level product picker
            ├── InDevelopment.jsx              # placeholder for other Ziva products
            └── zivabasa/                       # ZivaBasaLayout + Dashboard/Chat/Predict/History tabs
```

---

## 6. Architecture Reference

```
Input Features (raw + engineered, per task)
        │
Shared Trunk: Dense(256, ReLU) → BatchNorm → Dropout(0.3)
              → Dense(128, ReLU) → Dropout(0.3)
        │
   ┌────┴────┬─────────────┐
   ▼         ▼             ▼
Employment  Productivity  Skills
Head        Head          Head
Dense(64→32)  Dense(64→32)  Dense(64→32)
   │             │             │
Output(1)     Output(1)     Output(1)
```

Feature taxonomy (must match the ChiedzaAI proposal's structure — see `backend/src/features.py`):

| Category | Example (this phase) |
|---|---|
| Raw | age, tenure, training hours, job role, automation exposure score |
| Ratio/Index | Training Hours per Employee, Automation Exposure Index |
| Interaction | Training Investment × Skill Readiness, AI Adoption × Employment Level |
| Learned | shared trunk output (not hand-built) |
| Fusion | concatenated representation feeding the task heads |

---

## 7. API Endpoints (`backend/api/main.py`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | which tasks loaded successfully |
| GET | `/schema/{task}` | feature names, input_dim, task_type for a task |
| POST | `/predict/{task}` | `{"features": [...]}` in schema order → prediction |
| POST | `/explain/{task}?top_k=8` | same input → SHAP contribution ledger |
| POST | `/predict/batch/{task}` | CSV upload → scored rows + aggregate KPIs |
| POST | `/chat` | LLM chat, can call `predict_task`/`explain_task` as tools |

`task` is one of `employment`, `skills`, `productivity` today (see §9 for a planned 4th).

---

## 8. Setup

**Backend:**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```
Check it's alive: `curl http://localhost:8000/health` should return all three tasks loaded.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
By default the app talks to `http://localhost:8000`. Override with a `frontend/.env`:
```
VITE_API_BASE=http://localhost:8000
```

**Backend persistence + auth (Supabase):** as of this session, every user-generated record
(org chart, roster/approval decisions, batch results, sources, chat usage log, cost entries,
chat session, predict history) is stored in Postgres via Supabase instead of localStorage, and
the app requires signing in. Setup:
1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `backend/supabase/schema.sql` once (tables + Row Level Security).
3. Copy `frontend/.env.example` to `frontend/.env` and fill in your project's URL + anon key
   (Project Settings → API).
4. `npm run dev` — you'll land on a sign-up/sign-in screen before anything else loads.

FastAPI itself is unchanged and stores nothing — see `backend/supabase/schema.sql` for the
architecture note on why CRUD goes through Supabase directly (client SDK + RLS) rather than
through a second REST layer in FastAPI.

Run notebooks in order (01 → 06) if retraining models. Each notebook reads from
`backend/data/processed/` produced by the previous one — do not skip 02 (feature engineering)
before running 03 or 04.

---

## 9. Planned Next: Shift Intelligence (SWS Integration)

A fourth task, **`skill_match`**, is planned to bring shift-and-skill matching concepts from the
sister project **FFIMS Shift & Workforce Scheduling** (Africa University's Fleet & Facilities
Integrated Management System) into ZivaBasa — turning static risk predictions into concrete
internal redeployment recommendations (who can be reskilled/redeployed instead of let go, and why).

- Follows the exact same `/schema/{task}` → `/predict/{task}` → `/explain/{task}` contract as the
  existing three tasks, so it plugs into the existing Predict/Chat/History UI with minimal changes.
- Adds a new **Roster** tab inside the ZivaBasa layout for shift-coverage and redeployment-candidate
  views, reusing existing `Card`/`Badge`/`ClarityRing` components and the `ShapLedger` explanation pattern.
- A full build spec for this is maintained separately (Claude Code build prompt) rather than in this
  README, to keep implementation detail out of the architecture doc — see the project's internal docs.

---

## 10. Known Limitations (Report These, Don't Bury Them)

1. **Cross-dataset alignment** — the five datasets are not from the same population; task heads
   are trained on different samples joined only at the feature-schema level. `human_capital` is
   internally row-aligned (its own rows are genuinely one-employee-one-row, joined on `EmpID`),
   but there's no shared key across it and the other four datasets (e.g. `skill_match`'s
   `staff_id` is a separate synthetic population) — so this limitation is not yet closed, only
   partially improved for one dataset. See `backend/data/schema/human_capital_dictionary.md`
   "Join strategy".
2. **No Zimbabwe/banking specificity** — employment/skills/productivity/skill_match proxy data is
   US/general-industry or synthetic-banking; results won't transfer directly to the target domain.
   `human_capital` is real US HR data (not a proxy standing in for something else), but still not
   Zimbabwe/banking-specific.
3. **No federated learning yet** — this phase runs on a single merged/aligned dataset locally;
   the proposal's privacy-preserving multi-bank federated setup is out of scope until real bank
   partners are onboarded.
4. **Causal-consistent XAI** — this phase implements standard SHAP (associational), not the
   causal-consistent XAI layer described in the proposal. That is a later research milestone.
5. **No auth, no persistent database** — history and batch results live in browser `localStorage`
   only; nothing survives a cleared cache or a different device.
6. **SHAP uses KernelExplainer, not GradientExplainer** — a Keras 3 / shap version conflict, not a
   bug. See `backend/README.md` §"Known issues" before "fixing" this again.

---

## 11. Next Phase (Not This Sprint)

- Replace proxy datasets with real bank HR/operational/AI-system data once available
- Build the `skill_match` task and Roster tab described in §9
- Add a persistent database (batch history, auth) — currently everything is file-based or browser-local
- Introduce federated learning across participating banks
- Move from SHAP to the causal-consistent XAI layer
- Reconcile the feature dictionary (`backend/src/features.py`) against the real raw feature list in
  the proposal once real data is available (taxonomy already matches — swap the data source only)