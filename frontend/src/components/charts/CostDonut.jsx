/*
  CostDonut — a ring chart showing each cost category's share of the grand total,
  with the total centered inside the ring. Built as plain SVG (no chart library)
  to match the rest of the app's hand-built visual language.
*/
export default function CostDonut({ segments, total, size = 168, thickness = 18 }) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  const hasData = total > 0;
  let cumulative = 0;

  const summary = hasData
    ? segments
        .filter((s) => s.value > 0)
        .map((s) => `${s.label}: ${Math.round((s.value / total) * 100)}%`)
        .join(", ")
    : "no cost data recorded";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`Monthly cost breakdown, total $${total.toLocaleString()}. ${summary}.`}
      >
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={thickness} className="text-border" stroke="currentColor" />
        {hasData &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const gap = circumference - dash;
              const offset = -cumulative * circumference;
              cumulative += fraction;
              return (
                <circle
                  key={s.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  className={s.colorClass}
                  stroke="currentColor"
                  style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
              );
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-mono text-2xl font-bold text-ink">
          {hasData ? `$${total.toLocaleString()}` : "$0"}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">per month</span>
      </div>
    </div>
  );
}
