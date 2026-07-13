import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import ClarityRing from "../../components/common/ClarityRing";

const TABS = [
  { to: "dashboard", label: "Dashboard" },
  { to: "chat", label: "Chat" },
  { to: "predict", label: "Predict" },
  { to: "history", label: "History" },
];

export default function ZivaBasaLayout() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 border-b border-border flex items-center justify-between px-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ink-faint">ChiedzaAI</span>
          <span className="text-ink-faint">/</span>
          <div className="flex items-center gap-2">
            <ClarityRing mode="static" size={18} strokeWidth={3} color="gold" />
            <span className="font-display font-semibold text-ink">ZivaBasa</span>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-surface2 rounded-xl p-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx("relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors", isActive ? "text-bg" : "text-ink-muted hover:text-ink")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="zivabasa-tab-pill"
                      className="absolute inset-0 bg-gold rounded-lg"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
