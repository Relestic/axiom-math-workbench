import type { WorkspaceAction } from "../modules/companion/actions";
export type { WorkspaceAction };

export type WorkspacePage = "proof" | "exercises" | "explore" | "surface" | "diagram" | "textbook";
export type WorkspaceCommandResult = boolean | "unchanged" | { reason: string };

export type WorkspaceEndpoint = {
  query: () => Record<string, unknown>;
  command?: (actions: readonly WorkspaceAction[]) => WorkspaceCommandResult;
};

const endpoints = new Map<string, WorkspaceEndpoint>();
const registrations = new EventTarget();

export function registerWorkspaceEndpoint(
  page: WorkspacePage,
  endpoint: WorkspaceEndpoint,
) {
  endpoints.set(page, endpoint);
  registrations.dispatchEvent(new Event(page));
  return () => {
    if (endpoints.get(page) === endpoint) endpoints.delete(page);
  };
}

export function getWorkspaceEndpoint(page: string) {
  return endpoints.get(page);
}

/** A pane may be lazy-loaded. Stop waiting when the question is cancelled or navigation fails. */
export function waitForWorkspaceEndpoint(page: WorkspacePage, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  if (endpoints.has(page)) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const available = () => finish(true);
    const cancel = () => finish(false);
    const timeout = setTimeout(cancel, 8000);
    function finish(ready: boolean) {
      clearTimeout(timeout);
      registrations.removeEventListener(page, available);
      signal.removeEventListener("abort", cancel);
      resolve(ready);
    }
    registrations.addEventListener(page, available);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
