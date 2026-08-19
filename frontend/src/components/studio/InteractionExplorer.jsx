import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getAllBatchResults } from "../../lib/batchStore";
import { TASKS, TASK_LABELS, TASK_SHORT_LABELS, TASK_POSITIVE_IS_RISK } from "../../lib/api";

/*
  Interaction Explorer — a real scatter plot of any two numeric features against each other
  from the latest batch upload, directly implementing the AI4I feature catalogue's "Interaction
  Features" concept (§2.3: e.g. "Training Hours × AI Tool Usage") — not a fabricated index, a
  literal plot of two real uploaded columns against each other, colored by the model's own
  prediction for that row.
*/

function taskWithRows(results) {
  return TASKS.filter((t) => results[t]?.rows?.length > 0);
}

function featureNamesFor(result) {
  if (!result?.rows?.length) return [];
  return Object.keys(result.rows[0]).filter((k) => !k.startsWith("_"));
}

export default function InteractionExplorer() {
  const [results, setResults] = useState({});
  const [task, setTask] = useState(null);
  const [xKey, setXKey] = useState(null);
  const [yKey, setYKey] = useState(null);

  useEffect(() => {
    getAllBatchResults().then((r) => {
      setResults(r);
      const available = taskWithRows(r);
      const firstTask = available[0] || "employment";
      setTask(firstTask);
      const features = featureNamesFor(r[firstTask]);
      setXKey(features[1] || features[0]);
      setYKey(features[0]);
    });
  }, []);

  const availableTasks = taskWithRows(results);
  const result = task ? results[task] : null;
  const features = useMemo(() => featureNamesFor(result), [result]);

  if (availableTasks.length === 0) {
    return null;
  }

  const rows = result?.rows || [];
  const xVals = rows.map((r) => r[xKey] ?? 0);
  const yVals = rows.map((r) => r[yKey] ?? 0);
  const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals), yMax = Math.max(...yVals);
  const xSpan = xMax - xMin || 1, ySpan = yMax - yMin || 1;

  const W = 260, H = 180, PAD = 8;
  const project = (x, y) => [
    PAD + ((x - xMin) / xSpan) * (W - 2 * PAD),
    H - PAD - ((y - yMin) / ySpan) * (H - 2 * PAD),
  ];

  const isClass = result?.task_type === "classification";

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-1.5 flex-wrap">
        {availableTasks.length > 1 &&
          availableTasks.map((t) => (
            <button
              key={t}
              onClick={() => setTask(t)}
              className={`text-[10px] px-2 py-1 rounded-md border ${
                task === t ? "bg-gold/10 border-gold/30 text-gold" : "border-border text-ink-faint hover:text-ink"
              }`}
            >
              {TASK_SHORT_LABELS[t]}
            </button>
          ))}
      </div>

      <div className="flex gap-2">
        <select
          value={yKey}
          onChange={(e) => setYKey(e.target.value)}
          className="flex-1 text-[10px] bg-surface2 border border-border rounded-lg px-1.5 py-1 text-ink-muted outline-none"
        >
          {features.map((f) => <option key={f} value={f}>Y: {f}</option>)}
        </select>
        <select
          value={xKey}
          onChange={(e) => setXKey(e.target.value)}
          className="flex-1 text-[10px] bg-surface2 border border-border rounded-lg px-1.5 py-1 text-ink-muted outline-none"
        >
          {features.map((f) => <option key={f} value={f}>X: {f}</option>)}
        </select>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-surface2/40 border border-border">
        {/* median guide lines, forming quadrants */}
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgb(var(--border))" strokeDasharray="2,3" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgb(var(--border))" strokeDasharray="2,3" />
        {rows.map((r, i) => {
          // A field can arrive as the "REDACTED" sentinel (see api/redact.py) for a viewer-role
          // caller — skip plotting that point rather than coercing a string to NaN/0, which
          // would misleadingly place it at the axis origin as if the value were actually 0.
          if (r[xKey] === "REDACTED" || r[yKey] === "REDACTED") return null;
          const [px, py] = project(r[xKey] ?? 0, r[yKey] ?? 0);
          const positiveIsRisk = TASK_POSITIVE_IS_RISK[task] ?? true;
          const flagged = positiveIsRisk ? r._label === 1 : r._label === 0;
          const color = isClass ? (flagged ? "rgb(var(--red))" : "rgb(var(--teal))") : "rgb(var(--gold))";
          return <circle key={i} cx={px} cy={py} r={2} fill={color} fillOpacity={0.65} />;
        })}
      </svg>
      <p className="text-[10px] text-ink-faint leading-relaxed">
        {rows.length} rows from the latest {TASK_LABELS[task]} upload.{" "}
        {isClass ? <>Red = flagged, teal = not flagged.</> : <>Color = predicted value.</>} Dashed lines mark the
        midpoint of each axis's plotted range, not a validated risk threshold.
      </p>
    </div>
  );
}
