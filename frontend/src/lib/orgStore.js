/*
  Org structure store — backed by Postgres via the backend's own /org-nodes routes
  (backend/api/routes/org_nodes.py) instead of a direct `supabase.from("org_nodes")` call, so a
  reporting structure built in My Organization survives across devices/browsers and isn't lost
  if the browser's storage is cleared. Same exported function names/shapes as before; call sites
  just need `await`.

  node: { id, title, department, parentId (null = top of chart), currentSkills: [],
          targetRole: "" | string, targetSkills: [], seniorityYears, headcount,
          avgSalaryUsd, performanceRating, recentTrainingHours, recentOtHours }

  The last four fields only feed Chiedza's scan_org_risk tool (backend/api/agent_graph.py) — a
  per-role skill_match redeployment-fit scan. Left blank (null), a role is simply skipped by
  that scan rather than defaulted to a fabricated number.
*/
import { request } from "./api";

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    parentId: row.parent_id,
    currentSkills: row.current_skills || [],
    targetRole: row.target_role,
    targetSkills: row.target_skills || [],
    seniorityYears: row.seniority_years,
    headcount: row.headcount,
    avgSalaryUsd: row.avg_salary_usd,
    performanceRating: row.performance_rating,
    recentTrainingHours: row.recent_training_hours,
    recentOtHours: row.recent_ot_hours,
  };
}

function toRow(node) {
  return {
    ...(node.id ? { id: node.id } : {}),
    title: node.title,
    department: node.department,
    parent_id: node.parentId ?? null,
    current_skills: node.currentSkills || [],
    target_role: node.targetRole || null,
    target_skills: node.targetSkills || [],
    seniority_years: node.seniorityYears ?? null,
    headcount: node.headcount ?? 1,
    avg_salary_usd: node.avgSalaryUsd ?? null,
    performance_rating: node.performanceRating ?? null,
    recent_training_hours: node.recentTrainingHours ?? null,
    recent_ot_hours: node.recentOtHours ?? null,
  };
}

export async function getOrgNodes() {
  try {
    const rows = await request("/org-nodes");
    return rows.map(fromRow);
  } catch (e) {
    console.error("getOrgNodes failed:", e.message);
    return [];
  }
}

export async function upsertNode(node) {
  const row = await request("/org-nodes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toRow(node)),
  });
  return fromRow(row);
}

export async function removeNode(id) {
  // Re-parenting the removed node's children is now done atomically server-side
  // (backend/api/routes/org_nodes.py) instead of 3 separate client round-trips.
  await request(`/org-nodes/${id}`, { method: "DELETE" });
}

export async function clearOrgNodes() {
  await request("/org-nodes", { method: "DELETE" });
}
