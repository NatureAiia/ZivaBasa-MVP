import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Lock, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

/*
  Course/upskilling recommendations tied to a prediction's top SHAP-contributing features
  (backend/src/upskilling.py's topic-tag matching + backend/api/upskilling_ai.py's AI-generated,
  board-verified micro-lesson). Same shape as CausalPanel.jsx: takes the same `result` prop
  ShapLedger already receives, task, and derives everything else itself.

  Free tier renders immediately, no gate. Premium unlock relies entirely on the existing global
  402 -> InsufficientTokensError -> UpgradeModal flow (frontend/src/lib/api.js) — no new gating
  UI here, just a plain try/catch around the button handler.
*/
const FORMAT_LABEL = { course: "Course", video: "Video", article: "Article", micro_lesson: "Micro-lesson" };

function CourseCard({ course }) {
  return (
    <a
      href={course.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-1 rounded-xl border border-border bg-surface2/40 p-3 text-xs hover:border-teal/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">{course.provider}</span>
        <span className="text-[10px] text-ink-faint">{FORMAT_LABEL[course.format] || course.format}</span>
      </div>
      <span className="text-ink font-medium leading-snug">{course.title}</span>
    </a>
  );
}

export default function UpskillingSection({ result, task }) {
  const [free, setFree] = useState(null);
  const [paidPreviewCount, setPaidPreviewCount] = useState(0);
  const [premium, setPremium] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState(null);

  const orderedFeatureNames = useMemo(
    () => (result?.top_contributions || []).map((c) => c.feature),
    [result]
  );
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    if (!orderedFeatureNames.length) return;
    setFree(null);
    setPremium(null);
    setError(null);
    api
      .upskillingRecommend(task, orderedFeatureNames)
      .then((r) => {
        setFree(r.free);
        setPaidPreviewCount(r.paid_preview_count);
        setTopics(r.topics);
      })
      .catch((e) => setError(e.message));
  }, [task, orderedFeatureNames]);

  const unlockPremium = async () => {
    setUnlocking(true);
    setError(null);
    try {
      const r = await api.upskillingPremium(task, orderedFeatureNames);
      setPremium(r);
    } catch (e) {
      // A 402 already triggered the global UpgradeModal via api.js's throwApiError() — this
      // just surfaces the message inline too, no special branch needed here.
      setError(e.message);
    } finally {
      setUnlocking(false);
    }
  };

  if (!result || !free) return null;

  return (
    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2">
        <GraduationCap size={15} className="text-teal" />
        <h3 className="text-sm font-semibold text-ink">Recommended upskilling</h3>
      </div>

      {free.length === 0 ? (
        <p className="text-xs text-ink-faint">No matching courses found for this prediction's top drivers yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {free.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red">{error}</p>}

      {!premium && paidPreviewCount > 0 && (
        <button
          onClick={unlockPremium}
          disabled={unlocking}
          className="self-start flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs font-medium text-ink hover:bg-gold/10 transition-colors disabled:opacity-60"
        >
          <Lock size={12} className="text-gold" />
          {unlocking ? "Unlocking…" : `Unlock ${paidPreviewCount} premium course${paidPreviewCount === 1 ? "" : "s"} + AI micro-lesson`}
        </button>
      )}

      {premium && (
        <div className="flex flex-col gap-3">
          {premium.paid.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {premium.paid.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          )}
          <div className="rounded-xl border border-teal/25 bg-teal/5 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
              <ShieldCheck size={13} className="text-teal" />
              Reviewed by {premium.micro_lesson.reviewed_by}
              {premium.micro_lesson.cached && <span className="text-ink-faint">(cached)</span>}
            </div>
            <p className="text-sm font-semibold text-ink">{premium.micro_lesson.title}</p>
            <p className="text-xs text-ink-muted leading-relaxed whitespace-pre-wrap">
              {premium.micro_lesson.body_markdown}
            </p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-ink-faint leading-relaxed">
        Courses link to each provider's own catalog/search page, not a specific verified course —
        ZivaBasa has no live partnership with these providers. Matched to topics:{" "}
        {topics.join(", ") || "your top prediction drivers"}.
      </p>
    </div>
  );
}
