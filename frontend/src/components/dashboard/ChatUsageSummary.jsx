import { Link } from "react-router-dom";
import { MessageSquare, ArrowUpRight } from "lucide-react";
import Card from "../common/Card";
import Badge from "../common/Badge";
import { usageSummary } from "../../lib/usageStore";
import { TASK_SHORT_LABELS } from "../../lib/api";

// Display labels for provider keys as they appear in usage log entries — backend providers
// are bare keys ("anthropic"), Puter entries are "puter:<model-id>" so a person can tell a
// free Puter message apart from a metered backend one at a glance.
function providerLabel(key) {
  if (key.startsWith("puter:")) return `Puter (${key.split(":")[1]})`;
  return { anthropic: "Claude", nvidia: "NVIDIA NIM", groq: "Groq", gemini: "Gemini" }[key] || key;
}

export default function ChatUsageSummary() {
  const summary = usageSummary(true); // this calendar month

  if (summary.totalMessages === 0) {
    return (
      <Card animated={false} className="flex items-center gap-3 opacity-70">
        <MessageSquare size={16} className="text-ink-faint shrink-0" />
        <div className="flex-1">
          <span className="text-xs font-medium text-ink">Chat usage & cost</span>
          <p className="text-[11px] text-ink-faint">No chat messages sent yet this month.</p>
        </div>
        <Link to="chat" className="text-[11px] text-gold hover:brightness-110 shrink-0">
          Open Chat →
        </Link>
      </Card>
    );
  }

  return (
    <Card animated={false} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-gold" />
          <span className="text-xs font-semibold text-ink">Chat usage & cost this month</span>
        </div>
        <Link to="/cost-monitoring" className="flex items-center gap-1 text-[11px] text-gold hover:brightness-110">
          Full cost model <ArrowUpRight size={11} />
        </Link>
      </div>

      <div className="flex items-baseline gap-4">
        <div>
          <span className="font-mono text-2xl font-semibold text-ink">{summary.totalMessages}</span>
          <span className="text-[11px] text-ink-faint ml-1.5">messages</span>
        </div>
        <div>
          <span className="font-mono text-2xl font-semibold text-ink">
            ${summary.totalCostUsd.toFixed(2)}
          </span>
          <span className="text-[11px] text-ink-faint ml-1.5">estimated</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(summary.byProvider).map(([provider, stats]) => (
          <Badge key={provider} tone={stats.costUsd > 0 ? "gold" : "teal"}>
            {providerLabel(provider)} · {stats.messages}
            {stats.costUsd > 0 ? ` · $${stats.costUsd.toFixed(2)}` : " · free"}
          </Badge>
        ))}
      </div>

      <p className="text-[10px] text-ink-faint leading-relaxed">
        Rough estimate from logged token counts, not an invoice — see Cost Monitoring for
        details and rates. Task predictions ({Object.values(TASK_SHORT_LABELS).join(", ")}) aren't
        metered the same way and aren't included here.
      </p>
    </Card>
  );
}
