/*
  Cost-monitoring manual entries — backed by Postgres via the backend's /cost-entries routes
  (backend/api/routes/cost_entries.py) instead of a direct `supabase.from("cost_entries")` call.
  Each item stores {monthlyUsd, note} keyed by itemKey; nothing is pre-filled with a number, per
  the original design instruction not to fabricate a total.
*/
import { request } from "./api";

export async function getCostEntries() {
  try {
    const rows = await request("/cost-entries");
    return Object.fromEntries(
      rows.map((r) => [r.item_key, { monthlyUsd: r.monthly_usd, note: r.note }])
    );
  } catch (e) {
    console.error("getCostEntries failed:", e.message);
    return {};
  }
}

export async function setCostEntry(itemKey, entry) {
  await request("/cost-entries", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_key: itemKey,
      monthly_usd: entry.monthlyUsd ?? null,
      note: entry.note ?? null,
    }),
  });
  return getCostEntries();
}

export async function clearCostEntries() {
  await request("/cost-entries", { method: "DELETE" });
}
