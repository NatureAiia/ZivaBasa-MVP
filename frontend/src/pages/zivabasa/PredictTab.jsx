import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import SimplePredict from "./SimplePredict";
import AdvancedPredict from "./AdvancedPredict";
import { fadeScale } from "../../lib/motion";

export default function PredictTab() {
  const [mode, setMode] = useState("simple"); // simple = CEO/upload mode, default

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-center pt-4">
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 w-fit">
          {[
            { key: "simple", label: "Upload & Analyze" },
            { key: "advanced", label: "Single-role (advanced)" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={clsx(
                "relative px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
                mode === m.key ? "text-bg" : "text-ink-muted hover:text-ink"
              )}
            >
              {mode === m.key && (
                <motion.span
                  layoutId="predict-mode-pill"
                  className="absolute inset-0 bg-gold rounded-lg"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === "simple" ? (
          <motion.div key="simple" variants={fadeScale} initial="hidden" animate="show" exit="exit" className="flex-1 flex flex-col overflow-hidden">
            <SimplePredict />
          </motion.div>
        ) : (
          <motion.div key="advanced" variants={fadeScale} initial="hidden" animate="show" exit="exit" className="flex-1 flex flex-col overflow-hidden">
            <AdvancedPredict />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
