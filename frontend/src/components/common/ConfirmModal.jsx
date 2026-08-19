import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import Button from "./Button";

export default function ConfirmModal({
  open,
  title = "Are you sure?",
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" role="dialog" aria-modal="true">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onCancel}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="relative w-full max-w-sm bg-surface border border-border rounded-2xl shadow-card-dark p-5 flex flex-col gap-4"
          >
            <div className="flex items-start gap-3">
              <div className={tone === "danger" ? "text-red" : "text-gold"}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink">{title}</h2>
                {body && <p className="text-xs text-ink-muted mt-1 leading-relaxed">{body}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" className="text-xs px-3 py-1.5" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button variant={tone === "danger" ? "danger" : "primary"} className="text-xs px-3 py-1.5" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
