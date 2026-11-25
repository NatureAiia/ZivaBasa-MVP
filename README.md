# ZivaBasa
### AI-powered workforce intelligence for banks: MVP on proxy data

**Module:** ZivaBasa, part of the ChiedzaAI platform
**Phase:** working end-to-end prototype, deployed to a UAT environment, trained on public Kaggle and synthetic data
**Last reviewed against the code:** 2026-11-25

---

## 1. What this is

ZivaBasa predicts and explains workforce outcomes for a bank: which roles face automation risk, who is at attrition risk, how AI adoption affects productivity, and who could be redeployed instead of let go. It combines:

- a shared-trunk multi-task neural network with five task heads,
- SHAP explanations (plus causal uplift estimates and forecasts),
- a FastAPI backend with its own Postgres database and JWT auth,
- a React dashboard with CEO, manager and employee views,
- an LLM chat assistant ("Chiedza") that can call the models as tools.

> **Every dataset except `human_capital` is a stand-in for real Zimbabwean banking data, and `human_capital` is real US HR data, not bank data.** Findings from this phase are methodological, not empirical. Say so in any write-up, thesis chapter or stakeholder demo that cites it.

### Where the models stand

From `backend/models/metrics.json` (test split, proxy data):

| Task | Type | Result | Reading |
|---|---|---|---|
| `employment` | classification | ROC-AUC 0.42, precision/recall 0 | worse than chance on this proxy |
| `skills` | classification | ROC-AUC 0.65, F1 0.21 | weak |
| `productivity` | regression | R² -0.02 | no better than predicting the mean |
| `skill_match` | classification | ROC-AUC 0.97, F1 0.79 | synthetic data; proves the pipeline, not real fit |
| `human_capital` | classification | no entry in `metrics.json` | the one real-data task; its model is `models/multitask_model/human_capital_model.keras`, but no recorded metrics were found |

These numbers show the architecture runs end to end. They are **not** evidence that the predictions are accurate. Do not present them as such.

---

## 2. What's real vs. prototype

**Real and working**

- **Prediction and explanation** for five tasks: `/predict/{task}`, `/explain/{task}` (SHAP), `/schema/{task}`, plus CSV batch scoring with KPIs, department breakdown and a top-risk list.
- **Auth and multi-tenancy**: self-hosted JWT (short-lived access token plus rotating refresh cookie), roles `viewer` < `admin` < `superadmin`, organizations with email invites.
- **Persistence**: all user data (org chart, roster and assignments, batch results, sources, chat sessions, predict history, cost entries, usage log, feedback, review queue, entity links, onboarding, milestones, token balances) is in Postgres via about 20 backend route modules. Nothing depends on browser `localStorage` for correctness.
- **Chat and agent** (`/chat`, `/chat/agent`) over a provider gateway: Anthropic, NVIDIA NIM, Gemini, Groq. Needs at least one provider key on the backend.
- **Causal uplift** (`/uplift/{task}`, EconML), **forecasting** (`/predict/forecast/{industry}`, LSTM/GRU with MC-dropout intervals), **redeployment recommendations** (`/skill_match/recommend`).
- **Governance**: human review queue, prediction feedback, model-health page, drift baselines, weekly retrain-and-promote workflow with a metrics gate.
- **Reports**: Markdown, PDF and XLSX export for predictions and chat.
- **Document extraction**: org-chart and task-field extraction from uploaded documents or images (needs a vision-capable provider key).
- **Token and cost metering** with an optional balance gate (`ZIVABASA_TOKEN_GATE_ENABLED`).

**Simulation or spike only**

- **Federated learning** (`/federated/simulate`): a Flower FedAvg simulation across synthetic institutions on one machine, not a cross-bank deployment.
- **TSMixer and Chronos-2 forecasting**: evaluated spikes needing the heavy `requirements-forecasting.lock.txt`; not part of the served API.
- **Studio stub tiles** (audio/video overview, mind map, quiz) in the Chat tab: visual only.
- **Sibling modules** (Ziva Bank, DataOps, Business, Upskill): placeholder pages.

For module-level detail see [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md). Product and design docs are in [`docs/`](docs/) (section 9).

---

## 3. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vite, React 19, React Router 7, Tailwind CSS, Framer Motion, lucide-react |
| Backend | FastAPI, Pydantic, Uvicorn, SQLAlchemy (async, asyncpg), Alembic |
| Database | Self-hosted PostgreSQL (SQLite for tests) |
| Auth | Custom JWT (passlib/bcrypt), refresh tokens hashed and stored server-side |
| ML | TensorFlow/Keras multi-task network, scikit-learn/XGBoost baselines, EconML, Flower |
| Explainability | SHAP `KernelExplainer` (see `backend/README.md` for why not `GradientExplainer`) |
| Experiment tracking | MLflow (local) |
| LLM / vision | Anthropic, NVIDIA NIM, Gemini, Groq; Azure OpenAI for image generation and editing |
| Deploy | cPanel Git Version Control (`.cpanel.yml`), PM2, Apache proxy; backend `Dockerfile` also available |
| CI | GitHub Actions: tests/lint/advisory scans (`tests.yml`), weekly retrain (`scheduled-retrain.yml`) |

---

## 4. Datasets

Five task heads, five unrelated datasets. They are **not** the same population; this is a known limitation (section 8).

| Task head | Dataset | Role |
|---|---|---|
| `employment` | AI Automation Risk by Job Role (`khushikyad001/ai-automation-risk-by-job-role`) | proxy: job-role automation exposure |
| `skills` | IBM HR Analytics Attrition (`pavansubhasht/ibm-hr-analytics-attrition-dataset`) | proxy: attrition, tenure, training, satisfaction |
| `productivity` | Future of Work in the Age of AI 2020-2026 (`algozee/future-of-work-in-the-age-of-ai-20202026`) | proxy: AI adoption, salary trend, skill gap |
| `skill_match` | synthetic banking roster (`scripts/generate_skill_match_fixture.py`) | synthetic: skill tags vs. target-role requirements |
| `human_capital` | HRDataset_v14-style roster (`davidepolizzi/hr-data-set-based-on-human-resources-data-set`), 3,310 employees | real HR data, but US and general industry. See `backend/data/schema/human_capital_dictionary.md` |

`backend/data/raw/` also holds an HCP sample (`raw/HCP/`). Do not edit raw files in place: cleaning happens in notebook 02 or the dedicated scripts, and writes to `backend/data/processed/`. Macro indicators (World Bank, FAO/IMF CPI) are joined into the productivity and forecast features.

---

## 5. Repository layout

```
ZivaBasa-MVP/
├── README.md
├── .cpanel.yml            # cPanel deploy pipeline (UAT)
├── .env.example           # backend/provider/auth env template
├── .github/workflows/     # tests.yml, scheduled-retrain.yml
├── admin/                 # deploy helper; secret-bearing scripts are git-ignored
├── docs/                  # BRD, architecture, dissertation pre-proposal, pitch scripts
├── backend/
│   ├── api/               # FastAPI app: main.py, auth, chat, agent_graph, reports, batch, ...
│   │   ├── routes/        # per-resource CRUD routers (assignments, org_nodes, feedback, ...)
│   │   └── db/            # SQLAlchemy models + session
│   ├── alembic/           # live DB migrations (0001, 0002)
│   ├── src/               # ML: features, model, ple_model, uplift, causal_xai, forecast,
│   │                      #     federated/, skill_matching, drift, entity_resolution, worldbank
│   ├── scripts/           # training, benchmarks, retrain_and_promote, data loaders
│   ├── notebooks/         # 01 EDA -> 06 sanity check
│   ├── data/{raw,processed,schema}/
│   ├── models/            # Keras models, scalers, SHAP outputs, drift baselines, retrain reports
│   ├── tests/             # pytest suite (28 modules, SQLite)
│   ├── supabase/          # LEGACY SQL from the Supabase era; historical reference only
│   └── Dockerfile, pyproject.toml, requirements*.txt
└── frontend/
    └── src/
        ├── pages/         # Landing, Login, ChiedzaDashboard, CostMonitoring, system/*, zivabasa/*
        ├── components/    # predict, chat, dashboard, organization, charts, common, effects, ...
        ├── lib/           # api client, authStore, domain stores (one per backend resource)
        └── hooks/         # usePredictionFlow
```

---

## 6. Architecture in brief

```
Input features (raw + engineered, per task)
        │
Shared trunk: Dense(256) → BatchNorm → Dropout → Dense(128) → Dropout
        │
 ┌──────┬────────┬──────────┬─────────────┬──────────────┐
 ▼      ▼        ▼          ▼             ▼
employment  skills  productivity  skill_match  human_capital   (task heads)
```

Feature taxonomy (`backend/src/features.py`): raw, ratio/index, interaction, learned (trunk), fusion. Full detail, including the data model, auth design and deployment, is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 7. Setup

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install uv
uv pip sync requirements.lock.txt
cp api/.env.example api/.env # the app loads backend/api/.env; fill in what you need
alembic upgrade head          # needs DATABASE_URL (postgresql+asyncpg://...)
uvicorn api.main:app --reload --port 8000
```

- `curl http://localhost:8000/health` should report all task models loaded.
- `/predict`, `/explain`, `/schema` and batch scoring work without any API key. `/chat`, document extraction and image generation need a provider key.
- `/auth/*` and every per-user route need `DATABASE_URL` and `JWT_SECRET` (generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`). Set `CORS_ALLOWED_ORIGINS` to your frontend origin.
- The repo-root `.env.example` mirrors these variables. Ignore its `docker compose` comment: there is no `docker-compose.yml` in the repo, only per-service Dockerfiles.

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Defaults to the backend at `http://localhost:8000`; override with `VITE_API_BASE` in `frontend/.env`.

### Tests

```bash
cd backend && pytest
```

### Retraining

Run notebooks 01 to 06 in order (do not skip 02), or run `backend/scripts/retrain_and_promote.py`, which gates promotion on a metrics comparison and writes a report to `backend/models/retrain_reports/`.

### Deployment (UAT)

`.cpanel.yml` builds the frontend, installs `requirements-serving.txt`, runs `alembic upgrade head` and reloads PM2. It depends on `backend/ecosystem.config.cjs` (backend on port 8002), which is **git-ignored and not in the repo**; see section 8.

---

## 8. Known limitations and open items

**Data and modelling**

1. **Proxy data.** Four of five tasks use proxy or synthetic data; results will not transfer to Zimbabwean banking.
2. **No shared key across datasets.** The heads are trained on different populations, joined only at the feature-schema level. `human_capital` is internally consistent but shares no key with the others.
3. **Weak models.** See the table in section 1.
4. **Uncalibrated, over-confident probabilities.** There is no calibration step; treat very near 0 or 1 outputs as directional.
5. **SHAP is associational.** Causal uplift (EconML) is available separately, but the explanation layer itself is not causal-consistent.
6. **`KernelExplainer` only.** A Keras 3 / shap version conflict, not a bug; read `backend/README.md` before "fixing" it.
7. **Federated learning is a single-machine simulation.**

**Engineering**

8. **Tenant isolation is enforced only in application code.** There is no database RLS backstop since leaving Supabase. Every new endpoint must filter by user or organization.
9. **Supabase residue.** The code no longer uses Supabase, but `backend/supabase/` still holds legacy SQL. The live schema is `backend/alembic/`.
10. **Deploy config not reproducible from the repo.** `backend/ecosystem.config.cjs` is git-ignored, and `.cpanel.yml` and `frontend/public/.htaccess` hard-code UAT hosts and port 8002.
11. **No frontend tests.** Only `npm run lint` and `frontend/demo_walkthrough.mjs`, a one-off Playwright screenshot script.
12. **Models and datasets live in git.** Trained models and raw/processed data are committed (the retrain bot commits promoted models back), which will bloat the repo over time; consider Git LFS or an artifact store.
13. **Compliance not assessed.** Nothing in the repo addresses Zimbabwe's data-protection law; confirm before processing real employee PII.

---

## 9. Documentation map

| Document | Contents |
|---|---|
| [`docs/BRD.md`](docs/BRD.md) | Business requirements, users, FR/NFR, success metrics, risks |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | As-built architecture, data model, auth, ML subsystem, deployment, risks |
| [`docs/DISSERTATION_PREPROPOSAL.md`](docs/DISSERTATION_PREPROPOSAL.md) (+ `.docx`) | Research framing: TimesFM multimodal fusion, fairness, real-bank evaluation |
| [`docs/demo_scripts/`](docs/demo_scripts/) | CEO and head-of-state pitch scripts |
| [`backend/README.md`](backend/README.md) | Backend API, ML pipeline, known issues |
| [`frontend/README.md`](frontend/README.md) | Frontend structure, pages, real vs. prototype |
| `backend/data/schema/human_capital_dictionary.md` | Column mapping and join strategy for the real-data task |

---

## 10. Next steps

1. Obtain real bank HR, operational and AI-system data, and add a validation gate before any real-data model is promoted.
2. Finish the clean-up in section 8 (Supabase residue, untracked deploy config, repo hygiene).
3. Add frontend tests and an automated tenant-isolation check for new endpoints.
4. Move federated learning from simulation to separate institutions.
5. Integrate deeper shift scheduling with the sister FFIMS project (owned externally).
6. Real-data evaluation for the dissertation: TimesFM multimodal fusion, accuracy and fairness.
