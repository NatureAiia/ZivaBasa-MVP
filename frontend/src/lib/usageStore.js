/*
  Usage store — now backed by Postgres (usage_log table) instead of localStorage. A log of
  every chat call, backend or Puter, with estimated cost — what makes "cost monitoring" for
  LLM usage automatic. Both the ZivaBasa dashboard's usage summary and Cost Monitoring's
  auto-tracked llm_api_usage line read from the same aggregate.
*/
import { supabase } from "./supabaseClient";

const MAX_ENTRIES = 500; // matches old client-side cap; kept as a query limit here

export async function getUsageLog() {
  const { data, error } = await supabase
    .from("usage_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_ENTRIES);
  if (error) {
    console.error("getUsageLog failed:", error.message);
    return [];
  }
  return data.map((r) => ({
    provider: r.provider,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    timestamp: r.created_at,
  }));
}

// entry: { provider, model, inputTokens, outputTokens, costUsd }
export async function logUsage(entry) {
  const { error } = await supabase.from("usage_log").insert({
    provider: entry.provider,
    model: entry.model ?? null,
    input_tokens: entry.inputTokens ?? 0,
    output_tokens: entry.outputTokens ?? 0,
    cost_usd: entry.costUsd ?? 0,
  });
  if (error) throw error;
  return getUsageLog();
}

export async function clearUsageLog() {
  const { error } = await supabase.from("usage_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
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
