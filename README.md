# 🕴️🤔 ZivaBasa 😶‍🌫️
### MVP (Kaggle-Data Phase)

**Module:** ZivaBasa (part of the ChiedzaAI platform — jobs, employment, productivity & skills forecasting)
**Phase:** MVP prototype using public Kaggle datasets as a stand-in for real banking-sector data
**Status:** Architecture proof-of-concept, not a real-world findings phase

---

## 1. Purpose of This Phase

This MVP validates the **explainable multi-task deep learning architecture** proposed for ZivaBasa
(shared representation trunk → Employment / Productivity / Skills task heads → SHAP explainability layer)
before real Zimbabwean banking-sector data is available.

**What this phase proves:**
- The multi-task neural network trains and produces sensible per-task predictions
- The feature engineering pipeline (raw → engineered → learned → fusion) works end-to-end
- SHAP explainability runs correctly against a multi-output Keras model
- The MLOps scaffolding (MLflow tracking, reproducible pipeline) is in place

**What this phase does NOT prove:**
- Anything about actual Zimbabwean bank employment/productivity/skills dynamics
- Real predictive accuracy on the target population — Kaggle data is a **proxy**, not ground truth

> ⚠️ Every dataset used here is a substitute for real banking HR/operational/AI-system data.
> All findings from this phase are **methodological**, not empirical. This must be stated
> explicitly in any write-up, thesis chapter, or stakeholder demo that references this phase.

---

## 2. Datasets Used (Proxy Data)

No single Kaggle dataset covers employment + productivity + skills for a banking workforce, so
three datasets are combined, each feeding a different task head. They are **not** the same
population — this is a known limitation, documented, not hidden.

| Task Head | Dataset | Kaggle Source | Proxy Role |
|---|---|---|---|
| Employment / Automation Risk | AI Automation Risk by Job Role | `khushikyad001/ai-automation-risk-by-job-role` | Job-role-level automation exposure |
| Skills / Readiness | IBM HR Analytics Employee Attrition & Performance | `pavansubhasht/ibm-hr-analytics-attrition-dataset` | Training hours, tenure, satisfaction, role, promotion history |
| Productivity / AI Adoption | Future of Work in the Age of AI (2020–2026) | `algozee/future-of-work-in-the-age-of-ai-20202026` | AI adoption level, salary trend, skill gap by industry |

Raw files live in `data/raw/`. Do not edit raw files in place — all cleaning happens in the
feature engineering notebook and writes to `data/processed/`.

---

## 3. Repository Structure

```
zivabasa_mvp/
├── README.md
├── data/
│   ├── raw/                     # untouched Kaggle CSVs
│   └── processed/                # cleaned, feature-engineered outputs
├── notebooks/
│   ├── 01_data_acquisition_eda.ipynb
│   ├── 02_feature_engineering.ipynb
│   ├── 03_baseline_models.ipynb
│   ├── 04_multitask_neural_network.ipynb
│   └── 05_shap_explainability.ipynb
├── src/
│   ├── features.py               # feature engineering functions (raw/ratio/index/interaction)
│   ├── model.py                  # multi-task Keras model definition
│   └── evaluate.py               # metrics + SHAP helpers
├── models/                       # saved .keras models + MLflow artifacts
├── mlruns/                       # MLflow tracking (local)
└── requirements.txt
```

---

## 4. Today's Deliverables (Prediction + Neural Network Notebooks)

Two notebooks are the priority for today:

### `03_baseline_models.ipynb` — Prediction Baselines
- Logistic Regression, Decision Tree, Random Forest, Gradient Boosting — one set per task head
- Metrics: Accuracy, Precision, Recall, F1, ROC-AUC (classification) or RMSE/MAE/R² (regression)
- Purpose: empirical justification for the deep model — if the neural net doesn't beat these,
  that's a real finding to report, not a failure to hide

### `04_multitask_neural_network.ipynb` — Multi-Task Deep Model
- Shared trunk (Dense 256 → BatchNorm → Dropout 0.3 → Dense 128 → Dropout 0.3)
- Three task-specific heads: Employment, Productivity, Skills
- Compile with per-task losses (weighted sum, equal weights as starting point — documented as a
  tunable hyperparameter, not a fixed design choice)
- Callbacks: EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
- Log every run to MLflow: dataset version, feature set, task loss weights, final metrics

Both notebooks must log results to `mlruns/` so today's run is auditable later.

---

## 5. Architecture Reference

```
Input Features (raw + engineered, per task)
        │
Shared Trunk: Dense(256, ReLU) → BatchNorm → Dropout(0.3)
              → Dense(128, ReLU) → Dropout(0.3)
        │
   ┌────┴────┬─────────────┐
   ▼         ▼             ▼
Employment  Productivity  Skills
Head        Head          Head
Dense(64→32)  Dense(64→32)  Dense(64→32)
   │             │             │
Output(1)     Output(1)     Output(1)
```

Feature taxonomy (must match the ChiedzaAI proposal's structure — see `src/features.py`):

| Category | Example (this phase) |
|---|---|
| Raw | age, tenure, training hours, job role, automation exposure score |
| Ratio/Index | Training Hours per Employee, Automation Exposure Index |
| Interaction | Training Investment × Skill Readiness, AI Adoption × Employment Level |
| Learned | shared trunk output (not hand-built) |
| Fusion | concatenated representation feeding the task heads |

---

## 6. Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` should pin: `tensorflow`, `scikit-learn`, `pandas`, `numpy`, `shap`, `mlflow`,
`matplotlib`, `seaborn`.

Run notebooks in order (01 → 05). Each notebook reads from `data/processed/` produced by the
previous one — do not skip 02 (feature engineering) before running 03 or 04.

---

## 7. Known Limitations (Report These, Don't Bury Them)

1. **Cross-dataset alignment** — the three datasets are not from the same population; task heads
   are trained on different samples joined only at the feature-schema level.
2. **No Zimbabwe/banking specificity** — proxy data is US/general-industry; results won't transfer
   directly to the target domain.
3. **No federated learning yet** — this phase runs on a single merged/aligned dataset locally;
   the proposal's privacy-preserving multi-bank federated setup is out of scope until real bank
   partners are onboarded.
4. **Causal-consistent XAI** — this phase implements standard SHAP (associational), not the
   causal-consistent XAI layer described in the proposal. That is a later research milestone.

---

## 8. Next Phase (Not This Sprint)

- Replace proxy datasets with real bank HR/operational/AI-system data once available
- Reconcile the feature dictionary (`src/features.py`) against the real raw feature list in the
  proposal (raw → engineered → learned → fusion taxonomy already matches — swap the data source only)
- Introduce federated learning across participating banks
- Move from SHAP to the causal-consistent XAI layer