import type { CardVisual } from "../../modules/visualization/cardVisual";
import { initialScene, type Scene } from "../../lib/plotScene";
import { riemannDiagram } from "../../modules/visualization/diagram/presets";

function plot(mode: Scene["mode"], expressions: string[], controls: Partial<Scene>, summary: string): CardVisual {
  return { board: "explore", summary, functionScene: {
    ...initialScene, mode, ...controls,
    curves: expressions.map((expression, i) => ({
      ...initialScene.curves[0], id: ["f","g","k"][i], label: ["f(x)","g(x)","k(x)"][i], expression,
    })),
  } };
}
export const builtinVisuals: Record<string, CardVisual> = {
  continuous: plot("continuity", ["2*x + 1"], { x0: 0.5, epsilon: 0.4, delta: 0.2 }, "斜率为 2，横向距离缩小到 ε/2 就能控制纵向误差。"),
  uniform: plot("continuity", ["x^2"], { xMin: -4, xMax: 4, yMin: -1, yMax: 16, x0: 0, delta: 0.15 }, "固定 ε 和 δ，再移动基准点，比较斜率变化对同一 δ 的影响。"),
  derivative: plot("derivative", ["x^2", "abs(x)"], { x0: 0 }, "切换当前函数，比较原点处的切线与尖点。"),
  "mean-value": plot("derivative", ["sin(x)", "sin(2)*x/2"], {
    xMin: -2, xMax: 2, yMin: -1.6, yMax: 1.6, x0: Math.acos(Math.sin(2) / 2),
  }, "第二条直线连接区间两端点。基准点处的切线与这条割线平行。"),
  taylor: plot("taylor", ["exp(x)"], { x0: 0, order: 2 }, "比较指数函数与它在原点的二阶 Taylor 多项式。"),
  primitive: plot("graph", ["0.5*x^2", "0.5*x^2 + 1", "x"], {}, "两条抛物线相差一个常数，导函数都是 x。"),
  riemann: { board: "diagram", diagramScene: riemannDiagram },
  integral: plot("integral", ["cos(x)"], { integralStart: 0, integralEnd: 2, xMin: -0.5, xMax: 2.5, yMin: -1.3, yMax: 1.3 }, "比较余弦曲线在横轴两侧的有向面积。"),
};
