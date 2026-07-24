import { useMemo } from "react";

const NODE_W = 168;
const NODE_H = 64;
const H_GAP = 24;
const V_GAP = 56;

/*
  Plain-JS tree layout (no d3/charting dependency — this app doesn't have one, and pulling one
  in for a single tree diagram isn't worth the bundle weight). Standard "leaf-counting" layout:
  a subtree's width is the sum of its children's widths (leaves count as 1 unit), position is
  assigned left-to-right by walking the tree once.
*/
function layoutTree(nodes) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const childrenOf = {};
  nodes.forEach((n) => {
    const key = byId[n.parentId] ? n.parentId : "__root__";
    (childrenOf[key] ??= []).push(n);
  });
  const roots = childrenOf["__root__"] || [];

  const positioned = [];
  let cursor = 0;

  function place(node, depth) {
    const kids = childrenOf[node.id] || [];
    if (kids.length === 0) {
      const x = cursor * (NODE_W + H_GAP);
      cursor += 1;
      positioned.push({ ...node, x, y: depth * (NODE_H + V_GAP) });
      return x;
    }
    const childXs = kids.map((k) => place(k, depth + 1));
    const x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    positioned.push({ ...node, x, y: depth * (NODE_H + V_GAP) });
    return x;
  }

  roots.forEach((r) => place(r, 0));
  return { positioned, childrenOf, byId };
}

// Skills-gap heatmap color scale — teal (no gap) through gold to red (large gap), matching the
// palette already used for Badge tones elsewhere in this app. Interpolates in RGB space between
// three stops rather than a library scale, since this is the only place in the app that needs one.
const HEATMAP_STOPS = [
  { at: 0, rgb: [47, 191, 159] },  // teal — matches this app's --teal
  { at: 0.5, rgb: [232, 131, 77] }, // gold — matches --gold under .zivabasa-scope
  { at: 1, rgb: [229, 72, 77] },    // red — matches this app's --red
];

function heatmapRgb(ratio) {
  const r = Math.max(0, Math.min(1, ratio));
  let lo = HEATMAP_STOPS[0], hi = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];
  for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
    if (r >= HEATMAP_STOPS[i].at && r <= HEATMAP_STOPS[i + 1].at) {
      lo = HEATMAP_STOPS[i];
      hi = HEATMAP_STOPS[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = (r - lo.at) / span;
  return lo.rgb.map((c, i) => Math.round(c + (hi.rgb[i] - c) * t));
}

function heatmapColor(ratio, alpha = 1) {
  const [r, g, b] = heatmapRgb(ratio);
  return `rgba(${r},${g},${b},${alpha})`;
}

/*
  heatmapValues: optional { [nodeId]: 0-1 skills-gap ratio | null }. When provided (and
  showHeatmap is true), each node's fill is colored by its gap ratio instead of the default
  neutral surface — nodes with no target role set (ratio === null/undefined) render with a
  dashed border and no fill tint, since there's no gap to show for a role with no destination.

  Scope note: this overlays skills-gap only, not "automation exposure + skills-gap" as
  originally floated — this org builder's node shape (title/department/headcount/currentSkills/
  targetSkills) has no automation-risk-model input fields (avg_salary_usd,
  ai_tool_maturity_score, task_repetition_level, etc.), so fabricating an automation-exposure
  color per role from data that doesn't exist here would be exactly the kind of overclaiming
  this project has disciplined itself against. Skills-gap is the one per-node metric this data
  model actually supports today (via skillMatchClient.matchScore, already computed elsewhere in
  MyOrganizationTab for the selected node).
*/
export default function OrgChart({ nodes, onSelect, selectedId, heatmapValues, showHeatmap }) {
  const { positioned, childrenOf } = useMemo(() => layoutTree(nodes), [nodes]);

  if (nodes.length === 0) return null;

  const maxX = Math.max(...positioned.map((p) => p.x), 0) + NODE_W;
  const maxY = Math.max(...positioned.map((p) => p.y), 0) + NODE_H;

  return (
    <svg
      viewBox={`0 0 ${maxX + 20} ${maxY + 20}`}
      width={maxX + 20}
      height={maxY + 20}
      className="shrink-0"
      style={{ minWidth: Math.min(maxX + 20, 320) }}
      role="group"
      aria-label={`Organization chart, ${nodes.length} role${nodes.length === 1 ? "" : "s"}${showHeatmap ? ", colored by skills-gap size" : ""}`}
    >
      {/* Connector lines, drawn first so nodes sit on top */}
      {positioned.map((p) =>
        (childrenOf[p.id] || []).map((childRaw) => {
          const child = positioned.find((c) => c.id === childRaw.id);
          if (!child) return null;
          const x1 = p.x + NODE_W / 2, y1 = p.y + NODE_H;
          const x2 = child.x + NODE_W / 2, y2 = child.y;
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={`${p.id}-${child.id}`}
              d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
              fill="none"
              stroke="rgb(var(--border))"
              strokeWidth={1.5}
            />
          );
        })
      )}
      {positioned.map((p) => {
        const gapRatio = showHeatmap ? heatmapValues?.[p.id] : null;
        const hasGapData = gapRatio != null;
        const gapLabel = hasGapData ? `, ${Math.round(gapRatio * 100)}% skills gap to ${p.targetRole}` : "";
        return (
        <g
          key={p.id}
          onClick={() => onSelect?.(p.id)}
          onKeyDown={(e) => {
            if (onSelect && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onSelect(p.id);
            }
          }}
          style={{ cursor: onSelect ? "pointer" : "default" }}
          tabIndex={onSelect ? 0 : undefined}
          role={onSelect ? "button" : undefined}
          aria-label={onSelect ? `${p.title}, ${p.department || "no department"}${gapLabel}` : undefined}
          className={onSelect ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold" : undefined}
        >
          <rect
            x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={12}
            fill={
              hasGapData
                ? heatmapColor(gapRatio, 0.15) // tint, not a solid fill — text stays legible
                : selectedId === p.id ? "rgb(var(--gold) / 0.12)" : "rgb(var(--surface))"
            }
            stroke={
              hasGapData
                ? heatmapColor(gapRatio)
                : selectedId === p.id ? "rgb(var(--gold))" : "rgb(var(--border))"
            }
            strokeWidth={selectedId === p.id ? 1.5 : 1}
            strokeDasharray={showHeatmap && !hasGapData ? "4,3" : undefined}
          />
          <text x={p.x + 12} y={p.y + 24} fontSize={12} fontWeight={600} fill="rgb(var(--ink))">
            {p.title.length > 20 ? p.title.slice(0, 19) + "…" : p.title}
          </text>
          <text x={p.x + 12} y={p.y + 42} fontSize={10} fill="rgb(var(--ink-faint))">
            {p.department || "—"}
          </text>
          {p.targetRole && (
            <text
              x={p.x + 12}
              y={p.y + 56}
              fontSize={9}
              fill={hasGapData ? heatmapColor(gapRatio) : "rgb(var(--teal))"}
            >
              → {p.targetRole.length > 18 ? p.targetRole.slice(0, 17) + "…" : p.targetRole}
              {hasGapData ? ` (${Math.round(gapRatio * 100)}% gap)` : ""}
            </text>
          )}
        </g>
        );
      })}
    </svg>
  );
}
