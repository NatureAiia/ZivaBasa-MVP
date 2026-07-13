import { FileDown, Mic, PlayCircle, Map, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getHistory } from "../../lib/history";
import { buildReportMarkdown, downloadReport } from "../../lib/report";

const STUB_ITEMS = [
  { icon: Mic, label: "Audio Overview" },
  { icon: PlayCircle, label: "Video Overview" },
  { icon: Map, label: "Mind Map" },
  { icon: HelpCircle, label: "Quiz" },
];

export default function StudioPanel() {
  const history = getHistory();
  const latest = history[0];

  const handleGenerateReport = () => {
    if (!latest) return;
    const md = buildReportMarkdown(latest.results);
    downloadReport(`zivabasa-report-${Date.now()}.md`, md);
  };

  return (
    <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">
      <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Studio</h3>

      <button
        onClick={handleGenerateReport}
        disabled={!latest}
        className="flex items-center gap-2.5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-left text-sm text-ink hover:bg-gold/15 transition-colors disabled:opacity-40 disabled:pointer-events-none"
      >
        <FileDown size={16} className="text-gold shrink-0" />
        <span className="flex-1">
          <span className="block font-medium">Generate report</span>
          <span className="block text-[11px] text-ink-muted">
            {latest ? "From your latest completed Predict run" : "Complete a run on the Predict tab first"}
          </span>
        </span>
      </button>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 gap-2">
        {STUB_ITEMS.map(({ icon: Icon, label }) => (
          <motion.div
            key={label}
            variants={fadeUpItem}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface2/50 px-3 py-3 text-ink-faint cursor-not-allowed"
            title="Coming soon"
          >
            <Icon size={15} />
            <span className="text-xs">{label}</span>
            <span className="text-[9px] uppercase tracking-wide border border-border rounded px-1 py-0.5 w-fit">soon</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
