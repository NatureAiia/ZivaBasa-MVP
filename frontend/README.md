# ZivaBasa v2 — ChiedzaAI frontend

React + Vite + Tailwind + Framer Motion rebuild of the ZivaBasa dashboard, wrapped in a
ChiedzaAI product shell.

## Setup

```bash
npm install
npm run dev
```

By default the app talks to `http://localhost:8000` (your FastAPI backend, from `api/main.py`).
Override with a `.env` file:

```
VITE_API_BASE=http://localhost:8000
```

Make sure the backend is running (`uvicorn api.main:app --reload`) with the fixed
`model_registry.py` / `main.py` (scaler-by-name mapping) — the old versions produce all-zero
predictions.

## Structure

```
src/
  lib/          api client, theme provider, motion variants, formatters, report builder, history
  hooks/        usePredictionFlow — the Employment→Skills→Productivity→Summary chain
  components/
    layout/     Sidebar, Shell, ThemeToggle
    common/     Card, Badge, Button, Skeleton, EmptyState, ClarityRing (signature element)
    predict/    TaskForm, PredictionResult, ShapLedger, OverallSummary
    chat/       ChatPane, StudioPanel, SourcesPanel, HistoryStrip
  pages/
    ChiedzaDashboard.jsx    top-level product picker
    InDevelopment.jsx       placeholder for Ziva Bank/DataOps/Business/Upskill + Cost Monitoring
    zivabasa/               ZivaBasaLayout + Dashboard/Chat/Predict/History tabs
```

## What's real vs. prototype (read this before demoing)

- **Predict tab, "Upload & Analyze" (default view)** — real, new. Upload a CSV per task
  (Employment/Skills/Productivity), the backend matches columns by name (including computing
  engineered features like `training_intensity_index` from raw HR columns automatically),
  scores every row, and returns KPI cards, a department/segment breakdown, and a top-risk list.
  This is the CEO-facing flow — no manual per-field data entry required.
- **Predict tab, "Single-role (advanced)"** — the original v1-ported flow: manual feature entry,
  chained Employment → Skills → Productivity → Summary, SHAP ledger. Kept for analysts who want
  to explore one hypothetical scenario at a time.
- **Corporate dashboard** (both ChiedzaAI's top-level Dashboards page and ZivaBasa's own
  Dashboard tab) — real, pulls from whatever batch uploads have been run. Big numbers: roles at
  automation risk (+ payroll value), employees at attrition risk (+ income value), productivity
  signal, department breakdown. Honestly labeled as not including "jobs created" (no model
  predicts that) and flags that skills-gap *recommendations* (as opposed to attrition risk)
  aren't built yet.
- **Chat tab's Chat pane** — real, wired to the backend's `/chat` endpoint, which can call the
  actual `predict_task`/`explain_task` tools. Needs `ANTHROPIC_API_KEY` or `NVIDIA_API_KEY` set
  on the *backend* (see its `.env.example`) — if neither is set, the chat pane surfaces that
  honestly instead of pretending to answer.
- **History tab** — real, but **client-side only** (`localStorage`), same as before.
- **Report generation** — real, generates a `.md` from a completed advanced-mode run.
- **Sources panel** (inside Chat tab) — still a UI prototype, not wired to the batch-predict
  endpoint. For real file-driven predictions, use Predict → Upload & Analyze.
- **Studio's stub tiles** (Audio/Video Overview, Mind Map, Quiz) — visual only, marked "soon."

## Known gaps worth tackling next

- No auth.
- NVIDIA NIM chat path is written to the documented OpenAI-compatible contract but was never
  tested against a live key or `integrate.api.nvidia.com` (unreachable from the sandbox this
  was built in) — verify before relying on it.
- Sources panel doesn't feed the batch-predict endpoint yet.
- History/batch results have no backend table — currently `localStorage` per browser.
- Report export is Markdown, not a formatted PDF.
