import { motion } from "framer-motion";

/*
  A dependency-free CSS timeline of the predict/explain pipeline for the current task —
  pattern adapted from NeuroWorks's TraceBlock (a hand-rolled Gantt strip, no chart library),
  reworked with ZivaBasa's own steps (schema -> predict -> explain) and design tokens.
  `steps` is [{ key, label, status: "pending"|"active"|"done"|"error", ms }].
*/
const STATUS_COLOR = {
  pending: "bg-surface2",
  active: "bg-gold animate-pulse",
  done: "bg-teal",
  error: "bg-red",
};

export default function PipelineTrace({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface2 gap-0.5">
        {steps.map((s) => (
          <motion.div
            key={s.key}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            className={`flex-1 rounded-full ${STATUS_COLOR[s.status]}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-ink-faint">
        {steps.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                s.status === "done" ? "bg-teal" : s.status === "error" ? "bg-red" : s.status === "active" ? "bg-gold" : "bg-ink-faint/40"
              }`}
            />
            {s.label}
            {s.status === "done" && typeof s.ms === "number" && (
              <span className="font-mono text-ink-faint/70">· {s.ms < 1000 ? `${s.ms}ms` : `${(s.ms / 1000).toFixed(1)}s`}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
