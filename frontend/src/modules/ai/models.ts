export const deepSeekModels = ["deepseek-flash", "deepseek-v4-pro"] as const;
export const openAIModels = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o3-mini"] as const;
export const codexModels = ["auto"] as const;
export const codexEfforts = [
  ["auto", "自动按环节换挡（推荐：提卡看图极速 · 证明出题批改思考）"],
  ["none", "极速无思考（none · 全部最快返回）"],
  ["low", "轻量思考（low）"],
  ["medium", "中度思考（medium · 全程推导）"],
  ["high", "深度思考（high · 适合复杂证明，耗时较长）"],
] as const;
export type CodexEffort = (typeof codexEfforts)[number][0];
export const providerLabels = { deepseek: "DeepSeek", openai: "ChatGPT (OpenAI)", codex: "本机 Codex（免填 Key）" } as const;
export const configureAIMessage = "请先在顶部配置本机 Codex、DeepSeek Key 或 OpenAI Key";
export type AIProvider = keyof typeof providerLabels;
export const providerModels: Record<AIProvider, readonly string[]> = { deepseek: deepSeekModels, openai: openAIModels, codex: codexModels };
export type DeepSeekModel = (typeof deepSeekModels)[number];
export type LegacyDeepSeekModel = "deepseek-chat" | "deepseek-reasoner";

export function resolveDeepSeekModel(model: string): string {
  if (!model || model === "deepseek-chat") return deepSeekModels[0];
  if (model === "deepseek-reasoner") return deepSeekModels[1];
  return model;
}
