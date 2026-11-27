import { ApiError, apiFetch, apiUrl } from "../../lib/api";
import type { DeepSeekModel, LegacyDeepSeekModel } from "./models";
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
  configured: boolean;
  model: DeepSeekModel;
  state: "ready" | "unset" | "error";
  migrated_from?: LegacyDeepSeekModel;
};

const local = { auth: false };

export const getKeyStatus = () =>
  apiFetch<KeyStatus>("/api/v1/ai/key/status", {}, local);

export const saveKey = (model: DeepSeekModel, key: string) =>
  apiFetch(
    "/api/v1/ai/key",
    {
      method: "PUT",
      body: JSON.stringify(key ? { model, api_key: key } : { model }),
    },
    local,
  );

export const clearKey = () =>
  apiFetch("/api/v1/ai/key", { method: "DELETE" }, local);

export async function testKey() {
  const result = await apiFetch<{
    ok: boolean;
    code?: string;
    error?: { code?: string };
  }>("/api/v1/ai/key/test", { method: "POST" }, local);
  if (!result.ok) {
    throw new ApiError(200, "连接测试失败", result.error?.code || result.code);
  }
}

export function keyError(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) {
    switch (cause.code) {
      case "invalid_key":
        return "DeepSeek Key 无效，请更换后再试。";
      case "insufficient_balance":
        return "DeepSeek 余额不足（402），充值后可重新测试。";
      case "timeout":
        return "连接 DeepSeek 超时，请稍后重试。";
      case "network":
        return "无法连接 DeepSeek，请检查网络后重试。";
      case "rate_limited":
        return "DeepSeek 请求过于频繁，请稍后重试。";
    }
    if (cause.status === 401) return "DeepSeek Key 无效，请更换后再试。";
    if (cause.status === 402)
      return "DeepSeek 余额不足（402），充值后可重新测试。";
  }
  return fallback;
}
