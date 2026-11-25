import { useLayoutEffect, useRef } from "react";
import {
  registerWorkspaceEndpoint,
  type WorkspaceEndpoint,
  type WorkspacePage,
} from "./workspaceEndpoints";

export function useWorkspaceEndpoint(
  page: WorkspacePage | null,
  revision: string,
  endpoint: WorkspaceEndpoint,
) {
  const live = useRef(endpoint);
  useLayoutEffect(() => {
    live.current = endpoint;
  });
  useLayoutEffect(() => {
    if (!page) return;
    return registerWorkspaceEndpoint(page, {
      query: () => live.current.query(),
      command: (actions) => live.current.command?.(actions) ?? false,
    });
  }, [page, revision]);
}
