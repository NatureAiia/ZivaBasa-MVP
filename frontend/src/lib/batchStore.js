/*
  Stores the latest batch-upload KPI result per task, client-side (same localStorage-only
  caveat as history.js — no backend persistence for this yet). This is what feeds the
  corporate dashboard's big numbers: upload a CSV once per task, the resulting aggregate
  sticks around until the next upload.
*/
import { TASKS } from "./api";

const KEY_PREFIX = "zivabasa-batch:";

export function saveBatchResult(task, result) {
  localStorage.setItem(KEY_PREFIX + task, JSON.stringify({ ...result, savedAt: new Date().toISOString() }));
}

export function getBatchResult(task) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + task);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAllBatchResults() {
  return Object.fromEntries(TASKS.map((t) => [t, getBatchResult(t)]));
}

export function clearBatchResult(task) {
  localStorage.removeItem(KEY_PREFIX + task);
}
