import type { DiagramScene } from "./schema";

const unitBox = { xMin: -0.12, xMax: 1.18, yMin: -0.22, yMax: 1.35 };
const unitAxes: DiagramScene["axes"] = { show: true, xLabel: "x", yLabel: "y", ticks: [
  { axis: "x", at: 1, label: "1" }, { axis: "y", at: 1, label: "1" },
] };
export const dirichlet: DiagramScene = {
  version: 1, title: "Dirichlet 函数", caption: "上层代表有理数处的函数值 1，下层代表无理数处的函数值 0。两类点在每个小区间都稠密，图中各取有限个点示意。",
  viewBox: unitBox, axes: unitAxes,
  nodes: [{ id: "layers", kind: "pattern", preset: "dirichlet_layers", xMin: 0, xMax: 1, density: 28, tone: "teal" }],
};
export const thomae: DiagramScene = {
  version: 1, title: "Thomae 函数", caption: "既约分数 $p/q$ 处的点高为 $1/q$，无理数处取零。仅显示有限分母，竖茎用于比较高度。",
  viewBox: unitBox, axes: unitAxes,
  nodes: [{ id: "stems", kind: "pattern", preset: "thomae_stems", xMin: 0, xMax: 1, density: 14 }],
};
export const epsilonDelta: DiagramScene = {
  version: 1, title: "连续函数的 ε–δ 邻域", caption: "固定纵向误差带，再缩小横向邻域，使邻域内的整段曲线落入误差带。",
  viewBox: { xMin: -2, xMax: 2, yMin: -1, yMax: 2 }, axes: { show: true, xLabel: "x", yLabel: "y", ticks: [
    { axis: "x", at: 0.35, label: "$x_0$" }, { axis: "x", at: -0.25, label: "$x_0-δ$" },
    { axis: "x", at: 0.95, label: "$x_0+δ$" },
  ] },
  nodes: [
    { id: "epsilon", kind: "region", xMin: -2, xMax: 2, yMin: 0.45, yMax: 1.45, tone: "teal", label: "ε 误差带" },
    { id: "delta", kind: "region", xMin: -0.25, xMax: 0.95, yMin: -1, yMax: 2, tone: "amber" },
    { id: "f", kind: "curve", smooth: true, points: [[-2,-0.4],[-1,0.2],[-0.25,0.67],[0.35,0.95],[0.95,1.21],[1.9,1.72]] },
    { id: "base", kind: "point", x: 0.35, y: 0.95, label: "$f(x_0)$" },
  ],
};
export const lagrange: DiagramScene = {
  version: 1, title: "Lagrange 中值定理", caption: "连接两端点作割线。在区间内部取一点，使该点的切线与割线平行。",
  viewBox: { xMin: -0.6, xMax: 2.6, yMin: -0.8, yMax: 4.6 },
  axes: { show: true, xLabel: "x", ticks: [
    { axis: "x", at: 0, label: "$a$" }, { axis: "x", at: 1, label: "$ξ$" }, { axis: "x", at: 2, label: "$b$" },
  ] },
  nodes: [
    { id: "f", kind: "curve", smooth: true, points: [[0,0],[0.5,0.25],[1,1],[1.5,2.25],[2,4]] },
    { id: "secant", kind: "segment", from: [0,0], to: [2,4], tone: "amber", label: "割线" },
    { id: "tangent", kind: "segment", from: [0.25,-0.5], to: [1.9,2.8], dashed: true, tone: "teal", label: "切线" },
    { id: "contact", kind: "point", x: 1, y: 1, tone: "teal" },
  ],
};
export const riemannDiagram: DiagramScene = {
  ...dirichlet, title: "Dirichlet 函数的 Darboux 上下和",
  caption: "在 $[0,1]$ 的每个分割小区间内，上确界为 1，下确界为 0。矩形总面积给出上和 1，下和始终为 0。",
  nodes: [
    { id: "upper", kind: "pattern", preset: "step_bars", xMin: 0, xMax: 1, yHigh: 1, yLow: 0, density: 8, tone: "amber" },
    ...dirichlet.nodes,
  ],
};
export const diagramPresets = [dirichlet, thomae, epsilonDelta, lagrange];
