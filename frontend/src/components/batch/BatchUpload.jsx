import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, AlertTriangle, TrendingDown, TrendingUp, Users, Building2, Shuffle, Fingerprint } from "lucide-react";
import clsx from "clsx";
import Card from "../common/Card";
import ClarityRing from "../common/ClarityRing";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { api, TASKS, TASK_LABELS, TASK_SHORT_LABELS, TASK_POSITIVE_IS_RISK } from "../../lib/api";
import { saveBatchResult } from "../../lib/batchStore";
import { addSource } from "../../lib/sourcesStore";
import { formatPercent } from "../../lib/format";

const TASK_COPY = {
  employment: { verb: "roles", risk: "automation risk", icon: TrendingDown },
  skills: { verb: "employees", risk: "attrition risk", icon: Users },
  productivity: { verb: "roles", risk: "AI-adoption impact", icon: TrendingUp },
  skill_match: { verb: "staff-role pairs", risk: "strong redeployment matches", icon: Shuffle },
};

export default function BatchUpload({ task, onResult }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const copy = TASK_COPY[task];
  const Icon = copy.icon;

  const upload = async (file) => {
    if (!file) return;
    setState("loading");
    setError(null);
    try {
      const res = await api.predictBatch(task, file);
      setResult(res);
      await Promise.all([
        saveBatchResult(task, res),
        addSource({ name: file.name, kind: "csv", size: file.size, task, rowCount: res.n_rows }),
      ]);
      setState("done");
      onResult?.(res);
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  };

  if (state === "loading") {
    return (
      <Card animated={false} className="flex flex-col items-center gap-3 py-10">
        <ClarityRing mode="loading" size={48} color="gold" />
        <p className="text-sm text-ink-muted">Scoring every row against the {TASK_LABELS[task]} model…</p>
      </Card>
    );
  }

  if (state === "done" && result) {
    const isClass = result.task_type === "classification";
    const positiveIsRisk = TASK_POSITIVE_IS_RISK[task] ?? true;
    const positiveTone = positiveIsRisk ? "text-red" : "text-teal";
    return (
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
        {result.drift?.available !== false && result.drift?.overall_verdict !== "none" && (
          <motion.div
            variants={fadeUpItem}
            className={clsx(
              "flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] border",
              result.drift.overall_verdict === "high"
                ? "text-red bg-red/10 border-red/25"
                : "text-gold bg-gold/10 border-gold/25"
            )}
          >
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              {result.drift.overall_verdict === "high" ? "Significant" : "Moderate"} drift from the data this
              model was trained on (PSI {result.drift.overall_psi}) — most shifted:{" "}
              {result.drift.top_shifted_features
                .slice(0, 3)
                .map((f) => f.feature)
                .join(", ")}
              . Predictions are still returned, but treat them with more caution than usual.
            </span>
          </motion.div>
        )}
        {result.provenance && (
          <motion.div
            variants={fadeUpItem}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[11px] border text-ink-muted bg-surface2/60 border-border"
          >
            <Fingerprint size={13} className="shrink-0 text-teal" />
            <span>
              {Math.round(result.provenance.completeness_score * 100)}% of uploaded rows were
              complete ({result.provenance.n_total - result.provenance.n_dropped} of{" "}
              {result.provenance.n_total}) · fingerprint{" "}
              <span className="font-mono">{result.provenance.content_sha256.slice(0, 12)}…</span>
            </span>
          </motion.div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Rows analyzed</span>
            <span className="font-mono text-2xl font-semibold text-ink">{result.n_rows}</span>
            {result.n_dropped > 0 && <span className="text-[11px] text-ink-faint">{result.n_dropped} skipped (incomplete data)</span>}
          </Card>
          {isClass ? (
            <>
              <Card className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">{positiveIsRisk ? "Flagged" : "Identified"} {copy.risk}</span>
                <span className={`font-mono text-2xl font-semibold ${positiveTone}`}>{result.aggregate.positive_count} {copy.verb}</span>
                <span className="text-[11px] text-ink-faint">{formatPercent(result.aggregate.positive_rate)} of uploaded rows</span>
              </Card>
              <Card className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                  {result.aggregate.value_column_used ? "Payroll value flagged" : "Avg. probability"}
                </span>
                <span className="font-mono text-2xl font-semibold text-gold">
                  {result.aggregate.value_at_risk != null
                    ? `$${result.aggregate.value_at_risk.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : formatPercent(result.aggregate.mean_probability)}
                </span>
                {result.aggregate.value_column_used && (
                  <span className="text-[11px] text-ink-faint">sum of {result.aggregate.value_column_used} across flagged rows</span>
                )}
              </Card>
            </>
          ) : (
            <>
              <Card className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Above-average impact</span>
                <span className="font-mono text-2xl font-semibold text-teal">{result.aggregate.above_average_count} {copy.verb}</span>
              </Card>
              <Card className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Below-average impact</span>
                <span className="font-mono text-2xl font-semibold text-red">{result.aggregate.below_average_count} {copy.verb}</span>
              </Card>
            </>
          )}
        </div>

        {result.by_segment && result.by_segment.length > 0 && (
          <Card animated={false}>
            <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3 flex items-center gap-1.5">
              <Building2 size={13} /> By department / segment
            </h3>
            <div className="flex flex-col gap-2">
              {result.by_segment.map((seg) => (
                <div key={seg.segment} className="flex items-center justify-between text-xs">
                  <span className="text-ink">{seg.segment}</span>
                  <span className="text-ink-muted">
                    {seg.count} {copy.verb} ·{" "}
                    <span className="font-mono text-ink">
                      {isClass ? formatPercent(seg.positive_rate) : seg.mean.toFixed(3)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {result.top_rows && result.top_rows.length > 0 && (
          <Card animated={false}>
            <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3 flex items-center gap-1.5">
              <Icon size={13} /> Highest {copy.risk}
            </h3>
            <div className="flex flex-col gap-1.5">
              {result.top_rows.slice(0, 6).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">{r.label}</span>
                  <span className="font-mono text-ink">{isClass ? formatPercent(r.value) : r.value.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <button onClick={() => { setState("idle"); setResult(null); }} className="text-xs text-ink-faint hover:text-ink transition-colors self-start">
          Upload a different file
        </button>
      </motion.div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]); }}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center cursor-pointer transition-colors",
        dragOver ? "border-gold bg-gold/5" : "border-border hover:border-ink-faint bg-surface"
      )}
    >
      <FileSpreadsheet size={28} className="text-ink-faint" />
      <div>
        <p className="text-sm font-medium text-ink">Drop your {TASK_SHORT_LABELS[task].toLowerCase()} data here</p>
        <p className="text-xs text-ink-muted mt-1">CSV export from your HR system — column names just need to roughly match, we'll match by name</p>
      </div>
      <span className="flex items-center gap-1.5 text-xs text-gold font-medium">
        <Upload size={13} /> or click to browse
      </span>
      {state === "error" && (
        <div className="flex items-start gap-2 mt-2 text-left text-[11px] text-red bg-red/10 border border-red/25 rounded-xl px-3 py-2.5 max-w-md">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => upload(e.target.files[0])} />
    </div>
  );
}
