import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import ClarityRing from "../common/ClarityRing";
import Badge from "../common/Badge";
import { formatPercent, formatRaw, isOverconfident } from "../../lib/format";
import { TASK_POSITIVE_IS_RISK } from "../../lib/api";

export default function PredictionResult({ result }) {
  if (!result) return null;

  if (result.task_type === "classification") {
    const positiveIsRisk = TASK_POSITIVE_IS_RISK[result.task] ?? true;
    const isRisk = positiveIsRisk ? result.label === 1 : result.label === 0;
    const overconfident = isOverconfident(result.probability);
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ClarityRing mode="confidence" value={result.probability} size={64} color={isRisk ? "red" : "teal"} />
          <div>
            <div className="font-mono text-2xl font-semibold text-ink">{formatPercent(result.probability)}</div>
            <Badge tone={isRisk ? "red" : "teal"}>{isRisk ? "Flagged" : "Clear"}</Badge>
          </div>
        </div>
        <p className="text-xs text-ink-muted">Predicted probability for task "{result.task}"</p>
        {overconfident && (
          <div className="flex gap-2 items-start bg-gold/10 border border-gold/25 rounded-xl px-3 py-2.5 text-[11px] text-gold leading-relaxed">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Extremely confident output — this prototype's model is trained on a few thousand
              proxy rows with no calibration step, so near-0%/near-100% readings can reflect an
              overconfident model, not certainty. Treat as directional, not exact.
            </span>
          </div>
        )}
      </motion.div>
    );
  }

  const direction = result.raw_output >= 0 ? "above-average" : "below-average";
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <div className="font-mono text-2xl font-semibold text-ink">{formatRaw(result.raw_output)}</div>
      <p className="text-xs text-ink-muted leading-relaxed">
        Standardized regression output for task "{result.task}" — a z-score against the training
        distribution, not a natural-scale number. This input is predicted{" "}
        <strong className="text-ink">{direction}</strong> the training-set mean (0 = exactly
        average, ±1 ≈ one standard deviation).
      </p>
    </motion.div>
  );
}
