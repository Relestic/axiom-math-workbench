import { BookOpen, LibraryBig, Minus, Plus } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAppData } from "../../app/DataProvider";
import type { GraphNode } from "../../domain/types";
import { layoutGraph, LANE_HEADER_HEIGHT, type GraphLayout, type LayoutNode } from "./layoutGraph";
import "./constellation.css";

type Point = { x: number; y: number };
type Camera = Point & { zoom: number; base: number };
type Size = { width: number; height: number };
type CameraRequest = { id?: string; revision: number };

export function needsReview(node: GraphNode) {
  if (node.state === "needs_review") return true;
  if (["unpracticed", "locked", "locked_extension", "unlocked_not_started"].includes(node.state ?? "")) return false;
  return node.progress != null && node.progress < 50 && (node.progress > 0 || node.state === "practiced");
}

function fitCamera(layout: GraphLayout, size: Size, mini: boolean): Camera {
  const { x, y, width, height } = layout.bounds;
  const padding = mini ? 5 : Math.min(24, size.width * 0.045);
  const scale = Math.min(1.15, Math.max(1, size.width - 2 * padding) / Math.max(1, width),
    Math.max(1, size.height - 2 * padding) / Math.max(1, height));
  // Very large overviews need a wider base view than the normal reading view.
  const base = Math.min(1, scale / 0.4);
  return { zoom: scale / base, base, x: size.width / 2 - (x + width / 2) * scale,
    y: size.height / 2 - (y + height / 2) * scale };
}

function readingCamera(node: LayoutNode, size: Size): Camera {
  const zoom = Math.min(1.1, Math.max(0.4, (size.width - 28) / node.width));
  return { zoom, base: 1, x: size.width / 2 - (node.x + node.width / 2) * zoom,
    y: size.height / 2 - (node.y + node.height / 2) * zoom };
}

function zoomAt(view: Camera, factor: number, anchor: Point): Camera {
  const zoom = Math.max(0.4, Math.min(2, view.zoom * factor));
  const ratio = zoom / view.zoom;
  return { ...view, zoom, x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio };
}

/** Keep long edges in the 24px row / 40px column gutters, rounding each turn. */
function gutterPath(points: Point[]) {
  let path = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], turn = points[i], next = points[i + 1];
    const radius = Math.min(6, Math.hypot(turn.x-prev.x, turn.y-prev.y)/2,
      Math.hypot(next.x-turn.x, next.y-turn.y)/2);
    const beforeX = turn.x - Math.sign(turn.x - prev.x) * radius;
    const beforeY = turn.y - Math.sign(turn.y - prev.y) * radius;
    const afterX = turn.x + Math.sign(next.x - turn.x) * radius;
    const afterY = turn.y + Math.sign(next.y - turn.y) * radius;
    path += ` L${beforeX} ${beforeY} C${turn.x} ${turn.y}, ${turn.x} ${turn.y}, ${afterX} ${afterY}`;
  }
  const last = points[points.length - 1];
  return path + ` L${last.x} ${last.y}`;
}

function connection(from: LayoutNode, to: LayoutNode) {
  const fromMid = from.x + from.width / 2, toMid = to.x + to.width / 2;
  const bottom = from.y + from.height, gutterY = bottom + (to.x < from.x ? 13 : 8);
  if (from.y === to.y && (from.x > to.x || to.layer > from.layer + 1)) {
    return gutterPath([{x:fromMid, y:bottom}, {x:fromMid, y:gutterY}, {x:toMid, y:gutterY}, {x:toMid, y:bottom}]);
  }
  if (from.x > to.x || to.layer > from.layer + 1) {
    const right = from.x < to.x;
    const endX = right ? to.x : to.x + to.width, endY = to.y + to.height / 2;
    const gutterX = endX + (right ? -16 : 16);
    return gutterPath([{x:fromMid, y:bottom}, {x:fromMid, y:gutterY}, {x:gutterX, y:gutterY},
      {x:gutterX, y:endY}, {x:endX, y:endY}]);
  }
  if (from.x === to.x) {
    const self = from.id === to.id;
    if (self || Math.abs(from.y - to.y) > from.height * 2) {
      const x = from.x + from.width, start = from.y + from.height * (self ? 0.3 : 0.5);
      const end = to.y + to.height * (self ? 0.7 : 0.5);
      return gutterPath([{x, y:start}, {x:x + 12, y:start}, {x:x + 12, y:end}, {x, y:end}]);
    }
    const down = to.y > from.y;
    const start = from.y + (down ? from.height : 0), end = to.y + (down ? 0 : to.height);
    const x = from.x + from.width / 2, mid = (start + end) / 2;
    return `M${x} ${start} C${x} ${mid}, ${x} ${mid}, ${x} ${end}`;
  }
  const right = to.x > from.x;
  const x1 = from.x + (right ? from.width : 0), y1 = from.y + from.height / 2;
  const x2 = to.x + (right ? 0 : to.width), y2 = to.y + to.height / 2;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

export function Constellation({ layout: providedLayout, selected, onSelect, matches, reviewOnly = false,
  cameraRequest, mini = false }: {
  layout?: GraphLayout; selected?: string; onSelect?: (id: string) => void; matches?: ReadonlySet<string>;
  reviewOnly?: boolean; cameraRequest?: CameraRequest; mini?: boolean;
}) {
  const { data } = useAppData();
  const layout = useMemo(() => providedLayout ?? layoutGraph(
    data.graph.nodes.filter(n => !n.textbookId && !n.kind), data.graph.edges,
  ), [providedLayout, data.graph]);
  const positions = useMemo(() => new Map(layout.nodes.map(node => [node.id, node])), [layout]);
  const [hovered, setHovered] = useState<string>();
  const active = hovered && positions.has(hovered) ? hovered : selected;
  const neighbors = useMemo(() => {
    if (!active || !positions.has(active)) return null;
    const adjacent = new Set([active]);
    for (const [from, to, type] of layout.edges) {
      if (type !== "prerequisite") continue;
      if (from === active) adjacent.add(to);
      if (to === active) adjacent.add(from);
    }
    return adjacent;
  }, [active, layout, positions]);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1, base: 1 });
  const previous = useRef<{ layout: GraphLayout; size: Size; request?: number }>(undefined);
  const drag = useRef<{ pointer: number; origin: Point; pan: Point } | null>(null);
  const moved = useRef(false);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const scale = camera.base * camera.zoom;

  useLayoutEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () => {
      const {width, height} = element.getBoundingClientRect();
      setSize(old => old.width === width && old.height === height ? old : {width, height});
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    const last = previous.current;
    const requested = cameraRequest && last?.request !== cameraRequest.revision;
    const resized = !!last && size !== last.size;
    const changed = layout !== last?.layout;
    previous.current = {layout, size, request: cameraRequest?.revision};
    if (!requested && !changed && !resized) return;
    const target = requested ? cameraRequest.id : resized && !changed ? selected : undefined;
    const node = target && positions.get(target);
    setCamera(node ? readingCamera(node, size) : fitCamera(layout, size, mini));
  }, [size, layout, positions, cameraRequest, selected, mini]);

  useEffect(() => {
    const element = svg.current;
    if (!element || mini) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setCamera(view => zoomAt(view, Math.exp(-delta * 0.002), anchor));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [mini]);

  const style = {
    "--graph-title-size": Math.min(24, Math.max(16, 12 / scale)) + "px",
    "--graph-meta-size": Math.min(16, Math.max(11, 8 / scale)) + "px",
  } as CSSProperties;
  return <div className={"constellation graph-atlas" + (mini ? " constellation-mini" : "")} style={style}>
    <svg ref={svg} className="graph-viewport" data-graph-viewport="" data-zoom={camera.zoom}
      data-pan-x={camera.x} data-pan-y={camera.y} data-scale={scale} role={mini ? "img" : "group"}
      aria-label={mini ? "内置课程知识图谱预览" : "数学知识关系图，拖动平移，滚轮缩放，节点可用键盘选择"}
      onPointerDown={event => {
        if (mini || !event.isPrimary || event.button !== 0) return;
        moved.current = false;
        drag.current = { pointer: event.pointerId, origin: {x:event.clientX, y:event.clientY}, pan:camera };
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || event.pointerId !== current.pointer || !event.buttons) return;
        const dx = event.clientX - current.origin.x, dy = event.clientY - current.origin.y;
        if (!moved.current && Math.hypot(dx, dy) < 4) return;
        if (!moved.current) {
          moved.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setHovered(undefined);
        }
        setCamera(view => ({ ...view, x: current.pan.x + dx, y: current.pan.y + dy }));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onClickCapture={event => {
        if (moved.current) { event.stopPropagation(); moved.current = false; }
      }}>
      <defs>
        {["default", "active", "sequence", "implication"].map(name => <marker key={name} id={uid + "-" + name}
          viewBox="0 0 8 8" markerWidth="6" markerHeight="6" refX="7.5" refY="4" orient="auto">
          <path className={"graph-arrow graph-arrow-" + name} d="M0 0L8 4L0 8Z"/>
        </marker>)}
      </defs>
      <g data-graph-world="" transform={`translate(${camera.x} ${camera.y}) scale(${scale})`}>
        {layout.lanes.map(lane => <g key={lane.id} data-lane-id={lane.id} className="graph-lane">
          <rect className="graph-lane-frame" x={lane.x} y={lane.y} width={lane.width} height={lane.height} rx={14}/>
          <foreignObject x={lane.x} y={lane.y} width={lane.width} height={LANE_HEADER_HEIGHT}>
            <div className="graph-lane-heading" title={lane.title}>
              {lane.id === "builtin" ? <LibraryBig aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
              <span className="graph-lane-title">{lane.title}</span>
              <span className="graph-lane-count">{lane.nodeCount} 节点</span>
            </div>
          </foreignObject>
        </g>)}
        {layout.edges.map(([from, to, type]) => {
          const source = positions.get(from), target = positions.get(to);
          if (!source || !target) return null;
          const linked = type === "prerequisite" && (from === active || to === active);
          const variant = linked ? "active" : type === "prerequisite" ? "default" : type;
          return <path className={"graph-edge graph-edge-" + variant} key={JSON.stringify([from,to,type])}
            data-from={from} data-to={to} data-edge-type={type} d={connection(source, target)}
            opacity={neighbors && !linked ? 0.35 : 1}
            strokeDasharray={type === "sequence" ? "5 5" : type === "implication" ? "1 4" : undefined}
            markerEnd={`url(#${uid}-${variant})`}>
            <title>{type === "sequence" ? "页序参考" : type === "implication" ? "条件推导" : "前置关系"}</title>
          </path>;
        })}
        {layout.nodes.map(node => {
          const chosen = selected === node.id, match = !!matches?.has(node.id), review = needsReview(node);
          const dim = (neighbors && !neighbors.has(node.id)) || (reviewOnly && !review && node.id !== active)
            || (matches?.size && !match && !neighbors);
          const color = chosen ? " chosen" : node.id === active ? " hovered" : match ? " matched" : "";
          const score = node.state === "unpracticed" ? null : node.progress;
          const status = score == null ? (node.state === "unpracticed" ? "未练习" : "待评分") : `${score}%`;
          return <g key={node.id} data-node-id={node.id} data-review={review} data-match={match}
            className={"graph-node" + color} opacity={dim ? 0.35 : 1}
            role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? chosen : undefined} aria-label={`${node.name}，${status}`}
            onPointerEnter={() => { if (!mini && !drag.current) setHovered(node.id); }}
            onPointerLeave={() => { if (!mini) setHovered(undefined); }}
            onFocus={event => {
              if (!onSelect || !event.currentTarget.matches(":focus-visible")) return;
              setHovered(node.id);
              const left = camera.x + node.x * scale, top = camera.y + node.y * scale;
              if (left < 0 || top < 0 || left + node.width * scale > size.width || top + node.height * scale > size.height)
                setCamera(readingCamera(node, size));
            }}
            onBlur={() => setHovered(undefined)} onClick={() => onSelect?.(node.id)}
            onKeyDown={event => {
              if (onSelect && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault(); onSelect(node.id);
              }
            }}>
            <title>{node.name}</title>
            <rect className="graph-card-frame" x={node.x} y={node.y} width={node.width} height={node.height} rx={9}/>
            <foreignObject x={node.x} y={node.y} width={node.width} height={node.height}>
              <div className="graph-card-body">
                <strong className="graph-card-title" title={node.name}>{node.name}</strong>
                <div className="graph-card-meta">
                  {node.pageStart != null && <span className="graph-page">P.{node.pageStart}</span>}
                  {reviewOnly && review && <span className="graph-review">待复习</span>}
                  {score == null ? <span className="graph-status">{status}</span> : <span className="graph-mastery">
                    <span className="graph-meter" aria-hidden="true"><i style={{ width: score + "%" }}/></span>{status}
                  </span>}
                </div>
              </div>
            </foreignObject>
          </g>;
        })}
      </g>
    </svg>
    {!mini && <div className="graph-footer">
      <div className="graph-legend" aria-label="图例"><span><i/>前置关系</span>
        {layout.edges.some(([, , type]) => type === "sequence") && <span><i className="graph-dash"/>页序参考</span>}
        {layout.edges.some(([, , type]) => type === "implication") && <span><i className="graph-logic"/>条件推导</span>}
      </div>
      <div className="graph-zoom">
        <button type="button" aria-label="缩小地图" title="缩小地图" disabled={camera.zoom <= 0.4}
          onClick={() => setCamera(view => zoomAt(view, 1 / 1.25, {x:size.width/2, y:size.height/2}))}><Minus/></button>
        <output aria-label="地图缩放">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" aria-label="放大地图" title="放大地图" disabled={camera.zoom >= 2}
          onClick={() => setCamera(view => zoomAt(view, 1.25, {x:size.width/2, y:size.height/2}))}><Plus/></button>
      </div>
    </div>}
  </div>;
}
