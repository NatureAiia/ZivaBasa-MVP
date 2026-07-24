"""
causal_xai.py — Causal-consistent XAI spike (Phase 3 of the Next-Gen Architecture reconciliation
plan): causal discovery -> causal-reweighted SHAP -> a simplified do-calculus intervention ->
template-based verbalization.

SCOPED DOWN from the compass doc's full recommended stack, for two concrete reasons (not
discovered mid-implementation, checked before writing any code):

1. **shapr (R-based) was dropped entirely** — no R is installed in this environment, and adding
   an R toolchain for one library violates "don't add new frameworks beyond what's required."
   In its place: a manual causal-reweighting of ordinary SHAP values, inspired directly by the
   2025 IJCNN "Causal SHAP" paper's core idea (down-weight attributions for features that are
   merely correlated with the target rather than direct causal parents in the discovered DAG).
   This is a simplification of Heskes et al.'s causal Shapley values, not a re-implementation.

2. **DoWhy-GCM was dropped too** — `dowhy` pulls in `cvxpy`/`numba`, which (like
   `causal-learn`'s own unpinned `numpy` requirement) risk silently upgrading numpy past the
   `tensorflow==2.16.1`/Keras-3 ceiling this whole project depends on (verified: `pip install
   causal-learn dowhy` resolved to numpy 2.4.6 before this was caught). In its place: a linear
   structural-causal-model approximation (`simulate_intervention`) — fits one linear regression
   per node on its discovered causal parents, then propagates a hypothetical intervention
   through the topological order. This is Pearl's do-calculus in its simplest linear-SCM form,
   not DoWhy-GCM's general nonlinear/nonparametric machinery.

Data caveat (stated per the checklist's own gate, Section 4): causal discovery here runs over
Kaggle-proxy/synthetic engineered features, not real bank data, and the "plausibility sanity
check" is self-authored reasoning about known feature semantics, NOT a domain-expert-validated
causal graph. Treat every DAG this module produces as illustrative of the *mechanism*, not a
validated claim about real banking-sector causal structure.
"""
from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional, Tuple

import joblib
import networkx as nx
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

from . import config, evaluate, features

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# 1. Causal discovery (causal-learn's PC algorithm)
# --------------------------------------------------------------------------- #
def discover_dag(df: pd.DataFrame, alpha: float = 0.05) -> nx.DiGraph:
    """Runs the PC (Peter-Clark) constraint-based algorithm over df's columns and returns a
    networkx.DiGraph of only the edges PC oriented with a definite direction. PC's output is
    technically a CPDAG (some edges may be left undirected, representing "could be either way
    given the data") — undirected edges are dropped here rather than arbitrarily oriented,
    since a wrongly-oriented edge is worse for downstream reweighting than a missing one.
    """
    from causallearn.search.ConstraintBased.PC import pc

    columns = list(df.columns)
    X = df[columns].to_numpy(dtype="float64")
    cg = pc(X, alpha=alpha, show_progress=False)

    dag = nx.DiGraph()
    dag.add_nodes_from(columns)

    graph = cg.G.graph  # causal-learn's adjacency encoding: graph[i, j] == -1 and
                         # graph[j, i] == 1 means an edge j -> i (see causal-learn's GraphClass)
    n = len(columns)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if graph[i, j] == -1 and graph[j, i] == 1:
                dag.add_edge(columns[j], columns[i])  # j -> i

    return dag


def dag_edge_list(dag: nx.DiGraph) -> List[Tuple[str, str]]:
    return list(dag.edges())


# --------------------------------------------------------------------------- #
# 2. Plausibility sanity check — self-authored, NOT domain-expert-validated (see module
#    docstring). Checks discovered edges against a small table of directionally-expected
#    relationships based on known feature semantics (e.g. "training causes skill match", not
#    the reverse), and flags edges that contradict that expectation as surprising.
# --------------------------------------------------------------------------- #
def plausibility_sanity_check(
    dag: nx.DiGraph, expected_parents: Dict[str, List[str]]
) -> str:
    """expected_parents: {child_feature: [features expected to be its causal parent, if any
    edge is discovered between them at all]} — a hand-authored prior, not derived from data.
    Returns a one-paragraph plain-text summary: how many discovered edges matched the prior,
    how many contradicted it (child before parent), and how many involve pairs with no stated
    prior at all (neither confirmed nor contradicted)."""
    edges = dag_edge_list(dag)
    matched, contradicted, no_prior = [], [], []

    for parent, child in edges:
        expected = expected_parents.get(child, [])
        reverse_expected = expected_parents.get(parent, [])
        if parent in expected:
            matched.append((parent, child))
        elif child in reverse_expected:
            contradicted.append((parent, child))
        else:
            no_prior.append((parent, child))

    summary = (
        f"Discovered {len(edges)} directed edge(s) over {dag.number_of_nodes()} features. "
        f"{len(matched)} matched the hand-authored plausibility prior "
        f"({matched if matched else 'none'}); {len(contradicted)} ran opposite to the prior's "
        f"expected direction ({contradicted if contradicted else 'none'}) and should be treated "
        f"as either a real, surprising finding worth domain-expert review or a discovery-noise "
        f"artifact of the small proxy dataset — not distinguishable from PC alone; "
        f"{len(no_prior)} edge(s) involve a feature pair with no stated prior either way "
        f"({no_prior if no_prior else 'none'}). This is a plausibility check against "
        f"self-authored expectations, NOT a domain-expert-validated causal claim — see module "
        f"docstring and checklist Section 4's gating note."
    )
    return summary


# --------------------------------------------------------------------------- #
# 3. Causal-reweighted SHAP (Causal-SHAP-paper-inspired simplification — see module docstring)
# --------------------------------------------------------------------------- #
def causal_reweight_shap(
    shap_values: np.ndarray,
    feature_names: List[str],
    target_name: str,
    dag: nx.DiGraph,
    downweight_factor: float = 0.3,
) -> Dict[str, float]:
    """Down-weights the SHAP value of any feature that is NOT a direct causal parent of
    target_name in the discovered DAG (i.e. it's a descendant, an unconnected node, or only
    connected via some other feature) by downweight_factor. Features that ARE direct causal
    parents keep their full SHAP value. This is the core Causal SHAP idea in its simplest
    form: ordinary SHAP can't distinguish "this feature is genuinely upstream of the outcome"
    from "this feature merely moves together with something that is" — direct causal parents
    in a discovered DAG give one (imperfect, discovery-dependent) way to make that distinction.

    Returns {feature_name: reweighted_shap_value} for one instance's SHAP row.
    """
    direct_parents = set(dag.predecessors(target_name)) if target_name in dag else set()
    reweighted = {}
    for name, value in zip(feature_names, shap_values):
        reweighted[name] = float(value) if name in direct_parents else float(value) * downweight_factor
    return reweighted


# --------------------------------------------------------------------------- #
# 4. Simplified do-calculus (linear-SCM approximation — see module docstring for why this
#    stands in for DoWhy-GCM's general nonlinear machinery)
# --------------------------------------------------------------------------- #
def fit_linear_scm(df: pd.DataFrame, dag: nx.DiGraph) -> Dict[str, LinearRegression]:
    """One linear regression per node, predicting it from its discovered causal parents.
    Root nodes (no parents) have no fitted model — their value is taken as given/exogenous
    during an intervention."""
    models = {}
    for node in dag.nodes():
        parents = list(dag.predecessors(node))
        if not parents:
            continue
        reg = LinearRegression()
        reg.fit(df[parents].to_numpy(), df[node].to_numpy())
        models[node] = reg
    return models


def simulate_intervention(
    df: pd.DataFrame,
    dag: nx.DiGraph,
    scm: Dict[str, LinearRegression],
    instance: pd.Series,
    intervene_feature: str,
    intervene_value: float,
) -> pd.Series:
    """Pearl's do-calculus, linear-SCM special case: do(intervene_feature := intervene_value),
    then propagate through the DAG's topological order, recomputing every downstream node from
    its (possibly-intervened) parents via the fitted linear model. Upstream/unrelated nodes are
    left at their observed value in `instance` — an intervention doesn't affect a variable's own
    causes, only its effects (this is exactly what distinguishes do(X:=x) from conditioning on
    X=x, which DOES update beliefs about X's causes)."""
    result = instance.copy()
    result[intervene_feature] = intervene_value

    for node in nx.topological_sort(dag):
        if node == intervene_feature:
            continue
        parents = list(dag.predecessors(node))
        if not parents or node not in scm:
            continue
        parent_values = np.asarray([[result[p] for p in parents]])
        result[node] = float(scm[node].predict(parent_values)[0])

    return result


# --------------------------------------------------------------------------- #
# 5. Template-based verbalization — numeric-first, deterministic, NO LLM call. Per the compass
#    doc's own recommendation, this is the always-available fallback for when no LLM tier is
#    configured (no ANTHROPIC_API_KEY etc. required to run this module or its artifact script).
# --------------------------------------------------------------------------- #
def verbalize_explanation(
    feature_values: Dict[str, float],
    raw_shap: Dict[str, float],
    causal_shap: Dict[str, float],
    top_n: int = 5,
) -> str:
    """Ranks features by |raw_shap|, then narrates each one's raw vs. causally-reweighted
    contribution in a fixed sentence template — never invents a reason beyond the numbers."""
    ranked = sorted(raw_shap.items(), key=lambda kv: abs(kv[1]), reverse=True)[:top_n]
    lines = []
    for name, raw_val in ranked:
        causal_val = causal_shap.get(name, raw_val)
        direction = "increased" if raw_val >= 0 else "decreased"
        if abs(causal_val - raw_val) < 1e-9:
            note = "this feature is a direct causal parent of the target in the discovered DAG, so its weight is unchanged."
        else:
            note = (
                f"this feature is not a direct causal parent of the target in the discovered DAG, "
                f"so its raw SHAP weight was reduced from {raw_val:.4f} to {causal_val:.4f} — it may "
                f"still matter, but more of its apparent effect could be correlation with an "
                f"upstream cause rather than a direct effect of its own."
            )
        lines.append(
            f"- {name} (value={feature_values.get(name, float('nan')):.3f}) {direction} the "
            f"prediction; raw SHAP={raw_val:.4f}, causally-reweighted SHAP={causal_val:.4f}. {note}"
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# 6. Persisted bundle — mirrors src/uplift.py's train/save/load shape. Causal discovery (PC
#    algorithm) is the slow step here; running it per-request would make every explain/intervene
#    call pay that cost, so it's done once (this bundle) and reused, same as uplift's trained
#    CausalForestDML or model_registry's loaded Keras models.
# --------------------------------------------------------------------------- #
CAUSAL_XAI_DIR = os.path.join(config.MODELS_DIR, "causal_xai")


def build_causal_bundle(
    task_name: str,
    expected_parents: Optional[Dict[str, List[str]]] = None,
    alpha: float = 0.05,
) -> Dict:
    """Runs PC discovery + fits the linear-SCM once for task_name, over the same processed/
    scaled feature matrix model_registry.py's TaskArtifacts already trains on (see that module's
    ModelRegistry.load_all) — so a bundle's `dag`/`scm` operate in the SAME standardized units a
    caller's already-scaled feature vector is in, no separate scaling step needed here."""
    df = features.load_processed(task_name)
    if df is None:
        raise RuntimeError(f"[{task_name}] no processed features found — run features.run_pipeline first.")
    splits = evaluate.make_splits(df, task_name, val_split=False)
    feature_names = splits["feature_names"]
    target_col = config.TASK_CONFIGS[task_name].target

    discovery_df = pd.DataFrame(splits["X_train"], columns=feature_names).astype("float64")
    discovery_df[target_col] = np.asarray(splits["y_train"]).astype("float64")

    logger.info("[%s] running PC algorithm over %d columns, %d rows...", task_name, discovery_df.shape[1], len(discovery_df))
    dag = discover_dag(discovery_df, alpha=alpha)
    sanity_check = plausibility_sanity_check(dag, expected_parents or {})
    scm = fit_linear_scm(discovery_df, dag)

    return {
        "task_name": task_name,
        "feature_names": feature_names,
        "target_col": target_col,
        "dag": dag,
        "scm": scm,
        "discovery_df": discovery_df,
        "sanity_check": sanity_check,
    }


def save_causal_bundle(bundle: Dict, directory: str = CAUSAL_XAI_DIR) -> str:
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, f"{bundle['task_name']}_causal_bundle.pkl")
    joblib.dump(bundle, path)
    logger.info("Causal XAI bundle saved -> %s", path)
    return path


def load_causal_bundle(task_name: str, directory: str = CAUSAL_XAI_DIR) -> Dict:
    path = os.path.join(directory, f"{task_name}_causal_bundle.pkl")
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No saved causal XAI bundle for '{task_name}' at {path}. Run scripts/train_causal_xai_model.py first."
        )
    return joblib.load(path)


# --------------------------------------------------------------------------- #
# 7. Per-instance API helpers — combine a cached bundle with one live prediction/SHAP result.
#    `scaled_features` must already be in the bundle's standardized units (i.e. the same array
#    api/model_registry.py's TaskArtifacts.transform() produces) — these helpers do no scaling
#    of their own.
# --------------------------------------------------------------------------- #
def explain_instance(
    bundle: Dict,
    scaled_features: np.ndarray,
    raw_shap_values: np.ndarray,
) -> Dict:
    """Causal-reweights one instance's already-computed ordinary SHAP values against the
    bundle's cached DAG, and verbalizes the raw-vs-causal comparison. Returns
    {feature: raw_shap}, {feature: causal_shap}, the set of the target's direct causal parents,
    and the template-based verbalization text."""
    feature_names = bundle["feature_names"]
    target_col = bundle["target_col"]
    dag = bundle["dag"]

    feature_values = dict(zip(feature_names, np.atleast_1d(scaled_features).tolist()))
    raw_shap = dict(zip(feature_names, np.atleast_1d(raw_shap_values).tolist()))
    causal_shap = causal_reweight_shap(raw_shap_values, feature_names, target_col, dag)
    verbalization = verbalize_explanation(feature_values, raw_shap, causal_shap)
    direct_parents = list(dag.predecessors(target_col)) if target_col in dag else []

    return {
        "raw_shap": raw_shap,
        "causal_shap": causal_shap,
        "direct_causal_parents": direct_parents,
        "verbalization": verbalization,
    }


def intervene_instance(
    bundle: Dict,
    scaled_features: np.ndarray,
    prediction: float,
    intervene_feature: str,
    intervene_value: float,
) -> Dict:
    """Runs simulate_intervention() for one instance: do(intervene_feature := intervene_value),
    propagated through the bundle's cached DAG/SCM. `prediction` is the model's own output for
    this instance, plugged in as the target column's pre-intervention observed value.
    `intervene_value` must already be in the bundle's standardized units, same as
    scaled_features."""
    feature_names = bundle["feature_names"]
    target_col = bundle["target_col"]
    dag = bundle["dag"]
    scm = bundle["scm"]
    discovery_df = bundle["discovery_df"]

    if intervene_feature not in dag:
        raise ValueError(
            f"'{intervene_feature}' is not a feature in this task's discovered causal DAG. "
            f"Known features: {feature_names}."
        )

    instance = pd.Series(dict(zip(feature_names, np.atleast_1d(scaled_features).tolist())))
    instance[target_col] = float(prediction)

    intervened = simulate_intervention(
        discovery_df, dag, scm, instance, intervene_feature, intervene_value,
    )

    downstream_effects = {}
    for node in nx.descendants(dag, intervene_feature):
        if node == target_col or node not in scm:
            continue
        downstream_effects[node] = {
            "before": float(instance.get(node, float("nan"))),
            "after": float(intervened[node]),
        }

    return {
        "predicted_target_before": float(instance[target_col]),
        "predicted_target_after": float(intervened[target_col]),
        "downstream_effects": downstream_effects,
    }
