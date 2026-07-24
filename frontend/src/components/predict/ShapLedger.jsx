import { useEffect } from "react";
import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { formatRaw } from "../../lib/format";
import { metaFor } from "../../lib/fieldMeta";
import { LEDGER_GRID_COLS, LedgerHeader, LedgerLegend } from "./shapLedgerShared";
import { markOnboardingStep } from "../../lib/onboardingStore";

/*
  Renamed from raw SHAP jargon to plain language: each bar is "a factor that pushed the
  prediction up or down," not a "SHAP contribution." Feature names route through fieldMeta's
  metaFor() (already built for the Advanced Predict form) so a bank exec sees "Matching
  Skills" instead of "skill_overlap_count" — same source of truth, no duplicate label list to
  keep in sync.
*/
export default function ShapLedger({ result, task }) {
  // Fires once per mount that actually has a result — i.e. the first time a real SHAP
  // explanation renders, not on every re-render while still loading (result is null then).
  useEffect(() => {
    if (result) markOnboardingStep("opened_first_shap");
  }, [result]);

  if (!result) return null;
  const maxAbs = Math.max(...result.top_contributions.map((c) => Math.abs(c.shap_value)), 1e-9);
  const hasLime = result.lime_top_contributions != null && result.agreement_score != null;
  const agreedCount = hasLime ? Math.round(result.agreement_score * result.top_contributions.length) : 0;

  return (
    <div className="flex flex-col gap-4">
      {hasLime && (
        <div className="flex items-center gap-2 text-[11px] bg-surface2 border border-border rounded-lg px-3 py-2">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              result.agreement_score >= 0.6 ? "bg-teal" : result.agreement_score >= 0.3 ? "bg-gold" : "bg-red"
            }`}
          />
          <span className="text-ink-muted">
            SHAP &amp; LIME agree on <span className="text-ink font-medium">{agreedCount}/{result.top_contributions.length}</span> top drivers
          </span>
        </div>
      )}
      <LedgerHeader />
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2.5">
        {result.top_contributions.map((c) => {
          const pct = (Math.abs(c.shap_value) / maxAbs) * 50;
          const isPos = c.shap_value >= 0;
          const label = metaFor(c.feature, task).label || c.feature;
          return (
            <motion.div key={c.feature} variants={fadeUpItem} className={`grid ${LEDGER_GRID_COLS} items-center gap-3 text-xs`}>
              <div className="text-ink-muted truncate" title={c.feature}>{label}</div>
              <div className="relative h-2 rounded-full bg-surface2 overflow-hidden">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 26 }}
                  className={`absolute top-0 bottom-0 rounded-full ${isPos ? "bg-teal left-1/2" : "bg-red right-1/2"}`}
                />
              </div>
              <div className={`text-right font-mono ${isPos ? "text-teal" : "text-red"}`}>
                {isPos ? "+" : ""}
                {formatRaw(c.shap_value)}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <LedgerLegend />
      <p className="text-[11px] text-ink-faint leading-relaxed border-t border-border pt-3">
        Longer bar, bigger effect. Starting point (typical case):{" "}
        <span className="font-mono text-ink-muted">{formatRaw(result.base_value)}</span>.
        This case: <span className="font-mono text-ink-muted">{formatRaw(result.prediction)}</span>.
      </p>
    </div>
  );
}
