/*
  Cost-monitoring manual entries — now backed by Postgres (cost_entries table) instead of
  localStorage. Each item stores {monthlyUsd, note} keyed by itemKey; nothing is pre-filled
  with a number, per the original design instruction not to fabricate a total.
*/
import { supabase } from "./supabaseClient";

export async function getCostEntries() {
  const { data, error } = await supabase.from("cost_entries").select("item_key, monthly_usd, note");
  if (error) {
    console.error("getCostEntries failed:", error.message);
    return {};
  }
  return Object.fromEntries(
    data.map((r) => [r.item_key, { monthlyUsd: r.monthly_usd, note: r.note }])
  );
}

export async function setCostEntry(itemKey, entry) {
  const { error } = await supabase.from("cost_entries").upsert(
    {
      item_key: itemKey,
      monthly_usd: entry.monthlyUsd ?? null,
      note: entry.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,item_key" }
  );
  if (error) throw error;
  return getCostEntries();
}

export async function clearCostEntries() {
  const { error } = await supabase.from("cost_entries").delete().neq("item_key", "");
  if (error) throw error;
}
