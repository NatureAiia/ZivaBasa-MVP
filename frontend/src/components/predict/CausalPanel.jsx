import { useEffect, useState } from "react";
import { AlertTriangle, GitBranch } from "lucide-react";
import { api, CAUSAL_ENABLED_TASKS } from "../../lib/api";
import { formatRaw } from "../../lib/format";
import { metaFor } from "../../lib/fieldMeta";
import CausalGraph from "./CausalGraph";

/*
  Causal-consistency layer on top of ShapLedger's ordinary SHAP view (backend/src/causal_xai.py,
  Phase 3 causal-consistent XAI). Ordinary SHAP can't distinguish "this feature genuinely causes
  the outcome" from "this feature just moves together with something that does" — this panel
  shows the same instance's SHAP values reweighted against a discovered causal DAG so a viewer
  sees both readings side by side, not just the causal one (raw SHAP is not wrong, it answers a
  different question).

  Gated to CAUSAL_ENABLED_TASKS — every other task 503s from /causal/{task}/* since no bundle
  was ever trained for it (backend/scripts/train_causal_xai_model.py), so this renders nothing
  rather than an error state for those.
*/
export default function CausalPanel({ task, features }) {
  const [dag, setDag] = useState(null);
  const [explain, setExplain] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const enabled = CAUSAL_ENABLED_TASKS.includes(task);

  useEffect(() => {
    if (!enabled || !features) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.causalDag(task), api.causalExplain(task, features)])
      .then(([dagRes, explainRes]) => {
        if (cancelled) return;
        setDag(dagRes);
        setExplain(explainRes);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, task, features]);

  if (!enabled) return null;
  if (loading) return <p className="text-xs text-ink-faint">Running causal discovery comparison…</p>;
  if (error) return <p className="text-xs text-red">{error}</p>;
  if (!dag || !explain) return null;

  const maxAbs = Math.max(...explain.attributions.map((a) => Math.abs(a.raw_shap)), 1e-9);
  const contradicted = dag.sanity_check.includes("0 ran opposite") ? 0 : null;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <GitBranch size={15} className="text-teal" />
        <h3 className="text-sm font-semibold text-ink">Causal-consistency view</h3>
      </div>

      <CausalGraph nodes={dag.nodes} edges={dag.edges} target={dag.target} task={task} />

      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
          Raw SHAP vs. causally-reweighted SHAP
        </p>
        {explain.attributions.map((a) => {
          const label = metaFor(a.feature, task).label || a.feature;
          const rawPct = (Math.abs(a.raw_shap) / maxAbs) * 100;
          const causalPct = (Math.abs(a.causal_shap) / maxAbs) * 100;
          return (
            <div key={a.feature} className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-muted truncate" title={a.feature}>
                  {label}
                  {a.is_direct_causal_parent && (
                    <span className="ml-1.5 text-[10px] text-gold">direct cause</span>
                  )}
                </span>
                <span className="font-mono text-ink-faint">
                  {formatRaw(a.raw_shap)} → {formatRaw(a.causal_shap)}
                </span>
              </div>
              <div className="relative h-1.5 rounded-full bg-surface2 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${a.raw_shap >= 0 ? "bg-teal/30" : "bg-red/30"}`}
                  style={{ width: `${rawPct}%` }}
                />
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${a.raw_shap >= 0 ? "bg-teal" : "bg-red"}`}
                  style={{ width: `${causalPct}%` }}
                />
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-ink-faint leading-relaxed">
          Light bar = raw SHAP; solid bar = causally-reweighted SHAP (down-weighted unless the
          feature is a direct cause of the prediction target in the graph above).
        </p>
      </div>

      <div
        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
          contradicted === 0
            ? "border-teal/25 bg-teal/5 text-ink-muted"
            : "border-gold/30 bg-gold/5 text-ink-muted"
        }`}
      >
        <AlertTriangle size={13} className={contradicted === 0 ? "text-teal shrink-0 mt-0.5" : "text-gold shrink-0 mt-0.5"} />
        <span>{dag.sanity_check}</span>
      </div>

      <p className="text-[11px] text-ink-faint leading-relaxed">{dag.data_caveat}</p>
    </div>
  );
}
