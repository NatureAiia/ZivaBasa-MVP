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

- **Predict tab** — fully wired to your FastAPI backend. Same guided flow as v1
  (Employment → Skills → Productivity → Summary), same SHAP ledger, same scaler fix.
- **Dashboard tab** — real `/health` check against your API; recent-activity list reads
  real logged runs.
- **History tab** — real, but **client-side only** (`localStorage`). No backend persistence
  exists yet — runs don't sync across devices/browsers. Wiring this to a real DB table is a
  natural next step once there's auth.
- **Report generation** (Studio panel + History tab + Predict Summary) — real, generates an
  actual `.md` file from your latest completed run. Not a styled PDF yet.
- **Chat tab's Chat pane** — **UI prototype only**. There's no conversational backend wired up
  (the FastAPI app only exposes `/health`, `/schema`, `/predict`, `/explain` — no chat
  endpoint). It echoes what you type so the interaction pattern is real, but nothing is
  actually asking the model anything. Says so directly in the UI.
- **Sources panel** — drag/drop UI works, files are listed, but nothing is uploaded anywhere
  (no backend endpoint exists to receive them). Says so directly in the UI.
- **Studio's stub tiles** (Audio Overview, Video Overview, Mind Map, Quiz) — visual only,
  marked "soon," mirroring NotebookLM's Studio without pretending they're built.

## Known gaps worth tackling next

- No auth — anyone with the URL sees everything.
- No real chat backend — would need an LLM endpoint that can call `/predict`/`/explain` as
  tools and reason over the results.
- Report export is Markdown, not a formatted PDF — `xlsx`/`docx`/`pdf` skills could generate a
  nicer artifact server-side.
- History has no backend table — currently `localStorage` per browser.
