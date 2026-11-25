import { X } from "lucide-react";
import { DeepSeekSettings } from "../../ai/DeepSeekSettings";
import { useAIConnection } from "../../ai/connection";
import { useSession } from "../../../lib/session";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";

export function ModelSettings({ state }: { state: FunctionWorkspaceState }) {
  const { available } = useAIConnection();
  const { serverMode } = useSession();
  return (
    <section className="card fw-settings">
      <div>
        <h3>个人 DeepSeek 接入设置</h3>
        <button
          className="icon-button"
          aria-label="关闭 AI 设置"
          onClick={() => state.setSettings(false)}
        >
          <X size={18} />
        </button>
      </div>
      <DeepSeekSettings />
      {available === false && serverMode && state.status?.configured && (
        <div className="button-row">
          <button
            className="btn"
            disabled={state.testing}
            onClick={() => void state.testConnection()}
          >
            {state.testing ? "正在测试…" : "测试服务器模型"}
          </button>
          {state.testResult && <p role="status">{state.testResult}</p>}
        </div>
      )}
    </section>
  );
}
