import { useMemo, useState } from "react";

/*
  Single-series small-multiple: one metric's historical trajectory (solid) rolling into its
  LSTM-forecast continuation (dashed) — deliberately not overlaid with the other metrics on one
  axis, since automation risk / AI adoption / skill gap are different scales (see dataviz "one
  axis" rule: two measures of different scale get separate charts, not a dual y-axis).
*/
const WIDTH = 320;
const HEIGHT = 160;
const PAD = { top: 18, right: 14, bottom: 22, left: 32 };

export default function ForecastLineChart({ title, color, unit = "", history = [], forecast = [], confidenceLevel }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const points = useMemo(() => {
    const hist = history.map((p) => ({ ...p, kind: "history" }));
    const fc = forecast.map((p) => ({ ...p, kind: "forecast" }));
    return [...hist, ...fc].sort((a, b) => a.year - b.year);
  }, [history, forecast]);

  if (points.length < 2) {
    return <div className="text-xs text-ink-faint py-8 text-center">Not enough data</div>;
  }

  const hasBand = forecast.some((p) => p.lower != null && p.upper != null);

  const years = points.map((p) => p.year);
  const values = points.map((p) => p.value);
  const bandValues = hasBand ? forecast.flatMap((p) => [p.lower, p.upper]).filter((v) => v != null) : [];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const rawMin = Math.min(...values, ...bandValues);
  const rawMax = Math.max(...values, ...bandValues);
  const valuePad = (rawMax - rawMin) * 0.2 || Math.abs(rawMax) * 0.1 || 1;
  const minVal = rawMin - valuePad;
  const maxVal = rawMax + valuePad;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const xScale = (year) => PAD.left + ((year - minYear) / (maxYear - minYear || 1)) * innerW;
  const yScale = (value) => PAD.top + innerH - ((value - minVal) / (maxVal - minVal || 1)) * innerH;
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.year)} ${yScale(p.value)}`).join(" ");

  const lastHistoryIdx = points.reduce((acc, p, i) => (p.kind === "history" ? i : acc), 0);
  const historyPts = points.slice(0, lastHistoryIdx + 1);
  const forecastPts = points.slice(lastHistoryIdx);
  const lastPoint = points[points.length - 1];
  const gridValues = [minVal + (maxVal - minVal) * 0.2, (minVal + maxVal) / 2, maxVal - (maxVal - minVal) * 0.2];
  const hovered = hoverIdx != null ? points[hoverIdx] : null;

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xScale(p.year) - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs font-medium text-ink">{title}</span>
        <span className="text-[9px] text-ink-faint flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ background: color }} />
            Actual
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="10" height="2" className="shrink-0">
              <line x1="0" y1="1" x2="10" y2="1" stroke={color} strokeWidth="1.5" strokeDasharray="2,2" />
            </svg>
            Projected
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label={`${title} trend, ${minYear} to ${maxYear}`}
      >
        {gridValues.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={yScale(v)} y2={yScale(v)} stroke="rgb(var(--border))" strokeWidth="1" />
            <text x={PAD.left - 6} y={yScale(v) + 3} fontSize="8" textAnchor="end" fill="rgb(var(--ink-faint))">
              {v.toFixed(0)}
            </text>
          </g>
        ))}

        <path d={toPath(historyPts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={toPath(forecastPts)}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="4,3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={p.year}
            cx={xScale(p.year)}
            cy={yScale(p.value)}
            r={i === points.length - 1 ? 3 : 2}
            fill={p.kind === "forecast" ? "rgb(var(--surface))" : color}
            stroke={color}
            strokeWidth="1.5"
          />
        ))}

        {[points[0], points[lastHistoryIdx], lastPoint].map((p, i) => (
          <text key={i} x={xScale(p.year)} y={HEIGHT - PAD.bottom + 13} fontSize="8" textAnchor="middle" fill="rgb(var(--ink-faint))">
            {p.year}
          </text>
        ))}

        <text
          x={xScale(lastPoint.year)}
          y={Math.max(PAD.top - 4, yScale(lastPoint.value) - 8)}
          fontSize="9"
          fontWeight="600"
          textAnchor="end"
          fill="rgb(var(--ink))"
        >
          {lastPoint.value.toFixed(1)}
          {unit}
        </text>

        {hovered && (
          <>
            <line
              x1={xScale(hovered.year)}
              x2={xScale(hovered.year)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="rgb(var(--border))"
              strokeDasharray="2,2"
            />
            <circle cx={xScale(hovered.year)} cy={yScale(hovered.value)} r="4.5" fill={color} stroke="rgb(var(--surface))" strokeWidth="2" />
          </>
        )}
      </svg>

      <div className="text-[10px] text-ink-muted mt-1 h-4">
        {hovered && (
          <>
            <span className="font-medium text-ink">{hovered.year}</span>
            {" — "}
            {hovered.value.toFixed(2)}
            {unit} {hovered.kind === "forecast" ? "(projected)" : ""}
          </>
        )}
      </div>
    </div>
  );
}
