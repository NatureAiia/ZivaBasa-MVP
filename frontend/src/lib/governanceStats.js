/*
  Governance stats — computed from real, already-logged data: the assignments table's
  approval workflow (recommend -> approve/reject, see assignmentStore.js / backend/supabase/
  schema.sql), including its recommended_at/decided_at timestamps.

  Same "no fabricated numbers" rule Cost Monitoring and indices.js already follow: if there
  isn't enough real history yet, these return null (or an insufficientHistory flag) and the
  caller says so in the UI, rather than inventing a trend line or a rate from zero decisions.

  Implements two items from the AI4I feature catalogue that ZivaBasa can actually compute
  today, from data the app itself already produces (as opposed to the 5 engineered features
  in src/features.py, which need real bank operational data ZivaBasa doesn't have yet):

    - "Workforce Redeployment Trend" (§2.2 Temporal Features) — decided redeployments per
      period, turning My Organization's point-in-time approval log into a trend over time.
    - "AI Overrides as a Share of AI Decisions" (§2.1 Index/Composite Features) — a
      recommendAssignment() call is the AI decision; a human marking it "rejected" is the
      override. Share = rejected / all decided.
*/

function monthKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/**
 * Buckets decided assignments (approved/rejected) by month using decided_at.
 * Returns null if there are no decided assignments at all yet.
 */
export function redeploymentTrend(assignments = []) {
  const decided = assignments.filter((a) => a.status !== "pending" && a.decidedAt);
  if (decided.length === 0) return null;

  const byMonth = {};
  for (const a of decided) {
    const key = monthKey(a.decidedAt);
    byMonth[key] = byMonth[key] || { approved: 0, rejected: 0 };
    byMonth[key][a.status === "approved" ? "approved" : "rejected"] += 1;
  }
  const keys = Object.keys(byMonth).sort();
  const series = keys.map((key) => ({
    key,
    label: monthLabel(key),
    approved: byMonth[key].approved,
    rejected: byMonth[key].rejected,
    total: byMonth[key].approved + byMonth[key].rejected,
  }));

  // A "trend" needs at least two distinct periods to mean anything — with one period this
  // is just a count, not a direction. Flag it rather than compute a fake delta.
  if (series.length < 2) {
    return { series, deltaPct: null, insufficientHistory: true };
  }

  const first = series[0].total;
  const last = series[series.length - 1].total;
  const deltaPct = first > 0 ? ((last - first) / first) * 100 : null;

  return { series, deltaPct, insufficientHistory: false };
}

/**
 * AI Overrides as a Share of AI Decisions: recommendAssignment() is the AI-generated
 * decision; a human marking it "rejected" is the override. Returns null until at least one
 * assignment has actually been decided (approved or rejected) — a 0% rate from zero
 * decisions would be indistinguishable from "no overrides" and is misleading either way.
 */
export function aiOverrideShare(assignments = []) {
  const decided = assignments.filter((a) => a.status === "approved" || a.status === "rejected");
  if (decided.length === 0) return null;
  const rejected = decided.filter((a) => a.status === "rejected").length;
  return { rejected, decided: decided.length, share: rejected / decided.length };
}
