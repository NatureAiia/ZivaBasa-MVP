/*
  Adaptive-precision formatters — carried over from the v1 fix. A flat toFixed(1) silently
  rounds tiny probabilities (e.g. 0.0000426%) down to "0.0%", which reads as "the model says
  zero" when it actually said something extremely small but nonzero. These keep real precision
  visible at the extremes while staying compact for ordinary mid-range values.
*/

export function formatPercent(p) {
  const pct = p * 100;
  if (pct === 0) return "0%";
  const abspct = Math.abs(pct);
  if (abspct < 0.001) return pct.toExponential(2) + "%";
  if (abspct < 1) return pct.toFixed(4) + "%";
  if (abspct < 10) return pct.toFixed(2) + "%";
  return pct.toFixed(1) + "%";
}

export function formatRaw(v) {
  if (v === 0) return "0.0000";
  const absv = Math.abs(v);
  if (absv < 0.0001) return v.toExponential(2);
  return v.toFixed(4);
}

// A model this confident, trained on a few thousand uncalibrated proxy rows, deserves a
// caveat rather than being read as certainty.
export function isOverconfident(probability) {
  return probability < 0.001 || probability > 0.999;
}
