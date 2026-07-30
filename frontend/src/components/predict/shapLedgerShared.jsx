// Shared visual grammar for the three SHAP views (ShapLedger, ShapWaterfall, ShapTierTrace) —
// one "ledger" reading convention at three zoom levels (ranked list / running total / running
// total grouped by engineering tier), not three unrelated chart types. Column widths, the
// statement-style header row, and the credit/debit legend live here once so the three views
// can't drift apart from each other.
export const LEDGER_GRID_COLS = "grid-cols-[130px_1fr_74px]";

export function LedgerHeader() {
  return (
    <div className={`grid ${LEDGER_GRID_COLS} items-center gap-3 text-[10px] uppercase tracking-wide text-ink-faint font-semibold pb-1 border-b border-border`}>
      <div>Factor</div>
      <div>Effect on prediction</div>
      <div className="text-right">Value</div>
    </div>
  );
}

export function LedgerLegend() {
  return (
    <p className="text-[11px] text-ink-faint leading-relaxed flex items-center gap-4 flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-teal inline-block" /> Credit — pushed the prediction up
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red inline-block" /> Debit — pushed it down
      </span>
    </p>
  );
}
