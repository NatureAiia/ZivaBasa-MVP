import { COST_CATEGORIES } from "./costModel";
import { downloadReport } from "./report";

export function buildCostReportMarkdown(entries) {
  const date = new Date().toLocaleString();
  let grandTotal = 0;

  const sections = COST_CATEGORIES.map((cat) => {
    let subtotal = 0;
    const rows = cat.items.map((item) => {
      const e = entries[item.key] || {};
      const amount = Number(e.monthlyUsd) || 0;
      subtotal += amount;
      return `- **${item.label}**: ${amount ? `$${amount.toLocaleString()}/mo` : "_not entered_"}\n  ${item.driver}${e.note ? `\n  Note: ${e.note}` : ""}`;
    }).join("\n");
    grandTotal += subtotal;
    return `### ${cat.label}\nSubtotal: ${subtotal ? `$${subtotal.toLocaleString()}/mo` : "_no figures entered_"}\n\n${rows}`;
  }).join("\n\n");

  return `# ZivaBasa — Cost Model
Generated ${date}

**Source:** AI4I Development Track Proposal, §5.3 "Cost and Resource Model." No dollar figures
are pre-filled by the platform — every number below was entered manually. This is a working
cost tracker, not a confirmed budget or costing exercise; the proposal explicitly recommends a
finance specialist validate real figures against confirmed ZCHPC hosting costs and pilot data
volumes before this is treated as a real budget.

**Running total (whatever has been entered so far): ${grandTotal ? `$${grandTotal.toLocaleString()}/mo` : "$0 — nothing entered yet"}**

${sections}
`;
}

export function downloadCostReport(entries) {
  downloadReport(`zivabasa-cost-model-${Date.now()}.md`, buildCostReportMarkdown(entries));
}
