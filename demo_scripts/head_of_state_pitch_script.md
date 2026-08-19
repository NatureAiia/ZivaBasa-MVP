# ZivaBasa — Head-of-State / National-Strategy Pitch Script (~10 minutes)

*Companion to `ceo_pitch_script.md` — sections marked **[SHARED]** are near-identical across both
scripts; sections marked **[HEAD-OF-STATE-ONLY]** differ. Written per
`prompt_ceo_headofstate_demo_readiness.md`'s Phase D requirement: every number below is tagged
**(real)** or **(proxy-derived)** so whoever delivers this can answer "is that real?" for any
figure, on the spot, without checking notes.*

**Prerequisite**: run through this once yourself before presenting — see the "Fallback plan" note
at the end. Screens referenced: Employee Mirror View → Manager Action Inbox (brief) → National
Evidence View (federated demo + sector evidence + AI Strategy alignment).

---

## 0:00–1:00 — Opening frame **[HEAD-OF-STATE-ONLY]**

Open on **My View** (the Employee Mirror View) — deliberately not an executive dashboard. Point
at the consent banner before anything else.

> "Before we talk about what this platform predicts, I want to show you what it protects. This is
> an individual employee's own view of their own information — nothing here is shared with a
> manager automatically. We built this because a workforce-AI tool that only serves management is
> a surveillance tool. One that also serves the worker is protective of their dignity, not just
> their employer's efficiency. That distinction is the one this project has tried to hold onto
> throughout."

Briefly show the risk assessment + the training-sessions slider live. **(proxy-derived — Kaggle
IBM HR attrition dataset, not real Zimbabwean data — say this explicitly)**.

---

## 1:00–3:00 — Manager Action Inbox: the mechanism, briefly **[SHARED, abbreviated]**

Switch to **Action Inbox**. Show one flagged case, the plain-language SHAP sentence, and the
causal-lever estimate.

> "The key distinction here is between correlation and causation. This tool doesn't just say
> 'this factor is associated with risk' — it estimates whether *acting* on a specific lever would
> actually move the outcome. That's a genuinely harder technical problem, and it's the difference
> between a system that produces plausible-sounding recommendations and one that's actually been
> checked."

**(proxy-derived** — same Kaggle attrition dataset; the causal-forest *method* (EconML
CausalForestDML, double machine learning) is a real, published technique, applied here to proxy
data pending real institutional data**)**.

---

## 3:00–6:00 — National Evidence View: sovereignty and evidence **[HEAD-OF-STATE-ONLY]**

Switch to **National View**.

### Federated learning demonstration

> "This is the piece that matters most for a national rollout across multiple banks, telcos, or
> public-sector institutions: none of them have to hand their raw employee data to anyone —
> including us — to still contribute to a shared model."

Click **Run live simulation**. Narrate while it runs:

> "You're watching three simulated institutions each train a model on their own local data
> partition right now. Only the model's learned parameters — not the underlying records — get
> combined centrally. Watch the loss curve converge toward the centralized baseline over these
> rounds — that's the proof that federation approaches full-data performance without ever moving
> the raw data."

**Say explicitly, every time this appears on screen**: *"This is a simulation — three processes
on one laptop, not three real institutions. The mechanism (Flower's real FedAvg aggregation
algorithm) is real; the institutions are not, yet."* **(the loss numbers themselves are
proxy-derived — same Kaggle attrition dataset, partitioned synthetically to represent
"institutions" for this demo)**.

### National-evidence framing

> "Reframe this same mechanism at a sector level: not 'this employee is at risk,' but 'what does
> this mean for the country's financial-services skills pipeline.'"

Point at the sector attrition-risk rate and department breakdown.

> "This screen only ever shows aggregated counts and rates — never an individual record. That's
> not just a promise, it's how the screen is built: the underlying component never receives
> individual employee data at all."

**(proxy-derived** — whatever batch data was uploaded for this demo; a real national rollout
would replace this with aggregated evidence across actual participating institutions**)**.

---

## 6:00–8:30 — Zimbabwe National AI Strategy alignment **[HEAD-OF-STATE-ONLY]**

Scroll to the alignment section.

> "This isn't positioned as a foreign platform asking to operate in Zimbabwe — it's designed
> around two pillars of the country's own National AI Strategy. Pillar 1, talent and capacity:
> the skills-gap output you just saw becomes a demand signal for what national AI-academy
> curricula should actually teach, feeding into Cognify's reskilling pathways. Pillar 3, and
> Project Pangolin specifically: the federated architecture is the technical answer to
> sovereign-data-versus-national-evidence tension — institutions keep their data, the country
> still gets the evidence base."

**Say explicitly**: *"This pillar language reflects our own planning documentation's stated
alignment with the strategy — I'd ask you or your team to verify it against the published
strategy text directly before we use this framing formally."* **(real — this is the project's
own drafted positioning, not fabricated for this demo, but not independently verified against the
government's exact published text in this session)**.

---

## 8:30–9:30 — Board-ready export, briefly **[SHARED, abbreviated]**

Return to Action Inbox, click **Export PDF** on one employee row — show that everything discussed
is captured in one exportable document with the same proxy-data disclaimer throughout.

---

## 9:30–10:00 — Close **[HEAD-OF-STATE-ONLY]**

> "Nothing you saw today is a finding about Zimbabwe's real workforce — every screen says so, and
> I want to be direct about that rather than let a compelling demo imply otherwise. What we've
> shown is a working mechanism: predictions that come with an honest explanation, causal
> validation before recommending action, and — critically for a national rollout — an
> architecture where institutions never have to give up their data to participate in a shared,
> national evidence base. That mechanism is real. Scaling it to real institutions is the
> conversation I'd like to have next."

---

## Fallback plan (per Phase D requirement)

- **If the live federated simulation fails or is slow mid-pitch**: have one successful run's
  results captured as a screenshot/export beforehand, and narrate from that rather than
  re-triggering it live under time pressure — the simulation is real compute (a few seconds to
  a minute), not instant, and a stall reads badly in front of this audience specifically.
- **If network is bad**: toggle **Low-bandwidth mode** before starting — verified functionally in
  this repo but **not verified under real 3G throttling**; test on the actual venue's network
  beforehand, don't assume.
- **Offline-capable build**: not built in this repo as of this writing — pre-build and test the
  Docker images before traveling to the venue; do not plan to `pip install`/build anything on
  site.
- **If asked a question this script doesn't cover**: the honest fallback answer for anything
  about real Zimbabwean data, real institutional partners, or production federated learning is
  "that's the roadmap, not the current state" — never improvise a claim the model hasn't earned.
