import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Lock, ArrowRight } from "lucide-react";
import clsx from "clsx";
import Card from "../../components/common/Card";
import ExecutiveTaskForm from "../../components/predict/ExecutiveTaskForm";
import PredictionResult from "../../components/predict/PredictionResult";
import ShapLedger from "../../components/predict/ShapLedger";
import OverallSummary from "../../components/predict/OverallSummary";
import PipelineTrace from "../../components/predict/PipelineTrace";
import DocumentAutoFill from "../../components/predict/DocumentAutoFill";
import { usePredictionFlow } from "../../hooks/usePredictionFlow";
import { TASKS, TASK_LABELS, TASK_SHORT_LABELS } from "../../lib/api";
import { fadeScale } from "../../lib/motion";
import { logHistoryEntry } from "../../lib/history";

const PIPELINE_STEPS = [
  { key: "schema", label: "Schema" },
  { key: "predict", label: "Predict" },
  { key: "explain", label: "Explain" },
];

export default function AdvancedPredict() {
  const flow = usePredictionFlow();
  const { activeTask, setActiveTask, schemas, loadSchema, results, predict, explain,
          carriedFeatures, reset, allComplete, loadingSchema, predicting, explaining, error } = flow;

  // Local, additive trace of how long each pipeline stage took for the active task — purely a
  // UI trust signal (mirrors NeuroWorks's dependency-free TraceBlock), not persisted, not fed
  // back into usePredictionFlow's own state/tests.
  const [trace, setTrace] = useState({});
  // Latest document-auto-fill result to merge into the form — keyed by task so switching tasks
  // doesn't leak one task's extracted values into another's form.
  const [appliedValues, setAppliedValues] = useState({});

  useEffect(() => {
    if (activeTask !== "summary" && !schemas[activeTask]) loadSchema(activeTask);
  }, [activeTask, schemas, loadSchema]);

  const markStep = (task, key, status, ms) => {
    setTrace((t) => ({ ...t, [task]: { ...t[task], [key]: { status, ms } } }));
  };

  const pipelineSteps = (task) => {
    const t = trace[task] || {};
    const schemaStatus = schemas[task] ? "done" : loadingSchema ? "active" : "pending";
    return PIPELINE_STEPS.map((s) => {
      if (s.key === "schema") return { ...s, status: schemaStatus };
      if (s.key === "predict") return { ...s, status: t.predict?.status ?? (predicting ? "active" : "pending"), ms: t.predict?.ms };
      return { ...s, status: t.explain?.status ?? (explaining ? "active" : "pending"), ms: t.explain?.ms };
    });
  };

  useEffect(() => {
    if (allComplete) logHistoryEntry(results).catch((e) => console.error("logHistoryEntry failed:", e.message));
  }, [allComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const schema = schemas[activeTask];
  const current = activeTask !== "summary" ? results[activeTask] : null;

  const handlePredict = async (values) => {
    const started = performance.now();
    markStep(activeTask, "predict", "active");
    try {
      await predict(activeTask, values, schema.feature_names);
      markStep(activeTask, "predict", "done", Math.round(performance.now() - started));
    } catch {
      markStep(activeTask, "predict", "error", Math.round(performance.now() - started));
    }
  };
  const handleExplain = async (values) => {
    const started = performance.now();
    markStep(activeTask, "explain", "active");
    try {
      await explain(activeTask, values, schema.feature_names);
      markStep(activeTask, "explain", "done", Math.round(performance.now() - started));
    } catch {
      markStep(activeTask, "explain", "error", Math.round(performance.now() - started));
    }
  };
  const goNext = () => {
    const idx = TASKS.indexOf(activeTask);
    setActiveTask(idx === TASKS.length - 1 ? "summary" : TASKS[idx + 1]);
  };
  const isLastTask = TASKS.indexOf(activeTask) === TASKS.length - 1;
  const nextTaskLabel = isLastTask
    ? null
    : TASK_SHORT_LABELS[TASKS[TASKS.indexOf(activeTask) + 1]];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto w-full">
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
                {done && <Check size={12} />} {TASK_SHORT_LABELS[task]}
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
          <motion.div key={activeTask} variants={fadeScale} initial="hidden" animate="show" exit="exit" className="flex flex-col gap-4">
            <Card animated={false} className="!p-4">
              <PipelineTrace steps={pipelineSteps(activeTask)} />
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card animated={false}>
              <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4">Assessment Inputs</h2>
              {schema && (
                <div className="mb-4">
                  <DocumentAutoFill
                    task={activeTask}
                    feature_names={schema.feature_names}
                    onApply={(features) => setAppliedValues({ [activeTask]: features })}
                  />
                </div>
              )}
              <ExecutiveTaskForm
                task={activeTask}
                schema={schema}
                loading={loadingSchema || !schema}
                initialValues={schema ? carriedFeatures(activeTask, schema.feature_names) : []}
                appliedValues={appliedValues[activeTask]}
                onPredict={handlePredict}
                onExplain={handleExplain}
                predicting={predicting}
                explaining={explaining}
                canExplain={!!current?.predict}
              />
            </Card>

            <div className="flex flex-col gap-5">
              <Card animated={false}>
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4">Result</h2>
                {current?.predict ? (
                  <PredictionResult result={current.predict} />
                ) : (
                  <p className="text-xs text-ink-faint">Run an assessment to see the result here.</p>
                )}
              </Card>

              <Card animated={false}>
                <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4">What's Driving This Result</h2>
                {current?.explain ? (
                  <>
                    <ShapLedger result={current.explain} task={activeTask} />
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
                      <span className="text-[11px] text-ink-faint">
                        {TASK_LABELS[activeTask]} complete.
                      </span>
                      <button
                        onClick={goNext}
                        className="flex items-center gap-1.5 text-xs font-medium text-gold hover:brightness-110 transition-all"
                      >
                        {isLastTask ? "View overall summary" : `Continue to ${nextTaskLabel}`}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-ink-faint">Run "Show Key Drivers" to see what's influencing this result.</p>
                )}
              </Card>
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
