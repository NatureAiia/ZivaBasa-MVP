import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import CorporateKPIGrid from "../components/dashboard/CorporateKPIGrid";
import MeshTextHover from "../components/effects/MeshTextHover";
import ShinyPill from "../components/effects/ShinyPill";
import Typewriter from "../components/effects/Typewriter";
import { MODELS } from "../components/layout/Sidebar";
import { computeCostTotals } from "../lib/costCompute";
import { getCostEntries } from "../lib/costStore";
import { usageSummary } from "../lib/usageStore";
import { staggerContainer, fadeUpItem } from "../lib/motion";

const COST_GROUP_DEFS = [
  { key: "model", label: "Model", categoryKeys: ["model"] },
  { key: "licence-maintenance", label: "Licence & Maintenance", categoryKeys: ["licence", "maintenance"] },
  { key: "human-other", label: "Human & Other Costs", categoryKeys: ["human", "other"] },
];

export default function ChiedzaDashboard() {
  const [totals, setTotals] = useState({ categoryTotals: [], grandTotal: 0, enteredCount: 0, totalItems: 0 });

  useEffect(() => {
    Promise.all([getCostEntries(), usageSummary(true)]).then(([entries, usage]) => {
      setTotals(computeCostTotals(entries, usage.totalCostUsd));
    });
  }, []);

  const { categoryTotals, grandTotal, enteredCount, totalItems } = totals;
  const costGroups = COST_GROUP_DEFS.map((group) => ({
    ...group,
    total: categoryTotals.filter(({ cat }) => group.categoryKeys.includes(cat.key)).reduce((sum, item) => sum + item.total, 0),
  }));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto w-full">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-8">
        <motion.div variants={fadeUpItem} className="flex flex-col items-center text-center w-full">
          <div className="flex items-center justify-center gap-3 flex-wrap w-full">
            <div style={{ width: 280, height: 70 }}>
              <MeshTextHover
                text="ChiedzaAI"
                color="#9BA3B7"
                colorSplit={true}
                customColors={["#E8A33D", "#2FBF9F", "#6C7CFF"]}
                force={14}
                font={{ fontFamily: "Space Grotesk", variant: "SemiBold", fontSize: 46 }}
              />
            </div>
            <div style={{ height: 48 }} className="flex items-center">
              <Typewriter
                texts={MODELS.map((m) => m.name)}
                typedColor="#9BA3B7"
                color="#9BA3B7"
                cursorChar="_"
                font={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 48 }}
                ease={{ type: "tween", duration: 0.06, delay: 1.1, ease: "easeInOut" }}
              />
            </div>
          </div>
          <div className="mt-2 flex justify-center w-full">
            <ShinyPill
              text="Decision intelligence, one model at a time."
              textColor="rgb(var(--ink-muted))"
              shineColor="#E8A33D"
              shineColor2="#6C7CFF"
              speed={2.6}
              font={{ fontFamily: "Inter", fontSize: "14px", fontWeight: 500, lineHeight: "1.4em" }}
              style={{ whiteSpace: "normal", width: "100%", maxWidth: "420px", textAlign: "center" }}
            />
          </div>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">
            Corporate summary — across all models
          </h2>
          <CorporateKPIGrid />
        </motion.div>

        <motion.div variants={fadeUpItem} className="w-full">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Cost monitoring dashboard</h2>
            <Badge tone={enteredCount > 0 ? "teal" : "neutral"}>
              {enteredCount} of {totalItems} drivers costed
            </Badge>
          </div>
          <Card animated={false} className="border-gold/20 bg-gold/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Total monthly cost</div>
                <div className="font-mono text-3xl font-semibold text-ink mt-1">
                  {grandTotal ? `$${grandTotal.toLocaleString()}` : "$0"}
                  <span className="text-sm text-ink-faint font-normal">/mo</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {costGroups.map(({ key, label, total }) => (
                  <div key={key} className="rounded-xl border border-border bg-surface px-3 py-2 min-w-[160px]">
                    <div className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">{label}</div>
                    <div className="font-mono text-sm font-semibold text-ink mt-0.5">
                      {total ? `$${total.toLocaleString()}` : "$0"}
                      <span className="text-[10px] text-ink-faint font-normal">/mo</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">Models</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODELS.map((m) => (
              <Link key={m.slug} to={`/models/${m.slug}`}>
                <motion.div whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
                  <Card animated={false} className="flex items-center justify-between gap-3 h-full">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-ink text-sm">{m.name}</h3>
                        <Badge tone={m.live ? "teal" : "neutral"}>{m.live ? "Live" : "In development"}</Badge>
                      </div>
                      <p className="text-xs text-ink-muted">{m.tagline}</p>
                    </div>
                    <ArrowUpRight size={16} className="text-ink-faint shrink-0" />
                  </Card>
                </motion.div>
              </Link>
            ))}
          </div>
        </motion.div>
      </motion.div>
      </div>
    </div>
  );
}
