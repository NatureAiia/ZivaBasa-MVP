"""
API smoke test: builds synthetic processed features + a real trained multi-task model
(same pipeline as tests/smoke_test.py), then exercises every endpoint of api/main.py through
FastAPI's TestClient. Confirms the API layer actually works against real artifacts on disk,
not just that it imports.
"""

import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, features, evaluate, model

# --- 1. Build synthetic raw data + run the real feature pipeline ---
rng = np.random.RandomState(0)
N = 300

df_employment = pd.DataFrame(
    {
        "job_role": rng.choice(["Teller", "Analyst", "Manager", "Clerk"], N),
        "industry": rng.choice(["Banking", "Finance"], N),
        "automation_risk": rng.uniform(0, 1, N),
        "salary": rng.normal(40000, 10000, N),
        "digital_skill_level": rng.uniform(0, 1, N),
    }
)
df_skills = pd.DataFrame(
    {
        "Age": rng.randint(22, 60, N),
        "JobRole": rng.choice(["Sales", "Research", "HR"], N),
        "Department": rng.choice(["Sales", "R&D", "HR"], N),
        "TrainingTimesLastYear": rng.randint(0, 6, N),
        "YearsAtCompany": rng.randint(0, 20, N),
        "MonthlyIncome": rng.normal(6000, 2000, N),
        "JobSatisfaction": rng.randint(1, 5, N),
        "PerformanceRating": rng.randint(1, 4, N),
        "Attrition": rng.choice(["Yes", "No"], N, p=[0.2, 0.8]),
    }
)
df_productivity = pd.DataFrame(
    {
        "industry": rng.choice(["Banking", "Retail", "Tech"], N),
        "ai_adoption_level": rng.uniform(0, 1, N),
        "skill_gap_index": rng.uniform(0, 1, N),
        "salary_trend": rng.normal(0.02, 0.01, N),
    }
)

os.makedirs(config.RAW_DIR, exist_ok=True)
df_employment.to_parquet(
    os.path.join(config.RAW_DIR, "employment_checked.parquet"), index=False
)
df_skills.to_parquet(
    os.path.join(config.RAW_DIR, "skills_checked.parquet"), index=False
)
df_productivity.to_parquet(
    os.path.join(config.RAW_DIR, "productivity_checked.parquet"), index=False
)

print("Running feature pipeline...")
processed = features.run_all_pipelines(save=True)
for name, df in processed.items():
    assert df is not None, f"[{name}] pipeline failed"
print("Feature pipeline OK.\n")

# --- 2. Train a (fast) real multi-task model and save it ---
print("Training multi-task model (fast smoke-test config)...")
splits_with_val = evaluate.make_all_splits(processed, val_split=True)
input_dims = {name: s["input_dim"] for name, s in splits_with_val.items()}
task_types = {name: config.TASK_CONFIGS[name].task_type for name in input_dims}

fast_cfg = config.ModelConfig(epochs=3, patience=3, batch_size=16)
trainer = model.MultiTaskTrainer(
    input_dims=input_dims, task_types=task_types, cfg=fast_cfg
)
trainer.fit(splits_with_val, mlflow_run=None, verbose=False)
trainer.save(config.MULTITASK_MODEL_DIR)
print("Model trained and saved.\n")

# --- 3. Exercise the API via TestClient ---
print("=" * 60, "\nTESTING API ENDPOINTS\n", "=" * 60)

from fastapi.testclient import TestClient
from backend.api.main import app

with TestClient(app) as client:
    # /health
    r = client.get("/health")
    assert r.status_code == 200, r.text
    health = r.json()
    print("GET /health ->", health)
    assert set(health["tasks_loaded"]) == set(input_dims.keys()), (
        f"Expected all tasks loaded, got {health['tasks_loaded']}"
    )

    for task_name in input_dims:
        # /schema/{task}
        r = client.get(f"/schema/{task_name}")
        assert r.status_code == 200, r.text
        sch = r.json()
        print(
            f"\nGET /schema/{task_name} -> input_dim={sch['input_dim']}, "
            f"task_type={sch['task_type']}, n_features={len(sch['feature_names'])}"
        )
        assert sch["input_dim"] == len(sch["feature_names"])

        # Build a valid feature vector from the real test split
        X_sample = splits_with_val[task_name]["X_test"][0].tolist()
        assert len(X_sample) == sch["input_dim"]

        # /predict/{task}
        r = client.post(f"/predict/{task_name}", json={"features": X_sample})
        assert r.status_code == 200, r.text
        pred = r.json()
        print(f"POST /predict/{task_name} -> {pred}")
        assert "raw_output" in pred
        if sch["task_type"] == "classification":
            assert pred["label"] in (0, 1)
            assert 0.0 <= pred["probability"] <= 1.0

        # /predict/{task} with WRONG feature length -> should 422, not crash
        r = client.post(f"/predict/{task_name}", json={"features": X_sample[:-1]})
        assert r.status_code == 422, (
            f"Expected 422 for bad input, got {r.status_code}: {r.text}"
        )
        print(
            f"POST /predict/{task_name} (bad length) -> {r.status_code} (correctly rejected)"
        )

        # /explain/{task}
        top_k = 5
        r = client.post(
            f"/explain/{task_name}",
            json={"features": X_sample},
            params={"top_k": top_k},
        )
        assert r.status_code == 200, r.text
        explanation = r.json()
        print(
            f"POST /explain/{task_name} -> explainer={explanation['explainer_used']}, "
            f"top_contributions={len(explanation['top_contributions'])}"
        )
        expected_n = min(top_k, sch["input_dim"])
        assert len(explanation["top_contributions"]) == expected_n, (
            f"Expected {expected_n} contributions (input_dim={sch['input_dim']}), got {len(explanation['top_contributions'])}"
        )
        assert all(
            "feature" in c and "shap_value" in c
            for c in explanation["top_contributions"]
        )

    # Unknown task -> 404, not a crash
    r = client.get("/schema/not_a_real_task")
    assert r.status_code == 404
    print(f"\nGET /schema/not_a_real_task -> 404 (correctly rejected)")

print("\n" + "=" * 60)
print("ALL API SMOKE TESTS PASSED")
print("=" * 60)
