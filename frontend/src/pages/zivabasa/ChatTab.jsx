import ChatPane from "../../components/chat/ChatPane";
import StudioPanel from "../../components/chat/StudioPanel";
import SourcesPanel from "../../components/chat/SourcesPanel";
import HistoryStrip from "../../components/chat/HistoryStrip";

export default function ChatTab() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Chat — dominant on desktop (left), full-width and first on mobile/tablet */}
        <div className="flex-1 lg:border-r border-border overflow-hidden min-h-[420px] lg:min-h-0">
          <ChatPane />
        </div>
        {/* Studio + Sources — side-by-side on tablet, stacked on desktop's right rail, both
            stacked full-width below Chat on mobile */}
        <div className="lg:w-[340px] shrink-0 flex flex-col sm:flex-row lg:flex-col border-t lg:border-t-0 border-border overflow-hidden">
          <div className="flex-1 sm:border-r lg:border-r-0 border-b border-border overflow-hidden min-h-[280px]">
            <StudioPanel />
          </div>
          <div className="flex-1 overflow-hidden min-h-[280px]">
            <SourcesPanel />
          </div>
        </div>
      </div>
      <HistoryStrip />
    </div>
  );
}
