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

export default function OrgChart({ nodes, onSelect, selectedId }) {
  const { positioned, childrenOf } = useMemo(() => layoutTree(nodes), [nodes]);

  if (nodes.length === 0) return null;

  const maxX = Math.max(...positioned.map((p) => p.x), 0) + NODE_W;
  const maxY = Math.max(...positioned.map((p) => p.y), 0) + NODE_H;

  return (
    <svg viewBox={`0 0 ${maxX + 20} ${maxY + 20}`} className="w-full" style={{ minHeight: Math.min(maxY + 20, 420) }}>
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
      {positioned.map((p) => (
        <g key={p.id} onClick={() => onSelect?.(p.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
          <rect
            x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={12}
            fill={selectedId === p.id ? "rgba(212,175,55,0.12)" : "rgb(var(--surface))"}
            stroke={selectedId === p.id ? "rgb(var(--gold))" : "rgb(var(--border))"}
            strokeWidth={selectedId === p.id ? 1.5 : 1}
          />
          <text x={p.x + 12} y={p.y + 24} fontSize={12} fontWeight={600} fill="rgb(var(--ink))">
            {p.title.length > 20 ? p.title.slice(0, 19) + "…" : p.title}
          </text>
          <text x={p.x + 12} y={p.y + 42} fontSize={10} fill="rgb(var(--ink-faint))">
            {p.department || "—"}
          </text>
          {p.targetRole && (
            <text x={p.x + 12} y={p.y + 56} fontSize={9} fill="rgb(var(--teal))">
              → {p.targetRole.length > 18 ? p.targetRole.slice(0, 17) + "…" : p.targetRole}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
