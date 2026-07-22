import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronDown, Upload } from "lucide-react";
import { motion } from "framer-motion";
import Card from "../../components/common/Card";
import EmptyState from "../../components/common/EmptyState";
import { fadeUpItem } from "../../lib/motion";
import { getAllBatchResults } from "../../lib/batchStore";
import { TASKS, TASK_LABELS, TASK_DESCRIPTIONS } from "../../lib/api";
import { formatPercent } from "../../lib/format";

/*
  Corporate View — embedded under My Organization (not a top-level nav tab). Same
  "aggregate/by_segment only, never individual rows" evidence framing as National Evidence
  View, but scoped to this organization only and across every uploaded task, without the
  federated-simulation / national-strategy sections, which are national-scale concerns.
*/
export default function CorporateView() {
  const [batches, setBatches] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getAllBatchResults().then(setBatches);
  }, []);

  const populatedTasks = batches ? TASKS.filter((t) => batches[t]) : [];

  return (
    <Card animated={false} className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-gold" />
          <div>
            <h2 className="text-sm font-semibold text-ink">Corporate View</h2>
            <p className="text-[11px] text-ink-muted">
              Aggregate evidence for this organization only — never any one employee's number.
            </p>
          </div>
        </div>
        <ChevronDown size={16} className={`text-ink-faint shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex flex-col gap-4 border-t border-border pt-3">
          {!batches ? null : populatedTasks.length === 0 ? (
            <EmptyState
              icon={Upload}
              title="No batch data yet"
              description="Upload a batch (Predict → Upload & Analyze) to populate organization-level evidence here."
              action={
                <Link to="../predict" className="text-xs font-semibold text-gold hover:brightness-110">
                  Go to Predict →
                </Link>
              }
            />
          ) : (
            populatedTasks.map((task) => {
              const batch = batches[task];
              return (
                <motion.div key={task} variants={fadeUpItem} className="rounded-xl border border-border p-3.5 flex flex-col gap-3">
                  <div>
                    <h3 className="text-xs font-semibold text-ink">{TASK_LABELS[task]}</h3>
                    <p className="text-[11px] text-ink-muted mt-0.5">{TASK_DESCRIPTIONS[task]}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-surface2/60 p-3">
                      <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold block">
                        Aggregate rate
                      </span>
                      <span className="font-mono text-xl font-semibold text-ink">
                        {formatPercent(batch.aggregate.positive_rate)}
                      </span>
                    </div>
                    <div className="rounded-lg bg-surface2/60 p-3">
                      <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold block">
                        Rows assessed
                      </span>
                      <span className="font-mono text-xl font-semibold text-ink">{batch.n_rows}</span>
                    </div>
                  </div>
                  {batch.by_segment?.length > 0 && (
                    <div>
                      <span className="text-[11px] text-ink-faint block mb-1.5">By segment (aggregate only)</span>
                      <div className="flex flex-col gap-1.5">
                        {batch.by_segment.map((s) => (
                          <div key={s.segment} className="flex items-center justify-between text-xs">
                            <span className="text-ink-muted">{s.segment}</span>
                            <span className="font-mono text-ink">{formatPercent(s.positive_rate)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}

          {populatedTasks.length > 0 && (
            <p className="text-[11px] text-ink-faint leading-relaxed">
              This section only ever reads aggregate counts and per-segment rates — never individual rows or
              names — from whatever your organization uploaded. Treat every number as a reflection of your
              uploaded data, not a verified external figure.
            </p>
          )}
        </motion.div>
      )}
    </Card>
  );
}
