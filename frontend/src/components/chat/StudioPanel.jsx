import { FileDown, ChevronRight, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { getHistory } from "../../lib/history";
import { downloadBlob } from "../../lib/report";
import { getAllBatchResults } from "../../lib/batchStore";
import { getChatSession } from "../../lib/chatSessionStore";
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
  const [history, setHistory] = useState([]);
  const [batches, setBatches] = useState({});
  const [chatSession, setChatSession] = useState({ messages: [], toolCallLog: [] });

  useEffect(() => {
    getHistory().then(setHistory);
    getAllBatchResults().then(setBatches);
    getChatSession().then(setChatSession);
  }, []);

  const latest = history[0];
  const hasIndexData = Object.values(batches).some(Boolean);
  const hasInteractionData = Object.values(batches).some((b) => b?.rows?.length > 0);
  const hasRosterData = !!batches.skill_match;
  const hasChatData = chatSession.messages.length > 0;
  const [downloadingPredict, setDownloadingPredict] = useState(false);
  const [downloadingChat, setDownloadingChat] = useState(false);
  const [format, setFormat] = useState("docx"); // "docx" | "pdf" — shared by both report buttons below

  const handleGeneratePredictReport = async () => {
    if (!latest) return;
    setDownloadingPredict(true);
    try {
      const blob =
        format === "pdf" ? await api.predictReportPdf(latest.results) : await api.predictReport(latest.results);
      downloadBlob(`zivabasa-predict-report-${Date.now()}.${format}`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setDownloadingPredict(false);
    }
  };

  const handleGenerateChatReport = async () => {
    if (!hasChatData) return;
    setDownloadingChat(true);
    try {
      const blob =
        format === "pdf"
          ? await api.chatReportPdf(chatSession.messages, chatSession.toolCallLog)
          : await api.chatReport(chatSession.messages, chatSession.toolCallLog);
      downloadBlob(`zivabasa-chat-report-${Date.now()}.${format}`, blob);
    } catch (e) {
      alert(`Couldn't generate report: ${e.message}`);
    } finally {
      setDownloadingChat(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3 h-full overflow-y-auto">
      <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">Studio</h3>

      <StudioBlock
        title="Reports"
        description="Clean, shareable reports with charts and tables — no raw data dumps."
        active={!!latest || hasChatData}
      >
        <div className="flex items-center gap-1 self-start rounded-lg border border-border p-0.5">
          {["docx", "pdf"].map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={clsx(
                "px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                format === f ? "bg-ink text-white" : "text-ink-faint hover:text-ink"
              )}
            >
              {f === "docx" ? "Word" : "PDF"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGeneratePredictReport}
            disabled={!latest || downloadingPredict}
            className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-left text-xs text-ink hover:bg-gold/15 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title={latest ? `Download your latest prediction as a ${format === "pdf" ? "PDF" : "Word"} report` : "Run a prediction first"}
          >
            <FileDown size={14} className="text-gold shrink-0" />
            <span className="font-medium">{downloadingPredict ? "Generating…" : "Predict report"}</span>
          </button>
          <button
            onClick={handleGenerateChatReport}
            disabled={!hasChatData || downloadingChat}
            className="flex items-center gap-1.5 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-left text-xs text-ink hover:bg-teal/15 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title={hasChatData ? `Download this conversation as a ${format === "pdf" ? "PDF" : "Word"} report` : "Send a chat message first"}
          >
            <MessageSquareText size={14} className="text-teal shrink-0" />
            <span className="font-medium">{downloadingChat ? "Generating…" : "Chat report"}</span>
          </button>
        </div>
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
