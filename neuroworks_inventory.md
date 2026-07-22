# NeuroWorks → ZivaBasa Inventory (21 Jul session)

Source: `D:\Aiia CodeHub\Neuroworks\neuroworks-main21_7\neuroworks-main` (Node/Express + React 18 agentic
chat/automation platform — pnpm workspace, TS everywhere, `web/` + `server/`).

**Correction vs. the assumption baked into the discovery prompt**: NeuroWorks is not a prediction/ML
product. It has no SHAP, no forecast chart, no confidence-interval UI, and no charting library at all
(`recharts`/`d3`/`visx`/`nivo` absent — the only visual libs are `d3-geo`+`three`, used solely for a globe
visualization). So "prediction UI" has no direct analog in NeuroWorks; what's closest is its task-result /
quality-gate UI, which is a reusable *interaction pattern* for trust signals around a model output, not
portable code.

## Catalogue

- **Models**: none — no ML model code, no training scripts, no weights. N/A.
- **APIs**: `server/src/routes/*.ts`, Express 4 routers, thin (delegate to `server/src/lib/*.ts`). No FastAPI/Python.
- **UI/UX**: `web/src/pages/*.tsx` (one per nav item), `web/src/components/*.tsx`. React 18.3 + react-router-dom 6 + Vite 5 + Tailwind 3.4, hand-rolled ink/violet/coral/cream/leaf/flame palette (`web/tailwind.config.js`), `lucide-react`, `marked` for markdown, `cmdk` command palette.
- **Feature engineering / data pipeline**: none in the ML sense — has a vault full-text index (MiniSearch) and doc parsers (PDF/DOCX/OCR), not feature engineering.
- **Explainability (XAI)**: none. `ResultPanel.tsx` has pass/fail quality cards and confidence bars, but these grade *agent answer quality*, not model feature attribution.
- **Federated learning / privacy**: none.
- **Model support services**: none (no model registry/feature store/drift monitor — this is a chat/automation app, not an ML serving stack).
- **Infra/DevOps**: Docker + k8s manifests present (`Dockerfile`, `k8s/`), not inspected in depth (out of scope for this pass — ZivaBasa already has its own Docker/CI, see checklist Section 7).
- **Chat**: `web/src/pages/Chat.tsx` (1279 lines) + `server/src/lib/llm.ts` (multi-provider routing/streaming/failover) + `server/src/routes/chat.ts` (intent router). See detail below — this is the substantial, genuinely useful category.

## Recommended Adoption

| NeuroWorks asset | Classification | Notes |
| --- | --- | --- |
| `Chat.tsx` scroll-stickiness (`ResizeObserver` + `wasNearBottomRef`, not a `messages`-array effect) | **Pattern worth reusing** | ZivaBasa's `ChatPane.jsx` scrolls on every message/sending change unconditionally — fine today, but the NeuroWorks trick (only stick to bottom if the user was already near it) is the correct fix once messages can arrive out of user-scroll-sync (e.g. future streaming). Adopted 22 Jul → `ChatPane.jsx`. |
| Slash-command palette (`SLASH_COMMANDS` regex-matched dropdown) | **Pattern worth reusing** | ZivaBasa already has a `SUGGESTIONS` chip row (different UX, same goal: fast canned prompts). Adopted as a complementary `/`-triggered dropdown in the input box, not a replacement for the chips. |
| SSE streaming + polling fallback (`EventSource` in `Chat.tsx`, `server/src/routes/tasks.ts` SSE pattern) | **Pattern worth reusing, deferred** | Real value, but rewiring all 4 ZivaBasa chat providers (Anthropic/NVIDIA/Groq/Gemini) for token streaming is a substantial backend change touching a working, tested code path (`api/chat.py`, `test_chat.py`, `test_llm_gateway.py`). Not attempted this session per "don't touch what's already useful" — flagged as a follow-up, not silently dropped. |
| `llm.ts` provider failover chain (profile/size-based routing, "don't switch after tokens streamed") | **Pattern worth reusing, already partially covered** | ZivaBasa's `api/llm_gateway.py` (Section 5a of the checklist) already implements budget-based fallback across the same 4 providers — a different trigger (budget exhaustion vs. transient error) but the same architectural idea. Not re-implemented. |
| `TraceBlock` — dependency-free CSS Gantt timeline for pipeline steps | **Pattern worth reusing** | No chart lib needed. Adopted 22 Jul as `PipelineTrace.jsx` in ZivaBasa's Advanced Predict flow, visualizing schema-load → predict → explain step timing/status — a genuine UX gap ZivaBasa didn't have (previously just spinner states). |
| `Bar` / `QualityBlock` confidence-meter convention | **Already covered** | ZivaBasa's `ShapLedger.jsx` + `ClarityRing` already do this (arguably more relevant — real SHAP-value bars, not a generic 0–100 meter). Not adopted. |
| Regex fast-path intent router before full agent planning | **Not applicable** | ZivaBasa's chat tool-calling loop is already a single bounded loop (4 iterations) against 4 small, well-defined tools (`predict_task`/`explain_task`/`generate_image`) — there's no "full agent planning path" to shortcut around. |
| Markdown rendering (`marked` + `dangerouslySetInnerHTML`) | **Already covered** | ZivaBasa has `ChatMarkdown.jsx` already wired in. Not touched. |

## Adopted this session

- `ChatPane.jsx` — near-bottom-aware auto-scroll (was: unconditional scroll-into-view on every message).
- `ChatPane.jsx` — `/`-triggered slash-command dropdown for quick prompts, additive alongside the existing suggestion chips.
- New `PipelineTrace.jsx` component + wiring into `AdvancedPredict.jsx` — visualizes the predict/explain pipeline as a CSS-only timeline, styled with ZivaBasa's existing design tokens (gold/teal/red), no new dependency.

## Bug found and fixed during the "UI surfaces" follow-up (22 Jul)

While scoping the Phase 2 item-5 "cross-task consistency flags" UI, found that `skill_match`'s
positive label (`target_good_redeployment_match` — a GOOD match) was being colored/badged as a
risk everywhere else in the app assumes label===1 means "bad" (automation/attrition/turnover
risk). Confirmed 4 real instances: `PredictionResult.jsx` (red ring + "Positive" badge on a good
match), `OverallSummary.jsx` (red card tone, missing skill_match/human_capital from the flag
sentence entirely — it only ever checked employment/skills), `InteractionExplorer.jsx` (scatter
dot color), `BatchUpload.jsx` (aggregate stat card, hardcoded `text-red`). `RosterTab.jsx` and
`ManagerActionInbox.jsx` were already correct (hardcoded to skill_match/skills respectively with
the right polarity for that one task). Fixed via a new central `TASK_POSITIVE_IS_RISK` map in
`lib/api.js`, consumed by all four affected components; `OverallSummary`'s flag sentence now also
covers all 5 tasks (was 2 of 5) via a `FLAG_PHRASES` map. Frontend build verified clean
(`npm run build`).

## Deferred, stated explicitly

- Full SSE token-streaming for chat replies — real backend rewrite across 4 providers + `test_chat.py`/`test_llm_gateway.py` re-verification; scoped out of this session to keep the diff reviewable and avoid touching a tested, working code path without a dedicated pass.
