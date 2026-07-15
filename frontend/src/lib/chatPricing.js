/*
  Chat pricing — $ per million tokens, used to estimate cost from the usage.input_tokens /
  usage.output_tokens the backend now returns with every /chat response.

  HONESTY NOTE: these are publicly-documented list prices as of when this was written, not
  verified against your actual invoice, and definitely not verified live (none of these
  providers' pricing pages are reachable from the sandbox this was built in). Rate-card
  pricing changes over time and can differ from what you're actually billed (enterprise
  agreements, regional pricing, promotional credits). Treat every number below as "close
  enough for a rough running estimate," not an accounting-grade figure — same spirit as the
  rest of Cost Monitoring's "no fabricated totals" stance, just for the one line item that's
  genuinely metered instead of a business estimate.

  NVIDIA NIM / Groq / Gemini are $0 here because all three currently offer meaningful free
  tiers for the model classes this app defaults to — that's $0 *while you're within the free
  quota*, not "free forever, unconditionally." If you're on a paid plan or blow through a free
  quota, update these rates.
*/
export const PRICING_PER_M_TOKENS = {
  anthropic: { input: 3, output: 15, note: "Claude Sonnet-class list price — verify against your plan." },
  nvidia: { input: 0, output: 0, note: "Free tier as of writing — verify current quota at build.nvidia.com." },
  groq: { input: 0, output: 0, note: "Free developer tier as of writing — verify at console.groq.com." },
  gemini: { input: 0, output: 0, note: "Free tier as of writing — verify current limits at ai.google.dev/pricing." },
};

export function estimateCostUsd(provider, inputTokens = 0, outputTokens = 0) {
  const rate = PRICING_PER_M_TOKENS[provider];
  if (!rate) return 0;
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}
