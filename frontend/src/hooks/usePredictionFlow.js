import { useCallback, useEffect, useState } from "react";
import { api, TASKS } from "../lib/api";

const EMPTY_RESULTS = () =>
  Object.fromEntries(TASKS.map((t) => [t, { features: null, predict: null, explain: null }]));

/*
  Ports v1's chained Employment -> Skills -> Productivity -> Summary flow into React state.
  Same rules as v1: Explain only unlocks after Predict; a new Predict invalidates any stored
  Explain for that task; feature values carry forward by name between tasks; the Overall
  Summary only unlocks once all three tasks have both a prediction and an explanation.
*/
export function usePredictionFlow() {
  const [activeTask, setActiveTask] = useState("employment");
  const [schemas, setSchemas] = useState({});
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
  }, []);

  const loadSchema = useCallback(async (task) => {
    setLoadingSchema(true);
    setError(null);
    try {
      const schema = await api.schema(task);
      setSchemas((s) => ({ ...s, [task]: schema }));
      return schema;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  // Carries a value forward from any other task's entered features that shares the same
  // feature name, so the user isn't retyping overlapping inputs.
  const carriedFeatures = useCallback(
    (task, featureNames) => {
      const stored = results[task].features;
      if (stored) return featureNames.map((n) => stored[n] ?? 0);
      return featureNames.map((name) => {
        for (const other of TASKS) {
          if (other === task) continue;
          const otherFeatures = results[other].features;
          if (otherFeatures && Object.prototype.hasOwnProperty.call(otherFeatures, name)) {
            return otherFeatures[name];
          }
        }
        return 0;
      });
    },
    [results]
  );

  const predict = useCallback(async (task, featureValues, featureNames) => {
    setPredicting(true);
    setError(null);
    try {
      const result = await api.predict(task, featureValues);
      const byName = Object.fromEntries(featureNames.map((n, i) => [n, featureValues[i]]));
      setResults((r) => ({
        ...r,
        [task]: { features: byName, predict: result, explain: null },
      }));
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setPredicting(false);
    }
  }, []);

  const explain = useCallback(async (task, featureValues, featureNames) => {
    setExplaining(true);
    setError(null);
    try {
      const result = await api.explain(task, featureValues, 8);
      const byName = Object.fromEntries(featureNames.map((n, i) => [n, featureValues[i]]));
      setResults((r) => ({
        ...r,
        [task]: { ...r[task], features: byName, explain: result },
      }));
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setExplaining(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResults(EMPTY_RESULTS());
    setActiveTask("employment");
  }, []);

  const allComplete = TASKS.every((t) => results[t].predict && results[t].explain);

  return {
    activeTask,
    setActiveTask,
    schemas,
    loadSchema,
    results,
    predict,
    explain,
    carriedFeatures,
    reset,
    allComplete,
    loadingSchema,
    predicting,
    explaining,
    error,
    setError,
    health,
  };
}
