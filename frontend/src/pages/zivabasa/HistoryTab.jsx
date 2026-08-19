import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, FileDown, History as HistoryIcon, Search, X } from "lucide-react";
import clsx from "clsx";
import Card from "../../components/common/Card";
import EmptyState from "../../components/common/EmptyState";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getHistory, deleteHistoryEntry } from "../../lib/history";
import { downloadBlob } from "../../lib/report";
import { formatPercent, formatRaw } from "../../lib/format";
import { TASKS, TASK_LABELS, TASK_SHORT_LABELS, api } from "../../lib/api";

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState(null); // null = all tasks

  useEffect(() => {
    getHistory().then(setHistory);
  }, []);

  // Client-side only — history is already fully loaded (Supabase-backed via lib/history.js),
  // no backend/store changes needed for search/filter over what's already in memory.
  const filtered = useMemo(() => {
    return history.filter((entry) => {
      if (taskFilter && !entry.results[taskFilter]?.predict) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      const dateText = new Date(entry.timestamp).toLocaleString().toLowerCase();
      if (dateText.includes(q)) return true;
      return TASKS.some((t) => entry.results[t]?.predict && TASK_SHORT_LABELS[t].toLowerCase().includes(q));
    });
  }, [history, query, taskFilter]);

  const remove = async (id) => setHistory(await deleteHistoryEntry(id));
  const download = async (entry) => {
    setDownloadingId(entry.id);
    try {
      const blob = await api.predictReport(entry.results);
      downloadBlob(`zivabasa-predict-report-${entry.id}.docx`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  if (history.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={HistoryIcon}
          title="No runs yet"
          description="Completed Predict runs (Employment, Skills, and Productivity all finished) show up here automatically."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by date or task…"
            className="w-full bg-surface2 border border-border rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:border-gold/50 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setTaskFilter(null)}
            className={clsx(
              "text-xs font-medium rounded-full px-3 py-1.5 border transition-colors",
              taskFilter === null ? "bg-gold text-bg border-gold" : "bg-surface2 border-border text-ink-muted hover:text-ink"
            )}
          >
            All tasks
          </button>
          {TASKS.map((t) => (
            <button
              key={t}
              onClick={() => setTaskFilter((f) => (f === t ? null : t))}
              className={clsx(
                "text-xs font-medium rounded-full px-3 py-1.5 border transition-colors",
                taskFilter === t ? "bg-gold text-bg border-gold" : "bg-surface2 border-border text-ink-muted hover:text-ink"
              )}
            >
              {TASK_SHORT_LABELS[t]}
            </button>
          ))}
        </div>
        {(query || taskFilter) && (
          <p className="text-[11px] text-ink-faint">{filtered.length} of {history.length} runs match.</p>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching runs"
          description="Try a different search term or clear the task filter."
        />
      ) : (
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
        <AnimatePresence>
          {filtered.map((entry) => (
            <motion.div key={entry.id} variants={fadeUpItem} exit={{ opacity: 0, height: 0 }} layout>
              <Card animated={false} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs text-ink-faint mb-2">{new Date(entry.timestamp).toLocaleString()}</div>
                  <div className="flex gap-4 flex-wrap">
                    {TASKS.map((task) => {
                      const r = entry.results[task];
                      if (!r?.predict) return null;
                      const isClass = r.predict.task_type === "classification";
                      const value = isClass ? formatPercent(r.predict.probability) : formatRaw(r.predict.raw_output);
                      return (
                        <div key={task} className="text-xs">
                          <span className="text-ink-faint">{TASK_SHORT_LABELS[task]}: </span>
                          <span className="font-mono text-ink">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={() => download(entry)}
                  disabled={downloadingId === entry.id}
                  className="text-ink-faint hover:text-gold transition-colors disabled:opacity-40"
                  aria-label="Download report"
                >
                  <FileDown size={16} />
                </button>
                <button
                  onClick={() => remove(entry.id)}
                  className="text-ink-faint hover:text-red transition-colors"
                  aria-label="Delete entry"
                >
                  <Trash2 size={16} />
                </button>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      )}
      </div>
    </div>
  );
}
