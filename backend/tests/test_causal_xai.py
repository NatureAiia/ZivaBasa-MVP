"""
test_causal_xai.py — unit coverage for src/causal_xai.py (Phase 3 causal-consistent XAI spike),
using a synthetic linear chain with a known ground-truth causal structure (X0 -> X1 -> X2), the
same pattern smoke_test.py/test_ple_model_smoke.py already use for architecture-level tests.
"""
from __future__ import annotations

import networkx as nx
import numpy as np
import pandas as pd

from src import causal_xai

rng = np.random.RandomState(0)
N = 500


def _make_chain_df() -> pd.DataFrame:
    """Ground truth: x0 -> x1 -> target, plus x_noise with no causal link to anything."""
    x0 = rng.normal(size=N)
    x1 = 0.9 * x0 + rng.normal(scale=0.3, size=N)
    target = 0.9 * x1 + rng.normal(scale=0.3, size=N)
    x_noise = rng.normal(size=N)
    return pd.DataFrame({"x0": x0, "x1": x1, "target": target, "x_noise": x_noise})


def test_discover_dag_recovers_chain_structure():
    df = _make_chain_df()
    dag = causal_xai.discover_dag(df, alpha=0.05)
    assert isinstance(dag, nx.DiGraph)
    assert set(dag.nodes()) == set(df.columns)
    # x_noise should end up isolated (no true causal link to anything else).
    assert dag.degree("x_noise") == 0


def test_plausibility_sanity_check_reports_matches_and_contradictions():
    dag = nx.DiGraph()
    dag.add_nodes_from(["x0", "x1", "target"])
    dag.add_edge("x0", "x1")
    dag.add_edge("x1", "target")

    summary = causal_xai.plausibility_sanity_check(dag, expected_parents={"x1": ["x0"], "target": ["x1"]})
    assert "2 matched" in summary
    assert "0 ran opposite" in summary


def test_causal_reweight_shap_keeps_direct_parents_full_weight():
    dag = nx.DiGraph()
    dag.add_edge("x1", "target")
    dag.add_node("x_noise")

    reweighted = causal_xai.causal_reweight_shap(
        shap_values=np.array([0.5, 0.2]),
        feature_names=["x1", "x_noise"],
        target_name="target",
        dag=dag,
        downweight_factor=0.3,
    )
    assert reweighted["x1"] == 0.5  # direct causal parent — unchanged
    assert abs(reweighted["x_noise"] - 0.06) < 1e-9  # 0.2 * 0.3 — downweighted


def test_simulate_intervention_propagates_through_topological_order():
    df = _make_chain_df()
    dag = nx.DiGraph()
    dag.add_edge("x0", "x1")
    dag.add_edge("x1", "target")
    dag.add_node("x_noise")

    scm = causal_xai.fit_linear_scm(df, dag)
    assert "x1" in scm and "target" in scm

    instance = df.iloc[0]
    baseline_target = instance["target"]
    intervened = causal_xai.simulate_intervention(df, dag, scm, instance, "x0", intervene_value=5.0)

    assert intervened["x0"] == 5.0
    # x1 and target should both shift meaningfully given the strong positive chain.
    assert intervened["x1"] > instance["x1"]
    assert intervened["target"] > baseline_target


def test_verbalize_explanation_flags_downweighted_features():
    text = causal_xai.verbalize_explanation(
        feature_values={"x1": 1.2, "x_noise": 0.4},
        raw_shap={"x1": 0.5, "x_noise": 0.2},
        causal_shap={"x1": 0.5, "x_noise": 0.06},
        top_n=2,
    )
    assert "x1" in text and "x_noise" in text
    assert "direct causal parent" in text
    assert "reduced from 0.2000 to 0.0600" in text
