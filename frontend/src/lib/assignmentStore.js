/*
  Assignment store — backed by Postgres via the backend's /assignments routes
  (backend/api/routes/assignments.py) instead of a direct `supabase.from("assignments")` call.
  Same approval-workflow audit trail concept as before (recommend -> approve/reject -> tracked
  decision); same exported function names, still async.

  A record: { id, roleId, roleTitle, fromRole, toRole, cosineSimilarityScore, missingSkills,
              status: "pending" | "approved" | "rejected", decidedAt, note, recommendedAt }
*/
import { request } from "./api";

function fromRow(row) {
  return {
    id: row.id,
    roleId: row.role_id,
    roleTitle: row.role_title,
    fromRole: row.from_role,
    toRole: row.to_role,
    cosineSimilarityScore: row.cosine_similarity_score,
    missingSkills: row.missing_skills || [],
    status: row.status,
    note: row.note,
    recommendedAt: row.recommended_at,
    decidedAt: row.decided_at,
  };
}

export async function getAssignments() {
  try {
    const rows = await request("/assignments");
    return rows.map(fromRow);
  } catch (e) {
    console.error("getAssignments failed:", e.message);
    return [];
  }
}

export async function recommendAssignment(record) {
  const rows = await request("/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role_id: record.roleId,
      role_title: record.roleTitle,
      from_role: record.fromRole,
      to_role: record.toRole,
      cosine_similarity_score: record.cosineSimilarityScore,
      missing_skills: record.missingSkills || [],
    }),
  });
  return rows.map(fromRow);
}

export async function decideAssignment(id, status, note = "") {
  const rows = await request(`/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  return rows.map(fromRow);
}

export async function clearAssignments() {
  await request("/assignments", { method: "DELETE" });
}
