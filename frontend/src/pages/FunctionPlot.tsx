import { useEffect, useMemo, useRef, useState } from "react";
import type { Data, Layout, PlotlyHTMLElement } from "plotly.js";
import { curveEvaluator, type Scene } from "../lib/plotScene";
import {
  parseFormula,
  numericalSlope,
  sampleCurve,
  taylorModel,
  midpointSum,
  symbolicDerivative,
} from "../lib/functionEngine";
const palette = ["#6551f4", "#0a9b8d", "#ed7096", "#ce8a23"];
export function analyze(scene: Scene) {
  const params = Object.fromEntries(
    scene.parameters.map((p) => [p.name, p.value]),
  );
  const curve = scene.curves.find((c) => c.id === scene.activeId)!;
  const formula = parseFormula(curve.expression);
  const fn = curveEvaluator(curve, params);
  const y0 = fn(scene.x0);
  const slope =
    scene.mode === "derivative" ? numericalSlope(fn, scene.x0) : null;
  const symbolic =
    scene.mode === "derivative" ? symbolicDerivative(formula) : null;
  const taylor =
    scene.mode === "taylor" && Number.isFinite(y0)
      ? taylorModel(formula, scene.x0, params, scene.order)
      : null;
  const sum =
    scene.mode === "integral"
      ? midpointSum(
          fn,
          scene.integralStart,
          scene.integralEnd,
          scene.subdivisions,
        )
      : null;
  const values =
    scene.mode === "continuity"
      ? Array.from({ length: 201 }, (_, i) =>
          fn(scene.x0 - scene.delta + (2 * scene.delta * i) / 200),
        )
      : [];
  const invalid =
    values.some((v) => !Number.isFinite(v)) || !Number.isFinite(y0);
  const error =
    values.length && !invalid
      ? Math.max(...values.map((v) => Math.abs(v - y0)))
      : null;
  return {
    params,
    curve,
    formula,
    fn,
    y0,
    slope,
    symbolic,
    taylor,
    sum,
    error,
    invalid,
  };
}
export default function FunctionPlot({
  scene,
  onPoint,
}: {
  scene: Scene;
  onPoint: (x: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const onPointRef = useRef(onPoint);
  onPointRef.current = onPoint;
  const [error, setError] = useState("");
  const plot = useMemo(() => {
    const a = analyze(scene);
    const traces: Data[] = [];
    const shapes: Partial<Plotly.Shape>[] = [];
    scene.curves
      .filter((c) => c.visible)
      .forEach((c) => {
        const samples = sampleCurve(
          curveEvaluator(c, a.params),
          scene.xMin,
          scene.xMax,
          scene.yMax - scene.yMin,
        );
        traces.push({
          type: "scatter",
          mode: "lines",
          ...samples,
          name: `${c.label} = ${c.expression}`,
          connectgaps: false,
          line: {
            width: c.id === scene.activeId ? 3 : 2,
            color: palette[scene.curves.indexOf(c)],
          },
          hovertemplate:
            "x=%{x:.4f}<br>y=%{y:.4f}<extra>%{fullData.name}</extra>",
        });
      });
    if (
      Number.isFinite(a.y0) &&
      scene.mode !== "graph" &&
      scene.mode !== "integral"
    )
      traces.push({
        type: "scatter",
        mode: "markers",
        x: [scene.x0],
        y: [a.y0],
        name: "基准点",
        marker: {
          color: "#6551f4",
          size: 11,
          line: { color: "white", width: 2 },
        },
      });
    if (scene.mode === "derivative") {
      const end = a.fn(scene.x0 + scene.h);
      const secant = (end - a.y0) / scene.h;
      if (Number.isFinite(secant)) {
        traces.push({
          type: "scatter",
          mode: "lines",
          x: [scene.xMin, scene.xMax],
          y: [
            a.y0 + secant * (scene.xMin - scene.x0),
            a.y0 + secant * (scene.xMax - scene.x0),
          ],
          name: "割线",
          line: { color: "#e3a133", width: 2 },
        });
        traces.push({
          type: "scatter",
          mode: "markers",
          x: [scene.x0 + scene.h],
          y: [end],
          name: "移动点",
          marker: { color: "#e3a133", size: 9 },
        });
      }
      if (a.slope !== null)
        traces.push({
          type: "scatter",
          mode: "lines",
          x: [scene.xMin, scene.xMax],
          y: [
            a.y0 + a.slope * (scene.xMin - scene.x0),
            a.y0 + a.slope * (scene.xMax - scene.x0),
          ],
          name: "切线（数值估计）",
          line: { color: "#0a9b8d", dash: "dash", width: 2 },
        });
    }
    if (scene.mode === "continuity" && Number.isFinite(a.y0)) {
      shapes.push({
        type: "rect",
        xref: "paper",
        x0: 0,
        x1: 1,
        y0: a.y0 - scene.epsilon,
        y1: a.y0 + scene.epsilon,
        fillcolor: "rgba(101,81,244,.09)",
        line: { color: "#bab1f7", dash: "dot" },
        layer: "below",
      });
      shapes.push({
        type: "rect",
        yref: "paper",
        y0: 0,
        y1: 1,
        x0: scene.x0 - scene.delta,
        x1: scene.x0 + scene.delta,
        fillcolor: "rgba(229,170,55,.09)",
        line: { color: "#e2b660", dash: "dot" },
        layer: "below",
      });
    }
    if (scene.mode === "integral") {
      const dx = (scene.integralEnd - scene.integralStart) / scene.subdivisions;
      const xs = Array.from(
        { length: scene.subdivisions },
        (_, i) => scene.integralStart + (i + 0.5) * dx,
      );
      traces.unshift({
        type: "bar",
        x: xs,
        y: xs.map((x) => {
          const y = a.fn(x);
          return Number.isFinite(y) ? y : null;
        }),
        width: dx,
        name: "中点矩形",
        marker: {
          color: "rgba(101,81,244,.15)",
          line: { color: "#a79ae9", width: 1 },
        },
        hoverinfo: "skip",
      });
    }
    if (a.taylor) {
      traces.push({
        type: "scatter",
        mode: "lines",
        ...sampleCurve(
          a.taylor.evaluate,
          scene.xMin,
          scene.xMax,
          scene.yMax - scene.yMin,
        ),
        name: `${scene.order} 阶 Taylor 多项式`,
        line: { color: "#0a9b8d", dash: "dash", width: 2 },
      });
    }
    const layout: Partial<Layout> = {
      autosize: true,
      margin: { l: 55, r: 24, t: 24, b: 70 },
      paper_bgcolor: "#fff",
      plot_bgcolor: "#fcfcfa",
      font: {
        family: "Segoe UI, Microsoft YaHei, sans-serif",
        size: 12,
        color: "#7c8495",
      },
      xaxis: {
        range: [scene.xMin, scene.xMax],
        zerolinecolor: "#c5c6ce",
        gridcolor: "#eeedf3",
      },
      yaxis: {
        range: [scene.yMin, scene.yMax],
        title: { text: "y" },
        zerolinecolor: "#c5c6ce",
        gridcolor: "#eeedf3",
      },
      legend: { orientation: "h", y: -0.2, x: 0, font: { size: 11 } },
      shapes,
      hovermode: "closest",
      dragmode: "pan",
      uirevision: `${scene.xMin},${scene.xMax},${scene.yMin},${scene.yMax}`,
      showlegend: true,
    };
    return { traces, layout };
  }, [scene]);
  useEffect(() => {
    let cancelled = false;
    const target = element.current!;
    import("plotly.js-basic-dist-min")
      .then(async ({ default: Plotly }) => {
        if (cancelled) return;
        await Plotly.react(target, plot.traces, plot.layout, {
          responsive: true,
          displaylogo: false,
          scrollZoom: false,
          modeBarButtonsToRemove: [
            "lasso2d",
            "select2d",
            "sendDataToCloud",
            "sendChartToCloud",
          ],
          toImageButtonOptions: {
            filename: "axiom-function",
            format: "png",
            width: 1400,
            height: 800,
          },
        });
        if (cancelled) return;
        setError("");
        const el = target as unknown as PlotlyHTMLElement;
        el.removeAllListeners?.("plotly_click");
        el.on("plotly_click", (event) => {
          const x = event.points?.[0]?.x;
          if (typeof x === "number") onPointRef.current(x);
        });
      })
      .catch(() => {
        if (!cancelled) setError("绘图组件加载失败，请刷新页面");
      });
    return () => {
      cancelled = true;
    };
  }, [plot]);
  useEffect(() => {
    const el = element.current!;
    const resize = new ResizeObserver(() => {
      import("plotly.js-basic-dist-min").then(({ default: p }) => {
        if (el.isConnected && el.querySelector(".plot-container"))
          p.Plots.resize(el);
      });
    });
    resize.observe(el);
    return () => {
      resize.disconnect();
      import("plotly.js-basic-dist-min").then(({ default: p }) => {
        if (!el.isConnected) p.purge(el);
      });
    };
  }, []);
  return (
    <div className="fw-plot" aria-label="自定义函数交互图像">
      <div ref={element} className="fw-plot-canvas" />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
