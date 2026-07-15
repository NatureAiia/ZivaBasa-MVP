import { FileDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { getHistory } from "../../lib/history";
import { downloadBlob } from "../../lib/report";
import { getAllBatchResults } from "../../lib/batchStore";
import { api } from "../../lib/api";
import IndexCards from "../studio/IndexCards";
import InteractionExplorer from "../studio/InteractionExplorer";

/*
  Studio — a right-rail toolkit next to Chat. Each block below is a real, working feature
  (nothing here is a "coming soon" stub) that "pops" with a gold glow once it has data to
  show, and sits flat/grey until then — same idea as ShinyPill, done with a border+shadow
  instead, so it reads as "ready" vs "needs data" rather than competing with ShinyPill's
  animated sweep in a small side panel.
*/
function StudioBlock({ title, description, active, children }) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-2 rounded-xl border p-3 transition-shadow",
        active
          ? "border-gold/40 bg-gold/[0.04] shadow-[0_0_0_1px_rgba(212,175,55,0.08),0_4px_16px_-4px_rgba(212,175,55,0.25)]"
          : "border-border"
      )}
    >
      <div>
        <h4 className={clsx("text-xs font-semibold", active ? "text-ink" : "text-ink-faint")}>{title}</h4>
        <p className="text-[11px] text-ink-faint mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function StudioPanel() {
  const history = getHistory();
  const latest = history[0];
  const batches = getAllBatchResults();
  const hasIndexData = Object.values(batches).some(Boolean);
  const hasInteractionData = Object.values(batches).some((b) => b?.rows?.length > 0);
  const hasRosterData = !!batches.skill_match;
  const [downloading, setDownloading] = useState(false);

  const handleGenerateReport = async () => {
    if (!latest) return;
    setDownloading(true);
    try {
      const blob = await api.predictReport(latest.results);
      downloadBlob(`zivabasa-predict-report-${Date.now()}.docx`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">
      <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Studio</h3>

      <StudioBlock
        title="Predict report (Word)"
        description={latest ? "Turns your latest prediction into a clean, shareable .docx with charts." : "Run a prediction first, then come back here."}
        active={!!latest}
      >
        <button
          onClick={handleGenerateReport}
          disabled={!latest || downloading}
          className="flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-left text-xs text-ink hover:bg-gold/15 transition-colors disabled:opacity-40 disabled:pointer-events-none w-fit"
        >
          <FileDown size={14} className="text-gold shrink-0" />
          <span className="font-medium">{downloading ? "Generating…" : "Download Word report"}</span>
        </button>
      </StudioBlock>

      <Link to="roster" className="block">
        <StudioBlock
          title="Redeployment candidates"
          description={
            hasRosterData
              ? "See which staff are a strong fit for open roles, and why."
              : "Upload a skill-matching file on Predict to unlock this."
          }
          active={hasRosterData}
        >
          <span className="flex items-center gap-1 text-[11px] text-gold font-medium">
            Open Redeployment Candidates <ChevronRight size={12} />
          </span>
        </StudioBlock>
      </Link>

      <StudioBlock
        title="Overall scores"
        description="One combined score per prediction type, built from everything you've uploaded so far."
        active={hasIndexData}
      >
        <IndexCards />
      </StudioBlock>

      <StudioBlock
        title="Compare any two factors"
        description="Pick two columns from your data and see how they relate to each other."
        active={hasInteractionData}
      >
        <InteractionExplorer />
      </StudioBlock>
    </div>
  );
}
