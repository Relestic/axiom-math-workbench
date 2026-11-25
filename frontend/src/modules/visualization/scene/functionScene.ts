import {
  initialScene,
  parseAIResult,
  validateScene,
  type Scene,
} from "../../../lib/plotScene";

export type { Scene };
export { initialScene, parseAIResult, validateScene };

export const FUNCTION_MODES = [
  ["graph", "函数图像"],
  ["continuity", "连续性"],
  ["derivative", "导数与切线"],
  ["integral", "定积分"],
  ["taylor", "Taylor 近似"],
] as const;

export function formatNumber(value: number | null): string {
  return value !== null && Number.isFinite(value)
    ? Number(value.toPrecision(6)).toString()
    : "无法计算";
}

/**
 * Load the persisted scene, then apply a one-shot request from another page
 * (for example, the textbook "open in exploration" action).
 */
export function loadFunctionScene(): Scene {
  let saved: Scene;
  try {
    saved = validateScene(
      JSON.parse(localStorage.getItem("axiom-function-scene") || "null"),
    );
  } catch {
    saved = structuredClone(initialScene);
  }
  const requested = localStorage.getItem("axiom-explore-request");
  const topics: Record<string, Scene["mode"]> = {
    continuous: "continuity",
    uniform: "continuity",
    derivative: "derivative",
    "mean-value": "derivative",
    taylor: "taylor",
    primitive: "integral",
    riemann: "integral",
    integral: "integral",
  };
  return requested && topics[requested]
    ? { ...saved, mode: topics[requested] }
    : saved;
}

/**
 * The single validation entry used by manual edits, AI results and undo.
 * No caller is allowed to write an unvalidated Scene into React state.
 */
export function applyFunctionScene(candidate: unknown): Scene {
  return validateScene(candidate);
}
