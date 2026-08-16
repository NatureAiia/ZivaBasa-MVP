"""
build_causal_xai_artifact.py — Produces the Phase 3 causal-consistent XAI deliverable per the
Next-Gen Architecture reconciliation plan's acceptance criteria:
  1. A DAG artifact (edge list + image) discovered from the current engineered feature set,
     with a one-paragraph plausibility sanity check.
  2. A single documented example: one prediction, its SHAP explanation, its causal-reweighted
     SHAP, a simplified do-calculus intervention, and a template-based verbalization of both —
     shown side by side.

Runs against the `skill_match` task head: its 8 engineered features have clear, checkable
semantics (training hours, skill overlap/gap counts, an explicit interaction feature), which
makes a self-authored plausibility prior meaningful to write, unlike e.g. employment's more
abstract job-role-level features.

Data caveat (repeated here deliberately, not just in causal_xai.py's docstring): this runs over
Kaggle-proxy/synthetic `bank_skill_matching.csv`-derived features, not real bank data. The DAG
and its sanity check are illustrative of the mechanism, not a domain-expert-validated claim.

Run from backend/: `python scripts/build_causal_xai_artifact.py`
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import pandas as pd

from src import config, causal_xai, evaluate, features, model as model_module  # noqa: E402

TASK_NAME = "skill_match"
OUTPUT_DIR = os.path.join(config.MODELS_DIR, "causal_xai")

# Self-authored plausibility prior (NOT domain-expert-validated — see module/causal_xai.py
# docstrings). "child: [expected causal parent(s), if any edge exists between them at all]".
EXPECTED_PARENTS = {
    "skill_overlap_count": ["recent_training_hours"],
    "missing_skill_count": ["recent_training_hours"],
    "overlap_x_training": ["skill_overlap_count", "recent_training_hours"],
    "target_good_redeployment_match": [
        "skill_overlap_count", "missing_skill_count", "overlap_x_training",
    ],
}


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    df = features.load_processed(TASK_NAME)
    if df is None:
        raise RuntimeError(f"[{TASK_NAME}] no processed features found — run features.run_pipeline first.")
    splits = evaluate.make_splits(df, TASK_NAME, val_split=False)
    feature_names = splits["feature_names"]
    target_col = config.TASK_CONFIGS[TASK_NAME].target

    # --- 1. Causal discovery over features + target together ---
    discovery_df = pd.DataFrame(splits["X_train"], columns=feature_names).astype("float64")
    discovery_df[target_col] = splits["y_train"].astype("float64")

    print(f"Running PC algorithm over {discovery_df.shape[1]} columns, {len(discovery_df)} rows...")
    dag = causal_xai.discover_dag(discovery_df, alpha=0.05)
    edges = causal_xai.dag_edge_list(dag)
    print(f"Discovered {len(edges)} directed edges: {edges}")

    sanity_check = causal_xai.plausibility_sanity_check(dag, EXPECTED_PARENTS)
    print("\nPlausibility sanity check:\n" + sanity_check)

    edge_list_path = os.path.join(OUTPUT_DIR, f"{TASK_NAME}_dag.json")
    with open(edge_list_path, "w") as f:
        json.dump({"nodes": list(dag.nodes()), "edges": edges, "sanity_check": sanity_check}, f, indent=2)
    print(f"\nSaved DAG edge list -> {edge_list_path}")

    fig, ax = plt.subplots(figsize=(9, 7))
    pos = nx.spring_layout(dag, seed=config.RANDOM_STATE)
    nx.draw(
        dag, pos, ax=ax, with_labels=True, node_color="#F7F4EA", edgecolors="#1F2430",
        node_size=2200, font_size=8, arrowsize=15, edge_color="#2FBF9F", width=1.5,
    )
    ax.set_title(f"Discovered causal DAG — {TASK_NAME} (PC algorithm, proxy data)")
    dag_image_path = os.path.join(OUTPUT_DIR, f"{TASK_NAME}_dag.png")
    fig.savefig(dag_image_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved DAG image -> {dag_image_path}")

    # --- 2. One documented example: SHAP, causal-reweighted SHAP, intervention, verbalization ---
    keras_model = model_module.MultiTaskTrainer.load_task_model(TASK_NAME, config.MULTITASK_MODEL_DIR)
    background, explain_set, ex_idx = evaluate.sample_background_and_explain_set(splits, n_background=50, n_explain=1)
    shap_values, explainer_name = evaluate.compute_shap_values(keras_model, background, explain_set)
    shap_values = np.atleast_1d(shap_values)
    print(f"\nSHAP computed via {explainer_name} for 1 test instance.")

    instance_features = dict(zip(feature_names, explain_set[0].tolist()))
    raw_shap = dict(zip(feature_names, shap_values.tolist()))

    causal_shap = causal_xai.causal_reweight_shap(
        shap_values=shap_values, feature_names=feature_names, target_name=target_col, dag=dag,
    )

    scm = causal_xai.fit_linear_scm(discovery_df, dag)
    instance_row = discovery_df.iloc[0].copy()
    for name, val in zip(feature_names, explain_set[0]):
        instance_row[name] = val
    baseline_target = float(instance_row[target_col]) if target_col in scm or target_col in discovery_df else None

    intervene_feature = "recent_training_hours"
    intervened = causal_xai.simulate_intervention(
        discovery_df, dag, scm, instance_row,
        intervene_feature=intervene_feature,
        intervene_value=float(instance_row[intervene_feature]) + 20.0,  # +20 training hours
    )

    verbalization = causal_xai.verbalize_explanation(instance_features, raw_shap, causal_shap)

    example = {
        "task": TASK_NAME,
        "explainer_used": explainer_name,
        "instance_features": instance_features,
        "raw_shap": raw_shap,
        "causal_reweighted_shap": causal_shap,
        "intervention_example": {
            "intervened_feature": intervene_feature,
            "intervened_from": float(instance_row[intervene_feature]),
            "intervened_to": float(instance_row[intervene_feature]) + 20.0,
            "predicted_target_before": float(instance_row[target_col]) if target_col in discovery_df.columns else None,
            "predicted_target_after": float(intervened[target_col]) if target_col in scm else None,
            "note": (
                "Linear-SCM approximation of do-calculus (see causal_xai.py docstring for why "
                "this stands in for DoWhy-GCM) — propagates the intervention through the "
                "discovered DAG's downstream nodes only."
            ),
        },
        "verbalization_template_based": verbalization,
        "data_caveat": (
            "Kaggle-proxy/synthetic data (bank_skill_matching.csv fixture), not real bank data. "
            "DAG and sanity check are self-authored, not domain-expert-validated."
        ),
    }

    example_path = os.path.join(OUTPUT_DIR, f"{TASK_NAME}_causal_example.json")
    with open(example_path, "w") as f:
        json.dump(example, f, indent=2)
    print(f"\nSaved documented example -> {example_path}")
    print("\n--- Verbalization (template-based, no LLM) ---")
    print(verbalization)


if __name__ == "__main__":
    main()
