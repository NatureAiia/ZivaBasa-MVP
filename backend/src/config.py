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
FORECAST_MODEL_DIR = os.path.join(MODELS_DIR, "forecast")

for _d in (RAW_DIR, PROCESSED_DIR, MODELS_DIR, MULTITASK_MODEL_DIR, SCALER_DIR, SHAP_DIR, FORECAST_MODEL_DIR):
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
        # Matches the REAL khushikyad001/ai-automation-risk-by-job-role schema (confirmed
        # against the actual downloaded CSV — the dataset is job-role-level, not employee-level,
        # so there's no per-employee "digital_skill_level"; ai_tool_maturity_score / task_repetition_level /
        # skill_complexity_score are the closest analogues and are used in the engineered features below).
        raw_cols=["job_role", "industry", "avg_salary_usd", "automation_risk_score",
                  "ai_tool_maturity_score", "task_repetition_level", "skill_complexity_score",
                  "training_hours_needed", "job_demand_index", "percent_tasks_automatable"],
        # NOTE: exposure_x_skill_complexity is dropped too, not just automation_risk_score and
        # automation_exposure_index — it's a direct multiplicative derivative of
        # automation_exposure_index (which is itself a monotonic transform of the raw target
        # source), so it inherits most of that signal. Confirmed via correlation check: this
        # interaction feature alone correlated ~0.49 with the target even on synthetic random
        # data. It stays in data/processed/ (documented in the feature dictionary) but must be
        # excluded from the modeling matrix for THIS task.
        drop_cols=["target_high_automation_risk", "automation_risk_score",
                   "automation_exposure_index", "exposure_x_skill_complexity"],
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
        # NOTE (found while wiring ai_adoption_x_labour_cost_trend below): raw_cols previously
        # listed "salary_trend", which does not exist in the real
        # ai_job_replacement_2020_2026_v2.csv schema — it was being silently dropped by
        # select_raw's `if c in df.columns` filter (features.py) every run, with only a WARNING
        # log to show for it. The real column is salary_change_percent (% change in salary,
        # the actual labour-cost-trend field this dataset provides). Fixed here.
        raw_cols=["industry", "ai_adoption_level", "skill_gap_index", "salary_change_percent"],
        # ai_adoption_x_labour_cost_trend is dropped too, not just ai_adoption_index — it's a
        # direct multiplicative derivative of ai_adoption_index (= target_ai_adoption), so it
        # inherits the same leakage employment's exposure_x_skill_complexity was excluded for.
        # Stays in data/processed/ (documented in the feature dictionary) but excluded from the
        # modeling matrix for THIS task.
        drop_cols=["target_ai_adoption", "ai_adoption_level", "ai_adoption_index",
                   "ai_adoption_x_labour_cost_trend"],
        loss_weight=1.0,
    ),
    "skill_match": TaskConfig(
        name="skill_match",
        raw_filename="bank_skill_matching.csv",
        target="target_good_redeployment_match",
        task_type="classification",
        # Synthetic banking-sector fixture (Shift Intelligence integration) — see
        # scripts/generate_skill_match_fixture.py and src/skill_matching.py for provenance.
        # current_skills/required_skills are free-text skill-tag lists; they're consumed into
        # numeric cosine_similarity_score / skill_overlap_count / missing_skill_count by
        # add_skill_match_features() in features.py and dropped before modeling, same as any
        # other raw_cols entry that only exists to feed a derived feature.
        raw_cols=["department", "current_role", "target_department", "target_role",
                  "current_skills", "required_skills", "seniority_years",
                  "recent_training_hours", "performance_rating", "avg_salary_usd",
                  "recent_ot_hours"],
        # cosine_similarity_score is dropped too, not just the target — same leakage logic as
        # employment's automation_risk_score: target_good_redeployment_match is a direct
        # quantile threshold of cosine_similarity_score, so leaving it in the modeling matrix
        # would let the model trivially memorize the threshold instead of learning from the
        # underlying staff/role features. training_x_skill_readiness inherits the same leakage
        # (it's a multiplicative derivative of cosine_similarity_score) and is dropped for the
        # same reason.
        drop_cols=["target_good_redeployment_match", "cosine_similarity_score",
                   "training_x_skill_readiness"],
        loss_weight=1.0,
    ),
    "human_capital": TaskConfig(
        name="human_capital",
        raw_filename="human_capital.csv",
        target="target_turnover",
        task_type="classification",
        # Real HR data (HRDataset_v14 shape), not a proxy — see
        # data/schema/human_capital_dictionary.md for the full column mapping, confirmed-
        # missing fields (training_hours_ytd/revenue_attributed/promotion_count don't exist in
        # this file), and the join-strategy note (row-aligned on EmpID, schema-level only vs.
        # skill_match). Its own task head (5th adapter into the shared trunk), not blended into
        # employment/skills — the architecture has no row-alignment across datasets, so there's
        # no mechanism for one CSV to "feed" another head; skill_match set this precedent.
        #
        # DateofHire is consumed into tenure_years by add_ratio_index_features and dropped
        # there (same pattern skill_match uses for current_skills/required_skills) — never
        # carried into the modeling matrix as a raw date string.
        #
        # EmploymentStatus/TermReason/DateofTermination are deliberately NOT selected at all,
        # not selected-then-dropped: DateofTermination is non-null iff the employee is
        # terminated (i.e. it IS target_turnover in date form), and EmploymentStatus/TermReason
        # are the same label spelled out in words. Selecting any of them would be a stronger,
        # more direct leak than the interaction-feature leaks already documented for the other
        # three tasks (bug 9.2), so they're excluded from raw_cols from the start.
        raw_cols=["Department", "Position", "PayRate", "PerformanceScore", "PerfScoreID",
                  "EngagementSurvey", "EmpSatisfaction", "SpecialProjectsCount",
                  "DaysLateLast30", "DateofHire", "Termd"],
        # Termd is the direct source of target_turnover (copied 1:1) — same leakage logic as
        # employment's automation_risk_score -> target_high_automation_risk. Dropped post-target.
        drop_cols=["target_turnover", "Termd"],
        loss_weight=1.0,
    ),
}

TASK_NAMES = list(TASK_CONFIGS.keys())

HUMAN_CAPITAL_RAW_FILENAME = "human_capital.csv"
HUMAN_CAPITAL_REQUIRED_COLUMNS = ["EmpID"]  # join key — hard-fail if absent, see load_human_capital.py
HUMAN_CAPITAL_EXPECTED_COLUMNS = [
    "EmpID", "Department", "Position", "PositionID", "DeptID",
    "DateofHire", "DateofTermination", "Termd", "EmploymentStatus", "TermReason",
    "PayRate", "PerformanceScore", "PerfScoreID", "EngagementSurvey", "EmpSatisfaction",
    "SpecialProjectsCount", "LastPerformanceReview_Date", "DaysLateLast30",
]
# Confirmed absent from this file — see data/schema/human_capital_dictionary.md
# "Confirmed-missing fields". Do not add these to raw_cols or synthesize them from other
# columns without documenting the substitution the way employment/productivity do.
HUMAN_CAPITAL_MISSING_FIELDS = ["training_hours_ytd", "revenue_attributed", "promotion_count"]
# Fixed snapshot date for tenure_years, not "today" — LastPerformanceReview_Date (the most
# recent activity in the file) tops out at 2019-02-28, so treating the file as a 2019-03-01
# snapshot keeps tenure_years reproducible across runs instead of silently drifting with
# whatever date the pipeline happens to execute on.
HUMAN_CAPITAL_REFERENCE_DATE = "2019-03-01"


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


# --------------------------------------------------------------------------- #
# Multi-year workforce forecasting (Day 11 — LSTM/GRU time-series head)
# --------------------------------------------------------------------------- #
@dataclass
class ForecastConfig:
    """
    Multi-year workforce forecasting is the one task head that isn't a per-row
    prediction — it forecasts *industry-level trends forward in time*, so it gets its
    own config shape rather than reusing TaskConfig (no per-row target/drop_cols; the
    "rows" here are (industry, year) aggregates, and the "target" is next-year values
    for several metrics at once).

    Data: the same ai_job_replacement_2020_2026_v2.csv backing the productivity task
    already carries a real `year` column (2020-2026) — the only raw dataset in this
    project with any time dimension. It's cross-sectional per row (no employee/job_id
    repeats across years), so per-entity sequences aren't available; industry-level
    yearly averages are, which is what this aggregates into a 7-point-per-industry panel.
    """
    raw_filename: str = "ai_job_replacement_2020_2026_v2.csv"
    group_col: str = "industry"
    year_col: str = "year"
    metrics: List[str] = field(default_factory=lambda: [
        "automation_risk_percent", "ai_adoption_level", "skill_gap_index",
    ])
    window_size: int = 3            # look-back years fed to the LSTM/GRU per training example
    default_horizon: int = 3        # years forecast forward by default (e.g. 2027-2029 off a 2026 panel)
    max_horizon: int = 5            # hard cap — recursive forecasting compounds error past this
    rnn_type: str = "lstm"          # "lstm" or "gru" — see model.py's build_forecast_model
    rnn_units: int = 32
    embedding_dim: int = 8          # industry-identity embedding, concatenated with the RNN output
    dropout_rate: float = 0.2
    batch_size: int = 16
    epochs: int = 200
    patience: int = 20              # short series -> needs more patience than the per-row tasks
    initial_lr: float = 1e-3


FORECAST_CONFIG = ForecastConfig()
