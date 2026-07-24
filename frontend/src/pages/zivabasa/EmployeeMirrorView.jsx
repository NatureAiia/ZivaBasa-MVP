import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Sparkles } from "lucide-react";
import Card from "../../components/common/Card";
import ExecutiveTaskForm from "../../components/predict/ExecutiveTaskForm";
import ShapLedger from "../../components/predict/ShapLedger";
import CausalPanel from "../../components/predict/CausalPanel";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";
import { formatPercent } from "../../lib/format";
import { metaFor } from "../../lib/fieldMeta";

// training_intensity_index = TrainingTimesLastYear / YearsAtCompany, the same formula
// fieldMeta.js's derived-field `compute()` uses to build this engineered feature for
// /predict and /explain — duplicated here (not imported) because fieldMeta's compute() takes a
// {featureName: value} object keyed by RAW field names, not this file's ordered array + index
// convention; recomputing inline is simpler than reshaping one for the other's sake.
function trainingIntensityIndex(trainingTimesLastYear, yearsAtCompany) {
  return trainingTimesLastYear / Math.max(1, yearsAtCompany);
}

const TASK = "skills";
const LEVER_FEATURE = "TrainingTimesLastYear";
const LEVER_MAX = 10;

/*
  Employee-facing mirror view — a consented, simplified view of your OWN trajectory + a
  "what would move this" simulator (demo-readiness Phase B, item 2 + item 4 combined: the
  scenario-slider interaction pattern IS the mirror view's simulator, not a separate build).

  Deliberately NOT bound to any HR-uploaded roster row — an employee wouldn't be picking
  themselves out of a manager's CSV upload. This page lets someone enter their own information
  directly (same fields Predict already collects for the "skills" task, reusing
  ExecutiveTaskForm rather than duplicating its slider/select rendering), get their own
  assessment, and see — live, as they drag the training-sessions slider — the causal/uplift
  model's estimate of how that specific lever would move their own risk. This is the feature
  that turns the platform from a surveillance tool into an empowerment tool; the consent framing
  below is deliberately visible on screen, not assumed.
*/
export default function EmployeeMirrorView() {
  const [schema, setSchema] = useState(null);
  const [values, setValues] = useState(null); // ordered feature array, once a prediction has run
  const [predicting, setPredicting] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [predictResult, setPredictResult] = useState(null);
  const [explainResult, setExplainResult] = useState(null);
  const [error, setError] = useState(null);

  const [leverValue, setLeverValue] = useState(null);
  const [leverEstimate, setLeverEstimate] = useState(null);
  const [leverLoading, setLeverLoading] = useState(false);
  const [causalEstimate, setCausalEstimate] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.schema(TASK).then(setSchema).catch((e) => setError(e.message));
  }, []);

  const leverIdx = useMemo(
    () => (schema ? schema.feature_names.indexOf(LEVER_FEATURE) : -1),
    [schema]
  );
  const yearsAtCompanyIdx = useMemo(
    () => (schema ? schema.feature_names.indexOf("YearsAtCompany") : -1),
    [schema]
  );
  const intensityIdx = useMemo(
    () => (schema ? schema.feature_names.indexOf("training_intensity_index") : -1),
    [schema]
  );

  const runPrediction = async (orderedValues) => {
    setPredicting(true);
    setError(null);
    try {
      const result = await api.predict(TASK, orderedValues);
      setPredictResult(result);
      setValues(orderedValues);
      setLeverValue(orderedValues[leverIdx] ?? 0);
      setExplainResult(null);
      setLeverEstimate(null);
      setCausalEstimate(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setPredicting(false);
    }
  };

  const runExplain = async (orderedValues) => {
    setExplaining(true);
    setError(null);
    try {
      setExplainResult(await api.explain(TASK, orderedValues, 8));
    } catch (e) {
      setError(e.message);
    } finally {
      setExplaining(false);
    }
  };

  const onLeverChange = (newLeverValue) => {
    setLeverValue(newLeverValue);
    if (!values || leverIdx < 0) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLeverLoading(true);
      try {
        const nextValues = [...values];
        nextValues[leverIdx] = newLeverValue;
        const estimate = await api.uplift(TASK, nextValues);
        setLeverEstimate(estimate);
      } catch (e) {
        setLeverEstimate({ error: e.message });
      } finally {
        setLeverLoading(false);
      }

      // Do-calculus counterpart to the uplift estimate above (src/causal_xai.py's
      // simulate_intervention, via /causal/skills/intervene) — an actual do(X:=x) on the
      // discovered causal DAG's fitted structural model, not a learned heterogeneous-effect
      // estimate. The DAG's direct parent of target_attrition is training_intensity_index
      // (TrainingTimesLastYear / YearsAtCompany), not TrainingTimesLastYear itself, so the
      // intervention is expressed on that engineered feature, computed the same way
      // fieldMeta.js's derived-field logic does.
      if (yearsAtCompanyIdx >= 0 && intensityIdx >= 0) {
        setCausalEstimate({ loading: true });
        try {
          const newIntensity = trainingIntensityIndex(newLeverValue, values[yearsAtCompanyIdx]);
          const result = await api.causalIntervene(TASK, values, "training_intensity_index", newIntensity);
          setCausalEstimate(result);
        } catch (e) {
          setCausalEstimate({ error: e.message });
        }
      }
    }, 300);
  };

  const riskSentence = (result) => {
    const top = result?.top_contributions?.[0];
    if (!top) return null;
    const topLabel = (metaFor(top.feature, TASK).label || top.feature).toLowerCase();
    return `Your risk is driven mainly by ${topLabel}.`;
  };

  const baselineLever = values ? values[leverIdx] : null;
  const leverDelta = baselineLever != null && leverValue != null ? leverValue - baselineLever : 0;
  const projectedProbability =
    predictResult && leverEstimate && !leverEstimate.error
      ? Math.max(0, Math.min(1, predictResult.probability + leverEstimate.estimated_effect_per_unit * leverDelta))
      : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-2xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">Your Growth & Risk View</h1>
            <p className="text-xs text-ink-muted mt-1">
              A simplified, personal view of your own attrition-risk assessment and what could move it.
            </p>
          </div>

          <Card variants={fadeUpItem} className="flex items-start gap-3 border-teal/25 bg-teal/5">
            <ShieldCheck size={16} className="text-teal shrink-0 mt-0.5" />
            <p className="text-xs text-ink-muted leading-relaxed">
              <strong className="text-ink">This is your information, for you.</strong> Nothing you enter here is
              automatically shared with your manager or HR — this view exists so you can see what a model like the
              one used elsewhere in this system would say about your own situation, and experiment with what might
              change it, before anyone else does. Built on Kaggle proxy / synthetic training data, not a real company
              model — treat every number as illustrative.
            </p>
          </Card>

          <Card animated={false}>
            <ExecutiveTaskForm
              task={TASK}
              schema={schema}
              loading={!schema}
              predicting={predicting}
              explaining={explaining}
              canExplain={!!predictResult}
              onPredict={runPrediction}
              onExplain={runExplain}
            />
          </Card>

          {error && (
            <Card animated={false} className="border-red/25 bg-red/5">
              <p className="text-xs text-red">{error}</p>
            </Card>
          )}

          {predictResult && (
            <Card variants={fadeUpItem}>
              <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Your assessment</span>
              <p className="text-sm text-ink mt-1">
                Estimated attrition-risk likelihood: <span className="font-mono font-semibold">{formatPercent(predictResult.probability)}</span>
              </p>
            </Card>
          )}

          {explainResult && (
            <Card animated={false}>
              <p className="text-sm text-ink font-medium mb-3">{riskSentence(explainResult)}</p>
              <ShapLedger result={explainResult} task={TASK} />
              {values && (
                <div className="mt-4">
                  <CausalPanel task={TASK} features={values} />
                </div>
              )}
            </Card>
          )}

          {predictResult && leverIdx >= 0 && (
            <Card animated={false} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-gold" />
                <h2 className="text-sm font-semibold text-ink">What would move this?</h2>
              </div>
              <p className="text-xs text-ink-muted">
                Drag to see how many training sessions per year could shift your estimated risk — a causal/uplift
                estimate (EconML CausalForestDML), not just a correlation.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={LEVER_MAX}
                  step={1}
                  value={leverValue ?? 0}
                  onChange={(e) => onLeverChange(parseFloat(e.target.value))}
                  className="flex-1 accent-gold h-1.5"
                />
                <span className="font-mono text-xs text-ink w-28 text-right shrink-0">
                  {leverValue} session{leverValue === 1 ? "" : "s"}/yr
                </span>
              </div>

              {leverLoading ? (
                <p className="text-xs text-ink-faint">Recalculating…</p>
              ) : leverEstimate?.error ? (
                <p className="text-xs text-red">{leverEstimate.error}</p>
              ) : leverEstimate && projectedProbability != null ? (
                <div className="rounded-xl bg-surface2/60 p-3 flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-ink-faint">Projected risk at this level:</span>
                    <span className="font-mono text-lg font-semibold text-ink">{formatPercent(projectedProbability)}</span>
                    <span className="text-[11px] text-ink-faint">
                      (from {formatPercent(predictResult.probability)})
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-faint leading-relaxed">{leverEstimate.interpretation}</p>
                </div>
              ) : (
                <p className="text-[11px] text-ink-faint">Move the slider to see a projected effect.</p>
              )}

              {intensityIdx >= 0 && (
                <div className="border-t border-border pt-3 mt-1">
                  <p className="text-[11px] text-ink-faint mb-2">
                    Causal do-calculus counterpart (src/causal_xai.py's linear-SCM intervention on the
                    discovered DAG's direct cause, not a learned correlational estimate):
                  </p>
                  {causalEstimate?.loading ? (
                    <p className="text-xs text-ink-faint">Recalculating…</p>
                  ) : causalEstimate?.error ? (
                    <p className="text-xs text-red">{causalEstimate.error}</p>
                  ) : causalEstimate ? (
                    <div className="rounded-xl bg-surface2/60 p-3 flex flex-col gap-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] text-ink-faint">do(training intensity := this level):</span>
                        <span className="font-mono text-lg font-semibold text-ink">
                          {formatPercent(causalEstimate.predicted_target_after)}
                        </span>
                        <span className="text-[11px] text-ink-faint">
                          (from {formatPercent(causalEstimate.predicted_target_before)})
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-faint leading-relaxed">{causalEstimate.data_caveat}</p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-ink-faint">Move the slider to see the causal-model projection.</p>
                  )}
                </div>
              )}
            </Card>
          )}

          <p className="text-[11px] text-ink-faint leading-relaxed">
            The projected risk above combines your baseline assessment with the causal lever estimate — a
            simplification for illustration, not a re-run of the full model at the new value. Treat direction and
            rough scale as informative, not the exact number.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
