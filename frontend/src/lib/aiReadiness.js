/*
  Org AI-Readiness score (growth mechanic 2) — an ORGANIZATION-level maturity narrative, never
  an individual employee score. Same "no fabricated numbers" rule governanceStats.js already
  follows: every input here is computed from real org_nodes/assignments data already entered by
  the admin; if there isn't enough of it yet, the relevant sub-score is `null` and excluded from
  the composite rather than defaulted to a number that implies data that doesn't exist.

  Inputs (all from data ZivaBasa already has, none of them a per-person risk figure):
    - gapClosure    — % of roles with a target role set whose skill gap is fully closed
                      (missingSkillCount === 0), via skillMatchClient.matchScore().
    - trainingLevel — average recentTrainingHours across roles that have it set, compared
                      against a fixed benchmark. This is a point-in-time LEVEL, not a trend —
                      org_nodes has no historical snapshot to compute a real trend from yet.
    - overrideHealth — inverse of governanceStats.aiOverrideShare(): a LOWER human-override
                      rate on AI redeployment recommendations indicates the org trusts (and the
                      model has earned trust for) its own recommendations.
    - matchCoverage — % of all roles that have a target role set at all, i.e. how much of the
                      org has been brought into the redeployment-planning process.

  Stage thresholds below are a tunable product decision, not derived from any external
  benchmark — adjust STAGE_BANDS if the product team wants different cutoffs.
*/
import { matchScore } from "./skillMatchClient";
import { aiOverrideShare } from "./governanceStats";

const TRAINING_BENCHMARK_HOURS = 20; // "healthy" recent training hours per role, per quarter

const STAGES = ["Reactive", "Aware", "Adaptive", "Strategic"];
const STAGE_BANDS = [0.25, 0.5, 0.75]; // composite >= band[i] -> STAGES[i+1]

function stageFor(composite) {
  let idx = 0;
  for (const band of STAGE_BANDS) {
    if (composite >= band) idx += 1;
  }
  return STAGES[idx];
}

export function computeAIReadiness(orgNodes = [], assignments = []) {
  if (orgNodes.length === 0) return null;

  const withTarget = orgNodes.filter((n) => n.targetRole);
  const matchCoverage = withTarget.length / orgNodes.length;

  let gapClosure = null;
  if (withTarget.length > 0) {
    const closed = withTarget.filter((n) => {
      const g = matchScore(n.currentSkills, n.targetSkills);
      return g.missingSkillCount === 0;
    }).length;
    gapClosure = closed / withTarget.length;
  }

  const withTraining = orgNodes.filter((n) => n.recentTrainingHours != null);
  let trainingLevel = null;
  if (withTraining.length > 0) {
    const avgHours = withTraining.reduce((sum, n) => sum + n.recentTrainingHours, 0) / withTraining.length;
    trainingLevel = Math.min(1, avgHours / TRAINING_BENCHMARK_HOURS);
  }

  const governance = aiOverrideShare(assignments);
  const overrideHealth = governance ? 1 - governance.share : null;

  const components = { gapClosure, trainingLevel, overrideHealth, matchCoverage };
  const available = Object.values(components).filter((v) => v != null);
  if (available.length === 0) {
    return { stage: null, composite: null, components, insufficientData: true };
  }

  const composite = available.reduce((sum, v) => sum + v, 0) / available.length;
  return { stage: stageFor(composite), composite, components, insufficientData: false };
}
