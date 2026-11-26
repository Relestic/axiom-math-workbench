import type { WorkspaceAction } from "../../../app/workspaceEndpoints";

export function sceneParameterBatch<Scene>(
  scene: Scene,
  actions: readonly WorkspaceAction[],
  validateChange: (candidate: Scene, name: string, value: number) => Scene | null,
): Scene | null {
  let next = scene;
  for (const action of actions) {
    if (action.type !== "set_scene_param") return null;
    const candidate = validateChange(next, action.name, action.value);
    if (!candidate) return null;
    next = candidate;
  }
  if (next === scene || JSON.stringify(next) === JSON.stringify(scene))
    return null;
  return next;
}
