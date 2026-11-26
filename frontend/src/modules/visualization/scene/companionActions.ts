import type { WorkspaceAction } from "../../../app/workspaceEndpoints";

type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

export function sceneRange(scene: Bounds, patch: Partial<Bounds> = {}): Bounds {
  return {
    xMin: patch.xMin ?? scene.xMin,
    xMax: patch.xMax ?? scene.xMax,
    yMin: patch.yMin ?? scene.yMin,
    yMax: patch.yMax ?? scene.yMax,
  };
}

/** A board records one undo entry only after all actions on that board validate. */
export function applySceneActions<T>(
  current: T,
  actions: readonly WorkspaceAction[],
  compose: (scene: T, action: WorkspaceAction) => T,
  commit: (scene: T) => void | boolean,
): true | "unchanged" | { reason: string } {
  try {
    const candidate = actions.reduce(compose, current);
    if (JSON.stringify(candidate) === JSON.stringify(current)) return "unchanged";
    if (commit(candidate) === false) return { reason: "图像配置未通过校验" };
    return true;
  } catch (error) {
    const reason = error instanceof Error && /[\u3400-\u9fff]/u.test(error.message)
      ? error.message : "图像配置未通过校验，请检查数学表达式和参数范围";
    return { reason };
  }
}
