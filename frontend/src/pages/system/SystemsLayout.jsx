import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Settings as SettingsIcon } from "lucide-react";

/*
  Systems section layout — mirrors pages/zivabasa/ZivaBasaLayout.jsx's nested-tabs pattern
  exactly (same convention, new route namespace), consolidating what used to be a single
  standalone Settings page into Settings / Users / Models & API.
*/
const TABS = [
  { to: "settings", label: "Settings" },
  { to: "users", label: "Users" },
  { to: "models", label: "Models & API" },
];

export default function SystemsLayout() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2.5 mb-3">
          <SettingsIcon size={18} className="text-gold" />
          <span className="font-display text-base font-semibold text-ink">Systems</span>
        </div>
        <nav className="flex items-center gap-1 bg-surface2 rounded-xl p-1 w-fit">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx(
                  "relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  isActive ? "text-bg" : "text-ink-muted hover:text-ink"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="systems-tab-pill"
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
