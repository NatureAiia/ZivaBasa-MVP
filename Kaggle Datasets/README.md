# Kaggle Datasets — Proxy Data Prototype

## Purpose

No single Kaggle dataset provides Zimbabwean banking employment, productivity, or skills data — that data is not publicly available. This phase uses Kaggle datasets as proxy data to validate the architecture and pipeline (multi-task DNN + SHAP + feature-engineering taxonomy), not to produce real-world findings. Real bank data will replace the Kaggle proxy later without changing the architecture. Document this explicitly to protect the scientific validity of the later real-data phase.

## Datasets to combine (none alone is sufficient)

| Task head | Candidate Kaggle dataset | What it gives you |
|---|---|---|
| Employment / automation-risk | "AI Automation Risk by Job Role" (khushikyad001) or "Occupation, Salary and Likelihood of Automation" (andrewmvd) | Job-role-level automation exposure — proxy for Employment output |
| Skills / attrition-readiness | "IBM HR Analytics Employee Attrition & Performance" (pavansubhasht) | Training, tenure, satisfaction, role, promotion history — proxy for Skills/workforce features |
| Productivity / AI adoption context | "Future of Work in the Age of AI (2020–2026)" (algozee) | AI adoption level, salary trend, skill gap by industry — proxy for Productivity + AI-adoption index |

## Integration strategy

- Align datasets on shared keys (role / department / industry) synthetically where possible.
- Alternatively, train each task head on its own dataset and use a shared representation layer only where features overlap (age, tenure, training hours, digital-skill proxies).
- Be explicit in the methodology: this is cross-dataset feature alignment, not a single coherent longitudinal dataset.

## Documentation notes

- State clearly that these are proxy datasets used to validate model architecture and pipeline, not to draw definitive conclusions about Zimbabwean banking.
- Explain limitations and the plan to replace proxies with real bank data later.
- Mention key components being validated: multi-task DNN, SHAP explainability, and the feature-engineering taxonomy.

---

Be prepared to show dataset alignment procedures and the exact mapping rules in methodology sections or supplementary docs — reviewers will ask for them.