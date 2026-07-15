import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { ChevronDown, Shuffle, Upload, Users } from "lucide-react";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import ClarityRing from "../../components/common/ClarityRing";
import EmptyState from "../../components/common/EmptyState";
import ShapLedger from "../../components/predict/ShapLedger";
import { staggerContainer, fadeUpItem, fadeScale } from "../../lib/motion";
import { getBatchResult } from "../../lib/batchStore";
import { api } from "../../lib/api";
import { formatPercent } from "../../lib/format";

const PAGE_SIZE = 12;

/*
  Roster & Redeployment — the "genuinely new page" half of Shift Intelligence (the other half,
  skill_match itself, is a task like any other and needs no bespoke UI in Predict/Chat/History).
  Reads the same batch-upload result the corporate dashboard's 4th KPI card reads
  (batchStore's "skill_match" entry) — no separate upload flow, no new backend endpoint.
*/
export default function RosterTab() {
  const [batch, setBatch] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState(null); // staff_id currently showing "Why this match?"
  const [explainCache, setExplainCache] = useState({});
  const [explaining, setExplaining] = useState(null);
  const [schema, setSchema] = useState(null);

  useEffect(() => {
    setBatch(getBatchResult("skill_match"));
    api.schema("skill_match").then(setSchema).catch(() => {});
  }, []);

  const candidates = useMemo(() => {
    if (!batch?.rows) return [];
    return batch.rows
      .filter((r) => r._label === 1)
      .sort((a, b) => b._value - a._value);
  }, [batch]);

  const toggleExplain = async (row) => {
    const id = row._name;
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (explainCache[id] || !schema) return;
    setExplaining(id);
    try {
      const featureValues = schema.feature_names.map((n) => row[n] ?? 0);
      const result = await api.explain("skill_match", featureValues, 8);
      setExplainCache((c) => ({ ...c, [id]: result }));
    } catch (e) {
      setExplainCache((c) => ({ ...c, [id]: { error: e.message } }));
    } finally {
      setExplaining(null);
    }
  };

  if (!batch) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={Shuffle}
          title="No redeployment data yet"
          description='Run a "skill_match" batch upload from Predict → Upload & Analyze to populate coverage and redeployment candidates here.'
          action={
            <Link
              to="predict"
              className="flex items-center gap-1.5 text-xs font-medium text-gold hover:brightness-110"
            >
              <Upload size={13} /> Go to Predict
            </Link>
          }
        />
      </div>
    );
  }

  const { aggregate, n_rows, by_segment } = batch;
  const visible = candidates.slice(0, visibleCount);

  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="p-6 max-w-5xl mx-auto w-full flex flex-col gap-5"
      >
        {/* Coverage summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variants={fadeUpItem} className="flex items-center gap-4">
            <ClarityRing mode="confidence" value={aggregate.positive_rate} size={52} color="teal" />
            <div>
              <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold block">
                Strong matches
              </span>
              <span className="font-mono text-2xl font-semibold text-ink">
                {aggregate.positive_count}
              </span>
              <span className="text-xs text-ink-muted block">
                {formatPercent(aggregate.positive_rate)} of {n_rows} pairs
              </span>
            </div>
          </Card>

          <Card variants={fadeUpItem} className="flex flex-col gap-2">
            <Users size={16} className="text-gold" />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
              Staff-to-role pairs analyzed
            </span>
            <span className="font-mono text-3xl font-semibold text-ink">{n_rows}</span>
          </Card>

          <Card variants={fadeUpItem} className="flex flex-col gap-2">
            <Shuffle size={16} className="text-teal" />
            <span className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
              Redeployable payroll
            </span>
            <span className="font-mono text-2xl font-semibold text-ink">
              {aggregate.value_at_risk != null
                ? `$${aggregate.value_at_risk.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "—"}
            </span>
          </Card>
        </div>

        {/* Department breakdown */}
        {by_segment && by_segment.length > 0 && (
          <Card animated={false}>
            <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">
              Match rate by target department
            </h2>
            <div className="flex flex-col gap-2">
              {by_segment.map((s) => (
                <div key={s.segment} className="flex items-center gap-3 text-xs">
                  <span className="w-40 truncate text-ink-muted">{s.segment}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                    <div
                      className="h-full bg-teal rounded-full"
                      style={{ width: `${Math.min(100, s.positive_rate * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-ink-faint w-14 text-right">
                    {formatPercent(s.positive_rate)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Redeployment candidates */}
        <Card animated={false} className="p-0 overflow-hidden">
          <div className="p-5 pb-3">
            <h2 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold">
              Redeployment candidates
            </h2>
            <p className="text-xs text-ink-faint mt-1">
              Staff flagged as strong matches for their target role, ranked by match strength.
            </p>
          </div>

          {candidates.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                icon={Users}
                title="No strong matches in this upload"
                description="Try a different roster export, or check the target roles in your data."
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col divide-y divide-border">
                {visible.map((row) => (
                  <div key={row._name}>
                    <button
                      onClick={() => toggleExplain(row)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface2/60 transition-colors"
                    >
                      <Badge tone="teal" className="w-fit shrink-0">
                        {formatPercent(row._value)}
                      </Badge>
                      <span className="font-mono text-xs text-ink flex-1 truncate">{row._name}</span>
                      <span className="text-[11px] text-ink-faint hidden sm:inline">
                        overlap {row.skill_overlap_count} · missing {row.missing_skill_count}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-ink-faint transition-transform ${expanded === row._name ? "rotate-180" : ""}`}
                      />
                    </button>
                    <AnimatePresence>
                      {expanded === row._name && (
                        <motion.div
                          variants={fadeScale}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          className="px-5 pb-4"
                        >
                          <div className="bg-surface2/60 rounded-xl p-4">
                            <h3 className="text-[11px] uppercase tracking-wide text-ink-faint font-semibold mb-3">
                              Why this match?
                            </h3>
                            {explaining === row._name ? (
                              <p className="text-xs text-ink-faint">Computing explanation…</p>
                            ) : explainCache[row._name]?.error ? (
                              <p className="text-xs text-red">{explainCache[row._name].error}</p>
                            ) : explainCache[row._name] ? (
                              <ShapLedger result={explainCache[row._name]} task="skill_match" />
                            ) : null}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              {visibleCount < candidates.length && (
                <div className="p-4 border-t border-border">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full text-xs font-medium text-gold hover:brightness-110 transition-all py-1.5"
                  >
                    Show more ({candidates.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </Card>

        <p className="text-[11px] text-ink-faint leading-relaxed">
          Redeployment fit is a model output on whatever roster/skills data you uploaded — a
          starting shortlist for HR review, not an automatic reassignment decision.
        </p>
      </motion.div>
    </div>
  );
}
