import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import ClarityRing from "../../components/common/ClarityRing";
import LowBandwidthToggle from "../../components/layout/LowBandwidthToggle";

const TABS = [
  { to: "dashboard", label: "Dashboard" },
  { to: "action-inbox", label: "Action Inbox" },
  { to: "my-view", label: "My View" },
  { to: "national-view", label: "National View" },
  { to: "chat", label: "Chat" },
  { to: "predict", label: "Predict" },
  { to: "forecast", label: "Forecast" },
  { to: "my-organization", label: "My Organization" },
  { to: "history", label: "History" },
];

export default function ZivaBasaLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="zivabasa-scope flex-1 flex flex-col overflow-hidden">
      {/* Below lg: breadcrumb row + an orange hamburger that drops an anchored menu box.
          At lg+ (persistent sidebar + roomy content area) it's the full horizontal pill row. */}
      <header className="shrink-0 border-b border-border relative px-4 sm:px-6 py-3 lg:h-16 lg:py-0">
        <div className="flex items-center justify-between gap-2.5 h-full">
          <div className="flex items-center gap-2 text-sm shrink-0">
            <span className="text-ink-faint">ChiedzaAI</span>
            <span className="text-ink-faint">/</span>
            <div className="flex items-center gap-2">
              <ClarityRing mode="static" size={18} strokeWidth={3} color="gold" />
              <span className="font-display font-semibold text-ink">ZivaBasa</span>
            </div>
          </div>

          <nav
            className="hidden lg:flex items-center gap-1 bg-surface2 rounded-xl p-1 overflow-x-auto max-w-full [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  clsx(
                    "relative shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    isActive ? "text-bg" : "text-ink-muted hover:text-ink"
                  )
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

          <div className="flex items-center gap-2 shrink-0">
            <LowBandwidthToggle />
            <button
              onClick={() => setMobileNavOpen((o) => !o)}
              className="lg:hidden shrink-0 w-9 h-9 rounded-lg bg-gold/15 border border-gold/30 text-gold flex items-center justify-center hover:bg-gold/25 transition-colors"
              aria-label="Toggle section navigation"
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileNavOpen && (
            <>
              {/* Invisible click-away catcher — not a dimmed full-screen overlay, just closes
                  the dropdown when you tap outside it. */}
              <div className="lg:hidden fixed inset-0 z-20" onClick={() => setMobileNavOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="lg:hidden absolute right-4 sm:right-6 top-full mt-2 z-30 w-52 bg-surface border border-border rounded-xl shadow-card dark:shadow-card-dark p-1.5 flex flex-col gap-0.5"
              >
                {TABS.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive ? "bg-gold text-bg" : "text-ink-muted hover:text-ink hover:bg-surface2"
                      )
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>
      <Outlet />
    </div>
  );
}
