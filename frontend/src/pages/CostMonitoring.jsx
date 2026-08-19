import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, FileDown, RotateCcw, Wallet, Zap } from "lucide-react";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import ShinyPill from "../components/effects/ShinyPill";
import CostDonut from "../components/charts/CostDonut";
import CostBarChart from "../components/charts/CostBarChart";
import { staggerContainer, fadeUpItem } from "../lib/motion";
import { getCostEntries, setCostEntry, clearCostEntries } from "../lib/costStore";
import { downloadCostReport } from "../lib/costReport";
import { computeCostTotals, AUTO_TRACKED_ITEM_KEY } from "../lib/costCompute";
import { usageSummary } from "../lib/usageStore";
import { getAssignments } from "../lib/assignmentStore";
import { aiOverrideShare } from "../lib/governanceStats";
import TokenBalanceBar from "../components/tokens/TokenBalanceBar";

// One distinct accent per category — used consistently across the quick-total
// buttons, the donut, the bar chart, and the legend so the same category
// always reads as the same color throughout the page.
const CATEGORY_COLORS = {
  model: "text-indigo",
  human: "text-gold",
  maintenance: "text-teal",
  licence: "text-violet",
  hardware: "text-cyan",
  other: "text-red",
};

export default function CostMonitoring() {
  const [entries, setEntries] = useState({});
  const [llmUsage, setLlmUsage] = useState({ totalMessages: 0, totalCostUsd: 0, byProvider: {} });
  const [governance, setGovernance] = useState(null);

  useEffect(() => {
    getCostEntries().then(setEntries);
    usageSummary(true).then(setLlmUsage);
    getAssignments().then((a) => setGovernance(aiOverrideShare(a)));
  }, []);

  const updateItem = async (itemKey, field, value) => {
    const current = entries[itemKey] || {};
    const next = { ...current, [field]: value };
    setEntries(await setCostEntry(itemKey, next));
  };

  const categoryRefs = useRef({});
  const { categoryTotals, grandTotal, enteredCount, totalItems, autoLlmCostUsd } = useMemo(
    () => computeCostTotals(entries, llmUsage.totalCostUsd),
    [entries, llmUsage]
  );

  const chartData = useMemo(
    () =>
      categoryTotals.map(({ cat, total }) => ({
        key: cat.key,
        label: cat.label,
        value: total,
        colorClass: CATEGORY_COLORS[cat.key] || "text-ink-faint",
      })),
    [categoryTotals]
  );

  const scrollToCategory = (key) => {
    categoryRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const reset = async () => {
    await clearCostEntries();
    setEntries({});
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-5">
          <motion.div variants={fadeUpItem} className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display text-xl font-semibold text-ink flex items-center gap-2">
                <Wallet size={20} className="text-gold" /> Cost Monitoring
              </h1>
              <div className="mt-1" style={{ maxWidth: 460 }}>
                <ShinyPill
                  text="Model, human, maintenance, licence, hardware/storage, and compliance costs."
                  textColor="rgb(var(--ink-muted))"
                  shineColor="#E8A33D"
                  shineColor2="#2FBF9F"
                  speed={2.8}
                  font={{ fontFamily: "Inter", fontSize: "14px", fontWeight: 500, lineHeight: "1.4em" }}
                  style={{ whiteSpace: "normal", width: "100%" }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => downloadCostReport(entries)}
                className="flex items-center gap-1.5 bg-surface2 border border-border rounded-xl px-3.5 py-2 text-xs font-medium text-ink hover:border-gold/40 transition-colors"
              >
                <FileDown size={14} /> Export
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 bg-surface2 border border-border rounded-xl px-3.5 py-2 text-xs font-medium text-ink-muted hover:text-red hover:border-red/30 transition-colors"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </motion.div>

          {/* Honesty banner — directly from the proposal's own words */}
          <motion.div variants={fadeUpItem}>
            <Card animated={false} className="flex items-start gap-3 border-gold/25 bg-gold/5">
              <AlertTriangle size={16} className="text-gold shrink-0 mt-0.5" />
              <p className="text-xs text-ink-muted leading-relaxed">
                <strong className="text-ink">No real costing exercise has been done yet.</strong>{" "}
                Per the AI4I proposal (§5.3): figures here need a finance specialist working from
                confirmed ZCHPC hosting costs and pilot data volumes. Nothing here is fabricated —
                every number below is whatever you enter, stored only in this browser, except
                "Chat LLM API usage," which is computed automatically from real logged chat calls
                (still an estimate — see that item for details). Treat the totals as a live
                scratchpad, not a budget.
              </p>
            </Card>
          </motion.div>

          {/* Totals — hero grand total + clickable category totals, click jumps to that category's detail below */}
          <motion.div variants={fadeUpItem} className="flex flex-col gap-3">
            <Card animated={false} className="flex items-center justify-between bg-gradient-to-br from-gold/10 to-transparent border-gold/25">
              <div>
                <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Total monthly cost</span>
                <div className="font-mono text-4xl font-bold text-ink mt-1">
                  {grandTotal ? `$${grandTotal.toLocaleString()}` : "$0"}
                  <span className="text-base text-ink-faint font-normal">/mo</span>
                </div>
              </div>
              <Badge tone={enteredCount > 0 ? "teal" : "neutral"}>
                {enteredCount} of {totalItems} drivers costed
              </Badge>
            </Card>

            <Card animated={false}>
              <TokenBalanceBar />
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {categoryTotals.map(({ cat, total }) => {
                const share = grandTotal > 0 ? Math.min(100, (total / grandTotal) * 100) : 0;
                const colorClass = CATEGORY_COLORS[cat.key] || "text-ink-faint";
                return (
                  <button
                    key={cat.key}
                    onClick={() => scrollToCategory(cat.key)}
                    className="text-left rounded-xl border border-border bg-surface px-3.5 py-3 hover:border-gold/40 hover:bg-surface2/50 transition-colors"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold truncate">{cat.label}</div>
                    <div className="font-mono text-lg font-semibold text-ink mt-0.5">
                      {total ? `$${total.toLocaleString()}` : "$0"}
                      <span className="text-[10px] text-ink-faint font-normal">/mo</span>
                    </div>
                    <div className="mt-2 h-1 w-full rounded-full bg-border overflow-hidden">
                      <div
                        className={colorClass}
                        style={{ width: `${Math.max(share, total ? 4 : 0)}%`, height: "100%", backgroundColor: "currentColor", transition: "width 0.6s ease" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Visual overview — donut for share-of-total, bar chart for category comparison */}
          <motion.div variants={fadeUpItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card animated={false}>
              <h2 className="text-sm font-semibold text-ink mb-4">Cost Breakdown</h2>
              <div className="flex items-center gap-5">
                <CostDonut segments={chartData} total={grandTotal} />
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  {chartData.map((d) => {
                    const pct = grandTotal > 0 ? Math.round((d.value / grandTotal) * 100) : 0;
                    return (
                      <div key={d.key} className="flex items-center gap-2 text-xs min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${d.colorClass}`} style={{ backgroundColor: "currentColor" }} />
                        <span className="text-ink-muted truncate flex-1">{d.label}</span>
                        <span className="font-mono text-ink-faint shrink-0">{d.value ? `${pct}%` : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card animated={false}>
              <h2 className="text-sm font-semibold text-ink mb-4">Category Comparison</h2>
              <CostBarChart bars={chartData} />
            </Card>
          </motion.div>

          {/* Category cards */}
          {categoryTotals.map(({ cat, total: subtotal }) => (
            <motion.div key={cat.key} variants={fadeUpItem} ref={(el) => (categoryRefs.current[cat.key] = el)}>
              <Card animated={false}>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-ink">{cat.label}</h2>
                  <span className="font-mono text-sm text-ink-muted">
                    {subtotal ? `$${subtotal.toLocaleString()}/mo` : "—"}
                  </span>
                </div>
                <p className="text-xs text-ink-faint mb-4">{cat.description}</p>

                {cat.key === "other" && governance && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2.5">
                    <Zap size={13} className="text-gold shrink-0 mt-0.5" />
                    <p className="text-[11px] text-ink-muted leading-relaxed">
                      <strong className="text-ink">
                        {(governance.share * 100).toFixed(0)}% of AI-recommended redeployments have been
                        overridden by a human
                      </strong>{" "}
                      ({governance.rejected} of {governance.decided} decided, My Organization tab) —
                      AI4I catalogue §2.1 "AI Overrides as a Share of AI Decisions." A live governance
                      signal, not a cost figure — factor a high override rate into how much human-review
                      time to budget under Legal / data-protection review and Security engineering below.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-4">
                  {cat.items.map((item) => {
                    const entry = entries[item.key] || {};
                    const isAuto = item.key === AUTO_TRACKED_ITEM_KEY;
                    return (
                      <div key={item.key} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex-1 min-w-[220px]">
                            <div className="text-xs font-medium text-ink flex items-center gap-1.5">
                              {item.label}
                              {isAuto && (
                                <Badge tone="teal">
                                  <Zap size={9} /> Auto
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-ink-faint mt-0.5 leading-relaxed">{item.driver}</p>
                            {isAuto ? (
                              <span className="text-[10px] text-ink-faint italic">
                                Computed automatically from {llmUsage.totalMessages} logged chat message
                                {llmUsage.totalMessages === 1 ? "" : "s"} this month, at estimated per-provider
                                rates — see Chat tab for the live picker. Rough estimate, not an invoice.
                              </span>
                            ) : (
                              <span className="text-[10px] text-ink-faint italic">{item.source}</span>
                            )}
                          </div>
                          {isAuto ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-ink-faint">$</span>
                              <span className="w-28 text-right font-mono text-sm text-ink">
                                {autoLlmCostUsd.toFixed(2)}
                              </span>
                              <span className="text-xs text-ink-faint">/mo</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-ink-faint">$</span>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                placeholder="0"
                                value={entry.monthlyUsd ?? ""}
                                onChange={(e) => updateItem(item.key, "monthlyUsd", e.target.value)}
                                className="w-28 bg-surface2 border border-border rounded-lg px-2.5 py-1.5 text-sm font-mono text-ink outline-none focus:border-gold/50 transition-colors"
                              />
                              <span className="text-xs text-ink-faint">/mo</span>
                            </div>
                          )}
                        </div>
                        {!isAuto && (
                          <input
                            type="text"
                            placeholder="Optional note (e.g. quote source, assumption)"
                            value={entry.note ?? ""}
                            onChange={(e) => updateItem(item.key, "note", e.target.value)}
                            className="mt-2 w-full bg-transparent border-b border-border text-xs text-ink-muted outline-none focus:border-gold/50 transition-colors py-1"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
