"""
Smoke test: exercises features.py -> evaluate.py -> model.py -> SHAP as one integrated
pipeline, using synthetic data shaped like the real Kaggle schemas. Not a substitute for
running on real data, but verifies the three src/ modules actually work together, not just
that they import cleanly.
"""
import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config, features, model, evaluate

rng = np.random.RandomState(0)
N = 300

# --- Synthetic "employment" raw data ---
df_employment = pd.DataFrame({
    "job_role": rng.choice(["Teller", "Analyst", "Manager", "Clerk"], N),
    "industry": rng.choice(["Banking", "Finance"], N),
    "automation_risk": rng.uniform(0, 1, N),
    "salary": rng.normal(40000, 10000, N),
    "digital_skill_level": rng.uniform(0, 1, N),
})
df_employment.loc[rng.choice(N, 10, replace=False), "salary"] = np.nan  # inject missing values

# --- Synthetic "skills" raw data (IBM HR-like) ---
df_skills = pd.DataFrame({
    "Age": rng.randint(22, 60, N),
    "JobRole": rng.choice(["Sales", "Research", "HR"], N),
    "Department": rng.choice(["Sales", "R&D", "HR"], N),
    "TrainingTimesLastYear": rng.randint(0, 6, N),
    "YearsAtCompany": rng.randint(0, 20, N),
    "MonthlyIncome": rng.normal(6000, 2000, N),
    "JobSatisfaction": rng.randint(1, 5, N),
    "PerformanceRating": rng.randint(1, 4, N),
    "Attrition": rng.choice(["Yes", "No"], N, p=[0.2, 0.8]),
})

# --- Synthetic "productivity" raw data ---
df_productivity = pd.DataFrame({
    "industry": rng.choice(["Banking", "Retail", "Tech"], N),
    "ai_adoption_level": rng.uniform(0, 1, N),
    "skill_gap_index": rng.uniform(0, 1, N),
    "salary_trend": rng.normal(0.02, 0.01, N),
})

os.makedirs(config.RAW_DIR, exist_ok=True)
df_employment.to_parquet(os.path.join(config.RAW_DIR, "employment_checked.parquet"), index=False)
df_skills.to_parquet(os.path.join(config.RAW_DIR, "skills_checked.parquet"), index=False)
df_productivity.to_parquet(os.path.join(config.RAW_DIR, "productivity_checked.parquet"), index=False)
print("Synthetic raw checkpoints written.\n")

# --- 1. Feature engineering (all three task heads) ---
print("=" * 60, "\n1. FEATURE ENGINEERING\n", "=" * 60)
processed = features.run_all_pipelines(save=True)
for name, df in processed.items():
    assert df is not None, f"[{name}] pipeline returned None"
    cfg = config.TASK_CONFIGS[name]
    assert cfg.target in df.columns, f"[{name}] target '{cfg.target}' missing after pipeline"
    print(f"[{name}] OK — shape={df.shape}, target present.")

fd = features.feature_dictionary_to_frame()
assert len(fd) > 0, "Feature dictionary is empty"
print(f"\nFeature dictionary: {len(fd)} entries logged.\n")

# --- 2. Splits ---
print("=" * 60, "\n2. TRAIN/TEST SPLITS\n", "=" * 60)
splits_no_val = evaluate.make_all_splits(processed, val_split=False)
splits_with_val = evaluate.make_all_splits(processed, val_split=True)
for name, s in splits_with_val.items():
    assert s is not None
    assert "X_val" in s and "y_val" in s
    print(f"[{name}] train={len(s['X_train'])} val={len(s['X_val'])} test={len(s['X_test'])}")

# --- 3. Baseline models ---
print("\n" + "=" * 60, "\n3. BASELINE MODELS\n", "=" * 60)
baseline_results = evaluate.run_all_baselines(splits_no_val, mlflow_log=False)
assert not baseline_results.empty, "No baseline results produced"
print(baseline_results.to_string(index=False))

# --- 4. Multi-task neural network (few epochs, just to prove the loop runs) ---
print("\n" + "=" * 60, "\n4. MULTI-TASK NEURAL NETWORK\n", "=" * 60)
input_dims = {name: s["input_dim"] for name, s in splits_with_val.items()}
task_types = {name: config.TASK_CONFIGS[name].task_type for name in input_dims}

fast_cfg = config.ModelConfig(epochs=3, patience=3, batch_size=16)  # keep the smoke test fast
trainer = model.MultiTaskTrainer(input_dims=input_dims, task_types=task_types, cfg=fast_cfg)
history = trainer.fit(splits_with_val, mlflow_run=None, verbose=True)
assert len(history["train_total"]) > 0, "Training loop produced no history"
print(f"\nTrained for {len(history['train_total'])} epoch(s). Final train loss: {history['train_total'][-1]:.4f}")

# --- 5. Evaluate NN on test set, using the SAME metric functions as the baselines ---
print("\n" + "=" * 60, "\n5. NEURAL NETWORK EVALUATION\n", "=" * 60)
nn_results = []
for name, s in splits_with_val.items():
    predict_fn = lambda X, name=name: trainer.predict(name, X)
    result = evaluate.evaluate_task_model(predict_fn, s, name)
    nn_results.append(result)
    print(result)

nn_results_df = pd.DataFrame(nn_results)
combined = pd.concat([baseline_results, nn_results_df], ignore_index=True)
print("\nCombined baseline + NN results:")
print(combined.to_string(index=False))

# --- 6. Save + reload model, confirm predictions match ---
print("\n" + "=" * 60, "\n6. SAVE / RELOAD\n", "=" * 60)
saved_paths = trainer.save(config.MULTITASK_MODEL_DIR)
for name in input_dims:
    reloaded = model.MultiTaskTrainer.load_task_model(name, config.MULTITASK_MODEL_DIR)
    X_sample = splits_with_val[name]["X_test"][:5]
    orig_pred = trainer.predict(name, X_sample)
    reload_pred = reloaded.predict(X_sample, verbose=0).squeeze()
    assert np.allclose(orig_pred, reload_pred, atol=1e-5), f"[{name}] reloaded model predictions differ!"
    print(f"[{name}] save/reload predictions match.")

# --- 7. SHAP explainability ---
print("\n" + "=" * 60, "\n7. SHAP EXPLAINABILITY\n", "=" * 60)
for name in input_dims:
    keras_model = model.MultiTaskTrainer.load_task_model(name, config.MULTITASK_MODEL_DIR)
    background, explain_set, _ = evaluate.sample_background_and_explain_set(
        splits_with_val[name], n_background=20, n_explain=10
    )
    sv, explainer_name = evaluate.compute_shap_values(keras_model, background, explain_set)
    assert sv.shape[0] == explain_set.shape[0], f"[{name}] SHAP values shape mismatch"
    imp_table = evaluate.feature_importance_table(sv, splits_with_val[name]["feature_names"])
    assert not imp_table.empty
    print(f"[{name}] explainer={explainer_name}, shap_values.shape={sv.shape}")
    print(imp_table.head(3).to_string(index=False))
    print()

print("=" * 60)
print("ALL SMOKE TESTS PASSED — features.py, model.py, and evaluate.py work together.")
print("=" * 60)
