import { TASK_LABELS } from "./api";
import { formatPercent, formatRaw } from "./format";

function taskSummaryLines(task, r) {
  if (!r.predict) return [`- **${TASK_LABELS[task]}**: not run`];
  const lines = [];
  if (r.predict.task_type === "classification") {
    lines.push(
      `- **${TASK_LABELS[task]}**: ${formatPercent(r.predict.probability)} (${r.predict.label === 1 ? "Positive" : "Negative"})`
    );
  } else {
    lines.push(`- **${TASK_LABELS[task]}**: ${formatRaw(r.predict.raw_output)} (standardized regression output)`);
  }
  if (r.explain) {
    const top = r.explain.top_contributions.slice(0, 3)
      .map((c) => `${c.feature} (${c.shap_value >= 0 ? "+" : ""}${c.shap_value.toFixed(3)})`)
      .join(", ");
    lines.push(`  Top drivers: ${top}`);
  }
  return lines;
}

export function buildReportMarkdown(results) {
  const tasks = Object.keys(results);
  const emp = results.employment?.predict;
  const skl = results.skills?.predict;
  const empFlag = emp?.task_type === "classification" && emp.label === 1;
  const sklFlag = skl?.task_type === "classification" && skl.label === 1;
  const flags = [];
  if (empFlag) flags.push("elevated automation-risk signal on Employment");
  if (sklFlag) flags.push("elevated attrition-risk signal on Skills");
  const flagSentence = flags.length
    ? `This input combination triggers ${flags.join(" and ")}.`
    : "This input combination does not trigger either classification task's risk flag.";

  const date = new Date().toLocaleString();

  return `# ZivaBasa — Workforce Intelligence Report
Generated ${date}

## Predictions

${tasks.map((t) => taskSummaryLines(t, results[t]).join("\n")).join("\n")}

## Overall summary

${flagSentence} Productivity is reported as a continuous standardized score (not a risk flag) —
read it alongside the two classification flags rather than as confirmation of them.

Each task head is a separately trained model on a different proxy dataset — these are not
row-aligned records of the same entity, so this is a narrative juxtaposition of three
predictions, not a single joint model output.

---
Prototype, Kaggle proxy data. Not a real-world workforce finding. SHAP values are local,
associational explanations, not causal claims. Extremely confident predictions (near 0%/100%)
may reflect an uncalibrated model rather than certainty.
`;
}

export function downloadReport(filename, content, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
