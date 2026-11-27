import {
  initialScene,
  parseAIResult,
  validateScene,
  type Scene,
} from "../../../lib/plotScene";
import type { WorkspaceAction } from "../../../app/workspaceEndpoints";
import { applySceneActions, normalizeGraphExpression, sceneRange } from "./companionActions";

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

function composeFunctionAction(scene: Scene, action: WorkspaceAction): Scene {
  switch (action.type) {
    case "set_curve":
    case "add_curve": {
      const { type, id: requestedId, ...patch } = action;
      patch.expression = normalizeGraphExpression(patch.expression);
      if (patch.expression.includes("?")) {
        throw new Error("分段函数请按定义域拆成多条曲线");
      }
      if (type === "add_curve") {
        if (scene.curves.length >= 4) throw new Error("对比曲线最多 4 条");
        const id = requestedId ?? ["f1", "f2", "f3", "f4"].find(
          name => scene.curves.every(curve => curve.id !== name),
        )!;
        if (scene.curves.some(curve => curve.id === id)) throw new Error("曲线编号已存在");
        const curve = { ...initialScene.curves[0], label: `${id}(x)`, ...patch, id };
        return applyFunctionScene({ ...scene, curves: [...scene.curves, curve] });
      }
      const id = requestedId ?? scene.activeId;
      if (!scene.curves.some(curve => curve.id === id)) throw new Error("指定的曲线不存在");
      return applyFunctionScene({
        ...scene, curves: scene.curves.map(curve => curve.id === id ? { ...curve, ...patch } : curve),
      });
    }
    case "remove_curve": {
      const curves = scene.curves.filter(curve => curve.id !== action.id);
      if (curves.length === scene.curves.length) throw new Error("指定的曲线不存在");
      if (!curves.length) throw new Error("至少需要保留一条曲线");
      const activeId = action.id === scene.activeId ? curves[0].id : scene.activeId;
      return applyFunctionScene({ ...scene, curves, activeId });
    }
    case "clear_comparison_curves":
      return applyFunctionScene({ ...scene, curves: scene.curves.filter(curve => curve.id === scene.activeId) });
    case "set_range":
      return applyFunctionScene({ ...scene, ...sceneRange(scene, action) });
    case "set_mode":
      return applyFunctionScene({ ...scene, mode: action.mode });
    case "set_parameter_range": {
      if (!/^[a-df-wz]$/.test(action.name)) throw new Error("参数名须为 x、e、y 以外的单个小写字母");
      if (!scene.parameters.some(parameter => parameter.name === action.name)) {
        throw new Error("当前曲线没有这个参数，请先修改表达式");
      }
      const { type, ...patch } = action;
      return applyFunctionScene({
        ...scene, parameters: scene.parameters.map(parameter => parameter.name === action.name ? patch : parameter),
      });
    }
    case "set_scene_param": {
      const value = scene.parameters.find(parameter => parameter.name === action.name)?.value
        ?? functionParameterHints(scene)[action.name];
      if (value === action.value) return scene;
      const candidate = functionParameterCandidate(scene, action.name, action.value);
      if (!candidate) throw new Error("参数不存在，或取值超出当前工具的范围");
      return candidate;
    }
    default:
      throw new Error("这项操作不适用于二维函数黑板");
  }
}

export function applyFunctionActions(scene: Scene, actions: readonly WorkspaceAction[], commit: (next: Scene) => void | boolean) {
  return applySceneActions(scene, actions, composeFunctionAction, commit);
}
