import { useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import BatchUpload from "../../components/batch/BatchUpload";
import ShinyPill from "../../components/effects/ShinyPill";
import { TASKS, TASK_LABELS, TASK_SHORT_LABELS } from "../../lib/api";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

export default function SimplePredict() {
  const [task, setTask] = useState("employment");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto w-full">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
        <motion.div variants={fadeUpItem}>
          <div style={{ height: 26, width: 220 }}>
            <ShinyPill
              text="Upload your data"
              textColor="rgb(var(--ink))"
              shineColor="#E8A33D"
              shineColor2="#2FBF9F"
              speed={2.2}
              font={{ fontFamily: "Space Grotesk", fontSize: "18px", fontWeight: 600 }}
            />
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Drop a CSV export from your HR or workforce system. We'll match the columns and
            score every row — no manual data entry.
          </p>
        </motion.div>

        <motion.div variants={fadeUpItem} className="flex gap-1 bg-surface2 rounded-xl p-1 w-fit">
          {TASKS.map((t) => (
            <button
              key={t}
              onClick={() => setTask(t)}
              className={clsx(
                "relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                task === t ? "text-bg" : "text-ink-muted hover:text-ink"
              )}
            >
              {task === t && (
                <motion.span
                  layoutId="simple-predict-pill"
                  className="absolute inset-0 bg-gold rounded-lg"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{TASK_SHORT_LABELS[t]}</span>
            </button>
          ))}
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <BatchUpload key={task} task={task} />
        </motion.div>
      </motion.div>
      </div>
    </div>
  );
}
