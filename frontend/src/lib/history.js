/*
  Predict run history — now backed by Postgres (predict_history table) instead of
  localStorage, so history syncs across devices instead of being tied to one browser.
*/
import { supabase } from "./supabaseClient";

const DISPLAY_LIMIT = 50; // same cap the old localStorage version enforced client-side

export async function getHistory() {
  const { data, error } = await supabase
    .from("predict_history")
    .select("id, results, created_at")
    .order("created_at", { ascending: false })
    .limit(DISPLAY_LIMIT);
  if (error) {
    console.error("getHistory failed:", error.message);
    return [];
  }
  return data.map((r) => ({ id: r.id, timestamp: r.created_at, results: r.results }));
}

export async function logHistoryEntry(results) {
  // Avoid duplicate back-to-back entries if the effect fires twice for the same completed
  // state (matches the old localStorage guard). Returns the row id either way, so callers
  // (e.g. the feedback control) always have something to attach to.
  const existing = await getHistory();
  const last = existing[0];
  if (last && JSON.stringify(last.results) === JSON.stringify(results)) return last.id;
  const { data, error } = await supabase.from("predict_history").insert({ results }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function deleteHistoryEntry(id) {
  const { error } = await supabase.from("predict_history").delete().eq("id", id);
  if (error) throw error;
  return getHistory();
}

export async function clearHistory() {
  const { error } = await supabase.from("predict_history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
}
