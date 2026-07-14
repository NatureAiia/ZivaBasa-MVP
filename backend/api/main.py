"""
main.py — ZivaBasa Workforce Intelligence API (prototype, Day 8 of the 14-day plan).

Run locally:
    cd zivabasa_mvp
    uvicorn api.main:app --reload

Then:
    GET  /health
    GET  /schema/{task}            task in {employment, skills, productivity}
    POST /predict/{task}           body: {"features": [...]}  (order per /schema/{task})
    POST /explain/{task}           body: {"features": [...]}  -> SHAP local explanation

This is a prototype, not a production deployment: models are loaded once into memory at
startup, there's no auth, and SHAP explanations run on-demand (slower than /predict). It's
meant to prove the trained multi-task model + SHAP pipeline can actually be served, per the
14-day plan's Day 8 deliverable.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # picks up ANTHROPIC_API_KEY / NVIDIA_API_KEY / CHAT_PROVIDER from .env if present
                # -- must run before api.chat is imported, since that module reads them at
                # import time via os.environ.get()

import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from api.schemas import (
    PredictRequest, PredictResponse, SchemaResponse,
    ExplainResponse, FeatureContribution, HealthResponse,
    ChatRequest, ChatResponse,
)
from api.model_registry import registry
from api import batch as batch_module
from api import chat as chat_module
from src import evaluate

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading task models into registry...")
    registry.load_all()
    if not registry.task_names():
        logger.warning(
            "No task models loaded. Run notebooks 02 (features) and 04 (multi-task NN) "
            "first, or call src.features.run_all_pipelines() + train + save."
        )
    else:
        logger.info("Loaded tasks: %s", registry.task_names())
    yield


app = FastAPI(
    title="ZivaBasa Workforce Intelligence API",
    description="Prototype API serving the ChiedzaAI multi-task Employment/Skills/Productivity model.",
    version="0.1.0-mvp",
    lifespan=lifespan,
)

# Permissive CORS for local prototyping only — the dashboard (opened as a local file, or
# served from a different port) needs this to call the API from a browser. Tighten this
# (specific origins, not "*") before this goes anywhere beyond your own machine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_task_or_404(task: str):
    artifacts = registry.get(task)
    if artifacts is None:
        available = registry.task_names() or ["<none loaded>"]
        raise HTTPException(
            status_code=404,
            detail=f"Task '{task}' not available. Loaded tasks: {available}",
        )
    return artifacts


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(status="ok", tasks_loaded=registry.task_names())


@app.get("/schema/{task}", response_model=SchemaResponse)
def schema(task: str):
    artifacts = _get_task_or_404(task)
    return SchemaResponse(
        task=task,
        task_type=artifacts.task_type,
        input_dim=artifacts.input_dim,
        feature_names=artifacts.feature_names,
    )


@app.post("/predict/{task}", response_model=PredictResponse)
def predict(task: str, request: PredictRequest):
    artifacts = _get_task_or_404(task)

    if len(request.features) != artifacts.input_dim:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Expected {artifacts.input_dim} features for task '{task}', "
                f"got {len(request.features)}. Check GET /schema/{task} for the expected order."
            ),
        )

    # Raw user-entered values must be standardized with the task's saved scaler before
    # reaching the model — it was trained on z-scored features, not raw ones. Feeding raw
    # values directly (the previous bug) produces wildly out-of-distribution input that
    # saturates the network into a near-constant, uninformative output.
    X = artifacts.transform(request.features)
    raw_output = float(artifacts.keras_model(X, training=False).numpy().squeeze())

    response = PredictResponse(
        task=task, task_type=artifacts.task_type, raw_output=raw_output
    )
    if artifacts.task_type == "classification":
        response.probability = raw_output
        response.label = int(raw_output > 0.5)
    return response


@app.post("/explain/{task}", response_model=ExplainResponse)
def explain(task: str, request: PredictRequest, top_k: int = 10):
    artifacts = _get_task_or_404(task)

    if len(request.features) != artifacts.input_dim:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Expected {artifacts.input_dim} features for task '{task}', "
                f"got {len(request.features)}. Check GET /schema/{task} for the expected order."
            ),
        )

    # Same scaling fix as /predict: SHAP must be computed on standardized input, since that's
    # what the model and its background sample are in. We keep the *raw* value in each
    # FeatureContribution below so the ledger stays human-readable (e.g. "45000", not "-1.4").
    X = artifacts.transform(request.features)
    try:
        shap_values, explainer_name = evaluate.compute_shap_values(
            artifacts.keras_model, artifacts.shap_background, X
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SHAP explanation failed: {e}")

    shap_values = np.atleast_1d(np.squeeze(shap_values))
    base_value = float(
        artifacts.keras_model(artifacts.shap_background, training=False).numpy().mean()
    )
    prediction = float(artifacts.keras_model(X, training=False).numpy().squeeze())

    contributions = [
        FeatureContribution(feature=name, value=float(val), shap_value=float(sv))
        for name, val, sv in zip(artifacts.feature_names, request.features, shap_values)
    ]
    contributions.sort(key=lambda c: abs(c.shap_value), reverse=True)

    return ExplainResponse(
        task=task,
        base_value=base_value,
        prediction=prediction,
        top_contributions=contributions[:top_k],
        explainer_used=explainer_name,
    )


# Feature that doubles as a $-value column for "value at risk" aggregation, when present in
# the task's own required features (both employment and skills already require a salary-like
# field as a model input, so no extra column is needed from the upload beyond the model's own
# required features).
_VALUE_COLUMN = {"employment": "avg_salary_usd", "skills": "MonthlyIncome"}


@app.post("/predict/batch/{task}")
async def predict_batch(task: str, file: UploadFile = File(...)):
    artifacts = _get_task_or_404(task)

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Only .csv files are supported right now.")

    file_bytes = await file.read()
    try:
        parsed = batch_module.parse_and_validate(file_bytes, task, artifacts.feature_names)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    df = parsed["df"]
    X_scaled = artifacts.transform_batch(parsed["feature_matrix"])
    raw_outputs = artifacts.keras_model(X_scaled, training=False).numpy().reshape(-1)

    if artifacts.task_type == "classification":
        aggregate, by_segment, top_risk = batch_module.aggregate_classification(
            df, raw_outputs, parsed["label_col"], parsed["segment_col"],
            value_col=_VALUE_COLUMN.get(task),
        )
    else:
        aggregate, by_segment, top_risk = batch_module.aggregate_regression(
            df, raw_outputs, parsed["label_col"], parsed["segment_col"]
        )

    rows = batch_module.build_row_records(
        df, parsed["feature_matrix"], artifacts.feature_names, raw_outputs,
        artifacts.task_type, parsed["label_col"],
    )

    return {
        "task": task,
        "task_type": artifacts.task_type,
        "feature_names": artifacts.feature_names,
        "n_rows": parsed["n_rows"],
        "n_dropped": parsed["n_dropped"],
        "label_column": parsed["label_col"],
        "segment_column": parsed["segment_col"],
        "aggregate": aggregate,
        "by_segment": by_segment,
        "top_rows": top_risk,
        "rows": rows,
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        result = await chat_module.send_chat([m.model_dump() for m in request.messages])
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat provider call failed: {e}")
    return ChatResponse(**result)
