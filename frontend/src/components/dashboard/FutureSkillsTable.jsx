import { useMemo } from "react";
import { Link } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { getOrgNodes } from "../../lib/orgStore";
import { matchScore, SKILL_LABELS } from "../../lib/skillMatchClient";

function impactTone(overlapCount, missingCount) {
  const total = overlapCount + missingCount;
  const pct = total > 0 ? overlapCount / total : 0;
  if (pct >= 0.7) return { tone: "teal", label: "Low disruption" };
  if (pct >= 0.4) return { tone: "gold", label: "Moderate ramp-up" };
  return { tone: "red", label: "Major retraining" };
}

export default function FutureSkillsTable() {
  const rows = useMemo(() => {
    return getOrgNodes()
      .filter((n) => n.targetRole)
      .map((n) => {
        const gap = matchScore(n.currentSkills, n.targetSkills);
        return { ...n, gap };
      });
  }, []);

  if (rows.length === 0) {
    return (
      <Card animated={false} className="flex items-center gap-3 opacity-70">
        <TrendingUp size={16} className="text-ink-faint shrink-0" />
        <div className="flex-1">
          <span className="text-xs font-medium text-ink">Predicted future skills & jobs</span>
          <p className="text-[11px] text-ink-faint">
            Set a future role for at least one position in My Organization to populate this.
          </p>
        </div>
        <Link to="my-organization" className="text-[11px] text-gold hover:brightness-110 shrink-0">
          Open My Organization →
        </Link>
      </Card>
    );
  }

  return (
    <Card animated={false} className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold text-ink">Predicted future skills, jobs & productivity</h3>
        <p className="text-[11px] text-ink-faint mt-0.5">
          From roles you've set a future target for in My Organization.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
              <th className="pb-2 pr-3 font-semibold">Current role</th>
              <th className="pb-2 pr-3 font-semibold">Future role</th>
              <th className="pb-2 pr-3 font-semibold">Skills needed</th>
              <th className="pb-2 font-semibold">Productivity impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const impact = impactTone(r.gap.skillOverlapCount, r.gap.missingSkillCount);
              return (
                <tr key={r.id}>
                  <td className="py-2 pr-3 text-ink">{r.title}</td>
                  <td className="py-2 pr-3 text-teal">{r.targetRole}</td>
                  <td className="py-2 pr-3 text-ink-faint">
                    {r.gap.missingSkills.length > 0
                      ? r.gap.missingSkills.map((s) => SKILL_LABELS[s] || s).join(", ")
                      : "None — fully ready"}
                  </td>
                  <td className="py-2">
                    <Badge tone={impact.tone}>{impact.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-ink-faint">
        Productivity impact is a skill-overlap estimate, not a model prediction — see My
        Organization for the full breakdown per role.
      </p>
    </Card>
  );
}
