# ZivaBasa — CEO / Bank-Board Pitch Script (~10 minutes)

*Companion to `head_of_state_pitch_script.md` — sections marked **[SHARED]** are near-identical
across both scripts; sections marked **[CEO-ONLY]** or **[HEAD-OF-STATE-ONLY]** differ. Written
per `prompt_ceo_headofstate_demo_readiness.md`'s Phase D requirement: every number below is
tagged **(real)** or **(proxy-derived)** so whoever delivers this can answer "is that real?" for
any figure, on the spot, without checking notes.*

**Prerequisite**: run through this once yourself before presenting — see the "Fallback plan"
note at the end. Screens referenced: Manager Action Inbox → Employee Mirror View (brief) →
Forecast → Board-ready export.

---

## 0:00–0:45 — Opening frame **[CEO-ONLY]**

> "Every workforce-analytics tool on the market can rank who's at risk. None of them hand your
> managers a *next action*, and none of them will tell you honestly which levers are real, causal
> interventions versus which are just correlations that look good in a dashboard. That's what
> we're going to look at today."

Open on **Manager Action Inbox** (not the Dashboard tab — this is deliberate; per the platform's
own design philosophy, executives want a queue to clear, not a chart to admire).

---

## 0:45–3:00 — Manager Action Inbox: the flagship screen **[SHARED]**

- Point at the **cost-of-inaction** summary card at the top: *"$X estimated cost of inaction this
  quarter"* **(proxy-derived — illustrative 9-months'-salary replacement-cost heuristic applied
  to whatever roster was uploaded; not a company-specific costing exercise)**.
- Click into one flagged employee. Read the plain-language sentence aloud: *"This employee's risk
  is driven mainly by [X], not [Y]."* **(proxy-derived — SHAP explanation on the `skills` task,
  trained on the IBM HR attrition Kaggle dataset, not real company data)**.
- Point at the **Recommended lever** section: *"Each additional training session reduces
  attrition probability by Z, on average, for someone with these characteristics."* **(proxy-derived
  — EconML CausalForestDML causal/uplift estimate, same proxy dataset; this is the platform's
  actual differentiator: it distinguishes "this variable predicts risk" from "this variable, if
  changed, would causally move risk" — most competitors only do the former)**.

> "That second number is the whole point. SHAP tells you what's associated with risk. The
> causal-forest estimate tells you whether pulling that lever would actually work. That's a
> materially harder problem, and as far as we've been able to verify, most workforce-analytics
> vendors don't attempt it at all."

---

## 3:00–4:00 — Cost-per-decision-avoided framing **[CEO-ONLY]**

> "The number your board should actually track weekly isn't model accuracy — that's an
> engineering metric. It's this: cost-per-decision-avoided. This quarter, if these retention
> interventions cost $A in reskilling and avoid an estimated $B in attrition/replacement cost,
> that's the number that closes the loop between what you spend on AI and what it's actually
> worth."

**(proxy-derived** — the underlying cost figures on screen today are illustrative heuristics, not
a completed costing exercise; the *mechanism* for computing this weekly is real and already
wired into Cost Monitoring's Supabase-backed LLM-spend tracking — extending it to workforce ROI
specifically is the next step, not yet built**)**.

---

## 4:00–6:00 — Employee Mirror View: trust framing, briefly **[SHARED, abbreviated for CEO]**

Switch to **My View**. Point at the consent banner: *"Nothing an employee enters here is
automatically shared with a manager."*

> "This matters for adoption, not just ethics — a tool employees experience as surveillance gets
> gamed or resisted. One that lets someone see their own trajectory and experiment with what
> would move it gets used."

Drag the training-sessions slider live — show the projected-risk number update **(proxy-derived,
same causal-forest model)**.

---

## 6:00–7:30 — Multi-year forecast, board credibility **[CEO-ONLY]**

Switch to **Forecast**. Point at the shaded confidence band around the projected years.

> "A snapshot risk score answers 'is this a problem right now.' A three-year trajectory with a
> confidence interval answers 'how urgent is this, and how confident should we be in that
> urgency.' That interval widens the further out we project — that's not a bug, that's the model
> being honest about compounding uncertainty."

**(proxy-derived** — LSTM trained on the same Kaggle-derived industry-year panel; the confidence
interval itself is a genuine MC-dropout statistical technique (Gal & Ghahramani), applied here to
proxy data — the *method* is real, the *data it's running on* is not**)**.

---

## 7:30–9:00 — Board-ready export **[SHARED]**

Back on Manager Action Inbox, click **Export PDF** on the expanded employee row.

> "Executives forward PDFs. They don't log into dashboards. Everything you just saw — the risk
> score, the SHAP explanation, the causal-lever estimate, the cost-of-inaction figure — is in
> that one document, with the same proxy-data disclaimer on it that's on every screen in this
> tool."

Open the downloaded PDF live if possible; if not, have one pre-generated as backup (see fallback
plan).

---

## 9:00–10:00 — Close **[CEO-ONLY]**

> "None of the numbers today are a claim about your real workforce — they're proxy data, and
> every screen says so. What we're actually demonstrating is the mechanism: prediction, honest
> explanation, causal validation of the recommended action, and a board-legible cost number, all
> in one clean flow. The moat isn't the model — it's this end-to-end discipline, plus the
> longitudinal data that accumulates once real institutional data replaces the proxy sets."

---

## Fallback plan (per Phase D requirement)

- **If live demo fails mid-pitch**: fall back to a pre-generated PDF export (produce one from
  this exact click-through before the pitch, save it locally) and narrate from it rather than
  re-attempting the live flow under time pressure.
- **If network is bad**: toggle **Low-bandwidth mode** (top-right of the ZivaBasa header) before
  starting — this was verified functionally in this repo but **not verified under real 3G
  throttling**; test it yourself on the actual venue's network before relying on it live.
- **Offline-capable build**: not built in this repo as of this writing — `docker-compose up` on a
  laptop with no internet would still require the backend's own dependencies to already be
  installed (no live pip install), so pre-build the Docker images before traveling to the venue,
  don't assume you can build them there.
