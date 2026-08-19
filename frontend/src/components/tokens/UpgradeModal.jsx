/*
  "What you'd unlock" ceiling comparison — renders directly from the backend token gate's
  structured 402 body (backend/api/tokens.py's insufficient_tokens shape). Triggered globally:
  any InsufficientTokensError thrown by lib/api.js opens this, regardless of which screen made
  the call, via the same module-level bridge pattern as components/common/Toast.jsx's
  emitGlobalToast (a plain callback registered on mount, not React context — so lib/api.js, a
  non-component module, can trigger it without every call site wiring a handler).
*/
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import Card from "../common/Card";
import Badge from "../common/Badge";

let _open = null;
export function triggerUpgradeModal(detail) {
  _open?.(detail);
}

export default function UpgradeModalHost() {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    _open = setDetail;
    return () => {
      _open = null;
    };
  }, []);

  return (
    <AnimatePresence>
      {detail && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setDetail(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm"
          >
            <Card animated={false} className="flex flex-col gap-3 border-gold/30">
              <div className="flex items-start justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <Sparkles size={15} className="text-gold" /> Out of tokens
                </span>
                <button onClick={() => setDetail(null)} className="text-ink-faint hover:text-ink" aria-label="Close">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="gold">{detail.balance ?? 0} left</Badge>
                <Badge tone="neutral">{detail.required} needed</Badge>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">{detail.upgrade_hint}</p>
              {/* No billing/checkout flow exists yet in this codebase — this closes the modal
                  rather than linking to a real upgrade destination that doesn't exist. Wire this
                  to the actual billing page once one ships. */}
              <button
                onClick={() => setDetail(null)}
                className="self-start bg-gold text-bg rounded-xl px-3.5 py-2 text-xs font-semibold hover:brightness-110"
              >
                Got it
              </button>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
