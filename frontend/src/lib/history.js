/*
  Predict run history — backed by Postgres via the backend's /predict-history routes
  (backend/api/routes/predict_history.py) instead of a direct `supabase.from("predict_history")`
  call, so history syncs across devices instead of being tied to one browser.
*/
import { request } from "./api";

export async function getHistory() {
  try {
    const rows = await request("/predict-history");
    return rows.map((r) => ({ id: r.id, timestamp: r.created_at, results: r.results }));
  } catch (e) {
    console.error("getHistory failed:", e.message);
    return [];
  }
}

export async function logHistoryEntry(results) {
  // Avoid duplicate back-to-back entries if the effect fires twice for the same completed
  // state (matches the old localStorage/Supabase guard). Returns the row id either way, so
  // callers (e.g. the feedback control) always have something to attach to.
  const existing = await getHistory();
  const last = existing[0];
  if (last && JSON.stringify(last.results) === JSON.stringify(results)) return last.id;
  const row = await request("/predict-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
  return row.id;
}

export async function deleteHistoryEntry(id) {
  const rows = await request(`/predict-history/${id}`, { method: "DELETE" });
  return rows.map((r) => ({ id: r.id, timestamp: r.created_at, results: r.results }));
}

export async function clearHistory() {
  await request("/predict-history", { method: "DELETE" });
}
