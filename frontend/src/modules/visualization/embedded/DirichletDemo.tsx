import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import "./dirichlet.css";

type Focus = "discontinuity" | "non_differentiability" | "integrability";

export function DirichletDemo({
  focus,
  sourceLabel,
}: {
  focus?: string[];
  sourceLabel?: string;
}) {
  const initial: Focus =
    focus?.includes("non_differentiability")
      ? "non_differentiability"
      : focus?.includes("integrability")
        ? "integrability"
        : "discontinuity";
  const [tab, setTab] = useState<Focus>(initial);
  const [delta, setDelta] = useState(0.3);
  const [center, setCenter] = useState(0.5);
  const y = (value: 0 | 1) => 150 - value * 90;
  const points: { x: number; y: number; kind: "rational" | "irrational" }[] = [];
  for (let i = 0; i < 95; i += 1) {
    const x = 0.03 + (i / 94) * 0.94;
    points.push({ x, y: y(1), kind: "rational" });
    points.push({
      x: 0.03 + ((i + 0.5) / 94) * 0.94,
      y: y(0),
      kind: "irrational",
    });
  }

  const text: Record<Focus, { title: string; body: string[] }> = {
    discontinuity: {
      title: "处处不连续",
      body: [
        "对任意一点 x₀ 和任意 δ>0，区间 (x₀−δ, x₀+δ) 内都同时有有理点和无理点。",
        "因此存在两点任意接近 x₀，函数值却分别是 1 和 0，差恒为 1。取 ε=1/2 就无法找到合适的 δ。",
        "所以狄利克雷函数在每一点不连续；这与“某个点附近的值靠得很近”完全不同。",
      ],
    },
    non_differentiability: {
      title: "处处不可导",
      body: [
        "不连续是“不可导”的充分理由：可导必连续，而狄利克雷函数处处不连续。",
        "更直接地看，任何差商 [f(x₀+h)−f(x₀)]/h 都会随着有理/无理取值在 0 与 1/h 之间跳变，不可能收敛到同一个有限极限。",
        "本页不画出连续折线，因为该函数没有可以用普通连线表示的连续图像。",
      ],
    },
    integrability: {
      title: "在 [0,1] 上不 Riemann 可积",
      body: [
        "任取 [0,1] 的分割，每个非退化小区间都含有有理点和无理点。",
        "所以每个小区间的上确界是 1、下确界是 0；上和恒为 1，下和恒为 0，上下和之差不能任意小。",
        "这说明“有界”不足以保证 Riemann 可积；它和前面关于连续性的焦点是两个不同结论。",
      ],
    },
  };

  return (
    <section className="dirichlet-demo">
      <div className="dirichlet-head">
        <div>
          <span className="badge purple">专用反例图像</span>
          <h2>狄利克雷函数：有理点取 1，无理点取 0</h2>
          <p>
            当前焦点：{text[tab].title}。本图是有限点集示意，不是完整函数图像；点的大小和密度不代表真实基数。
          </p>
        </div>
        {sourceLabel && <span className="dirichlet-source">{sourceLabel}</span>}
      </div>

      <div className="dirichlet-tabs">
        {(
          [
            ["discontinuity", "不连续性"],
            ["non_differentiability", "不可导性"],
            ["integrability", "不可积性"],
          ] as [Focus, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="dirichlet-figure">
        <svg viewBox="0 0 600 220" role="img" aria-label="狄利克雷函数有理点与无理点示意图">
          <rect x="0" y="0" width="600" height="220" fill="#fff" />
          <line x1="55" y1="170" x2="560" y2="170" stroke="#6f6a80" />
          <line x1="55" y1="25" x2="55" y2="170" stroke="#6f6a80" />
          <text x="25" y="64" fill="#746f83" fontSize="11">1</text>
          <text x="25" y="154" fill="#746f83" fontSize="11">0</text>
          <text x="555" y="190" fill="#746f83" fontSize="11">x</text>
          <rect
            x={55 + (center - delta) * 500}
            y="20"
            width={delta * 2 * 500}
            height="155"
            fill="#7c6cf610"
            stroke="#8b7cf6"
            strokeDasharray="4 3"
          />
          {points.map((point, index) => (
            <circle
              key={index}
              cx={55 + point.x * 500}
              cy={point.y + (point.kind === "rational" ? -3 : 3)}
              r="2.2"
              fill={point.kind === "rational" ? "#6551d6" : "#3da9a0"}
              opacity={Math.abs(point.x - center) <= delta ? 0.95 : 0.25}
            />
          ))}
          <text x="70" y="42" fill="#6551d6" fontSize="10">有理点 → 1</text>
          <text x="70" y="198" fill="#3da9a0" fontSize="10">无理点 → 0</text>
          <text x="320" y="36" fill="#8b7cf6" fontSize="10">
            邻域 x₀±δ
          </text>
        </svg>
      </div>

      <div className="dirichlet-controls">
        <label>
          邻域中心 x₀ = {center.toFixed(2)}
          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.01"
            value={center}
            onChange={(event) => setCenter(Number(event.target.value))}
          />
        </label>
        <label>
          邻域半径 δ = {delta.toFixed(2)}
          <input
            type="range"
            min="0.02"
            max="0.45"
            step="0.01"
            value={delta}
            onChange={(event) => setDelta(Number(event.target.value))}
          />
        </label>
        <div className="dirichlet-check">
          <Info size={14} />
          <span>无论 δ 多小，阴影区域内始终同时出现两种颜色。</span>
        </div>
      </div>

      <div className="dirichlet-explanation">
        <h3>{text[tab].title}</h3>
        {text[tab].body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="dirichlet-warning">
        <AlertTriangle size={14} />
        <span>
          有限点集只用于说明“任意邻域同时含有两类点”；它不证明连续性、可导性或可积性。真正结论必须回到定义与证明。
        </span>
      </div>
    </section>
  );
}
