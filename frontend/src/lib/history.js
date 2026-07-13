/*
  Client-side run history. No backend persistence exists yet for this (the FastAPI backend is
  stateless — /predict and /explain don't store anything), so this is a real but v2-prototype
  limitation: history lives in this browser's localStorage only, not synced across devices.
  Wiring this to a real backend table is a natural next step once auth/accounts exist.
*/
const KEY = "zivabasa-history";

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function logHistoryEntry(results) {
  const history = getHistory();
  const entry = {
    id: `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    results,
  };
  // Avoid duplicate back-to-back entries if the effect fires twice for the same completed state.
  const last = history[0];
  if (last && JSON.stringify(last.results) === JSON.stringify(results)) return;
  const next = [entry, ...history].slice(0, 50);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function deleteHistoryEntry(id) {
  const next = getHistory().filter((h) => h.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearHistory() {
  localStorage.setItem(KEY, "[]");
}
