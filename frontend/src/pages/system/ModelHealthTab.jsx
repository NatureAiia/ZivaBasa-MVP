import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HeartPulse, Loader2, ThumbsDown } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getModelHealth } from "../../lib/modelHealthStore";
import { TASK_LABELS } from "../../lib/api";

const CATEGORY_LABELS = {
  "data-quality": "Data quality",
  "model-drift": "Model drift",
  "explanation-unclear": "Explanation unclear",
  "outcome-mismatch": "Outcome mismatch",
  other: "Other",
};

function rateTone(rate) {
  if (rate == null) return "neutral";
  if (rate >= 0.8) return "teal";
  if (rate >= 0.5) return "gold";
  return "red";
}

/*
  Systems -> Model Health — aggregates prediction_feedback (the reviewer thumbs-up/down loop
  wired into AdvancedPredict's per-task result panel) into a per-task satisfaction rate and a
  low-quality-runs list, so a labeled dataset of "what's wrong with this model" is visible
  somewhere instead of sitting unread in the table.
*/
export default function ModelHealthTab() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    getModelHealth().then(setHealth);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <HeartPulse size={20} className="text-gold" /> Model Health
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Reviewer quality flags per task, and the runs that were marked not helpful.
            </p>
          </div>

          {!health ? (
            <div className="flex items-center gap-2 text-xs text-ink-faint py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <motion.div variants={fadeUpItem} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.keys(TASK_LABELS).map((task) => {
                  const t = health.byTask[task];
                  const rate = t?.satisfactionRate;
                  return (
                    <Card key={task} animated={false}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                          {TASK_LABELS[task]}
                        </h3>
                        <Badge tone={rateTone(rate)}>
                          {rate == null ? "No flags yet" : `${Math.round(rate * 100)}% helpful`}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-ink-faint">
                        {t ? `${t.up} up · ${t.down} down` : "No feedback recorded"}
                      </div>
                    </Card>
                  );
                })}
              </motion.div>

              <motion.div variants={fadeUpItem}>
                <Card animated={false}>
                  <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
                    <ThumbsDown size={14} className="text-red" /> Low-quality runs
                  </h2>
                  {health.lowQuality.length === 0 ? (
                    <p className="text-xs text-ink-faint">No runs flagged as not helpful yet.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-border">
                      {health.lowQuality.map((r) => (
                        <div key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-ink">{TASK_LABELS[r.task] || r.task}</div>
                            {r.note && <div className="text-[11px] text-ink-faint mt-0.5">{r.note}</div>}
                            <div className="text-[10px] text-ink-faint mt-0.5">
                              {new Date(r.created_at).toLocaleString()}
                            </div>
                          </div>
                          {r.category && (
                            <Badge tone="red" className="shrink-0">
                              {CATEGORY_LABELS[r.category] || r.category}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
