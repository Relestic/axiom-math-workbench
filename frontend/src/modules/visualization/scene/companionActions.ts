import type { WorkspaceAction } from "../../../app/workspaceEndpoints";

type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

const functionAliases = new Map([
  ["ln", "log"], ["arcsin", "asin"], ["arccos", "acos"], ["arctan", "atan"], ["sgn", "sign"],
]);

export function normalizeGraphExpression(input: string): string {
  if (input.length > 300) throw new Error("表达式需为 1–300 个字符");
  const expression = input.trim()
    .replaceAll("（", "(").replaceAll("）", ")")
    .replace(/^(?:[yz]|[fg]\s*\(\s*x\s*\)|f\s*\(\s*x\s*,\s*y\s*\))\s*=(?!=)\s*/, "")
    .replace(/[−–]/g, "-").replaceAll("·", "*")
    .replace(/[a-zA-Z_][a-zA-Z_0-9]*(?=\s*\()/g, name => functionAliases.get(name) ?? name);
  if (!expression || expression.length > 300) throw new Error("表达式需为 1–300 个字符");
  return expression;
}

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
