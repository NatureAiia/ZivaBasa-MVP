import { useMemo } from "react";
import { metaFor } from "../../lib/fieldMeta";

/*
  Node-link view of the discovered causal DAG (backend/src/causal_xai.py's discover_dag, via
  GET /causal/{task}/dag) — the piece none of ShapLedger/ShapWaterfall/ShapTierTrace show, since
  those are all flat feature-attribution lists with no notion of causal structure between
  features. Layout is a simple longest-path layering (source features on the left, the
  prediction target on the right) rather than a force-directed layout: these graphs are small
  (under a dozen nodes, engineered-feature DAGs from a constraint-based search), so a
  deterministic layered layout reads more clearly than a physics simulation would, with no
  jitter between renders.
*/
const NODE_W = 160;
const NODE_H = 34;
const LAYER_GAP = 200;
const ROW_GAP = 50;
const PAD = 20;

function layerOf(nodes, edges) {
  const incoming = new Map(nodes.map((n) => [n, []]));
  edges.forEach(({ source, target }) => {
    if (incoming.has(target)) incoming.get(target).push(source);
  });
  const layers = new Map();
  const resolving = new Set();
  function resolve(n) {
    if (layers.has(n)) return layers.get(n);
    if (resolving.has(n)) return 0; // defensive cycle guard — PC's output shouldn't cycle
    resolving.add(n);
    const parents = incoming.get(n) || [];
    const l = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(resolve));
    layers.set(n, l);
    resolving.delete(n);
    return l;
  }
  nodes.forEach(resolve);
  return layers;
}

export default function CausalGraph({ nodes, edges, target, task }) {
  const layout = useMemo(() => {
    if (!nodes?.length) return null;
    const layers = layerOf(nodes, edges);
    const byLayer = new Map();
    nodes.forEach((n) => {
      const l = layers.get(n) ?? 0;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l).push(n);
    });
    const positions = new Map();
    let maxRows = 1;
    let maxLayer = 0;
    byLayer.forEach((ns, l) => {
      maxRows = Math.max(maxRows, ns.length);
      maxLayer = Math.max(maxLayer, l);
      ns.forEach((n, i) => positions.set(n, { x: PAD + l * LAYER_GAP, y: PAD + i * ROW_GAP }));
    });
    return {
      positions,
      width: PAD * 2 + maxLayer * LAYER_GAP + NODE_W,
      height: PAD * 2 + (maxRows - 1) * ROW_GAP + NODE_H,
    };
  }, [nodes, edges]);

  if (!layout) return null;
  const { positions, width, height } = layout;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface2/40 p-3">
        <svg width={width} height={height} style={{ minWidth: "100%" }}>
          <defs>
            <marker id="causal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="fill-ink-faint" />
            </marker>
          </defs>
          {edges.map(({ source, target: t }) => {
            const a = positions.get(source);
            const b = positions.get(t);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`${source}->${t}`}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none"
                className="stroke-teal/60"
                strokeWidth={1.5}
                markerEnd="url(#causal-arrow)"
              />
            );
          })}
          {nodes.map((n) => {
            const p = positions.get(n);
            if (!p) return null;
            const isTarget = n === target;
            const label = metaFor(n, task).label || n;
            const short = label.length > 22 ? `${label.slice(0, 20)}…` : label;
            return (
              <g key={n} transform={`translate(${p.x},${p.y})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  className={isTarget ? "fill-gold/15 stroke-gold" : "fill-surface stroke-border"}
                  strokeWidth={1.5}
                >
                  <title>{label}</title>
                </rect>
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 + 4}
                  textAnchor="middle"
                  className={`text-[10px] font-medium ${isTarget ? "fill-gold" : "fill-ink"}`}
                >
                  {short}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] text-ink-faint leading-relaxed flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-full border border-border bg-surface inline-block" /> Feature
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-full border border-gold bg-gold/15 inline-block" /> Prediction target
        </span>
        <span>Arrows point from cause to effect, per the discovered DAG.</span>
      </p>
    </div>
  );
}
