import { motion } from "framer-motion";
import { Users, TrendingDown, TrendingUp, Upload, Shuffle } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getAllBatchResults } from "../../lib/batchStore";
import { formatPercent } from "../../lib/format";

function EmptyKPICard({ icon: Icon, title }) {
  return (
    <Card animated={false} className="flex flex-col gap-2 opacity-60">
      <Icon size={16} className="text-ink-faint" />
      <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">{title}</span>
      <Link to="predict" className="flex items-center gap-1 text-[11px] text-gold hover:brightness-110 mt-1">
        <Upload size={11} /> Upload data to populate
      </Link>
    </Card>
  );
}

export default function CorporateKPIGrid() {
  const { employment, skills, productivity, skill_match: skillMatch } = getAllBatchResults();

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {employment ? (
          <Card variants={fadeUpItem} className="flex flex-col gap-2">
            <TrendingDown size={16} className="text-red" />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Roles at automation risk</span>
            <span className="font-mono text-3xl font-semibold text-ink">{employment.aggregate.positive_count}</span>
            <span className="text-xs text-ink-muted">
              {formatPercent(employment.aggregate.positive_rate)} of {employment.n_rows} roles analyzed
            </span>
            {employment.aggregate.value_at_risk != null && (
              <Badge tone="red" className="w-fit mt-1">
                ${employment.aggregate.value_at_risk.toLocaleString(undefined, { maximumFractionDigits: 0 })} payroll value
              </Badge>
            )}
          </Card>
        ) : (
          <EmptyKPICard icon={TrendingDown} title="Roles at automation risk" />
        )}

        {skills ? (
          <Card variants={fadeUpItem} className="flex flex-col gap-2">
            <Users size={16} className="text-gold" />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Employees at attrition risk</span>
            <span className="font-mono text-3xl font-semibold text-ink">{skills.aggregate.positive_count}</span>
            <span className="text-xs text-ink-muted">
              {formatPercent(skills.aggregate.positive_rate)} of {skills.n_rows} employees analyzed
            </span>
            {skills.aggregate.value_at_risk != null && (
              <Badge tone="gold" className="w-fit mt-1">
                ~${skills.aggregate.value_at_risk.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo income at risk
              </Badge>
            )}
          </Card>
        ) : (
          <EmptyKPICard icon={Users} title="Employees at attrition risk" />
        )}

        {productivity ? (
          <Card variants={fadeUpItem} className="flex flex-col gap-2">
            <TrendingUp size={16} className="text-teal" />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Productivity signal</span>
            <span className="font-mono text-3xl font-semibold text-ink">{productivity.aggregate.mean.toFixed(2)}</span>
            <span className="text-xs text-ink-muted">
              avg standardized score across {productivity.n_rows} roles ({productivity.aggregate.above_average_count} above avg.)
            </span>
          </Card>
        ) : (
          <EmptyKPICard icon={TrendingUp} title="Productivity signal" />
        )}

        {skillMatch ? (
          <Card variants={fadeUpItem} className="flex flex-col gap-2">
            <Shuffle size={16} className="text-teal" />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Redeployment matches</span>
            <span className="font-mono text-3xl font-semibold text-ink">{skillMatch.aggregate.positive_count}</span>
            <span className="text-xs text-ink-muted">
              {formatPercent(skillMatch.aggregate.positive_rate)} of {skillMatch.n_rows} staff-to-role pairs are strong matches
            </span>
            {skillMatch.aggregate.value_at_risk != null && (
              <Badge tone="teal" className="w-fit mt-1">
                ~${skillMatch.aggregate.value_at_risk.toLocaleString(undefined, { maximumFractionDigits: 0 })} redeployable payroll
              </Badge>
            )}
            <Link to="roster" className="text-[11px] text-gold hover:brightness-110 mt-1">
              View candidates →
            </Link>
          </Card>
        ) : (
          <EmptyKPICard icon={Shuffle} title="Redeployment matches" />
        )}
      </div>

      <p className="text-[11px] text-ink-faint leading-relaxed">
        These are model outputs on whatever you upload, scaled by dollar values already present
        in your data (e.g. salary/income columns) — not verified real-world financial figures.
        No model here predicts "jobs created" — only automation/attrition/redeployment-fit risk
        on what you upload.
      </p>
    </motion.div>
  );
}
