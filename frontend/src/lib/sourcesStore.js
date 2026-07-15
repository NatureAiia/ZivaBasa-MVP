/*
  Sources store — persisted (localStorage, same pattern as batchStore/history), written to by
  two places: SourcesPanel's manual drag-drop, and every successful Predict-tab batch upload
  (BatchUpload.jsx). Before this, a batch upload and a manually-dropped file were two unrelated
  things; now "everything you've fed ZivaBasa" lives in one list.

  File contents are never stored here (localStorage isn't for multi-MB blobs, and predict data
  already lives in batchStore) — just enough metadata to recognize and jump back to it.
*/
const KEY = "zivabasa-sources";

export function getSources() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(sources) {
  localStorage.setItem(KEY, JSON.stringify(sources));
  return sources;
}

// source: { name, kind: "pdf"|"image"|"text"|"csv", size, task?, rowCount? }
export function addSource(source) {
  const id = `${source.name}-${source.size ?? 0}-${Date.now()}`;
  const next = [{ ...source, id, addedAt: new Date().toISOString() }, ...getSources()];
  return write(next);
}

export function removeSource(id) {
  return write(getSources().filter((s) => s.id !== id));
}
