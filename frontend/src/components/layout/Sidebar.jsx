import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Boxes, Wallet, ChevronDown, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import clsx from "clsx";
import ClarityRing from "../common/ClarityRing";
import ThemeToggle from "./ThemeToggle";

const MODELS = [
  { slug: "zivabasa", name: "ZivaBasa", tagline: "Workforce intelligence", live: true },
  { slug: "ziva-bank", name: "Ziva Bank", tagline: "Financial risk", live: false },
  { slug: "ziva-dataops", name: "Ziva DataOps", tagline: "Data operations", live: false },
  { slug: "ziva-business", name: "Ziva Business", tagline: "Business intelligence", live: false },
  { slug: "ziva-upskill", name: "ZivaUpskill", tagline: "Learning & growth", live: false },
];

function NavItem({ to, icon: Icon, label, collapsed, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive ? "text-ink bg-surface2" : "text-ink-muted hover:text-ink hover:bg-surface2/60"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="sidebar-active-pill"
              className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gold"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          <Icon size={17} className="shrink-0" />
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(true);
  const location = useLocation();

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 264 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="h-screen shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden"
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
        <ClarityRing mode="static" size={30} strokeWidth={4} color="gold" />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="leading-tight"
            >
              <div className="font-display text-sm font-semibold text-ink">ChiedzaAI</div>
              <div className="text-[10px] text-ink-faint">Decision Intelligence</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
        <NavItem to="/" end icon={LayoutGrid} label="Dashboards" collapsed={collapsed} />

        <button
          onClick={() => setModelsOpen((o) => !o)}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted hover:text-ink hover:bg-surface2/60 transition-colors"
        >
          <Boxes size={17} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Models</span>
              <ChevronDown
                size={14}
                className={clsx("transition-transform", modelsOpen && "rotate-180")}
              />
            </>
          )}
        </button>

        <AnimatePresence initial={false}>
          {modelsOpen && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="overflow-hidden pl-4 flex flex-col gap-0.5"
            >
              {MODELS.map((m) => (
                <NavLink
                  key={m.slug}
                  to={`/models/${m.slug}`}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-colors",
                      isActive ? "text-ink bg-surface2" : "text-ink-faint hover:text-ink-muted hover:bg-surface2/50"
                    )
                  }
                >
                  <span>{m.name}</span>
                  {!m.live && (
                    <span className="text-[9px] uppercase tracking-wide text-ink-faint border border-border rounded px-1 py-0.5">
                      soon
                    </span>
                  )}
                </NavLink>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <NavItem to="/cost-monitoring" icon={Wallet} label="Cost Monitoring" collapsed={collapsed} />
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        {!collapsed && <ThemeToggle />}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-ink-faint hover:text-ink transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
    </motion.aside>
  );
}
