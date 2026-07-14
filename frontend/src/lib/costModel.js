/*
  Cost Monitoring category/item definitions — sourced directly from the AI4I Development
  Track proposal, Section 5.3 "Cost and Resource Model" (plus the compute detail in 3.3 and
  the compliance/security detail in 4.1/4.3 that 5.3 references as "pre-condition costs").

  Deliberately NO dollar figures are hardcoded. The proposal is explicit about this:
  "No total is given; a fabricated figure would be less credible than naming the real drivers
  plainly." This module defines the real cost DRIVERS; the actual numbers are entered by
  whoever's using this page and stored client-side (see costStore.js).
*/

export const COST_CATEGORIES = [
  {
    key: "model",
    label: "Model / Compute Costs",
    description: "Training and inference compute, plus metered third-party LLM usage.",
    items: [
      {
        key: "training_compute",
        label: "Model training compute",
        driver:
          "CPU-sufficient today — 3 small Keras models train in minutes on a few thousand proxy rows. " +
          "GPU becomes necessary once LSTM/Transformer forecasting (Day 11) and real bank-scale data arrive.",
        source: "Proposal §3.3",
      },
      {
        key: "inference_compute",
        label: "Inference / hosting compute",
        driver: "ZCHPC CCE quota once confirmed, or cloud fallback if ZCHPC capacity is constrained.",
        source: "Proposal §3.3, §5.3",
      },
      {
        key: "llm_api_usage",
        label: "Chat LLM API usage (Anthropic / NVIDIA NIM)",
        driver:
          "/chat is metered, pay-per-token — ongoing and usage-scaling, not a one-time cost. " +
          "Must be covered by whatever the subscription price (§5.2) ends up being.",
        source: "Proposal §5.3",
      },
    ],
  },
  {
    key: "human",
    label: "Human Costs",
    description: "Team time to finish the build and keep it running afterward.",
    items: [
      {
        key: "remaining_build",
        label: "Remaining build (Days 11–14)",
        driver:
          "Workforce forecasting (LSTM), executive report export, integration/E2E testing, " +
          "and Docker deployment — the 4 unstarted days of the 14-day plan.",
        source: "Proposal §3.2, Appendix A",
      },
      {
        key: "hardening",
        label: "Post-MVP hardening",
        driver: "Authentication/RBAC, CI/CD, security scanning — flagged gaps, not yet built.",
        source: "Proposal §4.3",
      },
      {
        key: "support_maintenance",
        label: "Ongoing support & maintenance",
        driver: "Retraining, dependency upgrades, and customer support once institutions are paying.",
        source: "Proposal §5.3",
      },
    ],
  },
  {
    key: "licence",
    label: "Licence Costs",
    description: "What's free and open-source vs. what's metered/third-party.",
    items: [
      {
        key: "source_licence",
        label: "ZivaBasa source licence",
        driver: "MIT-intended per the README — no LICENSE file committed yet. Zero cost either way.",
        source: "Proposal §5.4",
      },
      {
        key: "oss_deps",
        label: "Open-source dependencies",
        driver: "TensorFlow, scikit-learn, XGBoost, SHAP, FastAPI, React, Vite, Tailwind — Apache-2.0/MIT/BSD family, no cost, no proprietary risk.",
        source: "Proposal §5.4",
      },
      {
        key: "llm_access",
        label: "LLM API access / plan",
        driver: "Anthropic and/or NVIDIA NIM account access — separate from the per-token usage cost above if your plan has a base/seat fee.",
        source: "Proposal §5.4",
      },
      {
        key: "kaggle_data",
        label: "Kaggle proxy datasets",
        driver: "Public, used as disclosed proxies only — not for redistribution as ZivaBasa's own dataset. No cost.",
        source: "Proposal §5.4",
      },
    ],
  },
  {
    key: "hardware",
    label: "Hardware & Storage Costs",
    description: "GPU/CPU and storage, sized for real data volume rather than Kaggle-scale.",
    items: [
      {
        key: "gpu_cpu",
        label: "GPU / CPU allocation",
        driver: "ZCHPC CCE GPU/CPU quota — figures in §3.3 are engineering estimates, not a confirmed allocation. Confirm directly with ZCHPC before relying on them.",
        source: "Proposal §3.3",
      },
      {
        key: "storage",
        label: "Storage (model artifacts + feature data)",
        driver: "Currently a few MB (Kaggle-scale). Real bank data volume is unknown and should size this properly, not assume it stays this small.",
        source: "Proposal §3.3, §5.3",
      },
    ],
  },
  {
    key: "other",
    label: "Other Costs",
    description: "Compliance, legal, and security — pre-condition costs the proposal says aren't deferrable.",
    items: [
      {
        key: "legal_compliance",
        label: "Legal / data-protection review",
        driver: "Cyber and Data Protection Act [Chapter 12:07] compliance review — consent wording, lawful basis, data-subject rights — before any real employee data touches the pipeline.",
        source: "Proposal §4.1, Appendix E",
      },
      {
        key: "security_hardening",
        label: "Security engineering",
        driver: "HTTPS/TLS, OAuth2/JWT auth, origin-locked CORS, vulnerability scanning — currently absent by design for local dev.",
        source: "Proposal §4.3, Appendix E",
      },
      {
        key: "data_prep",
        label: "Real-data preparation",
        driver: "Cleaning and onboarding a pilot bank partner's real HR export once secured.",
        source: "Proposal §5.3",
      },
      {
        key: "finance_specialist",
        label: "Costing / business-model exercise",
        driver: "This page itself is a stand-in for a proper costing exercise — the proposal recommends a finance specialist do this from confirmed hosting and pilot-volume figures.",
        source: "Proposal §5.2, §5.3",
      },
    ],
  },
];
