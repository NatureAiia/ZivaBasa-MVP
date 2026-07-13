import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { formatRaw } from "../../lib/format";

export default function ShapLedger({ result }) {
  if (!result) return null;
  const maxAbs = Math.max(...result.top_contributions.map((c) => Math.abs(c.shap_value)), 1e-9);

  return (
    <div className="flex flex-col gap-4">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2.5">
        {result.top_contributions.map((c) => {
          const pct = (Math.abs(c.shap_value) / maxAbs) * 50;
          const isPos = c.shap_value >= 0;
          return (
            <motion.div key={c.feature} variants={fadeUpItem} className="grid grid-cols-[110px_1fr_70px] items-center gap-3 text-xs">
              <div className="font-mono text-ink-muted truncate" title={c.feature}>{c.feature}</div>
              <div className="relative h-2 rounded-full bg-surface2 overflow-hidden">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 26 }}
                  className={`absolute top-0 bottom-0 rounded-full ${isPos ? "bg-teal left-1/2" : "bg-red right-1/2"}`}
                />
              </div>
              <div className={`font-mono text-right ${isPos ? "text-teal" : "text-red"}`}>
                {isPos ? "+" : ""}{c.shap_value.toFixed(4)}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      <p className="text-[11px] text-ink-faint leading-relaxed border-t border-border pt-3">
        Base value (average model output over the background sample):{" "}
        <span className="font-mono text-ink-muted">{formatRaw(result.base_value)}</span>. This
        prediction: <span className="font-mono text-ink-muted">{formatRaw(result.prediction)}</span>.
        Explainer used: <span className="font-mono text-ink-muted">{result.explainer_used}</span>.
      </p>
    </div>
  );
}
