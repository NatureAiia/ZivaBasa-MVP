import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { getOrgNodes } from "../../lib/orgStore";
import { getAssignments } from "../../lib/assignmentStore";
import { computeAIReadiness } from "../../lib/aiReadiness";

const STAGES = ["Reactive", "Aware", "Adaptive", "Strategic"];

export default function AIReadinessCard() {
  const [readiness, setReadiness] = useState(undefined); // undefined = loading, null = no data yet

  useEffect(() => {
    Promise.all([getOrgNodes(), getAssignments()]).then(([nodes, assignments]) =>
      setReadiness(computeAIReadiness(nodes, assignments))
    );
  }, []);

  if (readiness === undefined) return null;
  if (readiness === null) return null; // no org_nodes at all yet — nothing to show

  const stageIdx = readiness.stage ? STAGES.indexOf(readiness.stage) : -1;

  return (
    <Card animated={false} className="bg-gradient-to-br from-gold/10 to-transparent border-gold/25">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold flex items-center gap-1.5">
            <Sparkles size={12} /> AI Readiness
          </span>
          {readiness.insufficientData ? (
            <p className="text-xs text-ink-muted mt-1 max-w-sm">
              Add target roles, skills, and training hours to your org structure to see where
              your organization stands on AI-driven workforce transformation.
            </p>
          ) : (
            <div className="font-display text-2xl font-bold text-ink mt-1">{readiness.stage}</div>
          )}
        </div>
        {!readiness.insufficientData && (
          <div className="flex items-center gap-1.5">
            {STAGES.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 w-8 rounded-full ${i <= stageIdx ? "bg-gold" : "bg-border"}`}
                title={s}
              />
            ))}
          </div>
        )}
      </div>
      {!readiness.insufficientData && (
        <p className="text-[11px] text-ink-faint leading-relaxed mt-3">
          Based on skills-gap closure, training investment, redeployment-recommendation trust,
          and how much of your org has a mapped future role — an organization-level view, not a
          score for any individual.{" "}
          {readiness.stage !== "Strategic" && (
            <>Close more skills gaps or map more roles to advance toward the next stage.</>
          )}
        </p>
      )}
    </Card>
  );
}
