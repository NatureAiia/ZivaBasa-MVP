import { useState } from "react";
import { motion } from "framer-motion";
import { FileDown, RotateCcw } from "lucide-react";
import Card from "../common/Card";
import Button from "../common/Button";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { TASKS, TASK_LABELS } from "../../lib/api";
import { formatPercent, formatRaw } from "../../lib/format";
import { downloadBlob } from "../../lib/report";
import { metaFor } from "../../lib/fieldMeta";
import { api } from "../../lib/api";

export default function OverallSummary({ results, onRestart }) {
  const [downloading, setDownloading] = useState(false);
  const emp = results.employment.predict;
  const skl = results.skills.predict;
  const empFlag = emp?.task_type === "classification" && emp.label === 1;
  const sklFlag = skl?.task_type === "classification" && skl.label === 1;
  const flags = [];
  if (empFlag) flags.push("elevated automation-risk signal on Employment");
  if (sklFlag) flags.push("elevated attrition-risk signal on Skills");
  const flagSentence = flags.length
    ? `This input combination triggers ${flags.join(" and ")}.`
    : "This input combination does not trigger either classification task's risk flag.";

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await api.predictReport(results);
      downloadBlob(`zivabasa-predict-report-${Date.now()}.docx`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {TASKS.map((task) => {
          const r = results[task];
          if (!r.predict) {
            return (
              <Card key={task} className="opacity-50">
                <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">{TASK_LABELS[task]}</h3>
                <p className="text-xs text-ink-faint">Not run</p>
              </Card>
            );
          }
          const isClass = r.predict.task_type === "classification";
          const value = isClass ? formatPercent(r.predict.probability) : formatRaw(r.predict.raw_output);
          const tone = isClass ? (r.predict.label === 1 ? "text-red" : "text-teal") : "text-gold";
          return (
            <Card key={task}>
              <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">{TASK_LABELS[task]}</h3>
              <div className={`font-mono text-xl font-semibold mb-1 ${tone}`}>{value}</div>
              <div className="text-[11px] text-ink-muted mb-3">
                {isClass ? (r.predict.label === 1 ? "Positive" : "Negative") : "standardized regression output"}
              </div>
              {r.explain && (
                <div className="text-[11px] text-ink-muted space-y-1">
                  {r.explain.top_contributions.slice(0, 3).map((c) => (
                    <div key={c.feature}>
                      <span className="text-ink">{metaFor(c.feature, task).label}</span>: {c.shap_value >= 0 ? "+" : ""}{c.shap_value.toFixed(3)}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card variants={fadeUpItem}>
        <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">Overall summary</h2>
        <p className="text-sm text-ink leading-relaxed mb-3">
          {flagSentence} Productivity is reported as a continuous score (not a risk flag) — read
          it alongside the two flags rather than as confirmation of them.
        </p>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          Each task head is a separately trained model on a different proxy dataset — these are
          not row-aligned records of the same entity, so this summary is a narrative juxtaposition
          of three predictions, not a single joint model output.
        </p>
        <p className="text-[11px] text-ink-faint">
          Prototype, Kaggle proxy data. Not a real-world workforce finding.
        </p>
      </Card>

      <div className="flex gap-2">
        <Button variant="primary" onClick={handleDownload} disabled={downloading}>
          <FileDown size={15} /> {downloading ? "Generating…" : "Download report (Word)"}
        </Button>
        <Button variant="secondary" onClick={onRestart}>
          <RotateCcw size={15} /> Start over
        </Button>
      </div>
    </motion.div>
  );
}
