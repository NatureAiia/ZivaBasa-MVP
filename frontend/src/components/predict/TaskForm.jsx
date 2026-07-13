import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Button from "../common/Button";
import Skeleton from "../common/Skeleton";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

export default function TaskForm({ schema, initialValues, onPredict, onExplain, predicting, explaining, canExplain, loading }) {
  const [values, setValues] = useState(initialValues || []);

  useEffect(() => {
    setValues(initialValues || []);
  }, [schema, initialValues]);

  if (loading || !schema) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const update = (i, v) => {
    const next = [...values];
    next[i] = v === "" ? 0 : parseFloat(v);
    setValues(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
        {schema.feature_names.map((name, i) => (
          <motion.div key={name} variants={fadeUpItem} className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-ink-muted" htmlFor={`feat-${i}`}>
              {name}
            </label>
            <input
              id={`feat-${i}`}
              type="number"
              step="any"
              value={values[i] ?? 0}
              onChange={(e) => update(i, e.target.value)}
              className="bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-ink focus:border-gold/50 transition-colors outline-none"
            />
          </motion.div>
        ))}
      </motion.div>
      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={() => onPredict(values)} disabled={predicting} className="flex-1">
          {predicting ? "Predicting…" : "Predict"}
        </Button>
        <Button variant="secondary" onClick={() => onExplain(values)} disabled={!canExplain || explaining} className="flex-1">
          {explaining ? "Explaining…" : "Explain"}
        </Button>
      </div>
    </div>
  );
}
