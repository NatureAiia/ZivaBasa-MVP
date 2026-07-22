import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import ClarityRing from "../../components/common/ClarityRing";
import CorporateKPIGrid from "../../components/dashboard/CorporateKPIGrid";
import DepartmentBreakdown from "../../components/dashboard/DepartmentBreakdown";
import ChatUsageSummary from "../../components/dashboard/ChatUsageSummary";
import FutureSkillsTable from "../../components/dashboard/FutureSkillsTable";
import Typewriter from "../../components/effects/Typewriter";
import ShinyPill from "../../components/effects/ShinyPill";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";

const RISK_PHRASES = ["Employee", "Skills", "Productivity", "Automation risk", "Lack of skills", "Low productivity"];

export default function DashboardTab() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-5xl mx-auto w-full">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6">
        <motion.div variants={fadeUpItem} className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-xl font-semibold text-ink">ZivaBasa</h1>
              <span className="text-ink-faint text-xl font-display">—</span>
              <div style={{ height: 24 }} className="flex items-center">
                <Typewriter
                  texts={RISK_PHRASES}
                  typedColor="rgb(var(--ink))"
                  color="rgb(var(--ink))"
                  cursorChar="_"
                  font={{ fontFamily: "Space Grotesk", fontWeight: 600, fontSize: 20 }}
                  ease={{ type: "tween", duration: 0.05, delay: 1, ease: "easeInOut" }}
                />
              </div>
            </div>
            <div className="mt-1" style={{ maxWidth: 420 }}>
              <ShinyPill
                text="Know your work — workforce transformation intelligence."
                textColor="rgb(var(--ink-muted))"
                shineColor="#E8A33D"
                shineColor2="#2FBF9F"
                speed={2.8}
                font={{ fontFamily: "Inter", fontSize: "14px", fontWeight: 500, lineHeight: "1.4em" }}
                style={{ whiteSpace: "normal", width: "100%" }}
              />
            </div>
          </div>
          <Link to="../predict">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-gold text-bg rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Upload data <ArrowRight size={15} />
            </motion.span>
          </Link>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <Card className="flex items-center gap-4" animated={false}>
            <ClarityRing mode={health ? "confidence" : "loading"} value={health ? 1 : 0} size={44} color={error ? "red" : "teal"} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">API status</span>
                {error ? (
                  <Badge tone="red">Unreachable</Badge>
                ) : health ? (
                  <Badge tone="teal">{health.tasks_loaded.length} model(s) available</Badge>
                ) : (
                  <Badge tone="neutral">Checking…</Badge>
                )}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                {error
                  ? error
                  : health
                  ? `Ready to score uploads for: ${health.tasks_loaded.join(", ")} — upload a batch below to populate results.`
                  : "Contacting the ZivaBasa API…"}
              </p>
            </div>
            <Activity size={16} className="text-ink-faint" />
          </Card>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">Corporate summary</h2>
          <CorporateKPIGrid />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <FutureSkillsTable />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <DepartmentBreakdown />
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <ChatUsageSummary />
        </motion.div>
      </motion.div>
      </div>
    </div>
  );
}
