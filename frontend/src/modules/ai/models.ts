export const deepSeekModels = ["deepseek-flash", "deepseek-v4-pro"] as const;
export type DeepSeekModel = (typeof deepSeekModels)[number];
export type LegacyDeepSeekModel = "deepseek-chat" | "deepseek-reasoner";

export function resolveDeepSeekModel(model: string): string {
  if (!model || model === "deepseek-chat") return deepSeekModels[0];
  if (model === "deepseek-reasoner") return deepSeekModels[1];
  return model;
}
