/*
  Shared cost-total computation. Previously CostMonitoring.jsx and ChiedzaDashboard.jsx each
  computed categoryTotals/grandTotal independently from the same costStore data — same
  duplicated-calculation pattern found (and fixed) elsewhere in this app (the module list, the
  task-label short-form). One version here now, imported by both.

  This is also where the one auto-tracked item (llm_api_usage) gets its number: instead of
  reading a manually-typed value for that one item, its contribution comes from
  usageStore's real logged chat usage. Every other item is still exactly what the person typed
  in Cost Monitoring — this doesn't touch those, on purpose (see costModel.js's comment on why
  most of these categories can't be automated at all).
*/
import { COST_CATEGORIES } from "./costModel";
import { getCostEntries } from "./costStore";
import { usageSummary } from "./usageStore";

export const AUTO_TRACKED_ITEM_KEY = "llm_api_usage";

export function computeCostTotals(entries = getCostEntries()) {
  const autoLlmCostUsd = usageSummary(true).totalCostUsd;

  const categoryTotals = COST_CATEGORIES.map((cat) => {
    const total = cat.items.reduce((sum, item) => {
      if (item.key === AUTO_TRACKED_ITEM_KEY) return sum + autoLlmCostUsd;
      return sum + (Number(entries[item.key]?.monthlyUsd) || 0);
    }, 0);
    return { cat, total };
  });

  const grandTotal = categoryTotals.reduce((sum, c) => sum + c.total, 0);
  const manualEnteredCount = Object.entries(entries).filter(
    ([key, e]) => key !== AUTO_TRACKED_ITEM_KEY && Number(e?.monthlyUsd) > 0
  ).length;
  const enteredCount = manualEnteredCount + (autoLlmCostUsd > 0 ? 1 : 0);
  const totalItems = COST_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  return { categoryTotals, grandTotal, enteredCount, totalItems, autoLlmCostUsd };
}
