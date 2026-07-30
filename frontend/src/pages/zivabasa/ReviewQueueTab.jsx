import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Clock, CheckCircle2, XCircle, PenLine, Loader2 } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getReviewQueue, decideReviewItem } from "../../lib/reviewQueueStore";
import { TASK_LABELS } from "../../lib/api";

/*
  Review Queue — HITL pause/resume for predictions the model wasn't confident about (see
  reviewThresholds.js for what "low confidence" means, and AdvancedPredict.jsx for where items
  get queued). Non-blocking by design: a flagged prediction still shows immediately, this page
  is where a reviewer later approves it, overrides it with a corrected value + required note, or
  rejects it outright.
*/
export default function ReviewQueueTab() {
  const [items, setItems] = useState(null);
  const [overriding, setOverriding] = useState(null); // id currently showing the override form
  const [overrideNote, setOverrideNote] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    getReviewQueue().then(setItems);
  }, []);

  const pending = useMemo(() => (items || []).filter((i) => i.status === "pending"), [items]);
  const decided = useMemo(() => (items || []).filter((i) => i.status !== "pending"), [items]);

  const decide = async (id, status, note = "") => {
    setBusy(id);
    try {
      setItems(await decideReviewItem(id, status, note));
    } finally {
      setBusy(null);
      setOverriding(null);
      setOverrideNote("");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <ShieldAlert size={20} className="text-gold" /> Review Queue
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Predictions and forecasts the model flagged as low-confidence, waiting on a human decision.
            </p>
          </div>

          {!items ? (
            <div className="flex items-center gap-2 text-xs text-ink-faint py-6 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : pending.length === 0 && decided.length === 0 ? (
            <Card animated={false}>
              <p className="text-xs text-ink-faint">Nothing has needed review yet.</p>
            </Card>
          ) : (
            <motion.div variants={fadeUpItem}>
              <Card animated={false} className="flex flex-col gap-3">
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                  Pending ({pending.length})
                </h2>
                <AnimatePresence initial={false}>
                  {pending.map((item) => (
                    <motion.div
                      key={item.id}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-col gap-2 bg-surface2/50 rounded-xl px-3 py-2.5 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <Clock size={13} className="text-gold shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-ink">
                          {TASK_LABELS[item.task] || item.task}
                          {item.subject ? ` — ${item.subject}` : ""}
                        </span>
                        <Badge tone="neutral" className="capitalize">{item.source}</Badge>
                        {item.confidenceScore != null && (
                          <Badge tone="gold">{Math.round(item.confidenceScore * 100)}% confidence</Badge>
                        )}
                        <button
                          disabled={busy === item.id}
                          onClick={() => decide(item.id, "approved")}
                          className="text-teal hover:brightness-110"
                          aria-label="Approve"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          disabled={busy === item.id}
                          onClick={() => setOverriding(overriding === item.id ? null : item.id)}
                          className="text-gold hover:brightness-110"
                          aria-label="Override"
                        >
                          <PenLine size={16} />
                        </button>
                        <button
                          disabled={busy === item.id}
                          onClick={() => decide(item.id, "rejected")}
                          className="text-red hover:brightness-110"
                          aria-label="Reject"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                      {overriding === item.id && (
                        <div className="flex flex-col gap-2 pl-6">
                          <textarea
                            value={overrideNote}
                            onChange={(e) => setOverrideNote(e.target.value)}
                            placeholder="Required: what's the corrected value/decision, and why?"
                            rows={2}
                            className="bg-surface border border-border rounded-md px-2 py-1.5 text-[11px] outline-none focus:border-gold/50 resize-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setOverriding(null)} className="text-[11px] text-ink-faint hover:text-ink">
                              Cancel
                            </button>
                            <button
                              disabled={!overrideNote.trim() || busy === item.id}
                              onClick={() => decide(item.id, "overridden", overrideNote)}
                              className="text-[11px] font-medium text-bg bg-gold rounded-md px-2.5 py-1 disabled:opacity-40"
                            >
                              Submit override
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))}
                  {pending.length === 0 && (
                    <p className="text-[11px] text-ink-faint">Nothing pending — every flagged item has been decided.</p>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          )}

          {decided.length > 0 && (
            <motion.div variants={fadeUpItem}>
              <Card animated={false} className="flex flex-col gap-2">
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Decided</h2>
                {decided.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-1 py-1.5 text-xs opacity-70">
                    {item.status === "approved" ? (
                      <CheckCircle2 size={13} className="text-teal shrink-0" />
                    ) : item.status === "overridden" ? (
                      <PenLine size={13} className="text-gold shrink-0" />
                    ) : (
                      <XCircle size={13} className="text-red shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 truncate text-ink-muted">
                      {TASK_LABELS[item.task] || item.task}
                      {item.subject ? ` — ${item.subject}` : ""}
                    </span>
                    <span className="text-[10px] text-ink-faint capitalize">{item.status}</span>
                  </div>
                ))}
              </Card>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
