/*
  Sources store — now backed by Postgres (sources table) instead of localStorage. Written to
  by SourcesPanel's manual drag-drop and every successful Predict-tab batch upload. File
  contents are never stored here — just enough metadata to recognize and reference the source.
*/
import { supabase } from "./supabaseClient";

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
  const { data, error } = await supabase.from("sources").select("*").order("added_at", { ascending: false });
  if (error) {
    console.error("getSources failed:", error.message);
    return [];
  }
  return data.map(fromRow);
}

// source: { name, kind: "pdf"|"image"|"text"|"csv", size, task?, rowCount? }
export async function addSource(source) {
  const { error } = await supabase.from("sources").insert({
    name: source.name,
    kind: source.kind,
    size: source.size ?? null,
    task: source.task ?? null,
    row_count: source.rowCount ?? null,
  });
  if (error) throw error;
  return getSources();
}

export async function removeSource(id) {
  const { error } = await supabase.from("sources").delete().eq("id", id);
  if (error) throw error;
  return getSources();
}
