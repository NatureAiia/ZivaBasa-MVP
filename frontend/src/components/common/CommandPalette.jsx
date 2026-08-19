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
    // Sidebar's visible "Search" button has no ref to this component's state, so it opens the
    // palette by firing this event instead — same entry point as Cmd/Ctrl+K.
    const onOpenRequest = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenRequest);
    };
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
          {/*
            Single group, not one per section: cmdk only sorts items by fuzzy-match score
            WITHIN a group — with separate "Navigate"/"System" groups, a weak match in the
            first-declared group could out-rank (and get auto-highlighted over) the actual best
            match sitting in a later group. One flat, score-sorted list fixes that; the group
            label prefix on each item's `value` keeps a lightweight visual/searchable category
            without needing a second Command.Group.
          */}
          <Command.Group>
            {ITEMS.map((item) => (
              <Command.Item
                key={item.to}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => go(item.to)}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-ink cursor-pointer data-[selected=true]:bg-gold/10 data-[selected=true]:text-gold"
              >
                <item.icon size={15} className="shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] text-ink-faint">{item.group}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}
