import { useState } from "react";
import { motion } from "framer-motion";
import { FileDown, RotateCcw } from "lucide-react";
import Card from "../common/Card";
import Button from "../common/Button";
import CopyButton from "../common/CopyButton";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { TASKS, TASK_LABELS, TASK_POSITIVE_IS_RISK } from "../../lib/api";
import { formatPercent, formatRaw } from "../../lib/format";
import { downloadBlob } from "../../lib/report";
import { metaFor } from "../../lib/fieldMeta";
import { api } from "../../lib/api";

// Per-task "is this classification result flagged?" check, respecting skill_match's inverted
// polarity (label === 1 there is a GOOD match, not a risk) via TASK_POSITIVE_IS_RISK.
function isFlagged(predict) {
  if (!predict || predict.task_type !== "classification") return false;
  const positiveIsRisk = TASK_POSITIVE_IS_RISK[predict.task] ?? true;
  return positiveIsRisk ? predict.label === 1 : predict.label === 0;
}

const FLAG_PHRASES = {
  employment: "elevated automation-risk signal on Employment",
  skills: "elevated attrition-risk signal on Skills",
  skill_match: "a poor redeployment match on Skill Matching",
  human_capital: "elevated turnover-risk signal on Human Capital",
};

export default function OverallSummary({ results, onRestart }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const flags = TASKS.filter((t) => isFlagged(results[t].predict)).map((t) => FLAG_PHRASES[t] || t);
  const flagSentence = flags.length
    ? `This input combination triggers ${flags.join(", ")}.`
    : "This input combination does not trigger any classification task's risk flag.";

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

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await api.predictReportPdf(results);
      downloadBlob(`zivabasa-predict-report-${Date.now()}.pdf`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setDownloadingPdf(false);
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
          const flagged = isFlagged(r.predict);
          const tone = isClass ? (flagged ? "text-red" : "text-teal") : "text-gold";
          return (
            <Card key={task}>
              <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-2">{TASK_LABELS[task]}</h3>
              <div className={`font-mono text-xl font-semibold mb-1 ${tone}`}>{value}</div>
              <div className="text-[11px] text-ink-muted mb-3">
                {isClass ? (flagged ? "Flagged" : "Clear") : "standardized regression output"}
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Overall summary</h2>
          <CopyButton text={flagSentence} label="Copy summary" />
        </div>
        {/* The one narrative verdict on this screen — set in the authority serif so it reads as
            a considered finding, not another data row. Everything else on this card stays Inter. */}
        <p className="font-serif text-lg leading-snug text-ink mb-3">
          {flagSentence}
        </p>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          Productivity is reported as a continuous score (not a risk flag) — read
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

      <div className="flex gap-2 flex-wrap">
        <Button variant="primary" onClick={handleDownload} disabled={downloading}>
          <FileDown size={15} /> {downloading ? "Generating…" : "Download report (Word)"}
        </Button>
        <Button variant="secondary" onClick={handleDownloadPdf} disabled={downloadingPdf}>
          <FileDown size={15} /> {downloadingPdf ? "Generating…" : "Download report (PDF)"}
        </Button>
        <Button variant="secondary" onClick={onRestart}>
          <RotateCcw size={15} /> Start over
        </Button>
      </div>
    </motion.div>
  );
}
