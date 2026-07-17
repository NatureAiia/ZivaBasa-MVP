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

// Image generation (the generate_image chat tool) is priced separately from text — Gemini's
// image-capable model bills per output-image-token and is NOT covered by the same free tier as
// text chat, unlike the $0 rows above. ~1290 output tokens per 1024x1024 image at the
// documented $30/1M output-token rate for image tokens ≈ $0.039/image. Same honesty caveat as
// the table above: list price as of writing, not verified live, not an invoice — verify at
// https://ai.google.dev/pricing.
export const IMAGE_COST_USD = {
  gemini: { perImage: 0.039, note: "gemini-2.5-flash-image list price, ~1024x1024 — verify at ai.google.dev/pricing." },
};

export function estimateImageCostUsd(provider, count = 1) {
  const rate = IMAGE_COST_USD[provider];
  if (!rate) return 0;
  return rate.perImage * count;
}
