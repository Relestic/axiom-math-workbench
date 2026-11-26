import { useMemo } from "react";
import type { ClassicKind } from "../../domain/types";
import { sampleClassic } from "../../modules/teaching/classicPlot";

export function ClassicChart({ kind, color }: { kind: ClassicKind; color: string }) {
  const plot = useMemo(() => kind === "dirichlet" ? null : sampleClassic(kind), [kind]);
  if (!plot) return <svg className="mini-chart" viewBox="0 0 440 238" role="img" aria-label="Dirichlet 函数的双层稠密示意">
    <title>有理点取 1，无理点取 0；两层点仅示意稠密性。</title>
    <rect width="440" height="238" fill="var(--plot-bg)" />
    {[["有理点 · f(x) = 1", 80], ["无理点 · f(x) = 0", 165]].map(([label, height], layer) => (
      <g key={label}><text x="26" y={Number(height) - 14} fill="var(--text)" fontSize="13">{label}</text>
        {Array.from({ length: 56 }, (_, i) => <circle key={i} cx={27 + i * 6.9 + layer * 2.8}
          cy={Number(height)} r={2} fill={color} />)}
      </g>))}
    <text x="26" y="210" fill="var(--muted)" fontSize="12">双层稠密示意 · 依据函数定义</text>
  </svg>;
  const px = (x: number) => 36 + (x - plot.a) / (plot.b - plot.a) * 374;
  const py = (y: number) => 203 - y / plot.top * 155;
  return <svg className="mini-chart" viewBox="0 0 440 238" role="img" aria-label={`f(x) = ${plot.formula} 的采样图像`}>
    <rect width="440" height="238" fill="var(--plot-bg)" />
    <g stroke="var(--plot-axis)"><line x1="30" y1={py(0)} x2="420" y2={py(0)} />
      <line x1={px(0)} y1="35" x2={px(0)} y2="208" /></g>
    <g fill="var(--muted)" fontSize="11">
      <text x="14" y={py(0) + 3}>0</text><text x="27" y="222">{plot.a}</text><text x="408" y="222">{plot.b}</text>
      <text x="420" y="198">x</text><text x={px(0) + 6} y="33">f(x)</text>
    </g>
    {plot.segments.map((points, index) => <polyline key={index} fill="none" stroke={color} strokeWidth="2.5"
      points={points.map(([x, y]) => `${px(x).toFixed(2)},${py(y).toFixed(2)}`).join(" ")} />)}
    {kind === "step" && <><circle cx={px(0.5)} cy={py(0)} r="4" fill="var(--plot-bg)" stroke={color} />
      <circle cx={px(0.5)} cy={py(1)} r="4" fill={color} /></>}
    {kind === "reciprocal" && <circle cx={px(1)} cy={py(1)} r="4" fill="var(--plot-bg)" stroke={color} />}
    <text x="44" y="25" fontSize="12" fill={color}>f(x) = {plot.formula}</text>
  </svg>;
}
