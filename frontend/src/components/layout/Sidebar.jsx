import { useState } from "react";
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Boxes, Wallet, ChevronDown, PanelLeftClose, PanelLeftOpen, X,
} from "lucide-react";
import clsx from "clsx";
import ClarityRing from "../common/ClarityRing";
import ThemeToggle from "./ThemeToggle";
import ShinyPill from "../effects/ShinyPill";

export const MODELS = [
  { slug: "zivabasa", name: "ZivaBasa", tagline: "Workforce intelligence", live: true },
  { slug: "ziva-dzidzo", name: "ZivaDzidzo", tagline: "Learning & skills growth", live: false },
  { slug: "ziva-business", name: "ZivaBusiness", tagline: "Business intelligence", live: false },
  { slug: "ziva-upfumi", name: "ZivaUpfumi", tagline: "Financial intelligence", live: false },
];

function NavItem({ to, icon: Icon, label, collapsed, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold transition-colors",
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
          <Icon size={19} className="shrink-0" />
          {!collapsed && <span>{label}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ mobileOpen = false, onCloseMobile }) {
  const [collapsed, setCollapsed] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(true);

  const content = (
    <motion.aside
      animate={{ width: collapsed ? 76 : 280 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className={clsx(
        "h-screen shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-300",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "md:static md:translate-x-0 md:z-auto"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-20 border-b border-border">
        <ClarityRing mode="static" size={36} strokeWidth={4} color="gold" />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="leading-tight flex-1"
            >
              <div className="font-display text-lg font-bold text-ink">ChiedzaAI</div>
              <div style={{ height: 16, width: 150 }}>
                <ShinyPill
                  text="Decision Intelligence"
                  textColor="rgb(var(--ink-faint))"
                  shineColor="#E8A33D"
                  shineColor2="#2FBF9F"
                  speed={2.2}
                  font={{ fontFamily: "Inter", fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em" }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={onCloseMobile} className="md:hidden text-ink-faint hover:text-ink" aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1.5">
        <NavItem to="/" end icon={LayoutGrid} label="Dashboards" collapsed={collapsed} onNavigate={onCloseMobile} />

        <button
          onClick={() => setModelsOpen((o) => !o)}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-ink-muted hover:text-ink hover:bg-surface2/60 transition-colors"
        >
          <Boxes size={19} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Models</span>
              <ChevronDown size={15} className={clsx("transition-transform", modelsOpen && "rotate-180")} />
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
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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

        <NavItem to="/cost-monitoring" icon={Wallet} label="Cost Monitoring" collapsed={collapsed} onNavigate={onCloseMobile} />
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between">
        {!collapsed && <ThemeToggle />}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:block text-ink-faint hover:text-ink transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </button>
      </div>
    </motion.aside>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      {content}
    </>
  );
}
