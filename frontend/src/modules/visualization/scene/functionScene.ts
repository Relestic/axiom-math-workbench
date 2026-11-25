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

const analysisParameters = {
  graph: ["x0"],
  continuity: ["x0", "epsilon", "delta"],
  derivative: ["x0", "h"],
  integral: ["x0", "integralStart", "integralEnd", "subdivisions"],
  taylor: ["x0", "order"],
} as const satisfies Record<Scene["mode"], readonly (keyof Scene)[]>;

export function functionParameterHints(scene: Scene) {
  return Object.fromEntries(
    analysisParameters[scene.mode].map((name) => [name, scene[name]]),
  );
}

export function functionParameterCandidate(
  scene: Scene,
  name: string,
  value: number,
): Scene | null {
  if (!Number.isFinite(value)) return null;
  const parameter = scene.parameters.find((item) => item.name === name);
  const control = analysisParameters[scene.mode].find((item) => item === name);

  try {
    if (parameter && parameter.value !== value) {
      return applyFunctionScene({
        ...scene,
        parameters: scene.parameters.map((item) =>
          item === parameter ? { ...item, value } : item,
        ),
      });
    }
    if (control && scene[control] !== value) {
      return applyFunctionScene({ ...scene, [control]: value });
    }
  } catch {
    // Retain the current scene when validation rejects a suggestion.
  }
  return null;
}
