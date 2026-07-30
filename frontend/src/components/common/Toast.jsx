/*
  Minimal toast primitive — no toast/modal library exists anywhere in this codebase, so this is
  built from framer-motion's AnimatePresence + the existing Card/Badge visual language rather
  than adding a dependency. Used for milestone celebrations (mechanic 4) and the token-balance
  low-balance nudge (mechanic 3) — never for the SHAP/prediction/report surfaces themselves.
*/
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { X } from "lucide-react";
import Badge from "./Badge";

const ToastContext = createContext(null);

// Module-level bridge so non-component code (report.js's downloadBlob, store modules that fire
// milestones outside a render) can still show a toast without threading useToast() through
// every call site. ToastProvider registers its `show` here on mount; a call before mount (or
// if the provider isn't present) is just a no-op, never a crash.
let _globalShow = null;
export function emitGlobalToast(opts) {
  _globalShow?.(opts);
}

const TONE_ACCENT = {
  gold: "border-gold/30 bg-gold/5",
  teal: "border-teal/30 bg-teal/5",
  neutral: "border-border bg-surface",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ title, body, tone = "gold", actionLabel, onAction, durationMs = 6000 }) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts, { id, title, body, tone, actionLabel, onAction }]);
      if (durationMs) setTimeout(() => dismiss(id), durationMs);
      return id;
    },
    [dismiss]
  );

  _globalShow = show;

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-[min(360px,calc(100vw-2.5rem))]">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className={clsx(
                "rounded-2xl border shadow-card dark:shadow-card-dark p-4 flex flex-col gap-2",
                TONE_ACCENT[t.tone] || TONE_ACCENT.gold
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {t.title && <span className="text-sm font-semibold text-ink">{t.title}</span>}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="text-ink-faint hover:text-ink shrink-0"
                  aria-label="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
              {t.body && <p className="text-xs text-ink-muted leading-relaxed">{t.body}</p>}
              {t.actionLabel && (
                <button
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                  className="self-start text-xs font-semibold text-gold hover:brightness-110"
                >
                  {t.actionLabel}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>");
  return ctx;
}

// Celebratory variant for milestone moments — same primitive, a badge instead of a plain
// title, and no urgency: longer duration, always "gold" (never "red").
function milestoneToastOpts({ title, body }) {
  return {
    title: (
      <span className="flex items-center gap-1.5">
        <Badge tone="teal">Milestone</Badge> {title}
      </span>
    ),
    body,
    tone: "teal",
    durationMs: 8000,
  };
}

export function showMilestoneToast(show, { title, body }) {
  show(milestoneToastOpts({ title, body }));
}

// For non-component callers (report.js's downloadBlob, store modules) that fire a milestone
// outside a render and can't call useToast().
export function emitMilestoneToast({ title, body }) {
  emitGlobalToast(milestoneToastOpts({ title, body }));
}
