import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import {
  LayoutGrid, Boxes, MessageSquare, History, Users, Building2, Wallet, Settings, Search, Cpu,
} from "lucide-react";

/*
  Cmd/Ctrl+K quick navigation — pattern adapted from NeuroWorks's CommandPalette.tsx (cmdk +
  a flat, static, keyword-searchable route list; no async data). Styled with ZivaBasa's own
  tokens, matching ChatPane.jsx's model-picker dropdown (bg-surface/border-border/bg-gold
  active state) rather than cmdk's default look.
*/
const ITEMS = [
  { group: "Navigate", label: "Dashboards", to: "/app", icon: LayoutGrid, keywords: "home overview" },
  { group: "Navigate", label: "Predict", to: "/app/models/zivabasa/predict", icon: Boxes, keywords: "assessment run task forecast" },
  { group: "Navigate", label: "Chat", to: "/app/models/zivabasa/chat", icon: MessageSquare, keywords: "ask assistant chiedza" },
  { group: "Navigate", label: "History", to: "/app/models/zivabasa/history", icon: History, keywords: "past runs predictions" },
  { group: "Navigate", label: "Roster & Redeployment", to: "/app/models/zivabasa/roster", icon: Users, keywords: "skill match candidates" },
  { group: "Navigate", label: "My Organization", to: "/app/models/zivabasa/my-organization", icon: Building2, keywords: "org chart roles" },
  { group: "System", label: "Cost Monitoring", to: "/app/cost-monitoring", icon: Wallet, keywords: "spend budget llm" },
  { group: "System", label: "Settings", to: "/app/systems/settings", icon: Settings, keywords: "profile theme preferences" },
  { group: "System", label: "Users", to: "/app/systems/users", icon: Users, keywords: "roles admin promote" },
  { group: "System", label: "Models & API", to: "/app/systems/models", icon: Cpu, keywords: "providers budget keys" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4"
      shouldFilter
    >
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-card-dark overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={15} className="text-ink-faint shrink-0" />
          <Command.Input
            placeholder="Jump to…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none"
          />
          <kbd className="text-[10px] text-ink-faint border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-xs text-ink-faint">No matches.</Command.Empty>
          {["Navigate", "System"].map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-group-heading]]:font-semibold"
            >
              {ITEMS.filter((i) => i.group === group).map((item) => (
                <Command.Item
                  key={item.to}
                  value={`${item.label} ${item.keywords}`}
                  onSelect={() => go(item.to)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-ink cursor-pointer data-[selected=true]:bg-gold/10 data-[selected=true]:text-gold"
                >
                  <item.icon size={15} className="shrink-0" />
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
