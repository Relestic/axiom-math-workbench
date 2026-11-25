import { Undo2 } from "lucide-react";
import FunctionPlot from "../../../pages/FunctionPlot";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";
import {
  FUNCTION_MODES,
  formatNumber,
} from "../scene/functionScene";
import { Metric, Range } from "./Range";

export function FunctionChart({ state }: { state: FunctionWorkspaceState }) {
  const { scene, math, busy, dirty, history } = state;
  return (
    <section className="card fw-chart-card">
      <div className="fw-chart-heading">
        <div>
          <span className="badge">
            {FUNCTION_MODES.find((mode) => mode[0] === scene.mode)?.[1]}
          </span>
          <h2>
            {math.curve.label} = <span>{math.curve.expression}</span>
          </h2>
        </div>
        <button
          className="btn"
          disabled={!history.length || busy}
          onClick={state.undo}
        >
          <Undo2 size={14} />
          撤销修改
        </button>
      </div>
      <FunctionPlot
        scene={scene}
        onPoint={(x) => {
          if (!busy && !dirty)
            state.patch({ x0: Math.max(scene.xMin, Math.min(scene.xMax, x)) });
        }}
      />
      <div className="fw-chart-caption">
        横轴 x，纵轴 y · 拖动平移 · 工具栏缩放与导出 ·
        点击曲线设置基准点。检测到未定义或不稳定片段时断开连线；有限采样不能替代证明。
      </div>
      {scene.mode !== "graph" && (
        <div className="fw-analysis">
          <div className="fw-tool-controls">
            {scene.mode !== "integral" && (
              <Range
                label={scene.mode === "taylor" ? "展开中心 x₀" : "基准点 x₀"}
                value={scene.x0}
                min={Math.min(scene.xMin, scene.x0)}
                max={Math.max(scene.xMax, scene.x0)}
                step={(scene.xMax - scene.xMin) / 600}
                change={(x0) => state.patch({ x0 })}
                disabled={busy || dirty}
              />
            )}
            {scene.mode === "derivative" && (
              <Range
                label="割线步长 h"
                value={scene.h}
                min={0.0001}
                max={Math.max(1, scene.h)}
                step={0.0001}
                change={(h) => state.patch({ h })}
                disabled={busy || dirty}
              />
            )}
            {scene.mode === "continuity" && (
              <>
                <Range
                  label="误差 ε"
                  value={scene.epsilon}
                  min={0.001}
                  max={Math.max(2, scene.epsilon)}
                  step={0.001}
                  change={(epsilon) => state.patch({ epsilon })}
                  disabled={busy || dirty}
                />
                <Range
                  label="邻域 δ"
                  value={scene.delta}
                  min={0.001}
                  max={Math.max(2, scene.delta)}
                  step={0.001}
                  change={(delta) => state.patch({ delta })}
                  disabled={busy || dirty}
                />
              </>
            )}
            {scene.mode === "integral" && (
              <>
                <div className="fw-fields">
                  {(["integralStart", "integralEnd"] as const).map(
                    (key, index) => (
                      <label key={key}>
                        {index ? "积分终点" : "积分起点"}
                        <input
                          type="number"
                          aria-label={index ? "积分终点" : "积分起点"}
                          value={scene[key]}
                          disabled={busy || dirty}
                          onChange={(event) =>
                            state.patch({ [key]: Number(event.target.value) })
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
                <Range
                  label="分割数 n"
                  value={scene.subdivisions}
                  min={4}
                  max={200}
                  step={1}
                  change={(subdivisions) => state.patch({ subdivisions })}
                  disabled={busy || dirty}
                />
              </>
            )}
            {scene.mode === "taylor" && (
              <Range
                label="多项式阶数"
                value={scene.order}
                min={1}
                max={5}
                step={1}
                change={(order) => state.patch({ order })}
                disabled={busy || dirty}
              />
            )}
          </div>
          <div className="fw-results">
            {scene.mode === "derivative" && (
              <>
                <Metric
                  label="当前差商"
                  value={formatNumber(
                    (math.fn(scene.x0 + scene.h) - math.y0) / scene.h,
                  )}
                />
                <Metric
                  label="导数数值估计"
                  value={formatNumber(math.slope)}
                />
                <p>
                  {math.slope === null
                    ? "当前点的左右差商不稳定或函数未定义，因此不画切线；是否可导仍需证明。"
                    : `符号求导：${math.symbolic || "当前表达式暂不支持符号形式，使用数值差商检查。"}`}
                </p>
              </>
            )}
            {scene.mode === "continuity" && (
              <>
                <Metric
                  label="邻域内采样最大误差"
                  value={formatNumber(math.error)}
                />
                <Metric
                  label="采样结果"
                  value={
                    math.error === null
                      ? "含未定义取值"
                      : math.error < scene.epsilon
                        ? "未超出 ε"
                        : "超出 ε"
                  }
                />
                <p>
                  只检查当前基准点附近的有限样本；不据此判定连续性或一致连续性。
                </p>
              </>
            )}
            {scene.mode === "integral" && (
              <>
                <Metric
                  label="中点 Riemann 和"
                  value={formatNumber(math.sum)}
                />
                <Metric
                  label="网格宽度"
                  value={formatNumber(
                    (scene.integralEnd - scene.integralStart) /
                      scene.subdivisions,
                  )}
                />
                <p>
                  {math.sum === null
                    ? "采样发现未定义取值，未给出数值结果。"
                    : "这是指定取点方式的有限和，不是精确积分值，也不说明积分一定存在。"}
                </p>
              </>
            )}
            {scene.mode === "taylor" && (
              <>
                <Metric label="展开中心" value={formatNumber(scene.x0)} />
                <Metric label="阶数" value={String(scene.order)} />
                <p>
                  {math.taylor
                    ? `系数（从常数项起）：${math.taylor.coefficients.map(formatNumber).join("，")}。以 (x−x₀) 的幂排列；未提供余项上界。`
                    : "此表达式或展开点暂不支持可靠的 Taylor 系数计算。分段与非光滑函数需先检查相应条件。"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
