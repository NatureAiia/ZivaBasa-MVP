import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import ManagerActionInbox from "./ManagerActionInbox";
import OrganizationalStructureTab from "./OrganizationalStructureTab";
import CorporateView from "./CorporateView";
import ForecastTab from "./ForecastTab";
import { fadeScale } from "../../lib/motion";

const SUBTABS = [
  { key: "action-inbox", label: "Action Inbox", Component: ManagerActionInbox },
  { key: "structure", label: "Organizational Structure", Component: OrganizationalStructureTab },
  { key: "corporate-view", label: "Corporate View", Component: CorporateView },
  { key: "forecasting", label: "Forecasting", Component: ForecastTab },
];

export default function MyOrganizationTab() {
  const [subtab, setSubtab] = useState(SUBTABS[0].key);
  const active = SUBTABS.find((t) => t.key === subtab);
  const Active = active.Component;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-center pt-4">
        <div className="flex gap-1 bg-surface2 rounded-xl p-1 w-fit flex-wrap justify-center">
          {SUBTABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubtab(t.key)}
              className={clsx(
                "relative px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
                subtab === t.key ? "text-bg" : "text-ink-muted hover:text-ink"
              )}
            >
              {subtab === t.key && (
                <motion.span
                  layoutId="my-organization-subtab-pill"
                  className="absolute inset-0 bg-gold rounded-lg"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={subtab} variants={fadeScale} initial="hidden" animate="show" exit="exit" className="flex-1 flex flex-col overflow-hidden">
          <Active />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
