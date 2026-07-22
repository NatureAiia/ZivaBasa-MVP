import { Wifi, WifiOff } from "lucide-react";
import { useLowBandwidth } from "../../lib/lowBandwidthStore";

export default function LowBandwidthToggle() {
  const { lowBandwidth, toggle } = useLowBandwidth();
  return (
    <button
      onClick={toggle}
      aria-pressed={lowBandwidth}
      title={lowBandwidth ? "Low-bandwidth mode on — text-first, animations off" : "Switch to low-bandwidth mode"}
      className={`flex items-center gap-1.5 rounded-full px-2.5 h-9 text-[11px] font-medium border transition-colors shrink-0 ${
        lowBandwidth
          ? "bg-teal/10 border-teal/30 text-teal"
          : "bg-surface2 border-border text-ink-faint hover:text-ink"
      }`}
    >
      {lowBandwidth ? <WifiOff size={13} /> : <Wifi size={13} />}
      <span className="hidden sm:inline">{lowBandwidth ? "Low-bandwidth" : "Full experience"}</span>
    </button>
  );
}
