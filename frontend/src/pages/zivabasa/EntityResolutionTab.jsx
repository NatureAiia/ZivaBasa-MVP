import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Loader2, Check, X } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getAllBatchResults } from "../../lib/batchStore";
import { getEntityLinks, confirmCluster } from "../../lib/entityLinksStore";
import { api, TASK_LABELS } from "../../lib/api";

// Rows without a "_name" field (no label_col found in the uploaded CSV — see batch.py's
// LABEL_CANDIDATES) can't be identity-matched, so they're excluded before the match request
// rather than sent in as an empty/placeholder label that would falsely cluster together.
function rowsForTask(result) {
  if (!result?.rows) return [];
  return result.rows
    .map((r, i) => ({ row_index: i, label: r._name }))
    .filter((r) => r.label);
}

/*
  Cross-dataset row-level identity matching UI ("golden record" linking, checklist item: no
  row-level alignment across tasks, only feature-schema-level join). Pulls whichever batch
  results the user has already uploaded, sends their identifier labels to
  /entity-resolution/match, and lets a reviewer confirm or dismiss each candidate cluster —
  confirmed clusters persist to entity_links.
*/
export default function EntityResolutionTab() {
  const [batchResults, setBatchResults] = useState(null);
  const [confirmedLabels, setConfirmedLabels] = useState(new Set());
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    getAllBatchResults().then(setBatchResults);
    getEntityLinks().then((links) => setConfirmedLabels(new Set(links.map((l) => `${l.task}:${l.row_label}`))));
  }, []);

  const availableTasks = batchResults
    ? Object.entries(batchResults).filter(([, r]) => rowsForTask(r).length > 0).map(([t]) => t)
    : [];

  const runMatch = async () => {
    setMatching(true);
    setError(null);
    try {
      const sets = Object.fromEntries(availableTasks.map((t) => [t, rowsForTask(batchResults[t])]));
      const result = await api.matchEntities(sets);
      setMatchResult(result);
      setDismissed(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setMatching(false);
    }
  };

  const confirm = async (cluster, idx) => {
    const goldenId = crypto.randomUUID();
    await confirmCluster(cluster.members, goldenId);
    setConfirmedLabels((prev) => {
      const next = new Set(prev);
      cluster.members.forEach((m) => next.add(`${m.task}:${m.label}`));
      return next;
    });
    setDismissed((prev) => new Set(prev).add(idx));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
              <Link2 size={20} className="text-gold" /> Entity Resolution
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Link the same person or role across your uploaded datasets, so a turnover-risk row
              and an automation-risk row for the same employee can be reasoned about together.
            </p>
          </div>

          <Card animated={false} className="flex flex-col gap-3">
            {!batchResults ? (
              <div className="flex items-center gap-2 text-xs text-ink-faint py-4 justify-center">
                <Loader2 size={14} className="animate-spin" /> Loading uploaded datasets…
              </div>
            ) : availableTasks.length < 2 ? (
              <p className="text-xs text-ink-faint">
                Upload batch results for at least two tasks (Predict Studio → Batch Upload) with
                an identifiable role/employee column before matching across them.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {availableTasks.map((t) => (
                      <Badge key={t} tone="neutral">{TASK_LABELS[t] || t}</Badge>
                    ))}
                  </div>
                  <button
                    disabled={matching}
                    onClick={runMatch}
                    className="text-xs font-medium text-bg bg-gold rounded-lg px-3 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {matching && <Loader2 size={12} className="animate-spin" />}
                    Find matches
                  </button>
                </div>
                {error && <p className="text-xs text-red">{error}</p>}
              </>
            )}
          </Card>

          {matchResult && (
            <motion.div variants={fadeUpItem}>
              <Card animated={false} className="flex flex-col gap-3">
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                  Candidate matches ({matchResult.clusters.length})
                </h2>
                {matchResult.clusters.length === 0 ? (
                  <p className="text-xs text-ink-faint">No cross-dataset matches found above the similarity threshold.</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {matchResult.clusters.map((cluster, idx) =>
                      dismissed.has(idx) ? null : (
                        <motion.div
                          key={idx}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex flex-col gap-2 bg-surface2/50 rounded-xl px-3 py-2.5 text-xs"
                        >
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {cluster.members.map((m) => {
                              const already = confirmedLabels.has(`${m.task}:${m.label}`);
                              return (
                                <span key={`${m.task}-${m.row_index}`} className="flex items-center gap-1.5 text-ink">
                                  <Badge tone="neutral" className="capitalize">{TASK_LABELS[m.task] || m.task}</Badge>
                                  {m.label}
                                  {already && <Check size={11} className="text-teal" />}
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-ink-faint">
                              Match confidence: {Math.round(Math.min(...cluster.members.map((m) => m.match_score)) * 100)}%
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setDismissed((prev) => new Set(prev).add(idx))}
                                className="text-ink-faint hover:text-ink"
                                aria-label="Dismiss"
                              >
                                <X size={15} />
                              </button>
                              <button
                                onClick={() => confirm(cluster, idx)}
                                className="text-teal hover:brightness-110"
                                aria-label="Confirm link"
                              >
                                <Check size={15} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )
                    )}
                  </AnimatePresence>
                )}
              </Card>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
