import {
  getWorkspaceEndpoint,
  waitForWorkspaceEndpoint,
  type WorkspaceAction,
  type WorkspaceEndpoint,
} from "../../app/workspaceEndpoints";
import { defaultSurfaceScene } from "../visualization/three-d/types";
import { fitCompanionContext } from "./context";

export type { WorkspaceAction };
export type DeskPanes = { study: string; board: string; collapsed: boolean };
type Context = Record<string, unknown>;
type Target = "proof" | "explore" | "surface" | "diagram";

// A React state update can be queued before its new endpoint revision is registered.
const applied = new WeakSet<WorkspaceEndpoint>();

function commit(endpoint: WorkspaceEndpoint | undefined, actions: readonly WorkspaceAction[]) {
  if (!actions.length || !endpoint || applied.has(endpoint)) return false;
  const result = endpoint.command?.(actions);
  if (result === true) applied.add(endpoint);
  return result === "unchanged" ? true : result ?? false;
}

function record(value: unknown): Context {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Context : {};
}
function fields(value: unknown, names: string[]) {
  const source = record(value);
  return Object.fromEntries(names.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
}
function items(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function actionTarget(action: WorkspaceAction, context: Context): Target {
  switch (action.type) {
    case "highlight_proof_step": return "proof";
    case "set_diagram":
    case "upsert_diagram_node":
    case "remove_diagram_node":
    case "set_diagram_view": return "diagram";
    case "set_surface_expression":
    case "set_surface_range":
    case "set_surface_view": return "surface";
    case "set_scene_param": {
      const parameters = items(record(context.function_scene).parameters);
      if (parameters.some(p => record(p).name === action.name)) return "explore";
      return Object.hasOwn(defaultSurfaceScene.view, action.name) || action.name === "opacity"
        ? "surface" : "explore";
    }
    default: return "explore";
  }
}

function workspaceSnapshot(page: string, context: Context, ready: boolean, isCurrent: () => boolean, desk = false) {
  const endpoint = getWorkspaceEndpoint(page);
  const targets = {
    proof: getWorkspaceEndpoint("proof"),
    explore: getWorkspaceEndpoint("explore"),
    surface: getWorkspaceEndpoint("surface"),
    diagram: getWorkspaceEndpoint("diagram"),
  };
  function applyActions(actions: readonly WorkspaceAction[]) {
    return isCurrent() && commit(endpoint, actions);
  }
  return {
    context: structuredClone(context), ready, isCurrent, applyActions,
    apply: (action: WorkspaceAction) => applyActions([action]),
    async dispatchActions(actions: readonly WorkspaceAction[], signal: AbortSignal, onReveal?: (target: Target) => void) {
      if (!actions.length || signal.aborted || !isCurrent()) return false;
      const groups = new Map<Target, WorkspaceAction[]>();
      for (const action of actions) {
        const target = actionTarget(action, context);
        if (!groups.has(target)) groups.set(target, []);
        groups.get(target)!.push(action);
      }
      for (const target of groups.keys()) {
        if (targets[target] && targets[target] !== getWorkspaceEndpoint(target)) return false;
      }
      const reasons: string[] = [];
      let appliedCount = 0;
      function interrupted() {
        if (!appliedCount && !reasons.length) return false as const;
        return {count: actions.length - appliedCount, reason: [...reasons, "目标页面已变化或尚未就绪。"].join(" ")};
      }
      for (const [target, batch] of groups) {
        if (signal.aborted) return interrupted();
        if (desk || target !== page || !endpoint) {
          const mounted = waitForWorkspaceEndpoint(target, signal);
          onReveal?.(target);
          window.dispatchEvent(new CustomEvent("axiom:reveal-pane", { detail: { pane: target } }));
          if (!await mounted || signal.aborted) return interrupted();
        }
        const current = getWorkspaceEndpoint(target);
        if (targets[target] && targets[target] !== current) return interrupted();
        const result = commit(current, batch);
        if (result === true) appliedCount += batch.length;
        else reasons.push(result ? result.reason : "当前步骤或参数已变更，未应用这组操作。");
      }
      return reasons.length ? {count: actions.length - appliedCount, reason: reasons.join(" ")} : true;
    },
  };
}

/** Other sections may suggest an operation that opens the learning desk. */
export function queryWorkspace(page: string) {
  const endpoint = getWorkspaceEndpoint(page);
  const context = { ...endpoint?.query() };
  const available: Context = {};
  for (const pane of ["explore", "surface"] as const) {
    if (pane === page) continue;
    const source = getWorkspaceEndpoint(pane)?.query();
    const scene = record(source?.[pane === "explore" ? "function_scene" : "surface_scene"]);
    if (Object.keys(record(scene.controls)).length) available[pane] = fields(scene, ["controls", "parameters"]);
  }
  if (Object.keys(available).length) context.available_scene_controls = available;
  return workspaceSnapshot(page, context, Boolean(endpoint), () => getWorkspaceEndpoint(page) === endpoint);
}

function studyContext(pane: string, source: Context): Context {
  if (pane === "textbook") {
    const lecture = record(source.lecture);
    return { lecture: {
      conditions: lecture.conditions,
      proof_refs: items(lecture.proof_steps).map(step => record(step).ref),
    } };
  }
  if (pane === "proof") {
    const proof = record(source.proof);
    return { proof: {
      unit_id: proof.unit_id,
      current_step: fields(proof.current_step, ["ref", "title", "text"]),
      refs: items(proof.steps).map(step => record(step).ref),
    } };
  }
  return source;
}

export function queryDeskWorkspace(studyPane: string, boardPane: string, boardCollapsed: boolean) {
  const study = getWorkspaceEndpoint(studyPane);
  const board = boardPane === "pdf" ? undefined : getWorkspaceEndpoint(boardPane);
  const context: Context = {
    ...studyContext(studyPane, study?.query() ?? {}),
    study_pane: studyPane,
    board: { mounted: Boolean(board), tab: boardPane, collapsed: boardCollapsed },
  };
  const boardContext = board?.query();
  if (boardContext?.function_scene) {
    const scene = record(boardContext.function_scene);
    context.function_scene = {
      ...fields(scene, ["active_expression", "mode", "range", "controls"]),
      curves: items(scene.curves).map(curve => fields(curve, ["id", "label", "expression", "domainMin", "domainMax"])),
      parameters: items(scene.parameters).map(parameter => fields(parameter, ["name", "value", "min", "max"])),
    };
  } else if (boardContext?.surface_scene) {
    context.surface_scene = fields(boardContext.surface_scene, ["expression", "range", "view"]);
  } else if (boardContext?.diagram_scene) {
    context.diagram_scene = boardContext.diagram_scene;
  }
  return workspaceSnapshot(studyPane, fitCompanionContext(context), Boolean(study) || studyPane === "review",
    () => getWorkspaceEndpoint(studyPane) === study && (!board || getWorkspaceEndpoint(boardPane) === board), true);
}
