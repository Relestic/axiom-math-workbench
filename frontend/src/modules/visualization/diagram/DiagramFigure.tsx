import { useId, type ReactNode } from "react";
import { MathText } from "../../../components/Math";
import type { DiagramNode, DiagramScene } from "./schema";

type Pair = [number, number];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const colors = { primary: "var(--plot-purple)", teal: "var(--plot-teal)", amber: "var(--plot-amber)", rose: "var(--plot-rose)", muted: "var(--muted)" };
const left = 45, right = 555, top = 26, bottom = 283;

function annotation(x: number, y: number, text?: string, align: "left" | "center" | "right" = "left") {
  if (!text) return null;
  const width = Math.min(220, Math.max(28, Array.from(text).length * 15));
  const offset = align === "right" ? width : align === "center" ? width / 2 : 0;
  return <foreignObject x={clamp(x - offset, 0, 600 - width)} y={clamp(y, 0, 298)} width={width} height={34}>
    <div className="diagram-annotation" style={{textAlign: align}}><MathText>{text}</MathText></div>
  </foreignObject>;
}

function curvePath(points: Pair[], smooth?: boolean) {
  let path = "M " + points[0].join(" ");
  for (let i = 1; i < points.length; i++) {
    const [a,b] = points[i - 1], [c,d] = points[i];
    if (!smooth) { path += ` L ${c} ${d}`; continue; }
    const prev = points[Math.max(0, i - 2)], next = points[Math.min(points.length - 1, i + 1)];
    // Catmull–Rom tangents converted to cubic Bézier controls in screen coordinates.
    path += ` C ${a + (c - prev[0]) / 6} ${b + (d - prev[1]) / 6}, ${c - (next[0] - a) / 6} ${d - (next[1] - b) / 6}, ${c} ${d}`;
  }
  return path;
}

function gcd(a: number, b: number): number { return b === 0 ? Math.abs(a) : gcd(b, a % b); }

type Pattern = Extract<DiagramNode, {kind: "pattern"}>;
function pattern(node: Pattern, view: DiagramScene["viewBox"], X: (x: number) => number, Y: (y: number) => number) {
  const lo = clamp(Math.min(node.xMin, node.xMax), view.xMin, view.xMax);
  const hi = clamp(Math.max(node.xMin, node.xMax), view.xMin, view.xMax);
  const count = node.density ?? 16, low = node.yLow ?? 0, high = node.yHigh ?? 1;
  const base = Y(low), peak = Y(high);
  if (node.preset === "thomae_stems") {
    const stems: ReactNode[] = [];
    for (let q = 1; q <= count; q++) {
      const first = Math.ceil(lo * q), last = Math.floor(hi * q);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) continue;
      const stride = Math.max(1, Math.ceil((last - first + 1) / (count + 1)));
      for (let i = 0; i <= count && first + i * stride <= last; i++) {
        const p = first + i * stride;
        if (gcd(p, q) !== 1) continue;
        const x = X(p / q), y = Y(low * (1 - 1 / q) + high / q);
        stems.push(<g key={q + "/" + p}><line x1={x} x2={x} y1={base} y2={y} stroke="currentColor" opacity=".35"/>
          <circle cx={x} cy={y} r="2.4" fill="currentColor"/></g>);
      }
    }
    return stems;
  }
  const start = X(lo), width = (X(hi) - start) / count;
  return Array.from({length: count}, (_, i) => {
    const x = start + i * width;
    return node.preset === "step_bars"
      ? <rect key={i} x={x} width={width} y={Math.min(base, peak)} height={Math.abs(base - peak)}
          fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.2"/>
      : <g key={i} fill="currentColor"><circle cx={x} cy={peak} r="2.8"/>
          <circle cx={x + width / Math.SQRT2} cy={base} r="2.8"/></g>;
  });
}

export function DiagramFigure({scene}: {scene: DiagramScene}) {
  const uid = useId();
  const box = scene.viewBox, axes = scene.axes;
  const X = (x: number) => left + (clamp(x, box.xMin, box.xMax) - box.xMin) / (box.xMax - box.xMin) * (right - left);
  const Y = (y: number) => bottom - (clamp(y, box.yMin, box.yMax) - box.yMin) / (box.yMax - box.yMin) * (bottom - top);
  function draw(node: DiagramNode): ReactNode {
    switch (node.kind) {
      case "label": return annotation(X(node.x), Y(node.y) - 17, node.text);
      case "point": return <><circle cx={X(node.x)} cy={Y(node.y)} r="4.4" stroke="currentColor" strokeWidth="2"
        fill={node.hollow ? "var(--surface)" : "currentColor"}/>{annotation(X(node.x) + 7, Y(node.y) - 22, node.label)}</>;
      case "segment": {
        const [x,y] = node.from, [u,v] = node.to;
        return <><line x1={X(x)} y1={Y(y)} x2={X(u)} y2={Y(v)} stroke="currentColor" strokeWidth="2"
          strokeDasharray={node.dashed ? "6 4" : undefined} markerEnd={node.arrow ? `url(#${uid}-arrow)` : undefined}/>
          {annotation((X(x) + X(u)) / 2 + 5, (Y(y) + Y(v)) / 2 - 20, node.label)}</>;
      }
      case "curve": {
        const points = node.points.map(([x,y]): Pair => [X(x), Y(y)]);
        const [x,y] = points.at(-1)!;
        return <><path d={curvePath(points, node.smooth)} clipPath={`url(#${uid}-plot)`} fill="none" stroke="currentColor"
          strokeWidth="2.8" strokeDasharray={node.dashed ? "6 4" : undefined}/>{annotation(x, y - 20, node.label)}</>;
      }
      case "region": {
        const x = Math.min(X(node.xMin), X(node.xMax)), y = Math.min(Y(node.yMin), Y(node.yMax));
        return <><rect x={x} y={y} width={Math.abs(X(node.xMax) - X(node.xMin))} height={Math.abs(Y(node.yMax) - Y(node.yMin))}
          stroke="currentColor" strokeDasharray="4 3" fill="currentColor" fillOpacity=".12"/>{annotation(x + 5, y + 2, node.label)}</>;
      }
      case "pattern": return <>{pattern(node, box, X, Y)}{annotation(X(node.xMin), Y(node.yHigh ?? 1) - 21, node.label)}</>;
    }
  }
  return <figure className="diagram-figure">
    <h2><MathText>{scene.title}</MathText></h2>
    <svg viewBox="0 0 600 332" role="img" aria-labelledby={uid + "-title"} aria-describedby={uid + "-caption"}>
      <title id={uid + "-title"}>{scene.title}</title>
      <defs>
        <clipPath id={uid + "-plot"}><rect x={left} y={top} width={right-left} height={bottom-top}/></clipPath>
        <marker id={uid + "-arrow"} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" fill="context-stroke"/></marker>
      </defs>
      {axes?.show && <g color="var(--muted)">
        <g stroke="currentColor"><line x1={left} x2={right} y1={Y(0)} y2={Y(0)}/><line x1={X(0)} x2={X(0)} y1={top} y2={bottom}/></g>
        {annotation(right + 6, Y(0) - 10, axes.xLabel)}{annotation(X(0) + 5, top - 22, axes.yLabel)}
        {axes.ticks?.map((tick, i) => <g key={i}>{tick.axis === "x"
          ? <><path d={`M${X(tick.at)} ${Y(0)}v5`} stroke="currentColor"/>{annotation(X(tick.at), Y(0) + 6, tick.label, "center")}</>
          : <><path d={`M${X(0)} ${Y(tick.at)}h-5`} stroke="currentColor"/>{annotation(X(0) - 8, Y(tick.at) - 9, tick.label, "right")}</>}</g>)}
      </g>}
      {scene.nodes.map(node => <g key={node.id} data-node-id={node.id} color={colors[node.tone ?? "primary"]}>
        {(node.kind === "label" || node.label) && <title>{node.kind === "label" ? node.text : node.label}</title>}
        {draw(node)}
      </g>)}
    </svg>
    <figcaption id={uid + "-caption"}><MathText>{scene.caption}</MathText></figcaption>
  </figure>;
}
