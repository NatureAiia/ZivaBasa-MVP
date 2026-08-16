"""
train_causal_xai_model.py — Builds and saves the persisted causal-XAI bundle (src/causal_xai.py's
build_causal_bundle) that api/main.py's /causal/{task}/* endpoints load at request time, so the
(slow) PC causal-discovery search runs once here, not on every API call.

Only tasks with a hand-authored plausibility prior below have a bundle built — same scope
principle as scripts/build_causal_xai_artifact.py (which this supersedes for API-serving
purposes; that script still stands as the one-off DAG-image/example artifact generator for
skill_match specifically). `skills` was added alongside skill_match so EmployeeMirrorView's
scenario slider can offer a real do-calculus intervention (src/causal_xai.py's
simulate_intervention) next to its existing EconML uplift estimate (src/uplift.py) — see that
page's docstring.

Run from backend/: `python scripts/train_causal_xai_model.py`
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import causal_xai  # noqa: E402

# Self-authored plausibility priors (NOT domain-expert-validated — see causal_xai.py's module
# docstring). "child: [expected causal parent(s), if any edge exists between them at all]".
EXPECTED_PARENTS_BY_TASK = {
    "skill_match": {
        "skill_overlap_count": ["recent_training_hours"],
        "missing_skill_count": ["recent_training_hours"],
        "overlap_x_training": ["skill_overlap_count", "recent_training_hours"],
        "target_good_redeployment_match": [
            "skill_overlap_count", "missing_skill_count", "overlap_x_training",
        ],
    },
    "skills": {
        # training_intensity_index = TrainingTimesLastYear / YearsAtCompany (features.py's
        # add_ratio_index_features); training_x_satisfaction = training_intensity_index *
        # JobSatisfaction (add_interaction_features) — both direct derivatives, not independent
        # causes, so their expected parent is the feature(s) they're computed from.
        "training_intensity_index": ["TrainingTimesLastYear", "YearsAtCompany"],
        "training_x_satisfaction": ["training_intensity_index", "JobSatisfaction"],
        "target_attrition": [
            "TrainingTimesLastYear", "JobSatisfaction", "PerformanceRating",
            "YearsAtCompany", "MonthlyIncome", "Age",
            "training_intensity_index", "training_x_satisfaction",
        ],
    },
}


def main():
    for task_name, expected_parents in EXPECTED_PARENTS_BY_TASK.items():
        print(f"\n=== {task_name} ===")
        bundle = causal_xai.build_causal_bundle(task_name, expected_parents=expected_parents)
        path = causal_xai.save_causal_bundle(bundle)
        print(f"Saved causal XAI bundle -> {path}")
        print(f"Discovered edges: {causal_xai.dag_edge_list(bundle['dag'])}")
        print("\nPlausibility sanity check:\n" + bundle["sanity_check"])


if __name__ == "__main__":
    main()
