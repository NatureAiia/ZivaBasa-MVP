import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, FileDown, History as HistoryIcon } from "lucide-react";
import Card from "../../components/common/Card";
import EmptyState from "../../components/common/EmptyState";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getHistory, deleteHistoryEntry } from "../../lib/history";
import { downloadBlob } from "../../lib/report";
import { formatPercent, formatRaw } from "../../lib/format";
import { TASKS, TASK_LABELS, TASK_SHORT_LABELS, api } from "../../lib/api";

export default function HistoryTab() {
  const [history, setHistory] = useState(getHistory());
  const [downloadingId, setDownloadingId] = useState(null);

  const remove = (id) => setHistory(deleteHistoryEntry(id));
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
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
        <AnimatePresence>
          {history.map((entry) => (
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
      </div>
    </div>
  );
}
