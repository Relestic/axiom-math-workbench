import {
  getWorkspaceEndpoint,
  type WorkspaceAction,
  type WorkspaceEndpoint,
} from "../../app/workspaceEndpoints";

export type { WorkspaceAction };

// Lock a committed batch until the owner renders so another reply cannot
// overwrite an update React has queued.
const applied = new WeakSet<WorkspaceEndpoint>();

export function queryWorkspace(page: string) {
  const endpoint = getWorkspaceEndpoint(page);
  const isCurrent = () => getWorkspaceEndpoint(page) === endpoint;
  function applyActions(actions: readonly WorkspaceAction[]) {
    if (!actions.length || !endpoint || !isCurrent() || applied.has(endpoint))
      return false;
    if (!endpoint.command?.(actions)) return false;
    applied.add(endpoint);
    return true;
  }
  return {
    context: endpoint ? structuredClone(endpoint.query()) : {},
    isCurrent,
    applyActions,
    apply(action: WorkspaceAction) {
      return applyActions([action]);
    },
  };
}
