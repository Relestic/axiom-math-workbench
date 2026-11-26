import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Download,
  Filter,
  Flame,
  Focus,
  Grid2X2,
  Info,
  Layers,
  ListFilter,
  Network,
  PlayCircle,
  RotateCcw,
  Sparkles,
  Waypoints,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { useAppData } from "../../app/DataProvider";
import type { GraphNode } from "../../domain/types";

export function Constellation({
  mini = false,
  onSelect,
  selected = "uniform",
  onlyUnlocked = false,
  showExamples = true,
  highlightGaps = true,
  relationsOnly = false,
}: {
  mini?: boolean;
  onSelect?: (id: string) => void;
  selected?: string;
  onlyUnlocked?: boolean;
  showExamples?: boolean;
  highlightGaps?: boolean;
  relationsOnly?: boolean;
}) {
  const { data } = useAppData();
  const nodes = data.graph.nodes;
  const edges = data.graph.edges;
  const nodeById = (id: string): GraphNode =>
    nodes.find((node) => node.id === id) || nodes[0];
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    ),
    moved = useRef(false);
  const uid = useId().replaceAll(":", "");
  const visible = nodes.filter(
    (n) =>
      (!onlyUnlocked || n.kind !== "extension") &&
      (showExamples || n.kind !== "case"),
  );
  const ids = new Set(visible.map((n) => n.id));
  const visibleEdges = edges.filter(
    ([a, b, k]) =>
      ids.has(a) &&
      ids.has(b) &&
      (!relationsOnly || k === "implication" || k === "case"),
  );
  const active = nodes.find((n) => n.id === selected);
  const pick = (n: GraphNode) => {
    onSelect?.(n.id);
  };
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  return (
    <div className={`constellation ${mini ? "constellation-mini" : ""}`}>
      {!mini && (
        <div className="constellation-top">
          <div className="map-legend">
            <span>
              <i style={{ background: "#dddfff" }} />
              当前学习
            </span>
            <span>
              <i style={{ background: "#80a1fa" }} />
              知识点
            </span>
            <span>
              <i style={{ background: "#ffcc70" }} />
              反例
            </span>
            <span>
              <i className="outline" />
              正式版拓展
            </span>
          </div>
          <div className="map-tools">
            <button
              title="放大地图"
              aria-label="放大地图"
              onClick={() => setZoom((z) => Math.min(2.1, z + 0.2))}
            >
              <ZoomIn size={15} />
            </button>
            <button
              title="缩小地图"
              aria-label="缩小地图"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
            >
              <ZoomOut size={15} />
            </button>
            <button title="复位地图" aria-label="复位地图" onClick={reset}>
              <Focus size={15} />
            </button>
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={mini ? "80 100 680 420" : "0 0 900 660"}
        role="img"
        aria-label="数学知识关系图，节点支持点击与键盘选择"
        onPointerDown={(e) => {
          if (mini || (e.target as Element).closest(".map-node")) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          moved.current = false;
          svgRef.current?.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const w = svgRef.current?.getBoundingClientRect().width || 900;
          const dx = ((e.clientX - drag.current.x) * 900) / w,
            dy = ((e.clientY - drag.current.y) * 900) / w;
          if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true;
          setPan({ x: drag.current.px + dx, y: drag.current.py + dy });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <radialGradient id={`${uid}-nebula`}>
            <stop offset="0" stopColor="#5145f5" stopOpacity=".13" />
            <stop offset="1" stopColor="#5145f5" stopOpacity=".01" />
          </radialGradient>
          <marker
            id={`${uid}-arrow`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M0 0L8 4L0 8" fill="#808cb8" />
          </marker>
        </defs>
        <g
          transform={`translate(${450 + pan.x} ${330 + pan.y}) scale(${zoom}) translate(-450 -330)`}
        >
          <ellipse
            cx="430"
            cy="310"
            rx="260"
            ry="300"
            fill={`url(#${uid}-nebula)`}
          />
          <ellipse
            cx="195"
            cy="380"
            rx="190"
            ry="210"
            fill="#14b6bc"
            opacity=".035"
          />
          <ellipse
            cx="692"
            cy="351"
            rx="159"
            ry="285"
            fill="#ed4e99"
            opacity=".035"
          />
          {[90, 190, 290, 390, 490, 590].map((y, i) => (
            <path
              key={y}
              d={`M10 ${y} C250 ${y - 65} 540 ${y + 75} 880 ${y - 8}`}
              fill="none"
              stroke="#fff"
              opacity=".055"
              strokeWidth="1"
            />
          ))}
          {[150, 380, 650, 810].map((x) => (
            <path
              key={x}
              d={`M${x} 20 Q${x + 80} 300 ${x + 30} 650`}
              fill="none"
              stroke="#fff"
              opacity=".055"
            />
          ))}
          {Array.from({ length: 48 }, (_, i) => (
            <circle
              key={`s${i}`}
              cx={35 + ((i * 83) % 815)}
              cy={45 + ((i * 67) % 560)}
              r={i % 7 === 0 ? 1.4 : 0.8}
              fill="#bdc4dd"
              opacity={0.13 + (i % 3) * 0.07}
            />
          ))}
          {visibleEdges.map(([a, b, k]) => {
            const n1 = nodeById(a),
              n2 = nodeById(b);
            const isActive = active && (active.id === a || active.id === b);
            return (
              <path
                key={JSON.stringify([a,b,k])} data-edge-type={k} data-from={a} data-to={b}
                d={`M${n1.x} ${n1.y} Q${(n1.x + n2.x) / 2 + (n1.y - n2.y) * 0.15} ${(n1.y + n2.y) / 2 - 28} ${n2.x} ${n2.y}`}
                fill="none"
                stroke={
                  k === "case" ? "#f45394" : isActive ? "#a8a0ff" : n1.color
                }
                strokeWidth={isActive ? 1.8 : 1.1}
                opacity={k === "extension" ? 0.18 : isActive ? 0.8 : 0.32}
                strokeDasharray={
                  k === "sequence" ? "4 5" : k === "case" ? "6 5" : k === "extension" ? "3 5" : undefined
                }
                markerEnd={!mini ? `url(#${uid}-arrow)` : undefined}
              />
            );
          })}
          {visible.map((n, i) => {
            const isActive = n.id === selected;
            const gap =
              highlightGaps &&
              n.progress != null && n.progress > 0 &&
              n.progress < 50 &&
              n.kind !== "case";
            return (
              <g
                key={n.id} data-node-id={n.id}
                className={`map-node ${n.kind === "extension" ? "is-extension" : ""}`}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : -1}
                aria-label={`${n.name}，${n.description}`}
                onClick={() => pick(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(n.id);
                  }
                }}
              >
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isActive ? 42 : n.size ? 29 : 21}
                  fill={n.color}
                  opacity={isActive ? 0.13 : 0.045}
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isActive ? 31 : n.size ? 21 : 14}
                  fill="none"
                  stroke={n.color}
                  opacity={isActive ? 0.6 : 0.13}
                />
                {isActive && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r="24"
                    fill="none"
                    stroke="#cac6ff"
                    opacity=".65"
                  />
                )}
                {n.size &&
                  [0, 1, 2].map((j) => (
                    <circle
                      key={j}
                      cx={n.x + Math.cos(i * 1.3 + j * 2.1) * 36}
                      cy={n.y + Math.sin(i * 1.3 + j * 2.1) * 36}
                      r={j === 0 ? 3 : 2.1}
                      fill={n.color}
                      opacity=".7"
                    />
                  ))}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.size || 5.5}
                  fill={gap ? "#fa5c9c" : n.color}
                />
                <circle cx={n.x} cy={n.y} r="19" fill="transparent" />
                <text
                  x={n.x + (n.id === "uniform" ? 35 : 0)}
                  y={
                    n.y +
                    (n.id === "uniform"
                      ? 5
                      : n.id === "derivative"
                        ? -24
                        : n.id === "reciprocal"
                          ? 30
                          : n.id === "lipschitz"
                            ? 23
                            : n.id === "continuity"
                              ? -22
                              : 28)
                  }
                  textAnchor={n.id === "uniform" ? "start" : "middle"}
                  fill={
                    isActive
                      ? "#fff"
                      : n.kind === "extension"
                        ? "#69718e"
                        : n.kind === "case"
                          ? "#f5ca6d"
                          : "#a2abc2"
                  }
                  fontSize={mini ? 13 : 12.5}
                  fontWeight={isActive ? "600" : "400"}
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {!mini && (
        <div className="constellation-bottom">
          <span>
            <Info size={13} /> 拖动平移 · 点击节点查看关系 · 教材页序用虚线标记
          </span>
          <span>
            {visible.length} 节点 · {visibleEdges.length} 条关系
          </span>
        </div>
      )}
    </div>
  );
}
