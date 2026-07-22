import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, FileDown, Inbox, TrendingUp, Upload } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import EmptyState from "../../components/common/EmptyState";
import ShapLedger from "../../components/predict/ShapLedger";
import { staggerContainer, fadeUpItem, fadeScale } from "../../lib/motion";
import { getBatchResult } from "../../lib/batchStore";
import { metaFor } from "../../lib/fieldMeta";
import { api } from "../../lib/api";
import { formatPercent } from "../../lib/format";
import { downloadBlob } from "../../lib/report";
import { useLowBandwidth } from "../../lib/lowBandwidthStore";

// Text-first fallback for low-bandwidth mode — same data as ShapLedger, no SVG-equivalent
// animated bars, just a plain list. Cheaper to render and doesn't rely on framer-motion.
function PlainShapList({ result, task }) {
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {result.top_contributions.map((c) => {
        const label = metaFor(c.feature, task).label || c.feature;
        const isPos = c.shap_value >= 0;
        return (
          <li key={c.feature} className="flex items-center justify-between gap-2">
            <span className="text-ink-muted truncate">{label}</span>
            <span className={isPos ? "text-teal" : "text-red"}>{isPos ? "Pushed up" : "Pushed down"}</span>
          </li>
        );
      })}
    </ul>
  );
}

const PAGE_SIZE = 10;
const TASK = "skills";

// Illustrative HR-industry rule of thumb (commonly cited range is 6-9 months' salary to
// replace an employee — recruiting, onboarding, lost-productivity ramp) — NOT a verified,
// company-specific cost model. Labeled as such everywhere this number appears on screen, per
// the demo-readiness prompt's honesty mandate (every number must carry honest labeling).
const REPLACEMENT_COST_MONTHS = 9;

/*
  Manager Action Inbox — the CEO-track flagship screen (demo-readiness Phase B, 2035 doc's own
  framing: "3 employees on your team are at elevated attrition risk this quarter — here's the
  one lever proven to move it"). A queue to clear, not a dashboard to admire: one flagged
  employee per row, one recommended lever, one cost-of-inaction number, expandable into why.

  Reuses the exact same batch-upload -> batchStore -> per-row SHAP pattern RosterTab.jsx already
  established for skill_match, applied to the "skills" (attrition) task instead — no new upload
  flow, no new backend endpoint for the inbox itself (only /uplift/{task} is new).
*/
export default function ManagerActionInbox() {
  const { lowBandwidth } = useLowBandwidth();
  const [batch, setBatch] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState(null);
  const [explainCache, setExplainCache] = useState({});
  const [upliftCache, setUpliftCache] = useState({});
  const [loadingRow, setLoadingRow] = useState(null);
  const [schema, setSchema] = useState(null);
  const [exportingRow, setExportingRow] = useState(null); // `${row._name}:pdf` | `${row._name}:xlsx`

  useEffect(() => {
    getBatchResult(TASK).then(setBatch);
    api.schema(TASK).then(setSchema).catch(() => {});
  }, []);

  const flagged = useMemo(() => {
    if (!batch?.rows) return [];
    return batch.rows.filter((r) => r._label === 1).sort((a, b) => b._value - a._value);
  }, [batch]);

  const totalCostOfInaction = useMemo(() => {
    if (!flagged.length) return null;
    return flagged.reduce((sum, r) => sum + (Number(r.MonthlyIncome) || 0) * REPLACEMENT_COST_MONTHS, 0);
  }, [flagged]);

  const toggleRow = async (row) => {
    const id = row._name;
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (explainCache[id] || !schema) return;

    setLoadingRow(id);
    try {
      // A field can arrive as the "REDACTED" sentinel (see api/redact.py) for a viewer-role
      // caller — not a number the explain/uplift endpoints can use. Fail honestly rather than
      // silently substituting a fake value into what would look like a real explanation.
      const redactedField = schema.feature_names.find((n) => row[n] === "REDACTED");
      if (redactedField) {
        setExplainCache((c) => ({
          ...c,
          [id]: { error: "Explain unavailable — this row includes a field redacted for your role." },
        }));
        return;
      }
      const featureValues = schema.feature_names.map((n) => row[n] ?? 0);
      const [explainResult, upliftResult] = await Promise.all([
        api.explain(TASK, featureValues, 8, true),
        api.uplift(TASK, featureValues).catch((e) => ({ error: e.message })),
      ]);
      setExplainCache((c) => ({ ...c, [id]: explainResult }));
      setUpliftCache((c) => ({ ...c, [id]: upliftResult }));
    } catch (e) {
      setExplainCache((c) => ({ ...c, [id]: { error: e.message } }));
    } finally {
      setLoadingRow(null);
    }
  };

  const riskSentence = (result) => {
    const top = result?.top_contributions?.[0];
    if (!top) return null;
    const topLabel = (metaFor(top.feature, TASK).label || top.feature).toLowerCase();
    const opposite = result.top_contributions.find((c) => Math.sign(c.shap_value) !== Math.sign(top.shap_value));
    const oppositeLabel = opposite ? (metaFor(opposite.feature, TASK).label || opposite.feature).toLowerCase() : null;
    return oppositeLabel
      ? `This employee's risk is driven mainly by ${topLabel}, not ${oppositeLabel}.`
      : `This employee's risk is driven mainly by ${topLabel}.`;
  };

  // Board-ready export (demo-readiness Phase D): reuses the existing /reports/predict/{pdf,xlsx}
  // endpoints (built for the Predict tab) rather than a new inbox-specific report builder —
  // shapes this one employee's skills-task result into the same {task: {predict, explain}}
  // contract, and attaches the cost-of-inaction + causal-lever estimate via extra_notes (a
  // generic field those endpoints already support, not an inbox-only special case).
  const exportRow = async (row, format) => {
    const explain = explainCache[row._name];
    const uplift = upliftCache[row._name];
    if (!explain || explain.error) return;

    const costOfInaction = (Number(row.MonthlyIncome) || 0) * REPLACEMENT_COST_MONTHS;
    const results = {
      skills: {
        predict: { task_type: "classification", probability: row._value, label: 1 },
        explain,
      },
    };
    const noteLines = [
      `**Estimated cost of inaction:** $${costOfInaction.toLocaleString(undefined, { maximumFractionDigits: 0 })} ` +
        `(illustrative — ${REPLACEMENT_COST_MONTHS} months' salary, a commonly cited HR replacement-cost heuristic).`,
    ];
    if (uplift && !uplift.error) {
      noteLines.push(`**Recommended lever:** ${uplift.interpretation}`);
    }
    const extraNotes = { skills: noteLines.join("\n\n") };

    setExportingRow(`${row._name}:${format}`);
    try {
      const blob =
        format === "pdf"
          ? await api.predictReportPdf(results, extraNotes)
          : await api.predictReportXlsx(results, extraNotes);
      downloadBlob(`zivabasa-inbox-${row._name.replace(/\s+/g, "-")}-${Date.now()}.${format}`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setExportingRow(null);
    }
  };

  if (!batch) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={Inbox}
          title="No attrition-risk data yet"
          description='Run a "skills" batch upload from Predict → Upload & Analyze to populate the Manager Action Inbox.'
          action={
            <Link to="../predict" className="flex items-center gap-1.5 text-xs font-medium text-gold hover:brightness-110">
              <Upload size={13} /> Go to Predict
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="p-6 max-w-4xl mx-auto w-full flex flex-col gap-5"
      >
        <div>
          <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
            <Inbox size={20} className="text-gold" /> Manager Action Inbox
          </h1>
          <p className="text-xs text-ink-muted mt-1 max-w-lg">
            {flagged.length} employee{flagged.length === 1 ? "" : "s"} on your team {flagged.length === 1 ? "is" : "are"} at
            elevated attrition risk this quarter — one recommended lever each, not a chart to interpret.
          </p>
        </div>

        {totalCostOfInaction != null && (
          <Card variants={fadeUpItem} className="bg-gradient-to-br from-gold/10 to-transparent border-gold/25">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
              Estimated cost of inaction this quarter
            </span>
            <div className="font-mono text-3xl font-bold text-ink mt-1">
              ${totalCostOfInaction.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
              Illustrative estimate only: {REPLACEMENT_COST_MONTHS} months' salary per flagged employee (a commonly
              cited HR replacement-cost heuristic — recruiting, onboarding, lost-productivity ramp), summed across all
              {" "}{flagged.length} flagged employees. Not a company-specific costing exercise — see Cost Monitoring for
              the honesty note on what would be needed to make this a real number.
            </p>
          </Card>
        )}

        <Card animated={false} className="p-0 overflow-hidden">
          {flagged.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={TrendingUp} title="No flagged employees" description="Nobody in this upload crossed the attrition-risk threshold." />
            </div>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-border">
                {flagged.slice(0, visibleCount).map((row) => {
                  const explain = explainCache[row._name];
                  const uplift = upliftCache[row._name];
                  const costOfInaction = (Number(row.MonthlyIncome) || 0) * REPLACEMENT_COST_MONTHS;
                  return (
                    <div key={row._name}>
                      <button
                        onClick={() => toggleRow(row)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface2/60 transition-colors"
                      >
                        <Badge tone="red" className="w-fit shrink-0">
                          {formatPercent(row._value)}
                        </Badge>
                        <span className="font-mono text-xs text-ink flex-1 truncate">{row._name}</span>
                        <span className="text-[11px] text-ink-faint hidden sm:inline">
                          ${costOfInaction.toLocaleString(undefined, { maximumFractionDigits: 0 })} at risk
                        </span>
                        <ChevronDown
                          size={14}
                          className={`text-ink-faint transition-transform ${expanded === row._name ? "rotate-180" : ""}`}
                        />
                      </button>
                      {expanded === row._name && (() => {
                        const inner = (
                          <div className="bg-surface2/60 rounded-xl p-4 flex flex-col gap-4">
                            {loadingRow === row._name ? (
                              <p className="text-xs text-ink-faint">Computing explanation and lever estimate…</p>
                            ) : explain?.error ? (
                              <p className="text-xs text-red">{explain.error}</p>
                            ) : explain ? (
                              <>
                                <p className="text-sm text-ink font-medium leading-relaxed">{riskSentence(explain)}</p>
                                {lowBandwidth ? (
                                  <PlainShapList result={explain} task={TASK} />
                                ) : (
                                  <ShapLedger result={explain} task={TASK} />
                                )}

                                <div className="border-t border-border pt-3">
                                  <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">
                                    Recommended lever
                                  </h3>
                                  {uplift?.error ? (
                                    <p className="text-xs text-red">{uplift.error}</p>
                                  ) : uplift ? (
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle
                                        size={13}
                                        className={`shrink-0 mt-0.5 ${uplift.statistically_significant_90pct ? "text-teal" : "text-ink-faint"}`}
                                      />
                                      <p className="text-xs text-ink-muted leading-relaxed">{uplift.interpretation}</p>
                                    </div>
                                  ) : null}
                                </div>

                                <div className="flex gap-2 border-t border-border pt-3">
                                  <button
                                    onClick={() => exportRow(row, "pdf")}
                                    disabled={exportingRow === `${row._name}:pdf`}
                                    className="flex items-center gap-1.5 text-[11px] font-medium bg-gold/10 border border-gold/30 text-gold rounded-lg px-2.5 py-1.5 hover:bg-gold/15 transition-colors disabled:opacity-50"
                                  >
                                    <FileDown size={12} />
                                    {exportingRow === `${row._name}:pdf` ? "Generating…" : "Export PDF"}
                                  </button>
                                  <button
                                    onClick={() => exportRow(row, "xlsx")}
                                    disabled={exportingRow === `${row._name}:xlsx`}
                                    className="flex items-center gap-1.5 text-[11px] font-medium bg-surface2 border border-border text-ink-muted rounded-lg px-2.5 py-1.5 hover:text-ink transition-colors disabled:opacity-50"
                                  >
                                    <FileDown size={12} />
                                    {exportingRow === `${row._name}:xlsx` ? "Generating…" : "Export Excel"}
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        );
                        return lowBandwidth ? (
                          <div className="px-5 pb-4">{inner}</div>
                        ) : (
                          <AnimatePresence>
                            <motion.div variants={fadeScale} initial="hidden" animate="show" exit="exit" className="px-5 pb-4">
                              {inner}
                            </motion.div>
                          </AnimatePresence>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>

              {visibleCount < flagged.length && (
                <div className="p-4 border-t border-border">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full text-xs font-medium text-gold hover:brightness-110 transition-all py-1.5"
                  >
                    Show more ({flagged.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </Card>

        <p className="text-[11px] text-ink-faint leading-relaxed">
          Attrition risk is a model output on whatever roster data you uploaded (Kaggle proxy data unless real HR
          data was substituted) — a starting shortlist for HR review, not an automatic decision. The recommended-lever
          estimate is a causal/uplift model (EconML CausalForestDML), separate from the SHAP explanation above it —
          SHAP shows association, the lever estimate shows whether training hours actually move this employee's risk.
        </p>
      </motion.div>
    </div>
  );
}
