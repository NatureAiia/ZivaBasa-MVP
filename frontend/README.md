# ZivaBasa: ChiedzaAI frontend

React 19 + Vite + Tailwind + Framer Motion single-page app that wraps ZivaBasa in a ChiedzaAI product shell. It talks only to the FastAPI backend (`backend/api`); there is no direct database or third-party auth client.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle to dist/
npm run lint       # oxlint
```

The app calls `http://localhost:8000` by default. Override in `frontend/.env`:

```
VITE_API_BASE=http://localhost:8000
```

The backend must be running with `DATABASE_URL` and `JWT_SECRET` set, because every screen is behind sign-in (`/login`). See the root `README.md` for backend setup. There are no frontend tests; `demo_walkthrough.mjs` is a one-off Playwright script that signs up a test user and screenshots the main surfaces.

## Routes (`src/App.jsx`)

```
/                         Landing
/login                    Sign in / sign up
/app                      ChiedzaDashboard (product picker)          [auth required]
/app/models/zivabasa/
    dashboard             corporate dashboard
    predict               Upload & Analyze, Simple, Advanced (single role)
    chat                  Chiedza chat + sources + studio
    history               prediction history
    roster                redeployment / skill-match roster
    review-queue          human review of flagged predictions
    my-organization       org chart, roster, invites, department engagement
    entity-resolution     cross-dataset identity matching
    my-view               employee "mirror" view
    national-view         national evidence view
/app/models/<other>       placeholder (Ziva Bank, DataOps, Business, Upskill)
/app/cost-monitoring      token / cost usage
/app/systems/{settings,users,models}    admin: settings, user management, models and model health
```

## Structure

```
src/
  lib/          api.js (fetch client: base URL, auth header, refresh), authStore.jsx,
                one *Store.js per backend resource (org, assignments, batch, sources, cost,
                usage, tokens, feedback, review queue, ...), theme, formatters, report builder
  hooks/        usePredictionFlow: Employment -> Skills -> Productivity -> Summary chain
  components/
    auth/ batch/ charts/ chat/ common/ dashboard/ effects/ forecast/ landing/ layout/
    onboarding/ organization/ predict/ studio/ tokens/
  pages/
    Landing, LoginPage, ChiedzaDashboard, CostMonitoring, InDevelopment
    system/     SystemsLayout + Settings, Users, Models, ModelHealth tabs
    zivabasa/   layout + the tabs listed above
```

State is server-backed: each store in `lib/` is a thin client over a backend route and holds no source-of-truth data in `localStorage`. `localStorage` is used only for per-browser preferences (theme, cookie consent, low-bandwidth mode, an API-base override). The access token is held in memory only.

## What's real vs. prototype (read before demoing)

**Real**
- **Predict, Upload & Analyze:** upload a CSV per task; the backend matches columns by name, engineers features, scores every row, and returns KPI cards, a department breakdown, and a top-risk list.
- **Predict, Advanced (single role):** manual entry, chained across tasks, with SHAP ledger, causal panel, upskilling suggestions and feedback control.
- **Dashboards:** corporate KPIs, department engagement, AI-readiness, future-skills table, built from stored batch results. Honestly labelled: no "jobs created" model exists.
- **Chat:** backend `/chat` and `/chat/agent`, able to call predict/explain tools. Needs a provider key on the backend; if none is set the UI says so.
- **Organization, roster, review queue, history, feedback, cost monitoring, onboarding:** all persisted in Postgres and shared across devices and sessions.
- **Auth:** email/password, JWT access token plus refresh cookie, invites with pre-assigned roles, role-gated admin pages.
- **Reports:** Markdown, PDF and XLSX export.

**Prototype or stubbed**
- Studio stub tiles (Audio/Video Overview, Mind Map, Quiz) are visual only, marked "soon".
- Sibling product pages are `InDevelopment` placeholders.
- The Sources panel in Chat is not yet a feeder for the batch-predict endpoint; use Predict, Upload & Analyze for file-driven scoring.
- Model outputs come from proxy data and several are weak (see root `README.md`, section 1). The UI shows the numbers; it does not make them accurate.

## Known gaps

- No automated tests.
- NVIDIA NIM chat is written to the documented OpenAI-compatible contract but was never verified against a live key.
- `frontend/dist/` is committed to git and should be build output only.
- `frontend/public/.htaccess` hard-codes the UAT backend port (8002) for the cPanel proxy.
