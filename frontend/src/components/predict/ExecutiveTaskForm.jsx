import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import Button from "../common/Button";
import Skeleton from "../common/Skeleton";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { metaFor, GROUP_ORDER } from "../../lib/fieldMeta";

function formatDisplay(meta, value) {
  if (meta.type === "currency") return `$${Number(value).toLocaleString()}`;
  if (meta.type === "percent") return `${Math.round(value * 100)}%`;
  if (meta.unit) return `${value} ${meta.unit}`;
  return `${value}`;
}

function FieldControl({ name, meta, value, onChange }) {
  if (meta.type === "select") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(name, parseFloat(e.target.value))}
        className="bg-surface2 border border-border rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/50 transition-colors"
      >
        {meta.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  // slider / currency / percent / number — all a bounded range input with a live readout
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        onChange={(e) => onChange(name, parseFloat(e.target.value))}
        className="flex-1 accent-gold h-1.5"
      />
      <span className="font-mono text-xs text-ink w-20 text-right shrink-0">{formatDisplay(meta, value)}</span>
    </div>
  );
}

export default function ExecutiveTaskForm({ task, schema, initialValues, onPredict, onExplain, predicting, explaining, canExplain, loading }) {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!schema) return;
    const next = {};
    schema.feature_names.forEach((name, i) => {
      const meta = metaFor(name);
      next[name] = meta.derived ? undefined : (initialValues?.[i] ?? meta.min ?? 0);
    });
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  if (loading || !schema) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  const setField = (name, v) => setValues((prev) => ({ ...prev, [name]: v }));

  const buildOrderedValues = () =>
    schema.feature_names.map((name) => {
      const meta = metaFor(name);
      if (meta.derived) return meta.compute(values);
      return values[name] ?? 0;
    });

  const visibleNames = schema.feature_names.filter((n) => !metaFor(n).derived);
  const derivedNames = schema.feature_names.filter((n) => metaFor(n).derived);
  const groups = (GROUP_ORDER[task] || []).filter((g) => visibleNames.some((n) => metaFor(n).group === g));
  const ungrouped = visibleNames.filter((n) => !groups.includes(metaFor(n).group));

  return (
    <div className="flex flex-col gap-5">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
        {[...groups, ...(ungrouped.length ? ["Other"] : [])].map((group) => (
          <motion.div key={group} variants={fadeUpItem} className="flex flex-col gap-3">
            <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">{group}</h3>
            {visibleNames
              .filter((n) => (metaFor(n).group || "Other") === group)
              .map((name) => {
                const meta = metaFor(name);
                return (
                  <div key={name} className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-ink" title={meta.tooltip}>
                      {meta.label}
                      {meta.tooltip && <Info size={11} className="text-ink-faint" />}
                    </label>
                    <FieldControl name={name} meta={meta} value={values[name] ?? meta.min ?? 0} onChange={setField} />
                  </div>
                );
              })}
          </motion.div>
        ))}

        {derivedNames.length > 0 && (
          <motion.div variants={fadeUpItem} className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5">
            <span className="text-[11px] text-ink-faint">
              {derivedNames.map((n) => metaFor(n).label).join(" & ")} calculated automatically from the fields above — no separate input needed.
            </span>
          </motion.div>
        )}
      </motion.div>

      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={() => onPredict(buildOrderedValues())} disabled={predicting} className="flex-1">
          {predicting ? "Running…" : "Run Assessment"}
        </Button>
        <Button variant="secondary" onClick={() => onExplain(buildOrderedValues())} disabled={!canExplain || explaining} className="flex-1">
          {explaining ? "Analyzing…" : "Show Key Drivers"}
        </Button>
      </div>
    </div>
  );
}
