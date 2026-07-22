import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileUp, Check, AlertTriangle, Loader2, X } from "lucide-react";
import { api } from "../../lib/api";
import { metaFor } from "../../lib/fieldMeta";

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

/*
  Document upload -> auto-fill review, built on POST /extract/task-fields/{task} (a sibling of
  organization/extract's vision-LLM extraction pattern, different target). Deliberately never
  applies anything automatically — this only ever produces a review list; the person clicks
  "Apply to form" themselves, same human-in-the-loop stance as the rest of Predict.
*/
export default function DocumentAutoFill({ task, feature_names, onApply }) {
  const inputRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | loading | review | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = async (file) => {
    if (!file) return;
    setState("loading");
    setError(null);
    try {
      const res = await api.extractTaskFields(task, file);
      setResult(res);
      setState("review");
    } catch (e) {
      setError(e.message);
      setState("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const apply = () => {
    if (result?.features) onApply(result.features);
    setState("idle");
    setResult(null);
  };

  const dismiss = () => {
    setState("idle");
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      {state === "idle" && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 w-full bg-surface2 border border-dashed border-border rounded-xl px-3.5 py-2.5 text-xs font-medium text-ink-muted hover:text-ink hover:border-gold/40 transition-colors"
        >
          <FileUp size={13} /> Auto-fill from a document (payslip, HR export, PDF/image)
        </button>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 bg-surface2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-ink-muted">
          <Loader2 size={13} className="animate-spin" /> Reading document…
        </div>
      )}

      {state === "error" && (
        <div className="flex items-start gap-2 bg-red/10 border border-red/25 rounded-xl px-3 py-2.5 text-[11px] text-red">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={dismiss} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      <AnimatePresence>
        {state === "review" && result && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-2.5 bg-surface2 border border-border rounded-xl p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
                Review before applying — nothing changed yet
              </span>
              <button onClick={dismiss} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
                <X size={13} />
              </button>
            </div>

            {Object.keys(result.features || {}).length > 0 && (
              <div className="flex flex-col gap-1">
                {Object.entries(result.features).map(([name, value]) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-ink">
                      <Check size={12} className="text-teal shrink-0" /> {metaFor(name, task).label || name}
                    </span>
                    <span className="font-mono text-ink-muted">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {result.unmatched?.length > 0 && (
              <p className="text-[11px] text-ink-faint">
                Not found in the document — left unchanged: {result.unmatched.map((n) => metaFor(n, task).label || n).join(", ")}
              </p>
            )}

            {result.notes && (
              <p className="text-[11px] text-gold flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {result.notes}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={apply}
                disabled={!Object.keys(result.features || {}).length}
                className="flex-1 bg-gold text-bg rounded-lg px-3 py-2 text-xs font-medium hover:brightness-110 transition-all disabled:opacity-40"
              >
                Apply {Object.keys(result.features || {}).length} field{Object.keys(result.features || {}).length === 1 ? "" : "s"} to form
              </button>
              <button
                onClick={dismiss}
                className="text-xs font-medium text-ink-muted hover:text-ink px-3 py-2"
              >
                Discard
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
