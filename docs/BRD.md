# Business Requirements Document (BRD)
## ZivaBasa — AI Workforce Intelligence Platform
### (a module of the ChiedzaAI platform)

**Status:** Draft v1.0
**Prepared:** 2026-09-10
**Scope of this document:** The ZivaBasa module as it exists today (MVP/prototype stage) plus the near-term roadmap already referenced in the codebase and pitch materials. ZivaBasa is one module of a larger planned platform, ChiedzaAI (which also lists Ziva Bank, Ziva DataOps, Ziva Business, Ziva Upskill as in-development sibling modules); this BRD scopes ZivaBasa only, and calls out platform-level dependencies where relevant.

---

## 1. Executive Summary

ZivaBasa is an AI-powered workforce intelligence platform aimed initially at banks operating in Zimbabwe. It predicts, explains, and helps act on workforce risk — which roles are at risk of automation, which employees are at risk of leaving, how productive/AI-adoption-ready the workforce is, and which employees can be redeployed into other roles instead of being laid off. It goes beyond typical "predictive HR analytics" vendors by pairing correlational explainability (SHAP) with **causal validation of interventions** (uplift modeling), and by offering a **federated-learning path** so multiple institutions (banks, telcos, public bodies) can improve a shared model without pooling raw employee data — positioned as a data-sovereignty story for a national rollout.

The product is currently an **honestly-scoped MVP**: most predictive models are trained and validated against public Kaggle proxy datasets (not yet real Zimbabwean banking data), with one real (non-proxy) HR dataset already integrated for the turnover/"human capital" task. Core prediction, explainability, causal uplift, forecasting, skill-matching/redeployment, a federated-learning simulation, self-hosted authentication, multi-tenant organizations, human-in-the-loop review, and an LLM chat assistant are already built and working.

## 2. Business Context & Problem Statement

### 2.1 Problem
Banks and large employers in Zimbabwe (and similar emerging markets) face converging workforce pressures:
- Automation/AI is changing which roles remain viable, but employers lack a systematic, explainable way to see which roles/employees are exposed.
- Attrition of skilled staff is costly, and reactive HR processes catch it too late to intervene.
- When roles are automated or restructured, organizations default to layoffs rather than **redeployment**, destroying institutional knowledge and increasing severance cost, when many at-risk employees could be reskilled and shifted into adjacent roles.
- Existing workforce-analytics vendors typically offer **correlational** explanations ("this employee looks like past leavers") but not **causal** validation of what to actually do about it ("would a raise/training/schedule change actually reduce the risk, or just correlate with it").
- At a national-policy level, no shared infrastructure lets multiple institutions (banks, telcos, public sector) pool statistical learning about workforce risk **without pooling sensitive raw employee data** — a blocker to any cross-institutional or national workforce strategy.

### 2.2 Opportunity
ZivaBasa's core commercial argument (per the CEO pitch material) is a shift from "cost of the tool" to **cost-of-inaction avoided**, and **cost-per-decision-avoided** as the board-level KPI: each correctly flagged and actioned at-risk employee avoids a quantifiable replacement/severance/productivity-loss cost. At a national level (per the head-of-state pitch material), the same infrastructure is positioned as a component of Zimbabwe's National AI Strategy — feeding workforce-risk signal into a reskilling-pathways product ("Cognify", Pillar 1) and a federated, sovereign-data architecture ("Project Pangolin", Pillar 3).

## 3. Business Objectives

1. Give bank HR/management a single, explainable view of workforce risk (automation exposure, attrition risk, productivity/AI-adoption signal) at both individual and organizational levels.
2. Replace default "layoff" decisions with a **redeployment-first workflow**: recommend and track internal moves for at-risk employees based on skill match.
3. Move workforce-risk decision-making from correlational ("who looks risky") to **causal** ("what intervention, applied to whom, actually reduces risk") — enabling defensible, ROI-justified HR interventions.
4. Preserve employee trust and legal defensibility: employee-level predictions must be explainable (SHAP), reviewable by a human before acting (review queue), and consent-gated where employee-facing (Employee Mirror View never auto-shares with managers).
5. Provide a path to **multi-institution / national-scale** learning (federated learning) without centralizing raw employee data, positioning the platform for a regulated, data-sovereignty-sensitive rollout.
6. Validate the MVP's predictive models against real Zimbabwean banking-sector data before any production/regulated deployment, replacing today's Kaggle-proxy training data task-by-task.
7. Monetize usage via a token/credit metering model that can support a tiered/SaaS commercial model (trial vs. paid seats) without gating administrative usage.

## 4. Stakeholders & User Roles

| Stakeholder | Interest |
|---|---|
| Bank C-suite / board | Cost-of-inaction ROI, board-level KPI reporting, national/regulatory positioning |
| HR / People Ops managers | Day-to-day use of the Manager Action Inbox, Roster/redeployment decisions, review queue |
| Individual employees | Employee Mirror View ("My View") — self-service, consent-gated visibility into their own risk/skill signal, without automatic manager visibility |
| Platform admins (`admin`/`superadmin`) | Org/user management, model health monitoring, role promotion, unmetered usage |
| Data/ML team (internal) | Model retraining, SHAP/causal validation, MLflow experiment tracking, model registry |
| National policy stakeholders (future) | Aggregated, federated, never-individual-record view of workforce trends (National Evidence View) |
| Sister-project integrations (future) | FFIMS (Africa University Fleet & Facilities Integrated Management System) for shift/workforce scheduling; Cognify for reskilling pathways |

Current implemented role model is a three-tier hierarchy: `viewer` < `admin` < `superadmin`, enforced centrally, with role escalation only possible via a dedicated superadmin action (never via a general profile update) to prevent privilege escalation. Multi-tenant organizations support inviting teammates by email with an assigned role.

## 5. Functional Requirements

Grouped by capability area; all items below are **already implemented** in the current codebase unless marked *(Planned)*.

### 5.1 Prediction & Explainability
- FR-1: Predict, per employee/role, across 5 task types: employment/automation risk, attrition ("skills") risk, productivity/AI-adoption regression, skill-match/redeployment fit, and turnover (human capital, real-data task).
- FR-2: Provide SHAP-based explanations for any prediction (which factors drove this specific score, in what direction).
- FR-3: Support both single-record ("Simple"/"Advanced" Predict) and batch (CSV upload) prediction workflows.
- FR-4: Maintain a per-user prediction history.

### 5.2 Causal & Intervention Support
- FR-5: Estimate the **causal uplift** of a candidate intervention (e.g., would raising pay, changing schedule, or offering training actually reduce this employee's attrition risk), not just correlational risk — supporting defensible, ROI-justified action.

### 5.3 Forecasting
- FR-6: Provide multi-year workforce/productivity forecasts per industry, with confidence intervals, incorporating macro-economic context (inflation, unemployment, labor force participation) at national/industry level.

### 5.4 Redeployment / Shift Intelligence
- FR-7: Recommend redeployment matches for at-risk employees based on current-vs-required skill similarity, rather than defaulting to layoff.
- FR-8: Track redeployment decisions (proposed → approved/rejected) against organizational structure (org chart / roster).
- FR-9 *(Planned)*: Deeper shift/workforce-scheduling integration with the sister FFIMS project.

### 5.5 Human-in-the-loop Governance
- FR-10: Route classification/forecast outputs needing sign-off through a review queue (approve / override / reject), with outcomes feeding model-health tracking.
- FR-11: Collect explicit positive/negative feedback on individual predictions to inform ongoing model monitoring.

### 5.6 Federated Learning (Multi-institution)
- FR-12: Provide a federated-learning simulation (multiple synthetic "institutions" training locally, aggregated centrally) as a proof-of-concept for cross-institution learning without centralizing raw data.
- FR-13 *(Planned)*: Production-grade multi-institution federated rollout beyond the current single-machine simulation.

### 5.7 Views by Audience
- FR-14: Manager-facing "Action Inbox": a prioritized queue of flagged at-risk employees with plain-language explanations, causal-lever recommendations, and cost-of-inaction figures.
- FR-15: Employee-facing "Mirror View": self-service visibility into one's own predicted risk/skill signal; explicitly consent-gated and never automatically shared with a manager.
- FR-16: Organization-wide "Corporate"/"Dashboard" views summarizing risk across the org.
- FR-17: "National Evidence View": aggregated/federated cross-institution view for policy stakeholders that never surfaces individual employee records.

### 5.8 Organization & Identity
- FR-18: Model an organizational structure (roles, departments, reporting lines, current/target skills, headcount) that predictions and redeployment recommendations are evaluated against.
- FR-19: LLM-assisted onboarding: extract organizational structure and task-relevant fields from uploaded documents/data automatically.
- FR-20: Cross-dataset entity resolution — match/link the same individual across multiple uploaded data sources (with a match score), surfaced to admins in an Entity Resolution tab.

### 5.9 Conversational Assistant
- FR-21: An LLM-backed chat assistant ("Chiedza") answering questions about predictions/data, with tool-calling ("agent") mode, pluggable across multiple LLM providers, and a usage budget per user.
- FR-22: Exportable reports (Markdown, PDF, Excel) from predictions and chat sessions.

### 5.10 Accounts, Access & Monetization
- FR-23: Self-hosted email/password authentication with JWT access + rotating refresh tokens (replacing an earlier Supabase-based auth system, migration in progress — see §9 Constraints).
- FR-24: Three-tier role-based access control (`viewer`/`admin`/`superadmin`) with a superadmin-only role-promotion action.
- FR-25: Multi-tenant organizations with email-based teammate invites carrying a role and optional bonus token grant.
- FR-26: Token/credit metering per action (predict, agent chat, report export, premium upskilling), with admin/superadmin usage unmetered; the metering gate is togglable and off by default until explicitly enabled.
- FR-27: Product-led-growth tracking: onboarding progress, feature discovery, and milestone events per user, plus department-level report-engagement analytics.
- FR-28: Cost monitoring: track and surface LLM token spend over time.
- FR-29: LLM-assisted image generation (and, via Azure OpenAI specifically, image editing) for use in reports/dashboards.

### 5.11 Platform / Admin
- FR-30: Admin console for model health monitoring, model registry inspection, system settings, and user management.
- FR-31: MLOps status endpoint reflecting current model/training state.

## 6. Non-Functional Requirements

- NFR-1 (Explainability): Every individual-level prediction that drives a management or automated action must be paired with a SHAP-based explanation understandable to a non-technical HR user.
- NFR-2 (Human oversight): Consequential model outputs (classification/forecast) must be able to pass through human review (approve/override/reject) before being treated as final.
- NFR-3 (Employee privacy/consent): Employee self-service views must not automatically disclose an employee's data to their manager; access must be consent-gated by design, not just by policy.
- NFR-4 (Tenant isolation): Since the platform moved off a database with built-in row-level security, every data-access path must enforce per-user/per-organization filtering in application code — treated as the single highest-risk correctness requirement in the current architecture.
- NFR-5 (Data provenance honesty): Any model or dashboard currently trained on public/proxy data (as opposed to real customer data) must be clearly labelled as such throughout the product and in reporting, until replaced with validated real-data models.
- NFR-6 (Auditability): Role changes, redeployment decisions, review-queue actions, and token/credit consumption must be recorded with an audit trail (ledger/log tables), not just a current-state value.
- NFR-7 (Extensibility of LLM providers): The chat/agent and image-generation features must not hard-depend on a single LLM vendor; provider choice must remain configuration-driven.
- NFR-8 (Deployability): The system must be deployable via the organization's existing hosting arrangement (shared-hosting/cPanel Git-VC pipeline today) without requiring a managed-database or managed-auth SaaS dependency.
- NFR-9 (Testability): Core prediction, auth, batch, causal/uplift, forecasting, federated, and agent code paths must have automated test coverage runnable without external network/service dependencies (SQLite-backed test database).

## 7. Out of Scope (current phase)

- Validated production use on real Zimbabwean banking-sector data (today: proxy/Kaggle data for 4 of 5 tasks).
- Production-scale (non-simulated) federated learning across real, separate institutions.
- Payment/billing processor integration, SMS notifications, or geolocation/maps features (none present or planned in current scope).
- Full ChiedzaAI sibling modules (Ziva Bank, Ziva DataOps, Ziva Business, Ziva Upskill) — tracked separately, outside this BRD.
- Deep, general-purpose shift/workforce scheduling (tracked as a planned integration with the separate FFIMS project, not a ZivaBasa-native build).

## 8. Success Metrics

- **Adoption**: number of organizations onboarded, active managers using the Action Inbox weekly, employees engaging with Mirror View.
- **Decision quality**: proportion of flagged at-risk employees receiving a documented intervention via the review queue, and outcome tracking (retained vs. left) after intervention.
- **Redeployment rate**: proportion of at-risk/automatable roles resolved via redeployment (approved assignments) rather than attrition/severance.
- **Model trust**: prediction feedback ratio (positive vs. negative), review-queue override rate (a proxy for model reliability).
- **Cost avoided**: aggregate "cost-of-inaction avoided" figure reported to leadership, per the board-level KPI framing in the CEO pitch material.
- **Data maturity**: number of task models successfully retrained/validated on real (non-proxy) customer data, replacing Kaggle proxies.

## 9. Constraints, Risks & Dependencies

- **Auth migration in progress**: the system has moved from Supabase-managed auth/DB to self-hosted Postgres + custom JWT auth, but Supabase environment variables, a live Supabase project URL in the deployment pipeline, and Supabase-oriented setup documentation still exist in the repository. This must be fully reconciled/decommissioned before it is treated as resolved.
- **Proxy-data risk**: four of five prediction tasks are trained on public Kaggle datasets standing in for real banking-sector data; any business claims or ROI figures derived from these models must be caveated as illustrative until real-data validation occurs.
- **Single-machine federated "simulation"**: the current federated learning capability demonstrates the mechanism (Flower FedAvg across synthetic institutions on one machine) but is not yet a cross-institution production deployment.
- **Regulatory/compliance**: no explicit references to Zimbabwe's Data Protection Act or banking-sector regulatory requirements were found in-repo; this should be confirmed with legal/compliance stakeholders before processing real employee PII, especially given multi-tenant and federated ambitions.
- **Sister-project dependency**: the planned deeper "Shift Intelligence" capability depends on integration with an externally-owned project (FFIMS, Africa University), outside this team's direct control.
- **Single-author development to date**: current git history shows concentrated authorship, which is a bus-factor/knowledge-continuity risk as the team scales.

## 10. Glossary

- **Cost-of-inaction**: the CEO-pitch framing of the financial loss incurred by *not* acting on a flagged workforce risk (e.g., losing a skilled employee that could have been retained).
- **Shift Intelligence**: the internal name for the skill-match/redeployment capability (roadmap item, partly implemented as the `skill_match` task and Roster tab).
- **Cognify**: a referenced sister product for reskilling pathways (Zimbabwe National AI Strategy Pillar 1), not built in this repository.
- **Project Pangolin**: a referenced national, sovereign, federated-data architecture initiative (Pillar 3) that ZivaBasa's federated-learning capability is positioned to feed into.
- **ChiedzaAI**: the parent platform brand under which ZivaBasa is one module among several planned (Ziva Bank/DataOps/Business/Upskill).
