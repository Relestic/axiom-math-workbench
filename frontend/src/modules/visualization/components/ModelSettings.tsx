import { X } from "lucide-react";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";

export function ModelSettings({ state }: { state: FunctionWorkspaceState }) {
  return (
    <section className="card fw-settings">
      <div>
        <h3>连接你的模型服务</h3>
        <button
          className="icon-button"
          aria-label="关闭连接说明"
          onClick={() => state.setSettings(false)}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        在 <code>backend/.env</code>（在线版是{" "}
        <code>backend/.env.online</code>）中填写以下配置，然后重启服务。
        DeepSeek 使用 OpenAI-compatible Chat Completions 协议。
      </p>
      <pre>
        {
          "AXIOM_AI_PROVIDER=deepseek\nAI_BASE_URL=https://api.deepseek.com\nAI_MODEL=deepseek-chat\nAI_API_KEY=sk-你的密钥\nAI_JSON_MODE=true\nAXIOM_LEGACY_AI=true"
        }
      </pre>
      <p>
        也可以把 <code>AI_MODEL</code> 换成 <code>deepseek-reasoner</code>；
        推理模型会自动关闭 <code>response_format</code>。密钥只由服务端读取，
        不会进入前端或日志。若服务商不支持 JSON 模式，将{" "}
        <code>AI_JSON_MODE</code> 改为 false。
      </p>
      <div className="button-row">
        <button className="btn" onClick={state.refreshStatus}>
          重新检查连接配置
        </button>
        <button
          className="btn primary"
          disabled={!state.status?.configured || state.testing}
          onClick={() => void state.testConnection()}
        >
          {state.testing ? "正在测试…" : "测试连接"}
        </button>
      </div>
      {state.testResult && (
        <p className="fw-muted" role="status">
          {state.testResult}
        </p>
      )}
    </section>
  );
}
