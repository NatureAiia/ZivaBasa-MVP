import { useState } from "react";
import { motion } from "framer-motion";
import { formatRaw } from "../../lib/format";
import { metaFor } from "../../lib/fieldMeta";

/*
  Waterfall/trace view of the same top_contributions ShapLedger renders as independent bars —
  here each feature is applied in sequence against a shared running-total axis, from the
  "typical case" base_value to this case's final prediction. Same teal/red polarity convention
  as ShapLedger (never remapped), just laid out as a cumulative build instead of parallel bars,
  so a viewer can see *how* the prediction was assembled, not just which factors mattered.
*/
export default function ShapWaterfall({ result, task }) {
  const [hovered, setHovered] = useState(null);
  if (!result) return null;

  const { base_value, prediction, top_contributions } = result;
  const steps = [];
  let running = base_value;
  for (const c of top_contributions) {
    const from = running;
    const to = running + c.shap_value;
    steps.push({ feature: c.feature, shap_value: c.shap_value, from, to });
    running = to;
  }
  // top_contributions is a subset of all features — whatever's left between the last step and
  // the actual prediction is every other feature's combined, unlabeled effect.
  const residual = prediction - running;

  const allValues = [base_value, prediction, ...steps.flatMap((s) => [s.from, s.to])];
  const domainMin = Math.min(...allValues);
  const domainMax = Math.max(...allValues);
  const span = domainMax - domainMin || 1e-9;
  const pad = span * 0.08;
  const lo = domainMin - pad;
  const hi = domainMax + pad;
  const toPct = (v) => ((v - lo) / (hi - lo)) * 100;

  const rows = [
    { kind: "anchor", label: "Typical case", value: base_value },
    ...steps.map((s) => ({ kind: "step", ...s })),
    ...(Math.abs(residual) > Math.abs(span) * 0.01
      ? [{ kind: "step", feature: "__residual__", shap_value: residual, from: running, to: prediction }]
      : []),
    { kind: "anchor", label: "This case", value: prediction },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-3 rounded-full bg-surface2 overflow-hidden">
        <div className="absolute inset-y-0" style={{ left: `${toPct(base_value)}%`, width: 2 }}>
          <div className="w-px h-full bg-border" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => {
          if (row.kind === "anchor") {
            return (
              <div key={row.label} className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-xs">
                <div className="text-ink-faint truncate">{row.label}</div>
                <div className="relative h-2">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ink-faint"
                    style={{ left: `calc(${toPct(row.value)}% - 4px)` }}
                  />
                </div>
                <div className="text-right font-mono text-ink-muted">{formatRaw(row.value)}</div>
              </div>
            );
          }

          const isResidual = row.feature === "__residual__";
          const label = isResidual ? "All other factors" : metaFor(row.feature, task).label || row.feature;
          const isPos = row.shap_value >= 0;
          const left = Math.min(toPct(row.from), toPct(row.to));
          const width = Math.abs(toPct(row.to) - toPct(row.from));
          const key = `${row.feature}-${i}`;

          return (
            <div
              key={key}
              className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-xs relative"
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
            >
              <div className={`truncate ${isResidual ? "text-ink-faint italic" : "text-ink-muted"}`} title={row.feature}>
                {label}
              </div>
              <div className="relative h-2 rounded-full bg-surface2/60">
                <motion.div
                  initial={{ opacity: 0, left: `${left + width / 2}%`, width: 0 }}
                  animate={{ opacity: 1, left: `${left}%`, width: `${width}%` }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 220, damping: 28 }}
                  className={`absolute top-0 bottom-0 rounded-full ${
                    isResidual ? "bg-ink-faint/50" : isPos ? "bg-teal" : "bg-red"
                  }`}
                />
                {hovered === key && (
                  <div className="absolute -top-7 left-0 z-10 bg-ink text-bg text-[10px] rounded-md px-2 py-1 whitespace-nowrap pointer-events-none">
                    {isPos ? "+" : ""}
                    {formatRaw(row.shap_value)} → running total {formatRaw(row.to)}
                  </div>
                )}
              </div>
              <div className={`text-right ${isResidual ? "text-ink-faint" : isPos ? "text-teal" : "text-red"}`}>
                {isPos ? "+" : ""}
                {formatRaw(row.shap_value)}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-faint leading-relaxed border-t border-border pt-3">
        Each step applies one factor's effect to the running total, left to right, starting from
        the typical case and ending at this case's prediction. Teal steps push the total up, red
        steps pull it down.
      </p>
    </div>
  );
}
