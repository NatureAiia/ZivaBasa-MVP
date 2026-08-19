import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import Card from "../common/Card";
import { getAllBatchResults } from "../../lib/batchStore";
import { formatPercent } from "../../lib/format";
import { TASK_LABELS } from "../../lib/api";

export default function DepartmentBreakdown() {
  const [results, setResults] = useState({});
  useEffect(() => {
    getAllBatchResults().then(setResults);
  }, []);
  const withSegments = Object.entries(results).filter(([, r]) => r?.by_segment?.length);

  if (withSegments.length === 0) return null;

  return (
    <Card animated={false}>
      <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-4 flex items-center gap-1.5">
        <Building2 size={13} /> By department / segment
      </h2>
      <div className="flex flex-col gap-5">
        {withSegments.map(([task, r]) => (
          <div key={task}>
            <h3 className="text-xs font-medium text-ink mb-2">{TASK_LABELS[task]}</h3>
            <div className="flex flex-col gap-1.5">
              {r.by_segment.map((seg) => (
                <div key={seg.segment} className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">{seg.segment}</span>
                  <span className="font-mono text-ink">
                    {seg.count} · {r.task_type === "classification" ? formatPercent(seg.positive_rate) : seg.mean.toFixed(3)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
