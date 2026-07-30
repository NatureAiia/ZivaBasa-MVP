/*
  Confirmed cross-dataset "golden record" links (entity_links table) — what a reviewer accepts
  from the candidate matches api.matchEntities() proposes. See backend/src/entity_resolution.py
  for the matching logic; this store only persists decisions, same stateless-API/stateful-
  frontend split as every other *Store.js file.
*/
import { supabase } from "./supabaseClient";

export async function getEntityLinks() {
  const { data, error } = await supabase
    .from("entity_links")
    .select("golden_id, task, row_label, match_score, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getEntityLinks failed:", error.message);
    return [];
  }
  return data;
}

// Confirms one cluster: every member gets the same golden_id, upserted on (task, row_label) so
// re-confirming just updates the existing link rather than duplicating it.
export async function confirmCluster(members, goldenId) {
  const rows = members.map((m) => ({
    golden_id: goldenId,
    task: m.task,
    row_label: m.label,
    match_score: m.match_score,
  }));
  const { error } = await supabase.from("entity_links").upsert(rows, { onConflict: "user_id,task,row_label" });
  if (error) throw error;
}

export async function removeLink(task, rowLabel) {
  const { error } = await supabase.from("entity_links").delete().eq("task", task).eq("row_label", rowLabel);
  if (error) throw error;
}
