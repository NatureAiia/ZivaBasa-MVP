# ZivaBasa — Workforce Intelligence Backend

FastAPI service serving five TensorFlow/Keras task heads (`employment`, `skills`,
`productivity`, `skill_match`, `human_capital`), SHAP explanations, causal uplift, forecasting,
an LLM chat/agent gateway, and the Postgres-backed auth and per-user data API. Four of the five
heads are trained on Kaggle proxy or synthetic data; `human_capital` uses real (US) HR data.

## Quickstart

```bash
python3 -m venv venv && source venv/bin/activate   # or a conda env
python -m pip install uv
python -m uv pip sync requirements.lock.txt
cp api/.env.example api/.env     # main.py loads api/.env; set DATABASE_URL + JWT_SECRET for auth/CRUD
alembic upgrade head              # creates the Postgres schema (alembic/versions/)
uvicorn api.main:app --reload --port 8000
```

Dependencies are managed via [uv](https://docs.astral.sh/uv/) — `pyproject.toml` is the source
of truth (with rationale comments for every pinned/constrained version), `requirements.lock.txt`
is the generated, hash-locked resolution actually installed. Regenerate it after editing
`pyproject.toml` with `uv pip compile pyproject.toml -o requirements.lock.txt`. For TSMixer/
Chronos-2 forecasting work (`src/tsmixer_forecast.py`, `src/chronos_forecast.py`), also sync
`requirements-forecasting.lock.txt` (adds torch/chronos-forecasting/transformers — a large,
slow download, deliberately not part of the default install or the served Docker image):
```bash
uv pip sync requirements-forecasting.lock.txt --system
```

Check it's alive: `curl http://localhost:8000/health` should report every task model loaded. Prediction routes work without a database or API keys; auth and per-user routes need `DATABASE_URL` and `JWT_SECRET`; `/chat` needs a provider key.

**On this machine specifically:** use the `deep_learning` conda env
(`C:\Users\<user>\.conda\envs\deep_learning`, Python 3.12.13) — `uv` detects and installs into
whichever environment is currently active (conda or venv), so `uv pip sync requirements.lock.txt`
inside that activated env installs the exact locked versions
(tensorflow==2.16.1, fastapi==0.111.0, etc.) that the existing task models were trained
under. The machine's global Python is 3.13,
which `tensorflow==2.16.1` doesn't support; pip-installing newer TF/numpy/pandas into the global
site-packages "works" but trains/serves under different library versions than everything else
in `models/`, which is best avoided rather than debugged later. Run scripts and uvicorn via
`"C:\Users\<user>\.conda\envs\deep_learning\python.exe" -m ...` (or activate the env first).

## Architecture

```
data/raw/             Kaggle/synthetic/HR source files (do not edit in place)
data/processed/       engineered + scaled feature parquets (src/features.py)
data/schema/          human_capital_dictionary.md (column mapping + join strategy)
models/
  multitask_model/    shared-trunk Keras model per task (served)
  ple_model/          PLE variant (benchmarked via scripts/benchmark_ple_vs_baseline.py)
  scalers/            fitted StandardScaler per task -- see "Scaler quirk" below
  shap_outputs/, causal_xai/, uplift/, forecast/, drift_baselines/, retrain_reports/
  metrics.json        latest per-task test metrics
src/                  ML code (no web framework)
  config.py           TaskConfig per task: target column, drop_cols (leakage exclusions)
  features.py, model.py, ple_model.py, evaluate.py
  uplift.py, causal_xai.py, upskilling.py, skill_matching.py
  forecast.py (served), tsmixer_forecast.py + chronos_forecast.py (spikes)
  federated/          Flower FedAvg simulation
  drift.py, entity_resolution.py, worldbank.py
api/
  main.py             app wiring, prediction/explain/batch/chat/report/extract routes
  model_registry.py   loads task models + scalers once at startup
  schemas.py          Pydantic request/response models
  auth.py, auth_service.py, auth_routes.py, token_service.py, tokens.py   JWT auth, roles, token gate
  chat.py, llm_gateway.py, agent_graph.py     chat providers + tool-calling agent
  batch.py, reports.py, org_extract.py, field_extract.py, redact.py
  image_gen.py, image_router.py, azure_image.py
  db/                 SQLAlchemy models + async session
  routes/             ~20 per-resource routers (all filter by the signed-in user/org)
alembic/              live schema migrations (0001 initial, 0002 org_nodes extras)
supabase/             LEGACY SQL from the Supabase era -- historical reference, not the live schema
scripts/              training, benchmarks, retrain_and_promote.py, retrain_worker.py, data loaders
tests/                pytest suite (28 modules, SQLite)
notebooks/            01 EDA -> 06 sanity check
```

## Endpoints

Prediction and ML

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | which task models loaded |
| GET | `/schema/{task}`, `/schema/forecast` | feature names, input_dim, task_type |
| POST | `/predict/{task}` | `{"features": [...]}` in schema order, returns prediction |
| POST | `/explain/{task}?top_k=8` | same input, returns SHAP contribution ledger |
| POST | `/predict/batch/{task}` | CSV upload, scored rows plus aggregate KPIs |
| POST | `/uplift/{task}` | causal treatment-effect estimates (EconML) |
| GET | `/predict/forecast/{industry}` | forecast with intervals |
| POST | `/skill_match/recommend` | redeployment recommendations |
| POST | `/federated/simulate` | single-machine FedAvg simulation |
| GET | `/mlops/status` | model/retrain status |

Chat, extraction, reports

| Method | Path | Purpose |
|---|---|---|
| POST | `/chat`, `/chat/agent` | LLM chat; the agent can call predict/explain tools |
| GET | `/chat/models`, `/chat/budget` | available models, usage budget |
| POST | `/extract/task-fields/{task}`, `/organization/extract` | field and org-chart extraction from documents/images |
| POST | `/images/generate` (+ `/images/providers`) | image generation |
| POST | `/reports/predict`, `/reports/chat` (+ `/pdf`, `/xlsx`) | export |

Auth and per-user data

`/auth/signup|login|refresh|logout`, `/auth/admin/promote-role` (superadmin only), plus CRUD routers for profiles, avatar, organizations (and invites), org_nodes, assignments, batch_results, sources, usage_log, cost_entries, chat_sessions, predict_history, onboarding, milestones, department_engagement, entity_links, feedback, review_queue and token_balance. Roles are `viewer` < `admin` < `superadmin`, enforced by `require_role()`. **Every query on a multi-tenant table must filter by user/organization in application code; there is no RLS backstop.**

`task` is one of `employment`, `skills`, `productivity`, `skill_match`, `human_capital`. Interactive docs are at `/docs`.

## Known issues & deliberate tradeoffs (read before "fixing" these again)

1. **SHAP always uses KernelExplainer, never GradientExplainer, even though the code tries
   GradientExplainer first.** Root cause: `shap==0.45.1`'s `GradientExplainer` calls
   `tf.keras.backend.learning_phase()`, which Keras 3 (bundled with our pinned
   `tensorflow==2.16.1`) removed. `shap==0.52.0` fixes it but requires `numpy>=2.0`, which
   conflicts with `tensorflow==2.16.1`'s `numpy<2.0` requirement and `pyarrow`/`mlflow`'s pins.
   Upgrading the whole TF/numpy stack to fix this is possible but needs full retraining
   verification first — not done incidentally. KernelExplainer is slower but has been verified
   numerically correct (`base_value + sum(shap_values) ≈ prediction`).

2. **Feature vectors must be raw, unscaled, human-readable numbers** (e.g.
   `avg_salary_usd: 45000`), in the exact order `GET /schema/{task}` returns. The API applies
   the task's saved `StandardScaler` internally (`model_registry.py`'s `TaskArtifacts.transform`)
   by matching feature names, not position — the scaler was fit on more columns than the model
   actually uses (2 leakage-flagged columns get dropped after scaling, see
   `config.TASK_CONFIGS[...].drop_cols`), so a positional/count-based scale would silently be
   wrong. If you retrain and see all-zero predictions again, check this mapping first.

3. **Predictions can be extremely confident** (e.g. probability ~1e-7). Not necessarily wrong,
   but the model has no calibration step (no temperature scaling / Platt scaling) and is trained
   on a few thousand proxy rows — treat near-0%/near-100% readings as directional, not exact.
   The frontend flags this automatically for anything outside the 0.1%–99.9% range.

4. **This is a prototype on Kaggle proxy data, not real workforce data.** Every output should be
   read as a pipeline validation, not a real-world workforce finding.

## Running tests

```bash
pytest                       # 28 modules, run against SQLite (no Postgres needed)
python3 -m py_compile src/*.py api/*.py   # quick syntax sweep
```

`tests/smoke_test.py` is a standalone script (real training run, mutates disk), deliberately excluded from pytest collection (`pytest.ini`). CI runs the suite in `.github/workflows/tests.yml`.

## Deployment notes

- `.cpanel.yml` installs `requirements-serving.txt` (no torch/transformers), runs `alembic upgrade head`, and reloads PM2 from `backend/ecosystem.config.cjs`. That file is git-ignored and not in the repo; the backend listens on port 8002 on the UAT host.
- `Dockerfile` builds a single serving image (models load in-process; no separate inference service).
- `.github/workflows/scheduled-retrain.yml` runs `scripts/retrain_and_promote.py` weekly against the CSVs in `data/raw/` and commits promoted models back to the branch.
