import { useState } from "react";
import { motion } from "framer-motion";
import { formatRaw } from "../../lib/format";
import { metaFor } from "../../lib/fieldMeta";
import { LedgerHeader, LedgerLegend } from "./shapLedgerShared";

const TIER_ORDER = ["raw", "ratio", "index", "interaction", "target"];
const TIER_LABELS = {
  raw: "Raw inputs",
  ratio: "Ratios",
  index: "Indexes",
  interaction: "Interactions",
  target: "Target-derived",
  other: "Other",
};

/*
  Same running-total mechanics as ShapWaterfall (base_value -> prediction, one step per
  contribution), but grouped into tiers using the raw/ratio/index/interaction/target taxonomy
  features.py already tags every engineered feature with (see backend's
  get_feature_categories()). Each tier ends on a subtotal row before the next tier's bars begin,
  so a viewer can see how much of the prediction each stage of feature engineering accounts for,
  not just the flat ranked list ShapLedger shows.
*/
export default function ShapTierTrace({ result, task }) {
  const [hovered, setHovered] = useState(null);
  if (!result) return null;

  const { base_value, prediction, top_contributions } = result;

  const tiers = TIER_ORDER.map((key) => ({
    key,
    label: TIER_LABELS[key],
    items: top_contributions.filter((c) => (c.category || "other") === key),
  }));
  const otherItems = top_contributions.filter((c) => !TIER_ORDER.includes(c.category));
  if (otherItems.length) tiers.push({ key: "other", label: TIER_LABELS.other, items: otherItems });

  let running = base_value;
  const tierBlocks = tiers
    .filter((t) => t.items.length)
    .map((t) => {
      const steps = t.items.map((c) => {
        const from = running;
        const to = running + c.shap_value;
        running = to;
        return { feature: c.feature, shap_value: c.shap_value, from, to };
      });
      return { ...t, steps, subtotal: running };
    });

  const residual = prediction - running;
  const hasResidual = Math.abs(residual) > 1e-9;

  const allValues = [
    base_value,
    prediction,
    ...tierBlocks.flatMap((t) => t.steps.flatMap((s) => [s.from, s.to])),
  ];
  const domainMin = Math.min(...allValues);
  const domainMax = Math.max(...allValues);
  const span = domainMax - domainMin || 1e-9;
  const pad = span * 0.08;
  const lo = domainMin - pad;
  const hi = domainMax + pad;
  const toPct = (v) => ((v - lo) / (hi - lo)) * 100;

  let stepIndex = 0;

  return (
    <div className="flex flex-col gap-4">
      <LedgerHeader />
      <div className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-xs">
        <div className="text-ink-faint truncate">Typical case</div>
        <div className="relative h-2">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ink-faint"
            style={{ left: `calc(${toPct(base_value)}% - 4px)` }}
          />
        </div>
        <div className="text-right font-mono text-ink-muted">{formatRaw(base_value)}</div>
      </div>

      {tierBlocks.map((tier) => (
        <div key={tier.key} className="flex flex-col gap-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold pt-1">
            {tier.label}
          </div>
          {tier.steps.map((row) => {
            const label = metaFor(row.feature, task).label || row.feature;
            const isPos = row.shap_value >= 0;
            const left = Math.min(toPct(row.from), toPct(row.to));
            const width = Math.abs(toPct(row.to) - toPct(row.from));
            const key = `${tier.key}-${row.feature}`;
            const i = stepIndex++;

            return (
              <div
                key={key}
                className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-xs relative"
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
              >
                <div className="truncate text-ink-muted" title={row.feature}>{label}</div>
                <div className="relative h-2 rounded-full bg-surface2/60">
                  <motion.div
                    initial={{ opacity: 0, left: `${left + width / 2}%`, width: 0 }}
                    animate={{ opacity: 1, left: `${left}%`, width: `${width}%` }}
                    transition={{ delay: i * 0.05, type: "spring", stiffness: 220, damping: 28 }}
                    className={`absolute top-0 bottom-0 rounded-full ${isPos ? "bg-teal" : "bg-red"}`}
                  />
                  {hovered === key && (
                    <div className="absolute -top-7 left-0 z-10 bg-ink text-bg text-[10px] rounded-md px-2 py-1 whitespace-nowrap pointer-events-none">
                      {isPos ? "+" : ""}
                      {formatRaw(row.shap_value)} → running total {formatRaw(row.to)}
                    </div>
                  )}
                </div>
                <div className={`text-right ${isPos ? "text-teal" : "text-red"}`}>
                  {isPos ? "+" : ""}
                  {formatRaw(row.shap_value)}
                </div>
              </div>
            );
          })}
          <div className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-[11px] border-t border-border/60 pt-1 mt-0.5">
            <div className="text-ink-faint italic">Subtotal</div>
            <div />
            <div className="text-right font-mono text-ink-faint">{formatRaw(tier.subtotal)}</div>
          </div>
        </div>
      ))}

      {hasResidual && (
        <div className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-xs">
          <div className="truncate text-ink-faint italic">All other factors</div>
          <div className="relative h-2 rounded-full bg-surface2/60">
            <div
              className="absolute top-0 bottom-0 rounded-full bg-ink-faint/50"
              style={{
                left: `${Math.min(toPct(running), toPct(prediction))}%`,
                width: `${Math.abs(toPct(prediction) - toPct(running))}%`,
              }}
            />
          </div>
          <div className="text-right text-ink-faint">
            {residual >= 0 ? "+" : ""}
            {formatRaw(residual)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[130px_1fr_74px] items-center gap-3 text-xs">
        <div className="text-ink-faint truncate">This case</div>
        <div className="relative h-2">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ink-faint"
            style={{ left: `calc(${toPct(prediction)}% - 4px)` }}
          />
        </div>
        <div className="text-right font-mono text-ink-muted">{formatRaw(prediction)}</div>
      </div>

      <LedgerLegend />
      <p className="text-[11px] text-ink-faint leading-relaxed border-t border-border pt-3">
        Features are grouped by engineering tier — raw inputs first, then derived ratios/indexes,
        then interactions — each tier ending on a subtotal, so you can see how much of the
        prediction comes from raw signal versus engineered/derived signal.
      </p>
    </div>
  );
}
