import {
  getWorkspaceEndpoint,
  waitForWorkspaceEndpoint,
  type WorkspaceAction,
  type WorkspaceEndpoint,
} from "../../app/workspaceEndpoints";
import { defaultSurfaceScene } from "../visualization/three-d/types";

export type { WorkspaceAction };

// Lock a committed batch until the owner renders so another reply cannot
// overwrite an update React has queued.
const applied = new WeakSet<WorkspaceEndpoint>();
type PlotHints = {
  controls: Record<string, number>;
  parameters?: { name: string; value: number; min: number; max: number }[];
};

function commit(endpoint: WorkspaceEndpoint | undefined, actions: readonly WorkspaceAction[]) {
  if (!actions.length || !endpoint || applied.has(endpoint)) return false;
  const result = endpoint.command?.(actions);
  if (result === true) applied.add(endpoint);
  return Boolean(result);
}

function actionPane(action: WorkspaceAction, activePage: string, context: Record<string, unknown>) {
  if (action.type === "highlight_proof_step") return "proof";
  if (activePage === "explore") {
    const scene = context.function_scene as { parameters?: {name: string}[] } | undefined;
    if (scene?.parameters?.some(parameter => parameter.name === action.name)) return "explore";
  }
  return Object.hasOwn(defaultSurfaceScene.view, action.name) || action.name === "opacity"
    ? "surface" : "explore";
}

export function queryWorkspace(page: string) {
  const endpoint = getWorkspaceEndpoint(page);
  const targets = {
    proof: getWorkspaceEndpoint("proof"),
    explore: getWorkspaceEndpoint("explore"),
    surface: getWorkspaceEndpoint("surface"),
  };
  const context = structuredClone(endpoint?.query() ?? {});
  const available: Partial<Record<"explore" | "surface", PlotHints>> = {};
  for (const pane of ["explore", "surface"] as const) {
    if (pane === page) continue;
    const source = targets[pane]?.query();
    const scene = source?.[pane === "explore" ? "function_scene" : "surface_scene"] as PlotHints | undefined;
    // The plot owner withholds controls during editing and AI requests.
    if (!scene?.controls || !Object.keys(scene.controls).length) continue;
    available[pane] = { controls: { ...scene.controls } };
    if (scene.parameters) available[pane].parameters = scene.parameters.map(({ name, value, min, max }) =>
      ({ name, value, min, max }));
  }
  if (Object.keys(available).length) context.available_scene_controls = available;
  const isCurrent = () => getWorkspaceEndpoint(page) === endpoint;
  function applyActions(actions: readonly WorkspaceAction[]) {
    return isCurrent() && commit(endpoint, actions);
  }
  return {
    context,
    ready: Boolean(endpoint),
    isCurrent,
    applyActions,
    async dispatchActions(actions: readonly WorkspaceAction[], signal: AbortSignal,
      onReveal?: (target: string) => void) {
      if (!actions.length || signal.aborted || !isCurrent()) return false;
      const target = actionPane(actions[0], page, context);
      if (actions.some(action => actionPane(action, page, context) !== target)) return false;
      if (target === page && endpoint) return applyActions(actions);
      const original = targets[target];
      if (original && original !== getWorkspaceEndpoint(target)) return false;

      const ready = waitForWorkspaceEndpoint(target, signal);
      onReveal?.(target);
      window.dispatchEvent(new CustomEvent("axiom:reveal-pane", { detail: { pane: target } }));
      if (!await ready || signal.aborted) return false;
      const current = getWorkspaceEndpoint(target);
      if (original && current !== original) return false;
      return commit(current, actions);
    },
    apply(action: WorkspaceAction) {
      return applyActions([action]);
    },
  };
}
