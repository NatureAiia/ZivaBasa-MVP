import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Card from "../components/common/Card";
import Badge from "../components/common/Badge";
import CorporateKPIGrid from "../components/dashboard/CorporateKPIGrid";
import { staggerContainer, fadeUpItem } from "../lib/motion";

const MODELS = [
  { slug: "zivabasa", name: "ZivaBasa", tagline: "Workforce transformation intelligence", live: true },
  { slug: "ziva-bank", name: "Ziva Bank", tagline: "Financial risk modeling", live: false },
  { slug: "ziva-dataops", name: "Ziva DataOps", tagline: "Data pipeline health & operations", live: false },
  { slug: "ziva-business", name: "Ziva Business", tagline: "Business intelligence & forecasting", live: false },
  { slug: "ziva-upskill", name: "ZivaUpskill", tagline: "Learning & upskilling pathways", live: false },
];

export default function ChiedzaDashboard() {
  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-8">
        <motion.div variants={fadeUpItem}>
          <h1 className="font-display text-2xl font-semibold text-ink">ChiedzaAI</h1>
          <p className="text-sm text-ink-muted mt-1">Decision intelligence, one model at a time.</p>
        </motion.div>

        <motion.div variants={fadeUpItem}>
          <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">
            Corporate summary — across all models
          </h2>
          <CorporateKPIGrid />
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
  );
}
