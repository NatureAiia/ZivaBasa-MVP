/*
  Stores the latest batch-upload KPI result per task — now backed by Postgres
  (batch_results table) instead of localStorage. Same "one row per task, latest wins"
  semantics as before, enforced by the unique(user_id, task) constraint + upsert.
*/
import { supabase } from "./supabaseClient";
import { TASKS } from "./api";

export async function saveBatchResult(task, result) {
  const { error } = await supabase
    .from("batch_results")
    .upsert({ task, result, saved_at: new Date().toISOString() }, { onConflict: "user_id,task" });
  if (error) throw error;
}

export async function getBatchResult(task) {
  const { data, error } = await supabase
    .from("batch_results")
    .select("result, saved_at")
    .eq("task", task)
    .maybeSingle();
  if (error) {
    console.error("getBatchResult failed:", error.message);
    return null;
  }
  if (!data) return null;
  return { ...data.result, savedAt: data.saved_at };
}

export async function getAllBatchResults() {
  const entries = await Promise.all(TASKS.map(async (t) => [t, await getBatchResult(t)]));
  return Object.fromEntries(entries);
}

export async function clearBatchResult(task) {
  const { error } = await supabase.from("batch_results").delete().eq("task", task);
  if (error) throw error;
}
