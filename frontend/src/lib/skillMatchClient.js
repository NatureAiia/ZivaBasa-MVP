/*
  Client-side JS port of backend/src/skill_matching.py's cosine-similarity engine. Deliberately
  kept in sync by hand (same ALL_SKILLS order, same algorithm) rather than round-tripping to the
  backend for every keystroke while editing an org chart — the real backend endpoint
  (/predict/skill_match) is still what the trained model and Roster page use for anything that
  needs to be a stored prediction; this is for instant, free, client-side "what's the skill gap
  here" feedback while building an org structure interactively.

  If ALL_SKILLS changes in skill_matching.py, update this list too — there is no single source
  of truth shared between Python and JS here (a real follow-up would be exposing this taxonomy
  from a GET endpoint instead of hand-duplicating it, flagging that rather than pretending this
  is already solved).
*/
export const ALL_SKILLS = [
  "teller_ops",
  "loan_underwriting",
  "credit_risk",
  "aml_compliance",
  "digital_banking",
  "sales_advisory",
  "customer_service",
  "forex_ops",
  "treasury_ops",
  "it_support",
  "data_analytics",
  "branch_management",
  "leadership",
  "cybersecurity",
  "wealth_management",
];

export const SKILL_LABELS = {
  teller_ops: "Teller Operations",
  loan_underwriting: "Loan Underwriting",
  credit_risk: "Credit Risk",
  aml_compliance: "AML Compliance",
  digital_banking: "Digital Banking",
  sales_advisory: "Sales Advisory",
  customer_service: "Customer Service",
  forex_ops: "Forex Operations",
  treasury_ops: "Treasury Operations",
  it_support: "IT Support",
  data_analytics: "Data Analytics",
  branch_management: "Branch Management",
  leadership: "Leadership",
  cybersecurity: "Cybersecurity",
  wealth_management: "Wealth Management",
};

function buildVector(tags) {
  const tagSet = new Set(tags);
  return ALL_SKILLS.map((skill) => (tagSet.has(skill) ? 1 : 0));
}

function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// Mirrors match_score() in skill_matching.py exactly.
export function matchScore(currentSkills = [], requiredSkills = []) {
  const current = new Set(currentSkills);
  const required = new Set(requiredSkills);
  const score = cosineSimilarity(buildVector([...current]), buildVector([...required]));
  const matched = [...required].filter((s) => current.has(s));
  const missing = [...required].filter((s) => !current.has(s));
  return {
    cosineSimilarityScore: score,
    skillOverlapCount: matched.length,
    missingSkillCount: missing.length,
    matchedSkills: matched,
    missingSkills: missing,
  };
}
