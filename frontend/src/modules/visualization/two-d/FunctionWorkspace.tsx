import { lazy, Suspense } from "react";
import { X } from "lucide-react";
import {
  FUNCTION_MODES,
  type Scene,
} from "../scene/functionScene";
import {
  useFunctionWorkspace,
  type FunctionWorkspaceProps,
} from "../hooks/useFunctionWorkspace";
import { FunctionChart } from "../components/FunctionChart";
import { FunctionEditor } from "../components/FunctionEditor";
import { NextStep } from "../components/NextStep";
import { WorkspaceHeader } from "../components/WorkspaceHeader";
import "./function-workspace.css";

const Classic = lazy(() => import("../../../pages/Exploration"));

export default function FunctionWorkspace(props: FunctionWorkspaceProps) {
  const state = useFunctionWorkspace(props);

  if (state.classic) {
    return (
      <>
        <button className="btn fw-back" onClick={() => state.setClassic(false)}>
          ← 返回自由函数工作区
        </button>
        <Suspense fallback={<p>载入经典示例…</p>}>
          <Classic {...props} onBoardActions={state.onBoardActions} />
        </Suspense>
      </>
    );
  }

  return (
    <div className="function-workspace">
      <WorkspaceHeader state={state} onNavigate={props.onNavigate} />
      <div className="fw-modebar" role="tablist" aria-label="函数分析工具">
        {FUNCTION_MODES.map(([id, label]) => (
          <button
            role="tab"
            aria-selected={state.scene.mode === id}
            className={state.scene.mode === id ? "active" : ""}
            disabled={state.dirty}
            key={id}
            onClick={() => state.patch({ mode: id as Scene["mode"] })}
          >
            {label}
          </button>
        ))}
        <span>切换工具，保留当前函数</span>
      </div>
      {state.error && (
        <div className="fw-error" role="alert">
          {state.error}
          <button
            aria-label="关闭错误提示"
            onClick={() => state.setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="fw-grid">
        <FunctionEditor state={state} />
        <div className="fw-main">
          <FunctionChart state={state} />
        </div>
      </div>
      <NextStep onNavigate={props.onNavigate} />
    </div>
  );
}
