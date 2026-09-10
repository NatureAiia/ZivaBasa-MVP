/*
  Sources store — backed by Postgres via the backend's /sources routes
  (backend/api/routes/sources.py) instead of a direct `supabase.from("sources")` call. Written
  to by SourcesPanel's manual drag-drop and every successful Predict-tab batch upload. File
  contents are never stored here — just enough metadata to recognize and reference the source.
*/
import { request } from "./api";

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    size: row.size,
    task: row.task,
    rowCount: row.row_count,
    addedAt: row.added_at,
  };
}

export async function getSources() {
  try {
    const rows = await request("/sources");
    return rows.map(fromRow);
  } catch (e) {
    console.error("getSources failed:", e.message);
    return [];
  }
}

// source: { name, kind: "pdf"|"image"|"text"|"csv", size, task?, rowCount? }
export async function addSource(source) {
  const rows = await request("/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: source.name,
      kind: source.kind,
      size: source.size ?? null,
      task: source.task ?? null,
      row_count: source.rowCount ?? null,
    }),
  });
  return rows.map(fromRow);
}

export async function removeSource(id) {
  const rows = await request(`/sources/${id}`, { method: "DELETE" });
  return rows.map(fromRow);
}
