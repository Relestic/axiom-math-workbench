import { ApiError, apiFetch, apiUrl } from "../../lib/api";
import { providerLabels, type AIProvider, type LegacyDeepSeekModel } from "./models";
export type { DeepSeekModel } from "./models";

export type AIStatus = {
  configured: boolean;
  model?: string;
  provider?: string;
  provider_label?: string;
};

export async function fetchAIStatus(): Promise<AIStatus> {
  const response = await fetch(apiUrl("/api/ai/status"));
  if (!response.ok) throw new Error("无法读取模型状态");
  return response.json();
}

export type KeyStatus = {
  codex_detected?: boolean;
  configured: boolean;
  provider?: AIProvider;
  model: string;
  base_url?: string | null;
  state: "ready" | "unset" | "error";
  migrated_from?: LegacyDeepSeekModel;
};

const local = { auth: false };

export const getKeyStatus = () =>
  apiFetch<KeyStatus>("/api/v1/ai/key/status", {}, local);

export const saveKey = (model: string, key: string, provider: AIProvider = "deepseek", baseUrl = "") =>
  apiFetch<KeyStatus>(
    "/api/v1/ai/key",
    {
      method: "PUT",
      body: JSON.stringify(provider === "codex" ? { provider, model } :
        { provider, model, base_url: baseUrl.trim() || null, api_key: key || undefined }),
    },
    local,
  );

export const clearKey = () =>
  apiFetch("/api/v1/ai/key", { method: "DELETE" }, local);

export async function testKey() {
  const result = await apiFetch<{
    ok: boolean;
    code?: string;
    error?: { code?: string; message?: string };
  }>("/api/v1/ai/key/test", { method: "POST" }, local);
  if (!result.ok) {
    throw new ApiError(200, result.error?.message || "连接测试失败", result.error?.code || result.code);
  }
}

export function keyError(cause: unknown, fallback: string, provider: AIProvider = "deepseek"): string {
  const label = providerLabels[provider];
  if (cause instanceof ApiError) {
    if (provider === "codex") return cause.message || fallback;
    if (cause.code === "invalid_key" || cause.status === 401)
      return `${label} Key 无效，请更换后再试。`;
    if (cause.code === "insufficient_balance" || cause.status === 402)
      return `${label} 余额不足（402），充值后可重新测试。`;
    switch (cause.code) {
      case "timeout":
        return `连接 ${label} 超时，请稍后重试。`;
      case "network":
        return `无法连接 ${label}，请检查网络后重试。`;
      case "rate_limited":
        return `${label} 请求过于频繁，请稍后重试。`;
    }
    if (cause.status === 422) return cause.message;
  }
  return fallback;
}
