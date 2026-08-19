import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import { getHistory } from "../../lib/history";
import { formatPercent, formatRaw } from "../../lib/format";

export default function HistoryStrip() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    getHistory().then((h) => setHistory(h.slice(0, 12)));
  }, []);

  return (
    <div className="border-t border-border px-4 py-3 flex items-center gap-3 overflow-x-auto bg-surface">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-faint shrink-0">
        <Clock size={12} /> Recent
      </div>
      {history.length === 0 ? (
        <p className="text-[11px] text-ink-faint">No completed runs yet — finish a flow on the Predict tab</p>
      ) : (
        history.map((h) => {
          const emp = h.results.employment?.predict;
          const label = emp
            ? emp.task_type === "classification"
              ? formatPercent(emp.probability)
              : formatRaw(emp.raw_output)
            : "—";
          return (
            <motion.div
              key={h.id}
              whileHover={{ y: -2 }}
              className="shrink-0 flex flex-col gap-0.5 rounded-lg border border-border bg-surface2 px-3 py-1.5 cursor-default"
            >
              <span className="text-[10px] text-ink-faint">{new Date(h.timestamp).toLocaleTimeString()}</span>
              <span className="text-xs font-mono text-ink">Employment {label}</span>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
