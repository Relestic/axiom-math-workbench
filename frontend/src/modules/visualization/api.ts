import { apiFetch, apiUrl } from "../../lib/api";
import { parseAIResult, type Scene } from "../../lib/plotScene";
import type { SurfaceScene } from "./three-d/types";

export type PlotAIResult = ReturnType<typeof parseAIResult>;

export type SurfaceAIResult = {
  message: string;
  scene: unknown | null;
  provider?: string;
  model?: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.error === "string"
      ? data.error
      : data.error?.message || data.message || "模型请求失败";
  } catch {
    return `模型请求失败（HTTP ${response.status}）`;
  }
}

export async function testAIConnection(): Promise<{
  provider_label: string;
  model: string;
  latency_ms: number;
}> {
  return apiFetch("/api/v1/ai/test", { method: "POST", body: "{}" });
}

export async function requestPlotChange(input: {
  message: string;
  scene: Scene;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
}): Promise<PlotAIResult> {
  const response = await fetch(apiUrl("/api/ai/plot"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      message: input.message,
      scene: input.scene,
      history: input.history,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return parseAIResult(await response.json());
}

export async function requestSurfaceChange(
  input: {
    message: string;
    scene: SurfaceScene;
    history: { role: "user" | "assistant"; content: string }[];
  },
  local: boolean,
): Promise<SurfaceAIResult> {
  return apiFetch<SurfaceAIResult>(
    local ? "/api/v1/ai/local-surface" : "/api/v1/ai/surface",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    { auth: !local },
  );
}
