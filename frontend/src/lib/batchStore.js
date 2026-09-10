/*
  Stores the latest batch-upload KPI result per task — backed by Postgres via the backend's
  /batch-results routes (backend/api/routes/batch_results.py) instead of a direct
  `supabase.from("batch_results")` call. Same "one row per task, latest wins" semantics.
*/
import { request, TASKS } from "./api";

export async function saveBatchResult(task, result) {
  await request("/batch-results", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, result }),
  });
}

export async function getBatchResult(task) {
  try {
    const data = await request(`/batch-results/${task}`);
    if (!data) return null;
    return { ...data.result, savedAt: data.saved_at };
  } catch (e) {
    console.error("getBatchResult failed:", e.message);
    return null;
  }
}

export async function getAllBatchResults() {
  const entries = await Promise.all(TASKS.map(async (t) => [t, await getBatchResult(t)]));
  return Object.fromEntries(entries);
}

export async function clearBatchResult(task) {
  await request(`/batch-results/${task}`, { method: "DELETE" });
}
