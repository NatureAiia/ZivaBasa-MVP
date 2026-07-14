/*
  Executive field metadata — directly implements the relabeling/input-mechanics spec:
  every raw backend variable gets a plain-language label, a one-line tooltip, a bounded
  control (slider/dropdown/currency) instead of a blank number box defaulting to 0, and the
  two composite skills features are auto-computed from other inputs rather than asked for
  directly (removing 2 of the 8 skills fields from the form entirely).

  Ranges are reasonable, sensible bounds — not verified against the exact training-data min/max
  (that wasn't available at build time). If a real value falls outside a slider's range, widen
  it here rather than assume the bound is exactly right.
*/

export const FIELD_META = {
  // ---- Employment -------------------------------------------------------
  avg_salary_usd: {
    label: "Average Role Salary",
    tooltip: "Typical fully-loaded annual salary for this role, in USD.",
    type: "currency",
    min: 15000, max: 250000, step: 1000,
    group: "Role Economics",
  },
  job_demand_index: {
    label: "Market Demand for Role",
    tooltip: "How sought-after this role is in the external labor market (0 = oversupplied, 10 = acute shortage).",
    type: "slider",
    min: 0, max: 10, step: 1,
    group: "Role Economics",
  },
  ai_tool_maturity_score: {
    label: "AI Tooling Maturity",
    tooltip: "How embedded AI tooling already is in this role's workflow today (0 = none in use, 10 = fully AI-native).",
    type: "slider",
    min: 0, max: 10, step: 1,
    group: "AI Exposure",
  },
  task_repetition_level: {
    label: "Task Repetitiveness",
    tooltip: "How routine and repeatable this role's day-to-day tasks are (0 = highly variable, 10 = highly repetitive).",
    type: "slider",
    min: 0, max: 10, step: 1,
    group: "AI Exposure",
  },
  percent_tasks_automatable: {
    label: "Tasks Automatable Today",
    tooltip: "Estimated share of this role's tasks that current AI/automation tools could already perform.",
    type: "percent",
    min: 0, max: 100, step: 1,
    group: "AI Exposure",
  },
  skill_complexity_score: {
    label: "Skill Complexity Required",
    tooltip: "How specialized and hard-to-replace the skills for this role are (0 = generic, 10 = highly specialized).",
    type: "slider",
    min: 0, max: 10, step: 1,
    group: "Skill Requirements",
  },
  training_hours_needed: {
    label: "Reskilling Hours Required",
    tooltip: "Estimated training hours to bring someone new up to speed in this role.",
    type: "slider",
    min: 0, max: 200, step: 5,
    unit: "hrs",
    group: "Skill Requirements",
  },

  // ---- Skills / Attrition -------------------------------------------------
  Age: {
    label: "Employee Age",
    tooltip: "Employee's age in years.",
    type: "slider",
    min: 18, max: 65, step: 1,
    group: "Demographics",
  },
  YearsAtCompany: {
    label: "Tenure at Company",
    tooltip: "How many years this employee has been with the company.",
    type: "slider",
    min: 0, max: 40, step: 1,
    unit: "yrs",
    group: "Demographics",
  },
  MonthlyIncome: {
    label: "Monthly Income",
    tooltip: "Employee's gross monthly income, in USD.",
    type: "currency",
    min: 1000, max: 25000, step: 100,
    group: "Demographics",
  },
  JobSatisfaction: {
    label: "Job Satisfaction",
    tooltip: "Employee's self-reported satisfaction with their role.",
    type: "select",
    group: "Engagement",
    options: [
      { value: 1, label: "1 — Low" },
      { value: 2, label: "2 — Medium" },
      { value: 3, label: "3 — High" },
      { value: 4, label: "4 — Very High" },
    ],
  },
  PerformanceRating: {
    label: "Performance Rating",
    tooltip: "Most recent formal performance review rating.",
    type: "select",
    group: "Engagement",
    options: [
      { value: 1, label: "1 — Needs Improvement" },
      { value: 2, label: "2 — Meets Expectations" },
      { value: 3, label: "3 — Exceeds Expectations" },
      { value: 4, label: "4 — Outstanding" },
    ],
  },
  TrainingTimesLastYear: {
    label: "Training Sessions (Last 12 Months)",
    tooltip: "Number of formal training sessions attended in the past year.",
    type: "slider",
    min: 0, max: 10, step: 1,
    group: "Development",
  },
  training_intensity_index: {
    label: "Training Intensity Index",
    derived: true,
    compute: (v) => (v.TrainingTimesLastYear ?? 0) / Math.max(1, v.YearsAtCompany ?? 1),
    explain: "Auto-calculated: training sessions relative to tenure — no separate input needed.",
  },
  training_x_satisfaction: {
    label: "Training × Satisfaction Interaction",
    derived: true,
    compute: (v) => {
      const intensity = (v.TrainingTimesLastYear ?? 0) / Math.max(1, v.YearsAtCompany ?? 1);
      return intensity * (v.JobSatisfaction ?? 0);
    },
    explain: "Auto-calculated: training intensity weighted by satisfaction — no separate input needed.",
  },

  // ---- Productivity -------------------------------------------------------
  skill_gap_index: {
    label: "Skill Gap Index",
    tooltip: "Standardized measure of the gap between required and current skill levels for this role (0 = no gap, 1 = severe gap).",
    type: "slider",
    min: 0, max: 1, step: 0.01,
    group: "Core",
  },
};

export const GROUP_ORDER = {
  employment: ["Role Economics", "AI Exposure", "Skill Requirements"],
  skills: ["Demographics", "Engagement", "Development"],
  productivity: ["Core"],
};

export function metaFor(name) {
  return FIELD_META[name] || { label: name, tooltip: "", type: "number", min: 0, max: 100, step: 1, group: "Other" };
}
