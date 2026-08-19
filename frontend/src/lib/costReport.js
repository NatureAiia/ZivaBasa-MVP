import { COST_CATEGORIES } from "./costModel";
import { downloadReport } from "./report";
import { AUTO_TRACKED_ITEM_KEY } from "./costCompute";
import { usageSummary } from "./usageStore";

export function buildCostReportMarkdown(entries) {
  const date = new Date().toLocaleString();
  const autoLlmCostUsd = usageSummary(true).totalCostUsd;
  let grandTotal = 0;

  const sections = COST_CATEGORIES.map((cat) => {
    let subtotal = 0;
    const rows = cat.items.map((item) => {
      const isAuto = item.key === AUTO_TRACKED_ITEM_KEY;
      const amount = isAuto ? autoLlmCostUsd : (Number(entries[item.key]?.monthlyUsd) || 0);
      subtotal += amount;
      const amountStr = amount
        ? `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo${isAuto ? " (auto-tracked from real chat usage)" : ""}`
        : "_not entered_";
      const note = entries[item.key]?.note;
      return `- **${item.label}**: ${amountStr}\n  ${item.driver}${note ? `\n  Note: ${note}` : ""}`;
    }).join("\n");
    grandTotal += subtotal;
    return `### ${cat.label}\nSubtotal: ${subtotal ? `$${subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo` : "_no figures entered_"}\n\n${rows}`;
  }).join("\n\n");

  return `# ZivaBasa — Cost Model
Generated ${date}

**Source:** AI4I Development Track Proposal, §5.3 "Cost and Resource Model." No dollar figures
are fabricated — every number below was either entered manually, or (for "Chat LLM API usage"
only) computed automatically from real logged chat calls at estimated per-provider rates. This
is a working cost tracker, not a confirmed budget or costing exercise; the proposal explicitly
recommends a finance specialist validate real figures against confirmed ZCHPC hosting costs and
pilot data volumes before this is treated as a real budget.

**Running total (whatever has been entered/tracked so far): ${grandTotal ? `$${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}/mo` : "$0 — nothing entered yet"}**

${sections}
`;
}

export function downloadCostReport(entries) {
  downloadReport(`zivabasa-cost-model-${Date.now()}.md`, buildCostReportMarkdown(entries));
}
