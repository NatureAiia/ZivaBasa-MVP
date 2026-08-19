# ZivaBasa backend — FastAPI serving predict/explain/forecast/reports plus chat/vision/image
# tools. There is no separate TensorFlow "inference service": model_registry.py loads the
# .keras artifacts straight into this API process at startup (see main.py's lifespan), so one
# container is the whole backend.
FROM python:3.12-slim

# libgomp1: xgboost and shap both link against OpenMP at runtime, which python:3.12-slim
# doesn't ship — without it the failure is an opaque ImportError inside xgboost's C extension,
# not an obviously-missing-package message.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# uv (astral-sh) — a real dependency resolver + lockfile, replacing a hand-sequenced pip
# install. requirements.lock.txt is generated (`uv pip compile pyproject.toml -o
# requirements.lock.txt`), not hand-written — see pyproject.toml for the source dependency
# list and rationale comments. The `forecasting` extra (torch/chronos-forecasting/transformers)
# is deliberately NOT installed here — nothing in api/main.py depends on it, and it's a large,
# slow download this served image doesn't need.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Dependencies copied and installed before the rest of the source so `docker build` only
# reinstalls the (slow: tensorflow, mlflow, shap) dependency layer when the lock file actually
# changes, not on every code edit.
COPY pyproject.toml requirements.lock.txt .
RUN uv pip sync requirements.lock.txt --system

# api/main.py's own docstring documents `uvicorn api.main:app`, run with this directory as
# cwd — api/ and src/ are plain top-level packages here, not backend.api/backend.src, so the
# image's WORKDIR must be this directory, not the repo root.
COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
