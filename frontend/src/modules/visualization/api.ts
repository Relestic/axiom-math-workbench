import { apiFetch } from "../../lib/api";
import { parseAIResult } from "../../lib/plotScene";
import type { Scene } from "../../lib/plotScene";
import type { SurfaceScene } from "./three-d/types";

export type AIStatus = {
  configured: boolean;
  active?: boolean;
  model?: string;
  provider?: string;
  provider_label?: string;
  reasoner?: boolean;
  json_mode?: boolean;
  source?: "user" | "system" | "none";
  using_user_key?: boolean;
  key_hint?: string;
  daily_limit?: number;
};

export type PlotAIResult = ReturnType<typeof parseAIResult>;

export type SurfaceAIResult = {
  message: string;
  scene: unknown | null;
  provider?: string;
  model?: string;
};

export async function fetchAIStatus(): Promise<AIStatus> {
  return apiFetch<AIStatus>("/api/v1/ai/status");
}

export async function testAIConnection(): Promise<{
  provider_label: string;
  model: string;
  latency_ms: number;
  source?: string;
}> {
  return apiFetch("/api/v1/ai/test", { method: "POST", body: "{}" });
}

export async function requestPlotChange(input: {
  message: string;
  scene: Scene;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
}): Promise<PlotAIResult> {
  const data = await apiFetch<unknown>("/api/v1/ai/plot", {
    method: "POST",
    signal: input.signal,
    body: JSON.stringify({
      message: input.message,
      scene: input.scene,
      history: input.history,
    }),
  });
  return parseAIResult(data);
}

export async function requestSurfaceChange(input: {
  message: string;
  scene: SurfaceScene;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<SurfaceAIResult> {
  return apiFetch<SurfaceAIResult>("/api/v1/ai/surface", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveAICredentials(input: {
  api_key: string;
  model: "deepseek-chat" | "deepseek-reasoner";
}): Promise<AIStatus> {
  return apiFetch<AIStatus>("/api/v1/ai/credentials", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteAICredentials(): Promise<AIStatus> {
  return apiFetch<AIStatus>("/api/v1/ai/credentials", { method: "DELETE" });
}
