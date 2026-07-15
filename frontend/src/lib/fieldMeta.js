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
    tooltip: "How sought-after this role is in the external labor market (0 = oversupplied, 1 = acute shortage).",
    type: "slider",
    min: 0, max: 1, step: 0.01,
    group: "Role Economics",
  },
  ai_tool_maturity_score: {
    label: "AI Tooling Maturity",
    tooltip: "How embedded AI tooling already is in this role's workflow today (0 = none in use, 1 = fully AI-native).",
    type: "slider",
    min: 0, max: 1, step: 0.01,
    group: "AI Exposure",
  },
  task_repetition_level: {
    label: "Task Repetitiveness",
    tooltip: "How routine and repeatable this role's day-to-day tasks are (0 = highly variable, 1 = highly repetitive).",
    type: "slider",
    min: 0, max: 1, step: 0.01,
    group: "AI Exposure",
  },
  percent_tasks_automatable: {
    label: "Tasks Automatable Today",
    tooltip: "Estimated share of this role's tasks that current AI/automation tools could already perform.",
    type: "percent",
    min: 0, max: 1, step: 0.01,
    group: "AI Exposure",
  },
  skill_complexity_score: {
    label: "Skill Complexity Required",
    tooltip: "How specialized and hard-to-replace the skills for this role are (0 = generic, 1 = highly specialized).",
    type: "slider",
    min: 0, max: 1, step: 0.01,
    group: "Skill Requirements",
  },
  training_hours_needed: {
    label: "Reskilling Hours Required",
    tooltip: "Estimated training hours to bring someone new up to speed in this role.",
    type: "slider",
    min: 0, max: 500, step: 5,
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
    tooltip: "Measure of the gap between required and current skill levels for this role (0 = no gap, 100 = severe gap).",
    type: "slider",
    min: 0, max: 100, step: 1,
    group: "Core",
  },

  // ---- Skill Match / Redeployment ------------------------------------------
  seniority_years: {
    label: "Staff Seniority",
    tooltip: "Years this staff member has been with the bank.",
    type: "slider",
    min: 0, max: 35, step: 0.5, unit: "yrs",
    group: "Staff Profile",
  },
  recent_training_hours: {
    label: "Recent Training Hours",
    tooltip: "Formal training hours completed in the last 12 months.",
    type: "slider",
    min: 0, max: 80, step: 1, unit: "hrs",
    group: "Staff Profile",
  },
  recent_ot_hours: {
    label: "Recent Overtime Hours",
    tooltip: "Overtime hours worked recently — lower values, with higher seniority, rank higher in fairness-based redeployment ordering.",
    type: "slider",
    min: 0, max: 40, step: 1, unit: "hrs",
    group: "Redeployment Match",
  },
  skill_overlap_count: {
    label: "Matching Skills",
    tooltip: "How many of the target role's required skills this staff member already has.",
    type: "slider",
    min: 0, max: 15, step: 1,
    group: "Redeployment Match",
  },
  missing_skill_count: {
    label: "Skill Gaps",
    tooltip: "How many of the target role's required skills this staff member still needs.",
    type: "slider",
    min: 0, max: 15, step: 1,
    group: "Redeployment Match",
  },
  overlap_x_training: {
    label: "Overlap × Training Interaction",
    derived: true,
    compute: (v) => (v.skill_overlap_count ?? 0) * (v.recent_training_hours ?? 0),
    explain: "Auto-calculated: existing skill overlap weighted by recent training investment — no separate input needed.",
  },
};

// performance_rating and avg_salary_usd are shared raw column names across multiple tasks
// (skills' PerformanceRating/MonthlyIncome are differently-cased and don't collide, but
// skill_match's synthetic fixture reuses these exact lowercase names) with different scales
// and meanings per task — a single flat FIELD_META entry can't serve both correctly, so
// task-scoped overrides win over the flat dict. Add here, not above, if a future task
// introduces another same-named-different-meaning column.
export const FIELD_META_OVERRIDES = {
  skill_match: {
    performance_rating: {
      label: "Performance Rating",
      tooltip: "Most recent formal performance review rating.",
      type: "select",
      group: "Staff Profile",
      options: [
        { value: 1, label: "1 — Needs Improvement" },
        { value: 2, label: "2 — Meets Expectations" },
        { value: 3, label: "3 — Exceeds Expectations" },
        { value: 4, label: "4 — Outstanding" },
        { value: 5, label: "5 — Exceptional" },
      ],
    },
    avg_salary_usd: {
      label: "Current Monthly Salary",
      tooltip: "Staff member's current gross monthly salary, in USD.",
      type: "currency",
      min: 150, max: 3000, step: 50,
      group: "Staff Profile",
    },
  },
};

export const GROUP_ORDER = {
  employment: ["Role Economics", "AI Exposure", "Skill Requirements"],
  skills: ["Demographics", "Engagement", "Development"],
  productivity: ["Core"],
  skill_match: ["Staff Profile", "Redeployment Match"],
};

export function metaFor(name, task) {
  const override = task && FIELD_META_OVERRIDES[task]?.[name];
  return (
    override ||
    FIELD_META[name] || { label: name, tooltip: "", type: "number", min: 0, max: 100, step: 1, group: "Other" }
  );
}
