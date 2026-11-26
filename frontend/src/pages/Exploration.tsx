import { useEffect, useRef, useState } from "react";
import { MathText } from "../components/Math";
import type { WorkspaceEndpoint } from "../app/workspaceEndpoints";
import { useWorkspaceEndpoint } from "../app/useWorkspaceEndpoint";
import {
  ArrowRight,
  BookmarkPlus,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  Grid2X2,
  Lightbulb,
  Link2,
  Maximize2,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "./exploration.css";
import {
  clamp,
  fmt,
  fact,
  poly,
  f,
  localError,
  safeDelta,
  type Topic,
  type FunctionId,
  type Config,
} from "../lib/explorationMath";

type Observation = { id: number; text: string; time: string };
type Props = {
  onBoardActions: NonNullable<WorkspaceEndpoint["command"]>;
  onNavigate: (page: string) => void;
  onSaveNote: (text: string) => void;
  notify: (text: string) => void;
};
const initial: Config = {
  topic: "continuity",
  dimension: 2,
  fn: "square",
  epsilon: 0.08,
  delta: 0.06,
  x0: 0.6,
  h: 0.3,
  n: 8,
  angle: 45,
  elevation: 28,
  band: true,
  neighborhood: true,
  danger: true,
  grid: false,
  sampling: "left",
  zoom: 1,
};
const names: Record<FunctionId, string> = {
  square: "x²",
  sqrt: "√x",
  inverse: "1/x",
  oscillation: "sin(1/x)",
  absolute: "|x|",
};
const labels: Record<Topic, string> = {
  continuity: "连续与一致连续",
  derivative: "导数与微分",
  taylor: "Taylor 近似",
  integral: "Riemann 定积分",
};
function read<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function readConfig(): Config {
  const stored = read<Partial<Config>>("axiom-exploration", {});
  const v =
    stored &&
    Object.keys(labels).includes(stored.topic || "") &&
    Object.keys(names).includes(stored.fn || "")
      ? stored
      : {};
  let config: Config = { ...initial, ...v };
  const requested = localStorage.getItem("axiom-explore-request");
  if (requested) {
    const topics: Record<string, Topic> = {
      continuous: "continuity",
      uniform: "continuity",
      derivative: "derivative",
      "mean-value": "derivative",
      taylor: "taylor",
      primitive: "integral",
      riemann: "integral",
      integral: "integral",
    };
    config = {
      ...initial,
      topic: topics[requested] || "continuity",
      n: requested === "taylor" ? 3 : 8,
    };
  }
  config.dimension = config.dimension === 3 ? 3 : 2;
  config.epsilon = clamp(Number(config.epsilon) || 0.08, 0.01, 0.2);
  config.delta = clamp(Number(config.delta) || 0.06, 0.001, 0.2);
  config.x0 = clamp(
    Number.isFinite(config.x0) ? config.x0 : 0.6,
    config.topic === "derivative" || config.topic === "taylor" ? -0.8 : 0.03,
    config.dimension === 3 ? 0.9 : config.topic === "continuity" ? 0.98 : 0.8,
  );
  config.n = Math.round(
    clamp(
      Number(config.n) || 8,
      config.topic === "integral" ? 4 : 1,
      config.topic === "taylor" ? 8 : 80,
    ),
  );
  return config;
}
function Slider({
  label,
  value,
  min,
  max,
  step = 0.001,
  tone = "",
  onChange,
  suffix = "",
  digits = 3,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  tone?: string;
  onChange: (n: number) => void;
  suffix?: string;
  digits?: number;
}) {
  return (
    <label className={`ex-slider ${tone}`}>
      <span>
        {label}
        <b>
          {value.toFixed(digits)}
          {suffix}
        </b>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>
        <span>{min}</span>
        <span>{max}</span>
      </small>
    </label>
  );
}
function Toggle({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="ex-toggle-line"
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={`ex-toggle ${checked ? "on" : ""}`} />
    </button>
  );
}

function CurvePlot({ c, setX }: { c: Config; setX: (x: number) => void }) {
  const w = 790,
    h = 390,
    l = 55,
    r = 745,
    top = 28,
    bottom = 342;
  const derivative = c.topic === "derivative",
    taylor = c.topic === "taylor",
    integral = c.topic === "integral";
  const xmin = derivative || taylor ? -1 : 0,
    xmax = derivative || taylor ? 1.2 : 1;
  const ymin = taylor
    ? 0
    : c.fn === "oscillation" && !derivative && !integral
      ? -1.3
      : 0;
  const ymax = taylor
    ? 3.5
    : c.fn === "inverse" && !derivative && !integral
      ? Math.max(4, 1 / c.x0 + c.epsilon * 6)
      : c.fn === "oscillation" && !derivative && !integral
        ? 1.3
        : 1.35;
  const sx = (x: number) => l + ((x - xmin) / (xmax - xmin)) * (r - l),
    sy = (y: number) => bottom - ((y - ymin) / (ymax - ymin)) * (bottom - top);
  const fn = (x: number) =>
    taylor ? Math.exp(x) : integral ? x * x : f(c.fn, x);
  const points = Array.from({ length: 700 }, (_, i) => {
    const x = xmin + ((xmax - xmin) * i) / 699;
    return [x, fn(x)] as const;
  });
  const path = points
    .filter(
      ([x, y]) =>
        Number.isFinite(y) &&
        (!(c.fn === "oscillation" || c.fn === "inverse") ||
          x >= 0.015 ||
          derivative ||
          integral ||
          taylor),
    )
    .map(
      ([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`,
    )
    .join(" ");
  const y0 = fn(c.x0),
    lo = Math.max(0, c.x0 - c.delta),
    hi = Math.min(1, c.x0 + c.delta);
  const h1 = c.h,
    slope = (fn(c.x0 + h1) - y0) / h1,
    tangent = c.fn === "absolute" ? Math.sign(c.x0) : 2 * c.x0;
  const updateFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const plottedX =
      xmin +
      ((((e.clientX - rect.left) / rect.width) * w - l) / (r - l)) *
        (xmax - xmin);
    const x = c.x0 + (plottedX - c.x0) / c.zoom;
    setX(
      clamp(
        x,
        derivative || taylor ? -0.8 : 0.03,
        derivative || taylor ? 0.8 : 0.98,
      ),
    );
  };
  return (
    <svg
      className="ex-plot"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={
        integral ? "函数 x 平方的 Riemann 矩形和" : "函数与可调参数的数学图像"
      }
      onPointerDown={(e) => {
        if (!integral) {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e);
        }
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1 && !integral) updateFromPointer(e);
      }}
    >
      <defs>
        <clipPath id="ex-clip">
          <rect x={l} y={top} width={r - l} height={bottom - top} />
        </clipPath>
        <marker
          id="ex-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0 0L6 3L0 6" fill="var(--plot-axis)" />
        </marker>
      </defs>
      <rect width={w} height={h} fill="var(--plot-bg)" />
      {c.grid &&
        Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <line
              x1={l + (i * (r - l)) / 10}
              y1={top}
              x2={l + (i * (r - l)) / 10}
              y2={bottom}
              stroke="var(--plot-grid)"
            />
            <line
              x1={l}
              y1={top + (i * (bottom - top)) / 10}
              x2={r}
              y2={top + (i * (bottom - top)) / 10}
              stroke="var(--plot-grid)"
            />
          </g>
        ))}
      <g clipPath="url(#ex-clip)">
        <g
          transform={`translate(${sx(c.x0)} ${sy(y0)}) scale(${c.zoom}) translate(${-sx(c.x0)} ${-sy(y0)})`}
        >
          {c.topic === "continuity" && (
            <>
              {c.band && (
                <>
                  <rect
                    x={l}
                    y={sy(y0 + c.epsilon)}
                    width={r - l}
                    height={sy(y0 - c.epsilon) - sy(y0 + c.epsilon)}
                    fill="var(--plot-purple)"
                    fillOpacity=".08"
                  />
                  <line
                    x1={l}
                    x2={r}
                    y1={sy(y0 + c.epsilon)}
                    y2={sy(y0 + c.epsilon)}
                    stroke="var(--plot-purple)"
                    strokeDasharray="5 5"
                  />
                  <line
                    x1={l}
                    x2={r}
                    y1={sy(y0 - c.epsilon)}
                    y2={sy(y0 - c.epsilon)}
                    stroke="var(--plot-purple)"
                    strokeDasharray="5 5"
                  />
                </>
              )}
              {c.neighborhood && (
                <>
                  <rect
                    x={sx(lo)}
                    y={top}
                    width={sx(hi) - sx(lo)}
                    height={bottom - top}
                    fill="var(--plot-amber)"
                    fillOpacity=".10"
                  />
                  <line
                    x1={sx(lo)}
                    x2={sx(lo)}
                    y1={top}
                    y2={bottom}
                    stroke="var(--plot-amber)"
                    strokeDasharray="5 5"
                  />
                  <line
                    x1={sx(hi)}
                    x2={sx(hi)}
                    y1={top}
                    y2={bottom}
                    stroke="var(--plot-amber)"
                    strokeDasharray="5 5"
                  />
                </>
              )}
            </>
          )}
          {integral &&
            Array.from({ length: c.n }, (_, i) => {
              const x = i / c.n,
                sample =
                  (i +
                    (c.sampling === "left"
                      ? 0
                      : c.sampling === "right"
                        ? 1
                        : 0.5)) /
                  c.n;
              return (
                <rect
                  key={i}
                  x={sx(x)}
                  y={sy(sample * sample)}
                  width={(r - l) / c.n}
                  height={bottom - sy(sample * sample)}
                  fill="var(--plot-purple)"
                  fillOpacity=".14"
                  stroke="var(--plot-purple)"
                  strokeWidth=".8"
                />
              );
            })}
          <path
            d={path}
            fill="none"
            stroke="var(--plot-purple)"
            strokeWidth="2.6"
          />
          {taylor && (
            <path
              d={points
                .map(([x], i) => `${i ? "L" : "M"}${sx(x)},${sy(poly(x, c.n))}`)
                .join(" ")}
              fill="none"
              stroke="var(--plot-teal)"
              strokeWidth="2.3"
              strokeDasharray="7 4"
            />
          )}
          {derivative && (
            <>
              <line
                x1={sx(xmin)}
                y1={sy(y0 + slope * (xmin - c.x0))}
                x2={sx(xmax)}
                y2={sy(y0 + slope * (xmax - c.x0))}
                stroke="var(--plot-amber)"
                strokeWidth="2"
              />
              <circle
                cx={sx(c.x0 + h1)}
                cy={sy(fn(c.x0 + h1))}
                r="5.5"
                fill="var(--plot-amber)"
                stroke="white"
                strokeWidth="2"
              />
              {(c.fn !== "absolute" || c.x0 !== 0) && (
                <line
                  x1={sx(xmin)}
                  y1={sy(y0 + tangent * (xmin - c.x0))}
                  x2={sx(xmax)}
                  y2={sy(y0 + tangent * (xmax - c.x0))}
                  stroke="var(--plot-teal)"
                  strokeWidth="1.8"
                  strokeDasharray="6 4"
                />
              )}
              {c.fn === "absolute" && c.x0 === 0 && (
                <line
                  x1={sx(-c.h)}
                  y1={sy(c.h)}
                  x2={sx(0)}
                  y2={sy(0)}
                  stroke="var(--plot-rose)"
                  strokeWidth="4"
                />
              )}
            </>
          )}
          {!integral && (
            <circle
              cx={sx(c.x0)}
              cy={sy(y0)}
              r="5.5"
              fill="var(--plot-purple)"
              stroke="white"
              strokeWidth="2"
            />
          )}
          {c.topic === "continuity" &&
            c.danger &&
            [lo, hi].map((x, i) => (
              <circle
                key={i}
                cx={sx(x)}
                cy={sy(fn(x))}
                r="9"
                fill="none"
                stroke={
                  localError(c) < c.epsilon
                    ? "var(--plot-amber)"
                    : "var(--plot-rose)"
                }
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            ))}
        </g>
      </g>
      <line
        x1={l}
        y1={sy(0)}
        x2={r + 15}
        y2={sy(0)}
        stroke="var(--plot-axis)"
        strokeWidth="1.4"
        markerEnd="url(#ex-arrow)"
      />
      <line
        x1={sx(0)}
        y1={bottom}
        x2={sx(0)}
        y2={top - 10}
        stroke="var(--plot-axis)"
        strokeWidth="1.4"
        markerEnd="url(#ex-arrow)"
      />
      <g fill="var(--muted)" fontSize="11">
        <text x={r + 22} y={sy(0) + 5}>
          x
        </text>
        <text x={sx(0) - 10} y={top - 12}>
          y
        </text>
        <text x={sx(0) - 15} y={sy(0) + 15}>
          0
        </text>
        <text x={sx(1)} y={bottom + 18}>
          1
        </text>
      </g>
      {c.topic === "continuity" && (
        <>
          <text
            x={l + 12}
            y={clamp(sy(y0 + c.epsilon) + 19, top + 20, bottom - 10)}
            fill="var(--plot-purple)"
            fontSize="11"
          >
            ε = {fmt(c.epsilon)} 水平带
          </text>
          <text
            x={clamp(sx(lo) + 8, l + 5, r - 130)}
            y={top + 18}
            fill="var(--plot-amber)"
            fontSize="11"
          >
            δ = {fmt(c.delta)} 邻域
          </text>
          <text
            x={sx(c.x0)}
            y={bottom + 34}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontSize="11"
          >
            x₀ = {fmt(c.x0)}
          </text>
        </>
      )}
      <text x={r - 135} y={top + 40} fill="var(--plot-purple)" fontSize="13">
        {taylor
          ? "f(x) = eˣ"
          : integral
            ? "f(x) = x²"
            : `f(x) = ${names[c.fn]}`}
      </text>
      {taylor && (
        <text x={r - 135} y={top + 63} fill="var(--plot-teal)" fontSize="12">
          P{c.n}(x)　Taylor 多项式
        </text>
      )}
      {derivative && (
        <text x={l + 15} y={top + 25} fill="var(--plot-amber)" fontSize="12">
          橙色：割线　绿色：切线
        </text>
      )}
    </svg>
  );
}

function SurfacePlot({ c }: { c: Config }) {
  const a = (c.angle * Math.PI) / 180,
    tilt = (c.elevation * Math.PI) / 180;
  const p = (x: number, y: number, z: number) => {
    const xr = x * Math.cos(a) - y * Math.sin(a),
      yr = x * Math.sin(a) + y * Math.cos(a);
    return [
      395 + xr * 220,
      292 + yr * 125 * Math.sin(tilt) - z * 200 * Math.cos(tilt),
    ];
  };
  const line = (points: number[][]) =>
    points
      .map((v, i) => `${i ? "L" : "M"}${p(v[0], v[1], v[2]).join(",")}`)
      .join(" ");
  const circle = (cx: number, cy: number, z: number, r: number) =>
    line(
      Array.from({ length: 97 }, (_, i) => {
        const theta = (i / 96) * Math.PI * 2;
        return [cx + Math.cos(theta) * r, cy + Math.sin(theta) * r, z];
      }),
    ) + "Z";
  const p0 = p(c.x0, -0.35, 0),
    value = c.x0 ** 2 + 0.35 ** 2,
    up = p(c.x0, -0.35, value),
    lowSlab = Math.max(0, value - c.epsilon),
    highSlab = value + c.epsilon;
  return (
    <svg
      className="ex-plot"
      viewBox="0 0 790 390"
      role="img"
      aria-label="向上开口的抛物面 z 等于 x 平方加 y 平方，展示 epsilon 水平夹层和 delta 圆盘"
    >
      <rect width="790" height="390" fill="var(--plot-bg)" />
      <path
        d={
          line([
            [-1.15, -1.15, 0],
            [1.15, -1.15, 0],
            [1.15, 1.15, 0],
            [-1.15, 1.15, 0],
          ]) + "Z"
        }
        fill="var(--surface-muted)"
        stroke="var(--border-strong)"
      />
      {Array.from({ length: 9 }, (_, i) => {
        const v = -1 + i / 4;
        return (
          <g key={i} stroke="var(--plot-grid)" strokeWidth=".7">
            <path
              d={line([
                [-1, v, 0],
                [1, v, 0],
              ])}
            />
            <path
              d={line([
                [v, -1, 0],
                [v, 1, 0],
              ])}
            />
          </g>
        );
      })}
      {c.band && (
        <g
          fill="var(--plot-purple)"
          fillOpacity=".06"
          stroke="var(--plot-purple)"
          strokeDasharray="5 4"
        >
          <path d={circle(0, 0, lowSlab, 1.03)} />
          <path d={circle(0, 0, highSlab, 1.03)} />
        </g>
      )}
      {Array.from({ length: 10 }, (_, i) => {
        const r = (i + 1) / 10;
        return (
          <path
            key={i}
            d={circle(0, 0, r * r, r)}
            fill="none"
            stroke="var(--plot-purple)"
            strokeWidth="1.1"
          />
        );
      })}
      {Array.from({ length: 16 }, (_, i) => {
        const theta = (i * Math.PI) / 8;
        return (
          <path
            key={i}
            d={line(
              Array.from({ length: 31 }, (_, j) => {
                const r = j / 30;
                return [Math.cos(theta) * r, Math.sin(theta) * r, r * r];
              }),
            )}
            fill="none"
            stroke="var(--plot-purple)"
            strokeWidth=".9"
          />
        );
      })}
      {c.neighborhood && (
        <path
          d={circle(c.x0, -0.35, 0, c.delta)}
          fill="var(--plot-amber)"
          fillOpacity=".22"
          stroke="var(--plot-amber)"
          strokeWidth="1.7"
        />
      )}
      <path
        d={line([
          [c.x0, -0.35, 0],
          [c.x0, -0.35, value],
        ])}
        stroke="var(--plot-purple)"
        strokeDasharray="4 4"
      />
      <circle cx={p0[0]} cy={p0[1]} r="3.5" fill="var(--plot-amber)" />
      <circle
        cx={up[0]}
        cy={up[1]}
        r="5"
        fill="var(--plot-purple)"
        stroke="white"
        strokeWidth="1.5"
      />
      <g fontSize="12">
        <text x={up[0] + 12} y={up[1] - 8} fill="var(--plot-purple)">
          f(P₀)
        </text>
        <text x={p0[0] + 10} y={p0[1] + 20} fill="var(--plot-amber)">
          P₀ · δ 圆盘
        </text>
        <text x="590" y="44" fill="var(--plot-purple)">
          z = x² + y²
        </text>
        <text x="38" y="35" fill="var(--muted)">
          单位圆盘上的曲面 · 拓展演示
        </text>
        <text x="38" y="57" fill="var(--muted)">
          横向：δ 邻域　竖向：ε 夹层
        </text>
        <text x="38" y="366" fill="var(--muted)">
          有限网格用于展示；条件由解析公式核对
        </text>
      </g>
      <path
        d={line([
          [0, 0, 0],
          [0, 0, 1.25],
        ])}
        stroke="var(--plot-axis)"
      />
      <text x={p(0, 0, 1.25)[0] + 7} y={p(0, 0, 1.25)[1]} fill="var(--muted)">
        z
      </text>
    </svg>
  );
}

export default function Exploration({ onNavigate, onSaveNote, notify, onBoardActions }: Props) {
  const [c, setC] = useState<Config>(readConfig);
  useWorkspaceEndpoint("explore", JSON.stringify(c), {
    query: () => ({ function_scene: {
      mode: c.topic,
      active_expression: c.dimension === 3 ? "x² + y²" : c.topic === "taylor" ? "exp(x)" : names[c.fn],
      controls: {},
    } }),
    command: onBoardActions,
  });
  const [history, setHistory] = useState<Config[]>([]);
  const [note, setNote] = useState("");
  const [observations, setObservations] = useState<Observation[]>(() =>
    read("axiom-observations", []),
  );
  const [expanded, setExpanded] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    localStorage.removeItem("axiom-explore-request");
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("axiom-exploration", JSON.stringify(c));
      localStorage.setItem("axiom-observations", JSON.stringify(observations));
    } catch {
      /* Browser storage may be unavailable. */
    }
  }, [c, observations]);
  const update = (patch: Partial<Config>) => {
    setHistory((v) => [...v.slice(-29), c]);
    setC((v) => {
      const next = { ...v, ...patch };
      next.x0 = clamp(
        next.x0,
        next.topic === "derivative" || next.topic === "taylor" ? -0.8 : 0.03,
        next.dimension === 3 ? 0.9 : next.topic === "continuity" ? 0.98 : 0.8,
      );
      next.n = Math.round(
        clamp(
          next.n,
          next.topic === "integral" ? 4 : 1,
          next.topic === "taylor" ? 8 : 80,
        ),
      );
      return next;
    });
  };
  const changeTopic = (topic: Topic) =>
    update({
      topic,
      dimension: 2,
      fn: "square",
      x0: 0.6,
      n: topic === "taylor" ? 3 : 8,
      zoom: 1,
    });
  const changeDimension = (dimension: 2 | 3) =>
    update({
      dimension,
      topic: "continuity",
      x0: clamp(c.x0, 0.03, 0.9),
      zoom: 1,
    });
  const undo = () => {
    if (!history.length) {
      notify("还没有可以撤销的参数修改");
      return;
    }
    setC(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    notify("已恢复上一次图像配置");
  };
  const maxError = localError(c),
    maxDelta = safeDelta(c),
    safe = maxError < c.epsilon;
  const saveObservation = () => {
    const content =
      note.trim() ||
      (c.topic === "continuity"
        ? `${c.dimension}D · ${c.dimension === 3 ? "x² + y²" : names[c.fn]}，ε=${fmt(c.epsilon)}，δ=${fmt(c.delta)}，x₀=${fmt(c.x0)}。闭邻域误差上界 ${fmt(maxError)}，${safe ? "满足当前精度要求" : "需要缩小邻域"}。`
        : c.topic === "integral"
          ? `分成 ${c.n} 段，采用${c.sampling === "left" ? "左端点" : c.sampling === "right" ? "右端点" : "中点"}求和，观察 Riemann 和向 1/3 靠近。`
          : `${labels[c.topic]}：${c.topic === "derivative" ? `函数 ${names[c.fn]}，h=${fmt(c.h)}` : `eˣ 的 ${c.n} 阶近似`}，基准点 x₀=${fmt(c.x0)}。`);
    setObservations((v) =>
      [
        {
          id: Date.now(),
          text: content,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        ...v,
      ].slice(0, 30),
    );
    onSaveNote(content);
    setNote("");
    notify("观察已保存到我的笔记");
  };
  const sum = Array.from(
    { length: c.n },
    (_, i) =>
      ((i + (c.sampling === "left" ? 0 : c.sampling === "right" ? 1 : 0.5)) /
        c.n) **
        2 /
      c.n,
  ).reduce((a, b) => a + b, 0);
  const derivativeValue = (f(c.fn, c.x0 + c.h) - f(c.fn, c.x0)) / c.h;
  const proofCards =
    c.topic === "continuity"
      ? [
          [
            "量词顺序",
            "先给定 ε，再选择 δ；一致连续要求 δ 对所有基准点都适用。",
            "∀ ε > 0　∃ δ > 0　∀ x, y",
          ],
          [
            "估计",
            c.dimension === 3
              ? "单位圆盘上 |‖P‖²−‖Q‖²| ≤ 2‖P−Q‖，因此 δ=ε/2 可以统一控制。"
              : c.fn === "inverse"
                ? "在 [a,1]（a>0）上，|1/x−1/y|≤|x−y|/a²；靠近 0 时不能沿用同一个正下界。"
                : c.fn === "oscillation"
                  ? "在 [a,1]（a>0）上，导数绝对值不超过 1/a²；整个 (0,1] 上则不一致连续。"
                  : c.fn === "sqrt"
                    ? "|√x − √y| ≤ √|x − y|，选 δ = ε² 即可统一控制。"
                    : "在 [0,1] 上，|x² − y²| = |x + y| |x − y| ≤ 2 |x − y|。",
            c.fn === "sqrt" && c.dimension === 2
              ? "δ = ε²"
              : (c.fn === "inverse" || c.fn === "oscillation") &&
                  c.dimension === 2
                ? "限制在 [a,1] 后可取 δ = εa²"
                : "δ = ε / 2",
          ],
          [
            "不等式",
            "图中误差上界由支持函数的解析极值计算。它检查当前闭邻域，不是全区间的证明。",
            `当前误差上界 ${fmt(maxError)}`,
          ],
          [
            "辅助函数",
            "用连续模描述距离不超过 δ 时函数值的最大变化，理解统一控制。",
            "ω(δ) = sup |f(x) − f(y)|",
          ],
          [
            "数列构造",
            "对于 1/x 在 (0,1] 上，选 xₙ = 1/n，yₙ = 1/(n+1)，距离趋零而函数值差恒为 1。",
            "反例：连续不一定一致连续",
          ],
          [
            "分割方法",
            "闭区间上的连续函数可通过紧致性建立统一控制，再用于可积性证明。",
            "连续 → 一致连续 → 可积",
          ],
        ]
      : c.topic === "integral"
        ? [
            [
              "分割",
              "把 [0,1] 分成 n 个小区间，观察最大区间长度随 n 增大而趋零。",
              `网格宽度 = 1/${c.n}`,
            ],
            [
              "标记点",
              "每个子区间可选择不同标记点，左、右、中点只是三种特定选择。",
              "ξᵢ ∈ [xᵢ₋₁, xᵢ]",
            ],
            [
              "上下和",
              "x² 在 [0,1] 上单调递增，因此左右端点分别给出上下和。",
              "Uₙ − Lₙ = 1/n",
            ],
            [
              "可积判据",
              "上下和差可任意小，因此 x² 在 [0,1] 上 Riemann 可积。",
              "∀ ε > 0，取 n > 1/ε",
            ],
            [
              "完整计算",
              "应用微积分基本定理，以 x³/3 为原函数，求出积分的准确值。",
              "∫₀¹ x² dx = 1/3",
            ],
            [
              "条件检查",
              "定积分与面积直觉相关，但有界函数不一定可积。可用上下和进一步检验。",
              "有界 ⇏ Riemann 可积",
            ],
          ]
        : c.topic === "derivative"
          ? [
              [
                "差商",
                "h 不能直接取 0。导数是差商在 h 趋于 0 时的极限。",
                "[f(x₀+h) − f(x₀)] / h",
              ],
              [
                "代数化简",
                "对 x²，差商等于 2x₀+h。因此 h 趋于 0 时导数为 2x₀。",
                "f′(x₀) = 2x₀",
              ],
              [
                "线性近似",
                "f(x₀+h) = f(x₀) + 2x₀h + h²，余项相对于 h 趋零。",
                "h² / h → 0",
              ],
              [
                "左右极限",
                "|x| 在 0 的右差商为 1，左差商为 −1，因此不可导。",
                "连续 ⇏ 可导",
              ],
              [
                "中值定理",
                "当闭区间连续、内部可导时，割线斜率会等于某点的导数。",
                "Lagrange 中值定理",
              ],
              [
                "验证边界",
                "图上看起来平滑不等于可导，应回到差商极限核验。",
                "图像观察 → 定义证明",
              ],
            ]
          : [
              [
                "有限阶近似",
                "以 0 为展开中心，用指数函数前 n 阶导数构造多项式。",
                "Pₙ(x) = Σ xᵏ / k!",
              ],
              [
                "余项",
                "在 |x|≤1 时，Lagrange 余项的绝对值不超过 e |x|ⁿ⁺¹/(n+1)!。",
                "|Rₙ(x)| ≤ e |x|ⁿ⁺¹/(n+1)!",
              ],
              [
                "前置条件",
                "指数函数具有所需阶数的连续导数，满足本次 Taylor 公式条件。",
                "eˣ 的各阶导数仍为 eˣ",
              ],
              [
                "误差比较",
                "比较实际误差与理论上界：上界可以宽松，但必须覆盖实际误差。",
                "实际误差 ≤ 理论上界",
              ],
              [
                "局部范围",
                "提高阶数与靠近展开中心都可能改善近似，具体由余项控制。",
                "展开中心 x = 0",
              ],
              [
                "课程边界",
                "这里展示有限阶 Taylor 公式；无穷级数的收敛另需论证。",
                "有限阶公式 ≠ 无穷级数",
              ],
            ];
  const title =
    c.topic === "continuity"
      ? c.dimension === 3
        ? "ε 夹层与 δ 圆盘 · 二元连续性"
        : "图像探索 · δ 到底依赖谁？"
      : c.topic === "derivative"
        ? "图像探索 · 从割线走向切线"
        : c.topic === "integral"
          ? "图像探索 · 从分割走向定积分"
          : "图像探索 · 近似能有多准确？";
  return (
    <div className={`explore-page ${c.dimension === 3 ? "is-3d" : ""}`}>
      <div className="ex-topline">
        <span className="badge">书桌黑板</span>
        <span className="muted">图像探索 · 从观察走向证明</span>
        <button className="btn" disabled={!history.length} onClick={undo}>
          <Undo2 size={14} /> 撤销改动
        </button>
        <button className="btn primary" onClick={saveObservation}>
          <BookmarkPlus size={15} />
          保存我的观察
        </button>
      </div>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            拖动参数观察经典示例。在右侧请 Hiyori 改图时，将打开自由函数工作区。
          </p>
        </div>
      </div>
      <div className="ex-topic-tabs" role="tablist" aria-label="探索主题">
        {Object.entries(labels).map(([id, label]) => (
          <button
            role="tab"
            aria-selected={c.topic === id}
            className={c.topic === id ? "active" : ""}
            key={id}
            onClick={() => changeTopic(id as Topic)}
          >
            {label}
          </button>
        ))}
        <span>MVP · 连续性至定积分</span>
      </div>
      <div className="ex-workspace">
        <aside className="card ex-controls">
          <div className="ex-card-heading">
            <h3>
              <SlidersHorizontal size={16} />
              参数
            </h3>
            <button className="ex-text-btn" onClick={() => update(initial)}>
              <RotateCcw size={12} />
              重置
            </button>
          </div>
          {c.topic === "continuity" && (
            <div className="ex-dimension">
              <div>
                <Box size={14} />
                <strong>显示维度</strong>
                <small>{c.dimension === 3 ? "拓展内容" : "推荐 2D"}</small>
              </div>
              <div className="ex-segment">
                <button
                  className={c.dimension === 2 ? "active" : ""}
                  onClick={() => changeDimension(2)}
                >
                  <Grid2X2 size={13} />
                  平面 2D
                </button>
                <button
                  className={c.dimension === 3 ? "active" : ""}
                  onClick={() => changeDimension(3)}
                >
                  <Box size={13} />
                  空间 3D
                </button>
              </div>
              <p>
                {c.dimension === 3
                  ? "二元函数为拓展演示，不计入 MVP 必修进度。"
                  : "一元函数用平面图像展示；三维视图可探索多元函数。"}
              </p>
            </div>
          )}
          <label className="ex-field-label">函数 / 知识点</label>
          {c.topic === "continuity" && c.dimension === 2 ? (
            <div className="ex-function-list">
              {(
                ["square", "sqrt", "inverse", "oscillation"] as FunctionId[]
              ).map((fn) => (
                <button
                  key={fn}
                  className={c.fn === fn ? "selected" : ""}
                  onClick={() => update({ fn, zoom: 1 })}
                >
                  f(x) = {names[fn]}
                  {c.fn === fn ? (
                    <Check size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ))}
            </div>
          ) : c.topic === "derivative" ? (
            <div className="ex-function-list">
              {(["square", "absolute"] as FunctionId[]).map((fn) => (
                <button
                  key={fn}
                  className={c.fn === fn ? "selected" : ""}
                  onClick={() =>
                    update({ fn, x0: fn === "absolute" ? 0 : 0.6 })
                  }
                >
                  f(x) = {names[fn]}
                  {c.fn === fn ? (
                    <Check size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="ex-fixed-function">
              {c.dimension === 3
                ? "f(x,y) = x² + y²"
                : c.topic === "taylor"
                  ? "f(x) = eˣ，展开中心 0"
                  : "f(x) = x²，区间 [0,1]"}
              <Check size={14} />
            </div>
          )}
          <div className="ex-sliders">
            {c.topic === "continuity" ? (
              <>
                <Slider
                  label={
                    c.dimension === 3 ? "ε（夹层厚度参数）" : "ε（输出精度）"
                  }
                  value={c.epsilon}
                  min={0.01}
                  max={0.2}
                  onChange={(epsilon) => update({ epsilon })}
                />
                <Slider
                  label={c.dimension === 3 ? "δ（圆盘半径）" : "δ（输入容差）"}
                  value={c.delta}
                  min={0.001}
                  max={0.2}
                  tone="amber"
                  onChange={(delta) => update({ delta })}
                />
                <Slider
                  label="x₀（基准点）"
                  value={c.x0}
                  min={0.03}
                  max={c.dimension === 3 ? 0.9 : 0.98}
                  tone="neutral"
                  onChange={(x0) => update({ x0 })}
                />
              </>
            ) : c.topic === "derivative" ? (
              <>
                <Slider
                  label="h（割线步长）"
                  value={c.h}
                  min={0.001}
                  max={0.4}
                  tone="amber"
                  onChange={(h) => update({ h })}
                />
                <Slider
                  label="x₀（基准点）"
                  value={c.x0}
                  min={-0.8}
                  max={0.8}
                  tone="neutral"
                  onChange={(x0) => update({ x0 })}
                />
              </>
            ) : (
              <>
                <Slider
                  label={
                    c.topic === "taylor" ? "n（多项式阶数）" : "n（分割数量）"
                  }
                  value={c.n}
                  min={c.topic === "taylor" ? 1 : 4}
                  max={c.topic === "taylor" ? 8 : 80}
                  step={1}
                  digits={0}
                  onChange={(n) => update({ n })}
                />
                {c.topic === "taylor" ? (
                  <Slider
                    label="x₀（误差观测点）"
                    value={c.x0}
                    min={-0.8}
                    max={0.8}
                    tone="neutral"
                    onChange={(x0) => update({ x0 })}
                  />
                ) : (
                  <label className="ex-field-label">
                    标记点选择
                    <select
                      value={c.sampling}
                      onChange={(e) =>
                        update({
                          sampling: e.target.value as Config["sampling"],
                        })
                      }
                    >
                      <option value="left">左端点</option>
                      <option value="midpoint">中点</option>
                      <option value="right">右端点</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
          {c.dimension === 3 && (
            <div className="ex-view-controls">
              <label className="ex-field-label">视角</label>
              <Slider
                label="方位角"
                value={c.angle}
                min={0}
                max={180}
                step={1}
                digits={0}
                suffix="°"
                tone="neutral"
                onChange={(angle) => update({ angle })}
              />
              <Slider
                label="俯仰角"
                value={c.elevation}
                min={10}
                max={80}
                step={1}
                digits={0}
                suffix="°"
                tone="neutral"
                onChange={(elevation) => update({ elevation })}
              />
            </div>
          )}
          <div className="ex-display">
            <label className="ex-field-label">显示</label>
            {c.topic === "continuity" && (
              <>
                <Toggle
                  label={c.dimension === 3 ? "ε 水平夹层" : "ε 水平带"}
                  checked={c.band}
                  onClick={() => update({ band: !c.band })}
                />
                <Toggle
                  label={c.dimension === 3 ? "δ 地面圆盘" : "δ 垂直邻域"}
                  checked={c.neighborhood}
                  onClick={() => update({ neighborhood: !c.neighborhood })}
                />
                {c.dimension === 2 && (
                  <Toggle
                    label="标出边界位置"
                    checked={c.danger}
                    onClick={() => update({ danger: !c.danger })}
                  />
                )}
              </>
            )}
            {c.dimension === 2 && (
              <Toggle
                label="坐标网格"
                checked={c.grid}
                onClick={() => update({ grid: !c.grid })}
              />
            )}
          </div>
          <button
            className="btn ex-full-width"
            onClick={() => onNavigate("textbook")}
          >
            <Link2 size={14} />
            查看相关定理
          </button>
        </aside>
        <div
          className={`card ex-chart-card ${expanded ? "ex-expanded" : ""}`}
          ref={chartRef}
        >
          <div className="ex-card-heading">
            <div>
              <h3>
                <MathText>{c.topic === "continuity"
                  ? c.dimension === 3
                    ? "z = x² + y² 在单位圆盘上 · ε 夹层与 δ 圆盘"
                    : "ε 水平带与 δ 垂直邻域的交截"
                  : c.topic === "derivative"
                    ? "差商与导数 · 让 h 逐渐趋近于零"
                    : c.topic === "integral"
                      ? "Riemann 和 · 不同标记点的比较"
                      : "Taylor 多项式与目标函数的误差"}</MathText>
                <span className="ex-small-badge">{c.dimension}D</span>
              </h3>
              <p>
                <MathText>{c.topic === "continuity"
                  ? `当前 ε = ${fmt(c.epsilon)}，δ = ${fmt(c.delta)}，x₀ = ${fmt(c.x0)}${c.dimension === 3 ? "，y₀ = −0.350" : ""}`
                  : c.topic === "derivative"
                    ? `当前 h = ${fmt(c.h)}，基准点 x₀ = ${fmt(c.x0)}`
                    : c.topic === "integral"
                      ? `区间 [0,1]，分割数 n = ${c.n}`
                      : `当前阶数 n = ${c.n}，观测点 x₀ = ${fmt(c.x0)}`}</MathText>
              </p>
            </div>
            <div className="ex-chart-actions">
              {c.topic === "continuity" && (
                <button
                  className="btn"
                  onClick={() => changeDimension(c.dimension === 2 ? 3 : 2)}
                >
                  <Box size={13} />
                  {c.dimension === 2 ? "切三维" : "切二维"}
                </button>
              )}
              {c.dimension === 2 && (
                <>
                  <button
                    className="btn"
                    aria-label="放大图像"
                    title="放大图像"
                    onClick={() => update({ zoom: clamp(c.zoom + 0.25, 1, 2) })}
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    className="btn"
                    aria-label="缩小图像"
                    title="缩小图像"
                    onClick={() => update({ zoom: clamp(c.zoom - 0.25, 1, 2) })}
                  >
                    <ZoomOut size={14} />
                  </button>
                </>
              )}
              <button
                className="btn"
                aria-label={expanded ? "退出大图" : "查看大图"}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <X size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>
          {c.dimension === 3 ? (
            <SurfacePlot c={c} />
          ) : (
            <CurvePlot c={c} setX={(x0) => update({ x0 })} />
          )}
          <div className="ex-metrics">
            {c.topic === "continuity" ? (
              <>
                <Metric label="当前 ε" value={fmt(c.epsilon)} tone="purple" />
                <Metric label="当前 δ" value={fmt(c.delta)} tone="orange" />
                <Metric label="闭邻域误差上界" value={fmt(maxError)} />
                <Metric
                  label="本基准点的临界 δ"
                  value={fmt(maxDelta)}
                  tone="teal"
                />
                <span className={`ex-verdict ${safe ? "valid" : "invalid"}`}>
                  {safe ? <CheckCircle2 size={15} /> : <Eye size={15} />}
                  {safe ? "当前邻域有效" : "请缩小 δ"}
                </span>
              </>
            ) : c.topic === "derivative" ? (
              <>
                <Metric label="当前 h" value={fmt(c.h)} tone="orange" />
                <Metric label="当前差商" value={fmt(derivativeValue)} />
                <Metric
                  label="基准点导数"
                  value={
                    c.fn === "absolute" && c.x0 === 0
                      ? "不存在"
                      : fmt(c.fn === "absolute" ? Math.sign(c.x0) : 2 * c.x0)
                  }
                  tone="teal"
                />
              </>
            ) : c.topic === "integral" ? (
              <>
                <Metric label="分割数" value={String(c.n)} tone="purple" />
                <Metric label="Riemann 和" value={fmt(sum, 5)} />
                <Metric label="准确积分值" value="1/3" tone="teal" />
                <Metric
                  label="绝对误差"
                  value={fmt(Math.abs(sum - 1 / 3), 5)}
                  tone="orange"
                />
              </>
            ) : (
              <>
                <Metric label="阶数" value={String(c.n)} tone="purple" />
                <Metric
                  label="实际误差"
                  value={fmt(Math.abs(Math.exp(c.x0) - poly(c.x0, c.n)), 6)}
                />
                <Metric
                  label="余项上界（|x|≤1）"
                  value={fmt(
                    (Math.E * Math.abs(c.x0) ** (c.n + 1)) / fact(c.n + 1),
                    6,
                  )}
                  tone="teal"
                />
              </>
            )}
          </div>
          <div className="ex-chart-foot">
            <span>
              <Eye size={13} />
              {c.dimension === 3
                ? "图示为单位圆盘上的三维拓展。圆盘邻域取与定义域的交集。"
                : c.topic === "integral"
                  ? "更换标记点并增加分割数量，比较求和结果。"
                  : "点击或拖动图像可移动基准点；滑块也支持键盘方向键。"}
            </span>
            {c.zoom !== 1 && (
              <button onClick={() => update({ zoom: 1 })}>恢复原始比例</button>
            )}
          </div>
        </div>
      </div>
      <section className="card ex-proof">
        <div className="ex-card-heading">
          <h3>
            <Grid2X2 size={16} />
            从图像进入证明 · 六类思维工具
          </h3>
          <span className="muted">把看到的现象，变成能写下的论证</span>
        </div>
        <div className="ex-proof-grid">
          {proofCards.map(([name, desc, formula], i) => (
            <button
              className="ex-proof-card"
              key={name}
              onClick={() => onNavigate("proof")}
            >
              <h4>
                <span className={`ex-prompt-icon tone-${i % 3}`}>
                  {["“", "↗", "≤", "ƒ", "⋮", "▦"][i]}
                </span>
                {name}
              </h4>
              <p><MathText>{desc}</MathText></p>
              <span className={`ex-formula tone-${i % 3}`}>
                <MathText>{formula}</MathText>
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="ex-bottom-grid">
        <section className="ex-insight">
          <h3>
            <span className="ex-icon-box">
              <Sparkles size={17} />
            </span>
            学习提示 · 这张图能告诉你什么
          </h3>
          <p>
            {c.topic === "continuity"
              ? "固定 ε，把基准点从左向右移动。你会发现“一个点附近有合适的 δ”和“所有点共用一个 δ”是两个不同的问题。"
              : c.topic === "integral"
                ? "左端点、右端点和中点的近似可能不同。Riemann 可积要求网格足够细时，任意标记点的和都趋向同一个值。"
                : c.topic === "derivative"
                  ? "观察割线接近切线的过程，再把图像里的趋近写成差商的极限。注意 h 始终非零。"
                  : "两条曲线在屏幕上重合不表示它们完全相同。余项估计说明了误差能被控制到什么程度。"}
          </p>
          <p>
            {c.topic === "continuity"
              ? "在 [0,1] 上，√x 虽然在靠近 0 时导数无界，但仍一致连续。这说明有界导数是一个充分条件，并非必要条件。"
              : "把参数变化时发现的规律记下来，然后用定义、定理条件和估计完成证明。"}
          </p>
          <div className="ex-insight-callout">
            <Lightbulb size={16} />
            <span>
              图像帮助发现思路；完整证明需要说明量词、适用条件和每一步推理。
            </span>
          </div>
          <button className="btn" onClick={() => onNavigate("proof")}>
            打开证明思路
            <ArrowRight size={14} />
          </button>
        </section>
        <section className="card ex-observations">
          <div className="ex-card-heading">
            <h3>
              <Eye size={16} />
              我的观察记录
            </h3>
            <span className="badge">{observations.length} 条</span>
          </div>
          <div className="ex-observation-list">
            {observations.length ? (
              observations.slice(0, 4).map((o) => (
                <article key={o.id}>
                  <p><MathText>{o.text}</MathText></p>
                  <small>{o.time} · 已保存到我的笔记</small>
                </article>
              ))
            ) : (
              <div className="ex-empty">
                <Pencil size={25} />
                <p>发现一个规律，就把它记下来。</p>
                <small>观察记录会自动保存在当前浏览器。</small>
              </div>
            )}
          </div>
          <form
            className="ex-note-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) saveObservation();
            }}
          >
            <input
              aria-label="观察记录"
              placeholder="记录你看到的规律…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button aria-label="保存观察记录" disabled={!note.trim()}>
              <BookmarkPlus size={16} />
            </button>
          </form>
          <div className="ex-observation-footer">
            <button className="ex-text-btn" onClick={() => onNavigate("notes")}>
              查看全部笔记
            </button>
            <button
              className="btn primary"
              onClick={() => onNavigate("textbook")}
            >
              回到讲义
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`ex-metric ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
