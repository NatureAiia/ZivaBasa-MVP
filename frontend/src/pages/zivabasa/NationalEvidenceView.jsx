import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Globe2, Landmark, Loader2, Play, ShieldAlert, Sparkles } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getBatchResult } from "../../lib/batchStore";
import { api } from "../../lib/api";
import { formatPercent } from "../../lib/format";

const TASK = "skills";
const NUM_INSTITUTIONS = 3;
const NUM_ROUNDS = 5;

// A perpetual, unmissable "this is simulated" marker — per the demo-readiness prompt's explicit
// instruction that conflating a same-machine simulation with a real deployment in front of a
// head of state is the single worst mistake this screen could make. Shown wherever the
// federated results appear, not just once at the top.
function SimulatedBadge() {
  return (
    <Badge tone="gold" className="uppercase tracking-wide">
      Simulated
    </Badge>
  );
}

function FederatedRoundChart({ history }) {
  const W = 320, H = 120, PAD = 24;
  const maxLoss = Math.max(...history.map((r) => r.val_loss), 0.01);
  const minLoss = Math.min(...history.map((r) => r.val_loss), 0);
  const xScale = (round) => PAD + ((round - 1) / Math.max(history.length - 1, 1)) * (W - 2 * PAD);
  const yScale = (loss) => H - PAD - ((loss - minLoss) / (maxLoss - minLoss || 1)) * (H - 2 * PAD);
  const path = history.map((r, i) => `${i === 0 ? "M" : "L"} ${xScale(r.round)} ${yScale(r.val_loss)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Federated validation loss per round">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="rgb(var(--border))" strokeWidth="1" />
      <path d={path} fill="none" stroke="rgb(var(--teal))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {history.map((r) => (
        <circle key={r.round} cx={xScale(r.round)} cy={yScale(r.val_loss)} r="3" fill="rgb(var(--teal))" />
      ))}
      {history.map((r) => (
        <text key={r.round} x={xScale(r.round)} y={H - PAD + 14} fontSize="8" textAnchor="middle" fill="rgb(var(--ink-faint))">
          R{r.round}
        </text>
      ))}
    </svg>
  );
}

/*
  National / Sovereignty View — the head-of-state-track flagship screen (demo-readiness Phase
  C). Three sections, each mapping to one Phase C requirement:
    1. Federated learning demo — runs the real (if single-process) simulation live via
       POST /federated/simulate, "Simulated" labeled throughout, never presented as production.
    2. National-evidence framing — reuses the SAME skills-task batch data the Manager Action
       Inbox reads, but ONLY the already-aggregated `aggregate`/`by_segment` fields (never
       `rows`/`top_rows`, which carry individual identifiers) — genuinely anonymized output,
       not a relabeled individual view.
    3. Zimbabwe National AI Strategy alignment — static content using the 2035 planning
       document's own drafted Pillar 1 / Pillar 3-Project Pangolin mapping verbatim, not a
       paraphrase invented for this screen.
*/
export default function NationalEvidenceView() {
  const [batch, setBatch] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);

  useEffect(() => {
    getBatchResult(TASK).then(setBatch);
  }, []);

  const runSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    try {
      setSimResult(await api.federatedSimulate(TASK, NUM_INSTITUTIONS, NUM_ROUNDS));
    } catch (e) {
      setSimError(e.message);
    } finally {
      setSimLoading(false);
    }
  };

  const nationalStats = useMemo(() => {
    if (!batch?.aggregate) return null;
    return { aggregate: batch.aggregate, bySegment: batch.by_segment || [] };
  }, [batch]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <Globe2 size={20} className="text-gold" /> National Evidence & Sovereignty View
            </h1>
            <p className="text-xs text-ink-muted mt-1 max-w-lg">
              What this platform's architecture means for national-scale workforce evidence — not any one
              institution's or individual's number.
            </p>
          </div>

          {/* 1. Federated demo */}
          <Card variants={fadeUpItem} className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-ink">Federated Learning Demonstration</h2>
                <SimulatedBadge />
              </div>
              <button
                onClick={runSimulation}
                disabled={simLoading}
                className="flex items-center gap-1.5 bg-gold text-bg rounded-xl px-3.5 py-2 text-xs font-semibold hover:brightness-110 disabled:opacity-50"
              >
                {simLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                {simLoading ? "Running…" : "Run live simulation"}
              </button>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              {NUM_INSTITUTIONS} simulated institutions each train locally on their own data partition — raw
              records never leave their partition — and only model weight updates are aggregated centrally
              (Flower's FedAvg). Runs live, in this process, when you click the button above.
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              {Array.from({ length: NUM_INSTITUTIONS }, (_, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-surface2/50 px-3 py-2 text-[11px] text-ink-muted">
                  <ShieldAlert size={12} className="text-gold" />
                  Simulated Institution {i + 1}
                  <span className="text-ink-faint">— raw data stays local</span>
                </div>
              ))}
            </div>

            {simError && <p className="text-xs text-red">{simError}</p>}

            {simResult && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                    Federated validation loss, per round
                  </span>
                  <SimulatedBadge />
                </div>
                <FederatedRoundChart history={simResult.round_history} />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-surface2/60 p-2.5">
                    <span className="text-[10px] text-ink-faint block">Final federated loss</span>
                    <span className="font-mono text-sm text-ink">{simResult.final_federated_val_loss.toFixed(4)}</span>
                  </div>
                  <div className="rounded-lg bg-surface2/60 p-2.5">
                    <span className="text-[10px] text-ink-faint block">Centralized baseline (no privacy)</span>
                    <span className="font-mono text-sm text-ink">{simResult.centralized_val_loss.toFixed(4)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-ink-faint leading-relaxed bg-gold/5 border border-gold/25 rounded-lg p-2.5">
                  <strong className="text-ink">{simResult.simulation_note}</strong>
                </p>
              </div>
            )}
          </Card>

          {/* 2. National-evidence framing */}
          <Card animated={false} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-teal" />
              <h2 className="text-sm font-semibold text-ink">Sector-Level Evidence, Not Individual Records</h2>
            </div>
            {nationalStats ? (
              <>
                <p className="text-xs text-ink-muted leading-relaxed">
                  What this means for the country's financial-services skills pipeline — aggregated across{" "}
                  {batch?.n_rows ?? "the uploaded"} roles, never any one employee's number.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface2/60 p-3">
                    <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold block">
                      Sector attrition-risk rate
                    </span>
                    <span className="font-mono text-xl font-semibold text-ink">
                      {formatPercent(nationalStats.aggregate.positive_rate)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-surface2/60 p-3">
                    <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold block">
                      Roles assessed
                    </span>
                    <span className="font-mono text-xl font-semibold text-ink">{batch?.n_rows}</span>
                  </div>
                </div>
                {nationalStats.bySegment.length > 0 && (
                  <div>
                    <span className="text-[11px] text-ink-faint block mb-1.5">By department segment (aggregate only)</span>
                    <div className="flex flex-col gap-1.5">
                      {nationalStats.bySegment.map((s) => (
                        <div key={s.segment} className="flex items-center justify-between text-xs">
                          <span className="text-ink-muted">{s.segment}</span>
                          <span className="font-mono text-ink">{formatPercent(s.positive_rate)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-ink-faint leading-relaxed">
                  This screen only ever reads aggregate counts and per-segment rates — never individual rows or
                  names — from whatever data was uploaded. Kaggle proxy data unless real HR data was substituted;
                  treat every number as illustrative of the mechanism, not a national statistic.
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-faint">
                Upload a "skills" batch (Predict → Upload &amp; Analyze) to populate sector-level evidence here.
              </p>
            )}
          </Card>

          {/* 3. Zimbabwe National AI Strategy alignment */}
          <Card animated={false} className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Landmark size={15} className="text-gold" />
              <h2 className="text-sm font-semibold text-ink">Zimbabwe National AI Strategy 2026–2030 Alignment</h2>
            </div>
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border p-3.5">
                <span className="text-xs font-semibold text-ink block mb-1">Pillar 1 — Talent &amp; Capacity</span>
                <p className="text-xs text-ink-muted leading-relaxed">
                  ZivaBasa's skills-gap output directly feeds Cognify reskilling pathways and, by extension,
                  national AI-academy curricula — a demand-signal generator for what Zimbabwe's AI-talent
                  pipeline should actually teach.
                </p>
              </div>
              <div className="rounded-xl border border-border p-3.5">
                <span className="text-xs font-semibold text-ink block mb-1">Pillar 3 / Project Pangolin — Sovereign Data &amp; National Evidence</span>
                <p className="text-xs text-ink-muted leading-relaxed">
                  The federated architecture demonstrated above is designed so raw institutional data never has
                  to leave Zimbabwean institutional walls to still contribute to a national evidence base —
                  addressing the sovereignty-vs-scale tension national AI strategies typically struggle with.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-ink-faint leading-relaxed border-t border-border pt-3">
              This mapping reflects this project's own planning documentation's stated alignment with the
              strategy's pillar language — verify against the published Zimbabwe National AI Strategy
              2026–2030 text directly before using this framing in a formal setting.
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
