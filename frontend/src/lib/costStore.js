/*
  Client-side storage for user-entered cost figures — same localStorage-only pattern as
  history.js and batchStore.js (no backend table for this yet either). Each item stores
  {monthlyUsd, note}; nothing here is pre-filled with a number, per the proposal's explicit
  instruction not to fabricate a total.
*/
const KEY = "zivabasa-cost-model";

export function getCostEntries() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function setCostEntry(itemKey, entry) {
  const all = getCostEntries();
  all[itemKey] = entry;
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

export function clearCostEntries() {
  localStorage.setItem(KEY, "{}");
}
