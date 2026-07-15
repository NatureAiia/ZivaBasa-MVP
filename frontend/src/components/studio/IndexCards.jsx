import { motion } from "framer-motion";
import ClarityRing from "../common/ClarityRing";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getAllBatchResults } from "../../lib/batchStore";
import { computeIndex, INDEX_DEFINITIONS } from "../../lib/indices";
import { TASK_LABELS } from "../../lib/api";

export default function IndexCards() {
  const results = getAllBatchResults();
  const cards = Object.keys(INDEX_DEFINITIONS)
    .map((task) => {
      const rows = results[task]?.rows;
      const index = rows ? computeIndex(task, rows) : null;
      return { task, index };
    })
    .filter((c) => c.index);

  if (cards.length === 0) {
    return null;
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-2.5">
      {cards.map(({ task, index }) => (
        <motion.div
          key={task}
          variants={fadeUpItem}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface2/50 px-3 py-2.5"
        >
          <ClarityRing mode="confidence" value={index.mean / 100} size={36} strokeWidth={4} color="teal" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-ink truncate">{index.label}</div>
            <div className="text-[10px] text-ink-faint truncate">{TASK_LABELS[task]} · n={index.n} · {index.source}</div>
          </div>
          <div className="font-mono text-sm text-teal shrink-0">{index.mean.toFixed(0)}</div>
        </motion.div>
      ))}
    </motion.div>
  );
}
