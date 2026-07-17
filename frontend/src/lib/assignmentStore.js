/*
  Assignment store — now backed by Postgres (assignments table, see
  backend/supabase/schema.sql) instead of localStorage. Same approval-workflow audit trail
  concept as before (recommend -> approve/reject -> tracked decision); same exported
  function names, now async.

  A record: { id, roleId, roleTitle, fromRole, toRole, cosineSimilarityScore, missingSkills,
              status: "pending" | "approved" | "rejected", decidedAt, note, recommendedAt }
*/
import { supabase } from "./supabaseClient";

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
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .order("recommended_at", { ascending: false });
  if (error) {
    console.error("getAssignments failed:", error.message);
    return [];
  }
  return data.map(fromRow);
}

export async function recommendAssignment(record) {
  // Relies on the assignments_role_target_uniq constraint (user_id, role_id, to_role) —
  // upsert with ignoreDuplicates is the same "don't spam a new row for the same
  // role -> target pair" behavior the old localStorage version implemented by hand.
  const { error } = await supabase
    .from("assignments")
    .upsert(
      {
        role_id: record.roleId,
        role_title: record.roleTitle,
        from_role: record.fromRole,
        to_role: record.toRole,
        cosine_similarity_score: record.cosineSimilarityScore,
        missing_skills: record.missingSkills || [],
        status: "pending",
      },
      { onConflict: "user_id,role_id,to_role", ignoreDuplicates: true }
    )
    .select();
  if (error) throw error;
  return getAssignments();
}

export async function decideAssignment(id, status, note = "") {
  const { error } = await supabase
    .from("assignments")
    .update({ status, note, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  return getAssignments();
}

export async function clearAssignments() {
  const { error } = await supabase.from("assignments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}
