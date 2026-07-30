import { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { getOrgNodes } from "../../lib/orgStore";
import { getDepartmentEngagement } from "../../lib/departmentEngagement";

// Operational completeness per department — never a risk-score ranking. Structure % is "how
// much of this department's org chart is filled in enough to run skills-gap analysis on";
// "Reviewed this quarter" is whether anyone opened that department's view recently. Neither
// number says anything about any individual employee.
export default function DepartmentEngagement() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getOrgNodes().then(async (nodes) => setRows(await getDepartmentEngagement(nodes)));
  }, []);

  if (rows.length === 0) return null;

  return (
    <Card animated={false}>
      <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4 flex items-center gap-1.5">
        <ClipboardCheck size={13} /> Department setup & review
      </h2>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.department} className="flex items-center justify-between text-xs gap-3">
            <span className="text-ink-muted truncate">{r.department}</span>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-20 h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-teal"
                  style={{ width: `${Math.round(r.structurePct * 100)}%`, transition: "width 0.6s ease" }}
                />
              </div>
              <span className="font-mono text-ink-faint w-9 text-right">{Math.round(r.structurePct * 100)}%</span>
              <Badge tone={r.reviewedThisQuarter ? "teal" : "neutral"}>
                {r.reviewedThisQuarter ? "Reviewed this quarter" : "Not reviewed yet"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
