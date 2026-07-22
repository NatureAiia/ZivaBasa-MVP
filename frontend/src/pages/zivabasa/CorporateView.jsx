import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Upload } from "lucide-react";
import { motion } from "framer-motion";
import Card from "../../components/common/Card";
import EmptyState from "../../components/common/EmptyState";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getAllBatchResults } from "../../lib/batchStore";
import { TASKS, TASK_LABELS, TASK_DESCRIPTIONS } from "../../lib/api";
import { formatPercent } from "../../lib/format";

/*
  Corporate View — the National Evidence View's counterpart scoped down to this
  organization only. Same "aggregate/by_segment only, never individual rows" evidence
  framing, but across every uploaded task (not just "skills") and without the
  federated-simulation / national-strategy sections, which are national-scale concerns.
*/
export default function CorporateView() {
  const [batches, setBatches] = useState(null);

  useEffect(() => {
    getAllBatchResults().then(setBatches);
  }, []);

  const populatedTasks = batches ? TASKS.filter((t) => batches[t]) : [];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <Building2 size={20} className="text-gold" /> Corporate View
            </h1>
            <p className="text-xs text-ink-muted mt-1 max-w-lg">
              Aggregate evidence for this organization only — never any one employee's number.
            </p>
          </div>

          {!batches ? null : populatedTasks.length === 0 ? (
            <Card animated={false}>
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
            </Card>
          ) : (
            populatedTasks.map((task) => {
              const batch = batches[task];
              return (
                <Card key={task} variants={fadeUpItem} animated={false} className="flex flex-col gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{TASK_LABELS[task]}</h2>
                    <p className="text-xs text-ink-muted mt-0.5">{TASK_DESCRIPTIONS[task]}</p>
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
                </Card>
              );
            })
          )}

          <p className="text-[11px] text-ink-faint leading-relaxed">
            This screen only ever reads aggregate counts and per-segment rates — never individual rows or
            names — from whatever your organization uploaded. Treat every number as a reflection of your
            uploaded data, not a verified external figure.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
