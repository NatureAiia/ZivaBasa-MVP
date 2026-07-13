import ChatPane from "../../components/chat/ChatPane";
import StudioPanel from "../../components/chat/StudioPanel";
import SourcesPanel from "../../components/chat/SourcesPanel";
import HistoryStrip from "../../components/chat/HistoryStrip";

export default function ChatTab() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Chat — left, dominant */}
        <div className="flex-1 border-r border-border overflow-hidden">
          <ChatPane />
        </div>
        {/* Studio (top-right) + Sources (bottom-right) */}
        <div className="w-[340px] shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 border-b border-border overflow-hidden">
            <StudioPanel />
          </div>
          <div className="flex-1 overflow-hidden">
            <SourcesPanel />
          </div>
        </div>
      </div>
      <HistoryStrip />
    </div>
  );
}
