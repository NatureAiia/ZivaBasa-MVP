# Dissertation Pre-Proposal

**Title:** Evaluating Multimodal Feature Fusion with TimesFM for Fair and Accurate Workforce Performance Forecasting in a Selected Zimbabwean Commercial Bank

**Candidate:** [Name] | **Programme:** [Degree / Institution] | **Supervisor (proposed):** [Name] | **Date:** [Date]

---

## 1. Background and Problem Statement

Zimbabwean commercial banks are digitising quickly (mobile banking, agent networks, automated credit scoring), and workforce planning has not kept pace. Branch and department managers still forecast staff performance and productivity from periodic appraisals and spreadsheets, which are retrospective and subjective. These methods are weakest where the stakes are highest: promotion, redeployment, retrenchment, and training investment.

Machine learning can improve this, but two gaps remain.

1. **Accuracy gap.** Banks hold several kinds of signal about an employee: structured HR attributes (tenure, grade, pay), time-ordered performance and productivity histories, and unstructured text such as appraisal comments and skills profiles. Most workforce models use only the tabular part. Where history is used, series are short (annual or quarterly) and a bank rarely has enough data to train a deep temporal model from scratch.
2. **Fairness gap.** Performance forecasts feed people decisions. A model that is accurate on average but systematically under-predicts for one gender, age band, branch type (urban vs. rural) or contract type can entrench disadvantage. Fairness evaluation of workforce-forecasting models in African banking contexts is almost absent from the literature.

Time-series foundation models (TimesFM, Chronos) are pretrained on large corpora and forecast zero-shot or with light fine-tuning. This makes them a plausible answer to the short-history problem, but it is unknown whether they help when combined with tabular and text features, and whether they change fairness outcomes.

**Problem statement:** It is not established whether fusing multimodal workforce features (tabular, temporal, textual) with a pretrained time-series foundation model, TimesFM, yields forecasts of employee performance that are both more accurate and fairer than conventional approaches in a Zimbabwean commercial bank.

## 2. Aim, Objectives and Research Questions

**Aim.** To design, build and evaluate, in a real Zimbabwean commercial bank, a workforce-intelligence platform whose forecasting model fuses multimodal features with TimesFM to produce fair and accurate performance forecasts.

**Objectives**

1. **Platform:** To design and develop a production-grade workforce-intelligence platform (data ingestion, secure storage, model serving, explainability, and a manager/HR dashboard) that integrates with the bank's HR and operational data sources.
2. **Model:** To build and train a TimesFM-based multimodal feature-fusion forecaster (tabular, temporal, textual) and compare early, late and intermediate fusion against statistical, gradient-boosted and deep-learning baselines.
3. **Real-environment evaluation:** To deploy the platform in the selected bank and evaluate it on real employee data and with real users, measuring:
   - forecast accuracy under rolling-origin backtests and a forward (live) pilot period;
   - fairness across gender, age band, grade and branch type;
   - explainability, usability and operational fit as judged by HR and line managers.
4. To review the literature on workforce analytics, time-series foundation models, multimodal fusion and algorithmic fairness in HR settings (foundation for 1–3).

**Research questions**

- **RQ1.** Does adding tabular and textual modalities to a TimesFM forecast improve accuracy over TimesFM alone and over trained baselines on real bank data?
- **RQ2.** Which fusion strategy gives the best accuracy-fairness trade-off?
- **RQ3.** Do forecast errors differ systematically across protected and operational groups, and can mitigation reduce this without material accuracy loss?
- **RQ4.** Can the platform be deployed within a bank's security, governance and workflow constraints, and do HR users find the explained forecasts useful and trustworthy?

## 3. Preliminary Work: ZivaBasa, a Prototype Built From Scratch

Before this proposal I built **ZivaBasa**, a working end-to-end workforce-intelligence prototype (module of a wider "ChiedzaAI" platform). It was built to de-risk the engineering and methodology while real bank data is being negotiated. It is evidence that the proposed framework is implementable, not a source of empirical findings.

### 3.1 How it was built

The project grew in stages over roughly [N] months in a public repository (about 120 commits):

| Stage | What was done |
|---|---|
| **1. Data and EDA** | Assembled public proxy datasets, since no single dataset covers a banking workforce: AI-automation risk by job role, IBM HR Analytics attrition/performance, a "Future of Work in the Age of AI" industry panel (2020–2026), an HR roster of 3,310 employees, and a synthetic banking roster for skill matching. Six notebooks cover EDA, feature engineering, baselines, multitask network, SHAP and a sanity check. |
| **2. Feature engineering** | A pipeline (`src/features.py`) producing a taxonomy of raw, ratio/index, interaction, learned and fusion features, with explicit leakage-column removal per task. |
| **3. Modelling** | Scikit-learn/XGBoost baselines, then a multitask Keras network (shared trunk with Employment, Skills and Productivity heads). Later extensions: skill-match task, a piecewise-layered-extraction variant, uplift modelling, a federated-learning simulation, and drift baselines. |
| **4. Time-series forecasting** | LSTM/GRU and TSMixer forecasters over an 8-industry × 7-year panel, with MC-dropout uncertainty, plus a **zero-shot Chronos-2** forecaster as a cold-start fallback and a held-out-final-year backtest comparing all three. This is the direct precursor of the TimesFM work proposed here. |
| **5. Explainability** | SHAP (KernelExplainer, chosen after a Keras 3 / SHAP incompatibility with GradientExplainer), LIME, and an early causal-XAI artefact. |
| **6. Product layer** | FastAPI service (predict, explain, schema, batch CSV scoring, LLM chat with tool calls, report export) and a React/Vite dashboard. |
| **7. Platform hardening** | Migration from a hosted backend-as-a-service to self-hosted PostgreSQL with Alembic migrations and custom JWT authentication, token/usage accounting, PII redaction before LLM calls, ~35 automated test modules, CI, scheduled retraining with promotion reports, and a cPanel/PM2 deployment pipeline. |

Architecture and requirements are documented in `docs/ARCHITECTURE.md` and `docs/BRD.md`.

### 3.2 What the prototype showed, and its limits

I report these honestly because they shape the research design.

- **Pipeline feasibility is demonstrated:** raw data → engineered features → model → SHAP explanation → API → dashboard works end to end.
- **Predictive results on proxy data are weak** for some heads (e.g. employment ROC-AUC ≈ 0.42 and productivity R² ≈ −0.02 in the saved metrics; skill-match ROC-AUC ≈ 0.97 on a synthetic fixture). This is expected when heads are trained on unrelated datasets joined only at schema level, and it motivates the need for real, aligned, per-employee longitudinal data.
- **No fairness evaluation has yet been done**, and no Zimbabwean or banking-specific data has been used. Both are central gaps this dissertation addresses.
- **TimesFM has not yet been used.** The prototype uses Chronos-2 as a foundation-model precedent; the dissertation will evaluate TimesFM, and may report Chronos-2 as a comparator.

## 4. Literature Context (to be expanded)

- **Time-series foundation models:** TimesFM (Das et al., 2024) is a decoder-only transformer pretrained on a large time-series corpus with strong zero-shot forecasts; Chronos (Ansari et al., 2024) tokenises series for language-model-style forecasting. Evidence comes mostly from generic benchmarks (energy, retail, web traffic), not HR data.
- **Multimodal fusion:** early, late and intermediate fusion taxonomies (Baltrušaitis et al., 2019). Multitask learning with shared representations (Caruana, 1997) underlies my prototype.
- **Fairness:** group-fairness criteria such as equalised odds / equality of opportunity (Hardt et al., 2016); surveys of bias and mitigation (Mehrabi et al., 2021). Regression-fairness (error parity across groups) is less mature than classification fairness and needs care here.
- **Explainability:** SHAP (Lundberg & Lee, 2017); foundation models are black boxes, so explanation must be done at the fusion layer and by counterfactual perturbation.
- **Regional context:** workforce analytics and bank digitalisation in Zimbabwe and sub-Saharan Africa. This literature is thin, which is part of the contribution.

*(All citations above must be verified and formatted in the required style before submission.)*

## 5. Proposed Methodology

**Design.** Design Science Research (build an artefact, then evaluate it) with a quantitative experimental core, run as a single-case study in a selected Zimbabwean commercial bank ([name withheld/TBC]). Three phases mirror the objectives:

1. **Build the platform** (iterative, with bank IT and HR as stakeholders): requirements, architecture, security review, integration with HR/operational systems, and deployment inside or alongside the bank's infrastructure.
2. **Build the model:** offline training and benchmarking on historical bank data.
3. **Evaluate in situ:** a shadow-mode pilot in which forecasts run on live data without driving any decision, followed by structured user evaluation (interviews, a usability instrument such as SUS, and a trust/usefulness survey) with HR staff and line managers.

**Data.** Monthly or quarterly per-employee records over [3–5] years:
- *Temporal:* KPI attainment, sales/transaction volumes, attendance, task throughput.
- *Tabular:* tenure, grade, department, branch, training hours, demographics (for fairness auditing only, not as model inputs, with a proxy-leakage check).
- *Textual:* appraisal comments and skills descriptions, embedded with a sentence encoder.

**Target.** Next-period performance score or productivity index per employee.

**Models compared**
1. Statistical baselines (naïve, seasonal naïve, ARIMA/ETS).
2. Gradient boosting (XGBoost/LightGBM) on tabular lags.
3. Trained deep baselines (LSTM/GRU, TSMixer) carried over from the prototype.
4. TimesFM zero-shot.
5. TimesFM with fine-tuning or covariate adapters.
6. **Proposed:** TimesFM temporal embedding fused with tabular and text embeddings under early, late and intermediate (learned) fusion.

**Evaluation**
- *Accuracy:* MAE, RMSE, MASE, and probabilistic metrics (CRPS, interval coverage), using rolling-origin backtests with strict no-lookahead splits.
- *Fairness:* error parity (MAE/bias gap) across gender, age band, grade and branch type; for classification of "under-performance", equalised odds. Mitigation via reweighing and post-hoc adjustment.
- *Explainability:* SHAP over fused features, modality ablations, and a small usability evaluation with HR practitioners.
- *Statistics:* paired tests (e.g. Diebold–Mariano) with confidence intervals; ablations isolating each modality.

**Reproducibility.** The ZivaBasa codebase (feature pipeline, backtest harness, API) is reused so every experiment is scripted, versioned and tested.

**Fallback if real data is delayed.** Use the public HR roster and industry panels, plus synthetic longitudinal data constructed to include known bias patterns, to validate the fairness pipeline. Claims would then be methodological only, as the prototype already states.

## 6. Ethical and Data-Protection Considerations

- Institutional ethics approval and written bank consent before data access.
- Compliance with Zimbabwe's Cyber and Data Protection Act (2021); anonymisation or pseudonymisation at source, data kept on bank-approved infrastructure, minimum necessary fields.
- Protected attributes used only to audit fairness; no individual-level decisions made from model output. Forecasts are decision support, not automated employment decisions.
- Personal data is never sent to third-party LLM APIs (the prototype already redacts PII before any LLM call).
- Risk of re-identification in a small single-bank sample will be assessed and reported.

## 7. Expected Contributions

1. **Empirical:** first evidence on whether TimesFM plus multimodal fusion improves workforce performance forecasts in a Zimbabwean bank.
2. **Methodological:** a fairness-aware evaluation protocol for workforce forecasting with error-parity metrics.
3. **Artefact:** a deployed, tested workforce-intelligence platform (evolved from ZivaBasa) with evidence from a real bank environment, which others can extend.

## 8. Risks and Limitations

- Access to real bank data, and approval to deploy on bank systems, may be delayed or restricted (mitigated by the fallback in §5 and by a deployment option that runs on bank-approved hardware).
- Single-bank case limits generalisability; findings will be framed as an exploratory case study.
- Short histories and small headcount may limit statistical power for subgroup fairness analysis.
- TimesFM is pretrained on non-HR data; domain shift may weaken zero-shot performance.
- Fairness metrics can conflict with each other and with accuracy; the trade-off will be reported, not hidden.

## 9. Indicative Timeline

| Months | Activity |
|---|---|
| 1–3 | Literature review; ethics and data-access approval; requirements gathering with the bank |
| 4–6 | Platform build and integration; data acquisition, anonymisation; baselines |
| 7–9 | TimesFM and fusion experiments; fairness audit and mitigation |
| 10–12 | Deployment and shadow-mode pilot in the bank; user evaluation |
| 13–15 | Analysis, writing, supervisor review, submission |

## 10. Preliminary References (verify before use)

- Ansari, A. F. et al. (2024). *Chronos: Learning the Language of Time Series.* TMLR.
- Baltrušaitis, T., Ahuja, C., & Morency, L.-P. (2019). Multimodal Machine Learning: A Survey and Taxonomy. *IEEE TPAMI*, 41(2).
- Caruana, R. (1997). Multitask Learning. *Machine Learning*, 28.
- Das, A., Kong, W., Sen, R., & Zhou, Y. (2024). A Decoder-Only Foundation Model for Time-Series Forecasting (TimesFM). *ICML*.
- Hardt, M., Price, E., & Srebro, N. (2016). Equality of Opportunity in Supervised Learning. *NeurIPS*.
- Lundberg, S. M., & Lee, S.-I. (2017). A Unified Approach to Interpreting Model Predictions. *NeurIPS*.
- Mehrabi, N. et al. (2021). A Survey on Bias and Fairness in Machine Learning. *ACM Computing Surveys*, 54(6).
- Republic of Zimbabwe (2021). *Cyber and Data Protection Act [Chapter 12:07].*
