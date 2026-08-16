/*
  Visible token balance (growth mechanic 3) — reuses CostMonitoring.jsx's stat-tile/progress-bar
  pattern verbatim (thin bg-border bar, currentColor fill, 0.6s width transition) rather than
  inventing a new visual language for "a bar that fills/empties."

  Fires a calm, one-per-cycle low-balance toast at 20% remaining — gold/teal tones, never red
  until the balance actually hits zero (that 402 is handled by UpgradeModal instead).
*/
import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { getTokenBalance } from "../../lib/tokenStore";
import { useToast } from "../common/Toast";

const LOW_BALANCE_TOASTED_KEY = "zivabasa_low_balance_toasted_cycle";

export default function TokenBalanceBar({ compact = false }) {
  const [balance, setBalance] = useState(null); // null = no gate active / no row yet
  const { show } = useToast();

  useEffect(() => {
    getTokenBalance().then(setBalance);
  }, []);

  useEffect(() => {
    if (!balance || balance.monthly_grant <= 0) return;
    const remainingPct = balance.balance / balance.monthly_grant;
    const cycleKey = balance.cycle_started_at;
    if (remainingPct <= 0.2 && remainingPct > 0 && sessionStorage.getItem(LOW_BALANCE_TOASTED_KEY) !== cycleKey) {
      sessionStorage.setItem(LOW_BALANCE_TOASTED_KEY, cycleKey);
      show({
        title: "Running low on tokens",
        body: `${balance.balance} of ${balance.monthly_grant} tokens left this cycle. Upgrade any time to keep predictions, reports, and Chiedza chat running without interruption.`,
        tone: "gold",
        durationMs: 9000,
      });
    }
  }, [balance, show]);

  if (!balance) return null; // gate not active for this account, or no balance tracked yet

  const pct = balance.monthly_grant > 0 ? Math.min(1, balance.balance / balance.monthly_grant) : 1;
  const toneClass = pct <= 0.2 ? "text-gold" : "text-teal";

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-1" title={`${balance.balance} tokens left this cycle`}>
        <Coins size={13} className={`shrink-0 ${toneClass}`} />
        <div className="flex-1 h-1 rounded-full bg-border overflow-hidden min-w-[3rem]">
          <div
            className={toneClass}
            style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: "currentColor", transition: "width 0.6s ease" }}
          />
        </div>
        <span className="font-mono text-[10px] text-ink-faint whitespace-nowrap">{balance.balance}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted flex items-center gap-1.5">
          <Coins size={13} className={toneClass} /> Tokens this cycle
        </span>
        <span className="font-mono text-ink">
          {balance.balance} <span className="text-ink-faint">/ {balance.monthly_grant}</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
        <div
          className={toneClass}
          style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: "currentColor", transition: "width 0.6s ease" }}
        />
      </div>
    </div>
  );
}
