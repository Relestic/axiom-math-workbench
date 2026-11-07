import { X } from "lucide-react";
import type { FunctionWorkspaceState } from "../hooks/useFunctionWorkspace";
import { AICredentialSettings } from "./AICredentialSettings";

export function ModelSettings({ state }: { state: FunctionWorkspaceState }) {
  return (
    <section className="card fw-settings">
      <div>
        <h3>连接 DeepSeek</h3>
        <button
          className="icon-button"
          aria-label="关闭连接说明"
          onClick={() => state.setSettings(false)}
        >
          <X size={18} />
        </button>
      </div>
      <AICredentialSettings
        status={state.status}
        onUpdated={state.refreshStatus}
      />
      <p className="fw-muted">
        保存后立即生效，不需要重启后端。系统默认 Key 仍作为未接入用户的回退；
        你保存自己的 Key 后，AI 改图优先使用你的 DeepSeek 账户。
      </p>
    </section>
  );
}
