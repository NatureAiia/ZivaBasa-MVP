"""
train_uplift_model.py — Trains and saves the causal/uplift model (src/uplift.py) for the
flagship attrition-risk use case (demo-readiness Phase B).

Run from backend/: `python scripts/train_uplift_model.py`
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import uplift  # noqa: E402


def main():
    bundle = uplift.train_uplift_model("skills")
    path = uplift.save_uplift_model(bundle)
    print(f"Saved uplift model -> {path}")
    print(f"Treatment: {bundle['treatment_feature']}")
    print(f"Confounders: {bundle['confounder_features']}")


if __name__ == "__main__":
    main()
