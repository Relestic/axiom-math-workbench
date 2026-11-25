export type WorkspaceAction =
  | { type: "highlight_proof_step"; ref: string }
  | { type: "set_scene_param"; name: string; value: number };

export type WorkspacePage = "proof" | "exercises" | "explore" | "surface";

export type WorkspaceEndpoint = {
  query: () => Record<string, unknown>;
  command?: (actions: readonly WorkspaceAction[]) => boolean;
};

const endpoints = new Map<string, WorkspaceEndpoint>();

export function registerWorkspaceEndpoint(
  page: WorkspacePage,
  endpoint: WorkspaceEndpoint,
) {
  endpoints.set(page, endpoint);
  return () => {
    if (endpoints.get(page) === endpoint) endpoints.delete(page);
  };
}

export function getWorkspaceEndpoint(page: string) {
  return endpoints.get(page);
}
