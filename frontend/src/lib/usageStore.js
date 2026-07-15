/*
  Usage store — a persisted (localStorage) log of every chat call, backend or Puter, with
  estimated cost. This is what makes "cost monitoring" for LLM usage automatic instead of
  manually typed in: every message sent through ChatPane appends one entry here, and both the
  ZivaBasa dashboard's usage summary and Cost Monitoring's auto-tracked llm_api_usage line read
  from the same aggregate, so they can't drift out of sync with each other.
*/
const KEY = "zivabasa-chat-usage";
const MAX_ENTRIES = 500; // cap growth — this is a running log, not permanent accounting

export function getUsageLog() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

// entry: { provider, model, inputTokens, outputTokens, costUsd }
export function logUsage(entry) {
  const log = getUsageLog();
  const next = [{ ...entry, timestamp: new Date().toISOString() }, ...log].slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearUsageLog() {
  localStorage.setItem(KEY, "[]");
}

function isThisMonth(isoTimestamp) {
  const d = new Date(isoTimestamp);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// Everything below defaults to "this calendar month" — matches the $/mo framing the rest of
// Cost Monitoring already uses, so the auto-tracked line item is comparable to the manual ones
// next to it instead of being a different unit (all-time vs. monthly).
export function usageSummary(monthOnly = true) {
  const log = getUsageLog().filter((e) => !monthOnly || isThisMonth(e.timestamp));
  const byProvider = {};
  let totalMessages = 0;
  let totalCostUsd = 0;

  for (const e of log) {
    totalMessages += 1;
    totalCostUsd += e.costUsd || 0;
    const key = e.provider;
    if (!byProvider[key]) byProvider[key] = { messages: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
    byProvider[key].messages += 1;
    byProvider[key].inputTokens += e.inputTokens || 0;
    byProvider[key].outputTokens += e.outputTokens || 0;
    byProvider[key].costUsd += e.costUsd || 0;
  }

  return { totalMessages, totalCostUsd, byProvider };
}
