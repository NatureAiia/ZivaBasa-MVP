/*
  Composite index cards — directly using the real taxonomy from the AI4I feature catalogue
  ("Project Features - Recommended Features - 7 July 2026", §2.1 Index/Composite Features:
  Workforce Digital Readiness Index, Skill Readiness Index, Digital Productivity Index, etc).

  That catalogue lists 603 possible features across a full research architecture ZivaBasa's
  MVP doesn't have the data for. Rather than fabricate numbers for indices we can't actually
  compute, these three are built ONLY from fields that genuinely exist in each task's schema
  today — min-max normalized across whatever batch was uploaded (i.e. relative to that
  population, not an absolute external benchmark, since no such benchmark exists yet).
*/

export const INDEX_DEFINITIONS = {
  employment: {
    key: "workforce_digital_readiness",
    label: "Workforce Digital Readiness Index",
    source: "AI4I feature catalogue §2.1",
    inputs: ["ai_tool_maturity_score", "job_demand_index"],
    invert: false,
    description: "AI tooling maturity + market demand for the role, min-max normalized across this upload (0-100, relative to this population).",
  },
  skills: {
    key: "skill_readiness",
    label: "Skill Readiness Index",
    source: "AI4I feature catalogue §2.1",
    inputs: ["TrainingTimesLastYear", "JobSatisfaction", "PerformanceRating"],
    invert: false,
    description: "Training frequency + satisfaction + performance, min-max normalized across this upload.",
  },
  productivity: {
    key: "digital_productivity",
    label: "Digital Productivity Index",
    source: "AI4I feature catalogue §2.1",
    inputs: ["skill_gap_index"],
    invert: true, // lower skill gap = higher productivity index
    description: "Inverse of skill gap, min-max normalized across this upload (smaller gap = higher index).",
  },
  skill_match: {
    key: "digital_skills_gap_index",
    label: "Digital Skills Gap Index",
    source: "AI4I feature catalogue §2.1",
    inputs: ["missing_skill_count"],
    invert: false, // more missing required skills = bigger gap = higher index
    description: "Count of required skills not yet held, min-max normalized across this upload (0-100, relative to this population — higher = bigger gap).",
  },
};

function minMaxNormalize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map((v) => ((v - min) / (max - min)) * 100);
}

export function computeIndex(task, rows) {
  const def = INDEX_DEFINITIONS[task];
  if (!def || !rows || rows.length === 0) return null;

  const perInputNormalized = def.inputs
    .filter((name) => rows[0][name] !== undefined)
    .map((name) => {
      let norm = minMaxNormalize(rows.map((r) => r[name] ?? 0));
      if (def.invert) norm = norm.map((v) => 100 - v);
      return norm;
    });
  if (perInputNormalized.length === 0) return null;

  const composite = rows.map((_, i) => {
    const vals = perInputNormalized.map((arr) => arr[i]);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const mean = composite.reduce((a, b) => a + b, 0) / composite.length;

  return { ...def, mean, n: rows.length };
}
