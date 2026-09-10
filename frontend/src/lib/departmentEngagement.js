/*
  Department engagement (growth mechanic 6) — OPERATIONAL completeness per department, never a
  risk-score competition between departments. Two inputs, both about how much setup/review work
  has happened, not about any individual's predicted outcome:

    - structureComplete — % of a department's org_nodes that have the minimum fields filled in
                          (department, at least one current skill, seniority) to be usable in
                          skill-gap analysis at all.
    - lastViewedAt      — when someone last reviewed that department's skills-gap view (Organi-
                          zational Structure tab), from the backend's /department-views routes
                          (backend/api/routes/department_engagement.py).
*/
import { request } from "./api";

const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;

function isStructureComplete(node) {
  return Boolean(node.department) && (node.currentSkills || []).length > 0 && node.seniorityYears != null;
}

export async function recordDepartmentView(department) {
  if (!department) return;
  try {
    await request("/department-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department }),
    });
  } catch (e) {
    console.error("recordDepartmentView failed:", e.message);
  }
}

async function getLastViewedByDepartment() {
  try {
    const rows = await request("/department-views");
    const byDept = {};
    for (const row of rows || []) {
      if (!byDept[row.department]) byDept[row.department] = row.viewed_at; // first hit per dept = most recent (already sorted)
    }
    return byDept;
  } catch (e) {
    console.error("getLastViewedByDepartment failed:", e.message);
    return {};
  }
}

// Combines org_nodes structure-completeness with department view recency into one
// per-department engagement summary, sorted by name.
export async function getDepartmentEngagement(orgNodes = []) {
  const byDept = {};
  for (const node of orgNodes) {
    const dept = node.department || "Unassigned";
    byDept[dept] ??= { department: dept, total: 0, complete: 0 };
    byDept[dept].total += 1;
    if (isStructureComplete(node)) byDept[dept].complete += 1;
  }

  const lastViewed = await getLastViewedByDepartment();
  const now = Date.now();

  return Object.values(byDept)
    .map((d) => {
      const viewedAt = lastViewed[d.department];
      const reviewedThisQuarter = viewedAt ? now - new Date(viewedAt).getTime() < QUARTER_MS : false;
      return {
        department: d.department,
        structurePct: d.total > 0 ? d.complete / d.total : 0,
        reviewedThisQuarter,
        lastViewedAt: viewedAt || null,
      };
    })
    .sort((a, b) => a.department.localeCompare(b.department));
}
