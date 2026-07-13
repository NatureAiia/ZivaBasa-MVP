import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, TrendingUp, Users, Cpu } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import Skeleton from "../../components/common/Skeleton";
import ClarityRing from "../../components/common/ClarityRing";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { api } from "../../lib/api";
import { getHistory } from "../../lib/history";

const TASK_META = [
  { key: "employment", icon: Users, label: "Employment", desc: "Automation risk by job role" },
  { key: "skills", icon: TrendingUp, label: "Skills", desc: "Attrition risk from workforce signals" },
  { key: "productivity", icon: Cpu, label: "Productivity", desc: "AI adoption impact, standardized" },
];

export default function DashboardTab() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const history = getHistory();

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-6">
        <motion.div variants={fadeUpItem} className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">ZivaBasa</h1>
            <p className="text-sm text-ink-muted mt-1">Know your work — workforce transformation intelligence.</p>
          </div>
          <Link to="../predict">
            <motion.span
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-gold text-bg rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Run a prediction <ArrowRight size={15} />
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
                  <Badge tone="teal">{health.tasks_loaded.length} task(s) loaded</Badge>
                ) : (
                  <Badge tone="neutral">Checking…</Badge>
                )}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                {error ? error : health ? `Loaded: ${health.tasks_loaded.join(", ")}` : "Contacting the ZivaBasa API…"}
              </p>
            </div>
            <Activity size={16} className="text-ink-faint" />
          </Card>
        </motion.div>

        <motion.div variants={fadeUpItem} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TASK_META.map(({ key, icon: Icon, label, desc }) => (
            <Card key={key} animated={false} className="flex flex-col gap-2">
              <Icon size={18} className="text-gold" />
              <h3 className="text-sm font-semibold text-ink">{label}</h3>
              <p className="text-xs text-ink-muted">{desc}</p>
            </Card>
          ))}
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <Card animated={false}>
            <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">Recent activity</h2>
            {history.length === 0 ? (
              <p className="text-xs text-ink-faint">No runs yet. Head to the Predict tab to get started.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {history.slice(0, 5).map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-xs text-ink-muted border-b border-border last:border-0 pb-2 last:pb-0">
                    <span>{new Date(h.timestamp).toLocaleString()}</span>
                    <span className="font-mono text-ink-faint">Employment · Skills · Productivity</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
