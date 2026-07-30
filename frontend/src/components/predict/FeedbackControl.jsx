import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { getFeedback, submitFeedback } from "../../lib/feedbackStore";

const CATEGORIES = [
  { value: "data-quality", label: "Data quality" },
  { value: "model-drift", label: "Model drift" },
  { value: "explanation-unclear", label: "Explanation unclear" },
  { value: "outcome-mismatch", label: "Outcome mismatch" },
  { value: "other", label: "Other" },
];

// Reviewer-facing quality flag on a single predict_history run — feeds the model-health
// dashboard and doubles as a labeled dataset for retraining (see prediction_feedback table).
export default function FeedbackControl({ predictHistoryId, task }) {
  const [saved, setSaved] = useState(null); // { rating, category, note } | null
  const [pendingDown, setPendingDown] = useState(false);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSaved(null);
    setPendingDown(false);
    setCategory("");
    setNote("");
    if (predictHistoryId) getFeedback(predictHistoryId).then(setSaved);
  }, [predictHistoryId]);

  if (!predictHistoryId) return null;

  const rate = async (rating, extra = {}) => {
    setBusy(true);
    try {
      await submitFeedback({ predictHistoryId, task, rating, ...extra });
      setSaved({ rating, category: extra.category || null, note: extra.note || null });
      setPendingDown(false);
    } catch (e) {
      console.error("submitFeedback failed:", e.message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
        <Check size={12} className="text-teal" />
        Feedback recorded ({saved.rating === "up" ? "helpful" : "flagged"}
        {saved.category ? ` · ${CATEGORIES.find((c) => c.value === saved.category)?.label}` : ""})
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-faint">Was this useful?</span>
        <button
          disabled={busy}
          onClick={() => rate("up")}
          className="p-1.5 rounded-md text-ink-faint hover:text-teal hover:bg-teal/10 transition-colors"
          title="Helpful"
        >
          <ThumbsUp size={13} />
        </button>
        <button
          disabled={busy}
          onClick={() => setPendingDown(true)}
          className="p-1.5 rounded-md text-ink-faint hover:text-red hover:bg-red/10 transition-colors"
          title="Not helpful"
        >
          <ThumbsDown size={13} />
        </button>
      </div>

      {pendingDown && (
        <div className="flex flex-col gap-2 bg-surface2 border border-border rounded-lg p-2.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-surface border border-border rounded-md px-2 py-1.5 text-[11px] outline-none focus:border-gold/50"
          >
            <option value="">What went wrong?</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            rows={2}
            className="bg-surface border border-border rounded-md px-2 py-1.5 text-[11px] outline-none focus:border-gold/50 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingDown(false)}
              className="text-[11px] text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
            <button
              disabled={busy || !category}
              onClick={() => rate("down", { category, note })}
              className="text-[11px] font-medium text-bg bg-gold rounded-md px-2.5 py-1 disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
