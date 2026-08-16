/*
  CostBarChart — simple vertical bar comparison of category totals, built with
  flexbox + divs (not a chart library) to match the app's hand-built visual
  language and inherit theme colors automatically.
*/
export default function CostBarChart({ bars, height = 168 }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const summary = bars.map((b) => `${b.label}: $${b.value.toLocaleString()}`).join(", ");

  return (
    <div
      className="flex items-end justify-between gap-3"
      style={{ height }}
      role="img"
      aria-label={`Cost comparison by category. ${summary}.`}
    >
      {bars.map((b) => {
        const pct = Math.max(2, (b.value / max) * 100); // min 2% so zero-value bars still show a sliver
        return (
          <div key={b.key} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="font-mono text-[11px] font-semibold text-ink mb-1 truncate w-full text-center">
              {b.value ? `$${b.value.toLocaleString()}` : "—"}
            </span>
            <div className="w-full flex items-end justify-center" style={{ height: "calc(100% - 46px)" }}>
              <div
                className={`w-full max-w-[34px] rounded-t-md ${b.colorClass}`}
                style={{
                  height: `${pct}%`,
                  backgroundColor: "currentColor",
                  opacity: b.value ? 1 : 0.25,
                  transition: "height 0.6s ease",
                }}
              />
            </div>
            <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold mt-2 text-center leading-tight truncate w-full">
              {b.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
