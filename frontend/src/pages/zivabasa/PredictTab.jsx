import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Lock, ArrowRight } from "lucide-react";
import clsx from "clsx";
import Card from "../../components/common/Card";
import TaskForm from "../../components/predict/TaskForm";
import PredictionResult from "../../components/predict/PredictionResult";
import ShapLedger from "../../components/predict/ShapLedger";
import OverallSummary from "../../components/predict/OverallSummary";
import { usePredictionFlow } from "../../hooks/usePredictionFlow";
import { TASKS, TASK_LABELS, NEXT_TASK_LABEL } from "../../lib/api";
import { fadeScale } from "../../lib/motion";
import { logHistoryEntry } from "../../lib/history";

export default function PredictTab() {
  const flow = usePredictionFlow();
  const { activeTask, setActiveTask, schemas, loadSchema, results, predict, explain,
          carriedFeatures, reset, allComplete, loadingSchema, predicting, explaining, error } = flow;

  useEffect(() => {
    if (activeTask !== "summary" && !schemas[activeTask]) loadSchema(activeTask);
  }, [activeTask, schemas, loadSchema]);

  useEffect(() => {
    if (allComplete) logHistoryEntry(results);
  }, [allComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const schema = schemas[activeTask];
  const current = activeTask !== "summary" ? results[activeTask] : null;

  const handlePredict = async (values) => {
    await predict(activeTask, values, schema.feature_names);
  };
  const handleExplain = async (values) => {
    await explain(activeTask, values, schema.feature_names);
  };
  const goNext = () => {
    const idx = TASKS.indexOf(activeTask);
    setActiveTask(idx === TASKS.length - 1 ? "summary" : TASKS[idx + 1]);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      {/* Step tabs */}
      <div className="flex items-center gap-1 mb-6 bg-surface2 rounded-xl p-1 w-fit">
        {TASKS.map((task) => {
          const done = results[task].predict && results[task].explain;
          return (
            <button
              key={task}
              onClick={() => setActiveTask(task)}
              className={clsx(
                "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activeTask === task ? "text-bg" : "text-ink-muted hover:text-ink"
              )}
            >
              {activeTask === task && (
                <motion.span
                  layoutId="predict-tab-pill"
                  className="absolute inset-0 bg-gold rounded-lg"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {done && <Check size={12} />} {TASK_LABELS[task].split(" / ")[0]}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => allComplete && setActiveTask("summary")}
          disabled={!allComplete}
          className={clsx(
            "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            activeTask === "summary" ? "text-bg" : allComplete ? "text-ink-muted hover:text-ink" : "text-ink-faint cursor-not-allowed"
          )}
        >
          {activeTask === "summary" && (
            <motion.span
              layoutId="predict-tab-pill"
              className="absolute inset-0 bg-gold rounded-lg"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {!allComplete && <Lock size={11} />} Summary
          </span>
        </button>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red bg-red/10 border border-red/25 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTask === "summary" ? (
          <motion.div key="summary" variants={fadeScale} initial="hidden" animate="show" exit="exit">
            <OverallSummary results={results} onRestart={reset} />
          </motion.div>
        ) : (
          <motion.div key={activeTask} variants={fadeScale} initial="hidden" animate="show" exit="exit" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card animated={false}>
              <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4">Input features</h2>
              <TaskForm
                schema={schema}
                loading={loadingSchema || !schema}
                initialValues={schema ? carriedFeatures(activeTask, schema.feature_names) : []}
                onPredict={handlePredict}
                onExplain={handleExplain}
                predicting={predicting}
                explaining={explaining}
                canExplain={!!current?.predict}
              />
            </Card>

            <div className="flex flex-col gap-5">
              <Card animated={false}>
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4">Prediction</h2>
                {current?.predict ? (
                  <PredictionResult result={current.predict} />
                ) : (
                  <p className="text-xs text-ink-faint">Run a prediction to see output here.</p>
                )}
              </Card>

              <Card animated={false}>
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4">Why — SHAP contribution ledger</h2>
                {current?.explain ? (
                  <>
                    <ShapLedger result={current.explain} />
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
                      <span className="text-[11px] text-ink-faint">
                        {TASK_LABELS[activeTask]} complete.
                      </span>
                      <button
                        onClick={goNext}
                        className="flex items-center gap-1.5 text-xs font-medium text-gold hover:brightness-110 transition-all"
                      >
                        {activeTask === "productivity" ? "View overall summary" : `Continue to ${NEXT_TASK_LABEL[activeTask]}`}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ink-faint">Run "Explain" to see which features drove this prediction.</p>
                )}
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
