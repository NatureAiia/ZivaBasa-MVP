import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, X } from "lucide-react";
import Card from "../common/Card";
import ClarityRing from "../common/ClarityRing";
import { getOnboardingProgress, ONBOARDING_STEPS } from "../../lib/onboardingStore";
import { useToast, showMilestoneToast } from "../common/Toast";

// Manual dismiss just hides the card for this browser session — it does NOT delete progress
// rows, so returning later (or in another tab) still shows real progress, not a reset checklist.
const DISMISS_KEY = "zivabasa_onboarding_dismissed";

export default function OnboardingChecklist() {
  const [progress, setProgress] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");
  const { show } = useToast();

  useEffect(() => {
    getOnboardingProgress().then(setProgress);
  }, []);

  useEffect(() => {
    if (progress?.completed_at && sessionStorage.getItem("zivabasa_onboarding_celebrated") !== "1") {
      sessionStorage.setItem("zivabasa_onboarding_celebrated", "1");
      showMilestoneToast(show, {
        title: "Onboarding complete",
        body: "You've connected data, run a prediction, seen the SHAP explanation behind it, and exported a report — you're fully set up.",
      });
    }
  }, [progress, show]);

  if (dismissed || !progress || progress.completed_at) return null;

  const doneCount = ONBOARDING_STEPS.filter((s) => progress[s.key]).length;
  const pct = doneCount / ONBOARDING_STEPS.length;

  return (
    <Card animated={false} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClarityRing mode="confidence" value={pct} size={36} strokeWidth={4} color="gold" />
          <div>
            <h2 className="text-sm font-semibold text-ink">Get set up with ZivaBasa</h2>
            <p className="text-[11px] text-ink-faint">{doneCount} of {ONBOARDING_STEPS.length} steps done</p>
          </div>
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          className="text-ink-faint hover:text-ink shrink-0"
          aria-label="Hide checklist"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {ONBOARDING_STEPS.map((step) => {
          const done = Boolean(progress[step.key]);
          return (
            <motion.div
              key={step.key}
              className="flex items-center gap-2 text-xs"
              animate={{ opacity: done ? 0.6 : 1 }}
            >
              {done ? (
                <CheckCircle2 size={14} className="text-teal shrink-0" />
              ) : (
                <Circle size={14} className="text-ink-faint shrink-0" />
              )}
              <span className={done ? "text-ink-muted line-through" : "text-ink"}>{step.label}</span>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
