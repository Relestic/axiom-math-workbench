import { hasMinimumSpan } from "../../../lib/interval";
import { normalizeSurfaceScene } from "./engine";
import type { SurfaceScene } from "./types";
import type { WorkspaceAction } from "../../../app/workspaceEndpoints";
import { applySceneActions, sceneRange } from "../scene/companionActions";

const viewControls = ["azimuth", "elevation", "heightScale", "zoom"] as const;

export function surfaceParameterHints(scene: SurfaceScene) {
  return { ...scene.view, opacity: scene.display.opacity };
}

export function surfaceParameterCandidate(
  scene: SurfaceScene,
  name: string,
  value: number,
): SurfaceScene | null {
  if (!Number.isFinite(value)) return null;
  const viewControl = viewControls.find((control) => control === name);
  try {
    if (viewControl && scene.view[viewControl] !== value) {
      const candidate = normalizeSurfaceScene({
        ...scene,
        view: { ...scene.view, [viewControl]: value },
      });
      if (candidate.view[viewControl] === value) return candidate;
    }
    if (name === "opacity" && scene.display.opacity !== value) {
      const candidate = normalizeSurfaceScene({
        ...scene,
        display: { ...scene.display, opacity: value },
      });
      if (candidate.display.opacity === value) return candidate;
    }
  } catch {
    // Retain the current scene when validation rejects a suggestion.
  }
  return null;
}

function composeSurfaceAction(scene: SurfaceScene, action: WorkspaceAction): SurfaceScene {
  switch (action.type) {
    case "set_surface_expression":
      if (!action.expression.trim()) throw new Error("曲面表达式不能为空");
      return normalizeSurfaceScene({ ...scene, expression: action.expression });
    case "set_surface_range": {
      const range = sceneRange(scene, action);
      if (!Object.values(range).every(value => Number.isFinite(value) && value >= -20 && value <= 20)) {
        throw new Error("三维显示区间必须在 −20 到 20 之间");
      }
      if (!hasMinimumSpan(range.xMin, range.xMax, 0.2) || !hasMinimumSpan(range.yMin, range.yMax, 0.2)) {
        throw new Error("三维显示区间跨度至少为 0.2");
      }
      return normalizeSurfaceScene({ ...scene, ...range });
    }
    case "set_surface_view": {
      const { type, ...patch } = action;
      const requested = { ...scene.view, ...patch };
      const candidate = normalizeSurfaceScene({ ...scene, view: requested });
      if (viewControls.some(key => !Number.isFinite(requested[key]) || candidate.view[key] !== requested[key])) {
        throw new Error("三维视角超出范围。方位角支持 0–360°，俯仰角支持 5–85°，高度缩放支持 0.2–3 倍");
      }
      return candidate;
    }
    case "set_scene_param": {
      const hints = surfaceParameterHints(scene);
      if (Object.hasOwn(hints, action.name) && hints[action.name as keyof typeof hints] === action.value) return scene;
      const candidate = surfaceParameterCandidate(scene, action.name, action.value);
      if (!candidate) throw new Error("三维控件不存在，或取值超出范围");
      return candidate;
    }
    default:
      throw new Error("这项操作不适用于三维曲面黑板");
  }
}

export function applySurfaceActions(scene: SurfaceScene, actions: readonly WorkspaceAction[], commit: (next: SurfaceScene) => void | boolean) {
  return applySceneActions(scene, actions, composeSurfaceAction, commit);
}
