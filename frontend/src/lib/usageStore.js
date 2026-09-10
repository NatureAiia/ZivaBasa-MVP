/*
  Usage store — backed by Postgres via the backend's /usage-log routes
  (backend/api/routes/usage_log.py) instead of a direct `supabase.from("usage_log")` call. A
  log of every chat call, backend or Puter, with estimated cost — what makes "cost monitoring"
  for LLM usage automatic. Both the ZivaBasa dashboard's usage summary and Cost Monitoring's
  auto-tracked llm_api_usage line read from the same aggregate.
*/
import { request } from "./api";

export async function getUsageLog() {
  try {
    const rows = await request("/usage-log");
    return rows.map((r) => ({
      provider: r.provider,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      timestamp: r.created_at,
    }));
  } catch (e) {
    console.error("getUsageLog failed:", e.message);
    return [];
  }
}

// entry: { provider, model, inputTokens, outputTokens, costUsd }
export async function logUsage(entry) {
  await request("/usage-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: entry.provider,
      model: entry.model ?? null,
      input_tokens: entry.inputTokens ?? 0,
      output_tokens: entry.outputTokens ?? 0,
      cost_usd: entry.costUsd ?? 0,
    }),
  });
  return getUsageLog();
}

export async function clearUsageLog() {
  await request("/usage-log", { method: "DELETE" });
}

function isThisMonth(isoTimestamp) {
  const d = new Date(isoTimestamp);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

// Everything below defaults to "this calendar month" — matches the $/mo framing the rest of
// Cost Monitoring already uses.
export async function usageSummary(monthOnly = true) {
  const log = (await getUsageLog()).filter((e) => !monthOnly || isThisMonth(e.timestamp));
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
