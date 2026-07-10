"""
config.py — Single source of truth for the ZivaBasa MVP (Kaggle-Data Phase) pipeline.

Every other module in src/ (features.py, model.py, evaluate.py) imports its task
definitions, paths, and hyperparameters from here. This is what keeps the notebooks
and the src/ package consistent with each other: change a target column, a drop-list,
or a hyperparameter once, here, and every module picks it up.
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Literal

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
# Resolved relative to the project root (parent of src/). Overridable via env vars
# so this works whether called from a notebook (../data/...) or a script run from
# the project root (data/...).
PROJECT_ROOT = os.environ.get(
    "ZIVABASA_PROJECT_ROOT",
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
)
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "data", "processed")
MODELS_DIR = os.path.join(PROJECT_ROOT, "models")
MULTITASK_MODEL_DIR = os.path.join(MODELS_DIR, "multitask_model")
SCALER_DIR = os.path.join(MODELS_DIR, "scalers")
SHAP_DIR = os.path.join(MODELS_DIR, "shap_outputs")
MLRUNS_DIR = os.path.join(PROJECT_ROOT, "mlruns")

for _d in (RAW_DIR, PROCESSED_DIR, MODELS_DIR, MULTITASK_MODEL_DIR, SCALER_DIR, SHAP_DIR):
    os.makedirs(_d, exist_ok=True)

RANDOM_STATE = 42

TaskType = Literal["classification", "regression"]


# --------------------------------------------------------------------------- #
# Task configuration
# --------------------------------------------------------------------------- #
@dataclass
class TaskConfig:
    """Everything that defines one task head, end to end."""
    name: str
    raw_filename: str                  # expected filename in data/raw/
    target: str                        # target column name, set after feature engineering
    task_type: TaskType
    raw_cols: List[str]                # raw columns to carry into the feature matrix
    drop_cols: List[str]               # columns to drop from X before modeling (targets, leaky cols)
    loss_weight: float = 1.0           # multi-task loss weighting (see model.py)


TASK_CONFIGS: Dict[str, TaskConfig] = {
    "employment": TaskConfig(
        name="employment",
        raw_filename="ai_automation_risk_by_job_role.csv",
        target="target_high_automation_risk",
        task_type="classification",
        raw_cols=["job_role", "industry", "automation_risk", "salary", "digital_skill_level"],
        drop_cols=["target_high_automation_risk", "automation_risk", "automation_exposure_index"],
        loss_weight=1.0,
    ),
    "skills": TaskConfig(
        name="skills",
        raw_filename="ibm_hr_attrition.csv",
        target="target_attrition",
        task_type="classification",
        raw_cols=["Age", "JobRole", "Department", "TrainingTimesLastYear", "YearsAtCompany",
                  "MonthlyIncome", "JobSatisfaction", "PerformanceRating", "Attrition"],
        drop_cols=["target_attrition"],
        loss_weight=1.0,
    ),
    "productivity": TaskConfig(
        name="productivity",
        raw_filename="future_of_work_ai_2020_2026.csv",
        target="target_ai_adoption",
        task_type="regression",
        raw_cols=["industry", "ai_adoption_level", "skill_gap_index", "salary_trend"],
        drop_cols=["target_ai_adoption", "ai_adoption_level", "ai_adoption_index"],
        loss_weight=1.0,
    ),
}

TASK_NAMES = list(TASK_CONFIGS.keys())


# --------------------------------------------------------------------------- #
# Feature engineering hyperparameters
# --------------------------------------------------------------------------- #
OUTLIER_LOWER_QUANTILE = 0.01
OUTLIER_UPPER_QUANTILE = 0.99
MAX_ONEHOT_CARDINALITY = 20


# --------------------------------------------------------------------------- #
# Multi-task neural network hyperparameters
# --------------------------------------------------------------------------- #
@dataclass
class ModelConfig:
    latent_dim: int = 64          # common dimension after per-task input adapters
    trunk_dim_1: int = 256
    trunk_dim_2: int = 128
    dropout_rate: float = 0.3
    batch_size: int = 32
    epochs: int = 100
    patience: int = 10             # early stopping patience (epochs)
    lr_patience: int = 5           # ReduceLROnPlateau-style patience
    lr_factor: float = 0.5
    min_lr: float = 1e-6
    initial_lr: float = 1e-3


MODEL_CONFIG = ModelConfig()


# --------------------------------------------------------------------------- #
# SHAP hyperparameters
# --------------------------------------------------------------------------- #
SHAP_N_BACKGROUND = 100
SHAP_N_EXPLAIN = 100
