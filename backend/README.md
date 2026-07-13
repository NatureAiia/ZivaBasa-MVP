# ZivaBasa — Workforce Intelligence Backend

FastAPI service serving three TensorFlow/Keras task heads (Employment automation-risk,
Skills attrition-risk, Productivity/AI-adoption) trained on Kaggle proxy datasets, with
SHAP-based local explanations.

## Quickstart

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Check it's alive: `curl http://localhost:8000/health` should return all three tasks loaded.

## Architecture

```
data/raw/            checked-in Kaggle CSVs, checkpointed to parquet by src/api_smoke_test.py
data/processed/       engineered + scaled feature parquets (src/features.py)
models/
  {task}/             saved Keras model per task
  scalers/            fitted StandardScaler per task (joblib) -- see "Scaler quirk" below
src/
  config.py           TaskConfig per task: target column, drop_cols (leakage exclusions)
  features.py          load -> clean -> engineer -> scale -> save pipeline
  model.py              Keras model architecture + training
  evaluate.py           make_splits, SHAP computation, metrics
api/
  schemas.py            Pydantic request/response models
  model_registry.py     loads all three tasks' models + scalers once at startup
  main.py                FastAPI routes: /health, /schema/{task}, /predict/{task}, /explain/{task}
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | which tasks loaded successfully |
| GET | `/schema/{task}` | feature names, input_dim, task_type for a task |
| POST | `/predict/{task}` | `{"features": [...]}` in schema order → prediction |
| POST | `/explain/{task}?top_k=8` | same input → SHAP contribution ledger |

`task` is one of `employment`, `skills`, `productivity`.

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
python3 -m py_compile src/*.py api/*.py   # syntax sweep
# no formal test suite yet (Day 13 on the roadmap: integration + E2E testing)
```
