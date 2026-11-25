import { Check, ChevronDown, Code2, FunctionSquare, Plus, Trash2 } from "lucide-react";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";
import { initialScene } from "../scene/functionScene";
import { Range } from "./Range";

export function FunctionEditor({ state }: { state: FunctionWorkspaceState }) {
  const { scene, draft, busy, dirty } = state;
  return (
    <aside className="card fw-editor">
      <div className="fw-section-title">
        <h3>
          <FunctionSquare size={17} />
          函数与参数
        </h3>
        <span>{scene.curves.length} / 4</span>
      </div>
      <p className="fw-muted">写入任意支持的表达式，或让 AI 帮你修改。</p>
      {draft.curves.map((curve, index) => (
        <div
          className={`fw-curve-editor ${scene.activeId === curve.id ? "active" : ""}`}
          key={curve.id}
        >
          <div className="fw-curve-label">
            <label>
              <input
                type="radio"
                name="active-curve"
                aria-label={`分析函数 ${index + 1}`}
                checked={scene.activeId === curve.id}
                disabled={
                  busy || dirty || !scene.curves.some((item) => item.id === curve.id)
                }
                onChange={() => state.patch({ activeId: curve.id })}
              />
              <strong>{curve.label}</strong>
            </label>
            <button
              className="icon-button"
              aria-label={`删除函数 ${index + 1}`}
              disabled={draft.curves.length === 1 || busy}
              onClick={() =>
                state.setDraft((current) => ({
                  ...current,
                  curves: current.curves.filter((item) => item.id !== curve.id),
                  activeId:
                    current.activeId === curve.id
                      ? current.curves.find((item) => item.id !== curve.id)!.id
                      : current.activeId,
                }))
              }
            >
              <Trash2 size={14} />
            </button>
          </div>
          <input
            className="fw-formula"
            aria-label={`函数 ${index + 1} 表达式`}
            value={curve.expression}
            maxLength={300}
            disabled={busy}
            onChange={(event) =>
              state.setCurve(curve.id, { expression: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") state.commit(draft, "公式已更新");
            }}
          />
          <details>
            <summary>
              定义域限制 <ChevronDown size={12} />
            </summary>
            <div className="fw-fields">
              <label>
                下限
                <input
                  aria-label={`函数 ${index + 1} 定义域下限`}
                  type="number"
                  placeholder="不限"
                  value={curve.domainMin ?? ""}
                  onChange={(event) =>
                    state.setCurve(curve.id, {
                      domainMin:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                上限
                <input
                  aria-label={`函数 ${index + 1} 定义域上限`}
                  type="number"
                  placeholder="不限"
                  value={curve.domainMax ?? ""}
                  onChange={(event) =>
                    state.setCurve(curve.id, {
                      domainMax:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="fw-check">
              <input
                type="checkbox"
                checked={curve.leftOpen}
                onChange={(event) =>
                  state.setCurve(curve.id, { leftOpen: event.target.checked })
                }
              />
              不包含左端点
            </label>
            <label className="fw-check">
              <input
                type="checkbox"
                checked={curve.rightOpen}
                onChange={(event) =>
                  state.setCurve(curve.id, { rightOpen: event.target.checked })
                }
              />
              不包含右端点
            </label>
          </details>
        </div>
      ))}
      <button
        className="btn fw-add"
        disabled={draft.curves.length >= 4 || busy}
        onClick={() =>
          state.setDraft((current) => ({
            ...current,
            curves: [
              ...current.curves,
              {
                ...initialScene.curves[0],
                id: `f_${Date.now()}`,
                label: `g${current.curves.length}(x)`,
                expression: "sin(x)",
              },
            ],
          }))
        }
      >
        <Plus size={14} />
        添加比较函数
      </button>
      <details className="fw-range">
        <summary>
          坐标显示范围 <ChevronDown size={13} />
        </summary>
        <div className="fw-fields">
          {(["xMin", "xMax", "yMin", "yMax"] as const).map((key, index) => (
            <label key={key}>
              {["x 下限", "x 上限", "y 下限", "y 上限"][index]}
              <input
                type="number"
                aria-label={
                  ["x 显示下限", "x 显示上限", "y 显示下限", "y 显示上限"][
                    index
                  ]
                }
                value={draft[key]}
                onChange={(event) =>
                  state.setDraft({ ...draft, [key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
        </div>
      </details>
      <button
        className="btn primary fw-apply"
        disabled={busy || !dirty}
        onClick={() => state.commit(draft, "公式与范围已更新")}
      >
        <Check size={15} />
        {dirty ? "应用公式与范围" : "当前配置已应用"}
      </button>
      <details className="fw-help">
        <summary>
          <Code2 size={13} />
          表达式怎么写？
        </summary>
        <p>
          支持幂、三角函数、指数、对数与组合，例如 <code>sin(x^2)</code>、
          <code>exp(-a*x^2)</code>。
        </p>
        <p>
          分段函数：<code>x &lt; 0 ? -x : x^2</code>。参数用 a、b、c
          等单字母，输入后自动生成滑块。乘法写 *，对数写 log，常数用 pi、e。
        </p>
      </details>
      <div className="fw-parameters">
        <h4>
          函数参数{" "}
          {scene.parameters.length === 0 && (
            <small>检测到参数后显示滑块</small>
          )}
        </h4>
        {scene.parameters.map((parameter) => (
          <div key={parameter.name}>
            <Range
              label={`参数 ${parameter.name}`}
              value={parameter.value}
              min={parameter.min}
              max={parameter.max}
              step={(parameter.max - parameter.min) / 200}
              disabled={busy || dirty}
              change={(value) =>
                state.patch({
                  parameters: scene.parameters.map((item) =>
                    item.name === parameter.name ? { ...item, value } : item,
                  ),
                })
              }
            />
            <div className="fw-parameter-limits">
              <label>
                下限
                <input
                  type="number"
                  aria-label={`参数 ${parameter.name} 下限`}
                  value={
                    draft.parameters.find(
                      (item) => item.name === parameter.name,
                    )?.min ?? parameter.min
                  }
                  onChange={(event) =>
                    state.setDraft({
                      ...draft,
                      parameters: draft.parameters.map((item) =>
                        item.name === parameter.name
                          ? { ...item, min: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label>
                上限
                <input
                  type="number"
                  aria-label={`参数 ${parameter.name} 上限`}
                  value={
                    draft.parameters.find(
                      (item) => item.name === parameter.name,
                    )?.max ?? parameter.max
                  }
                  onChange={(event) =>
                    state.setDraft({
                      ...draft,
                      parameters: draft.parameters.map((item) =>
                        item.name === parameter.name
                          ? { ...item, max: Number(event.target.value) }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
