import type { Attempt } from "../domain/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { emptyCatalog, mapLocalCatalog } from "../modules/teaching/localCatalog";

export function useLocalCatalog(enabled: boolean) {
  const [catalog,setCatalog] = useState(emptyCatalog);
  const [available,setAvailable] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await apiFetch<unknown>("/api/v1/local/bootstrap-extras", {signal:controller.signal}, {auth:false});
      if (controller.signal.aborted) return;
      setCatalog(mapLocalCatalog(response));
      setAvailable(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      setAvailable(false);
      throw error;
    }
  },[enabled]);
  useEffect(() => {
    void refresh().catch(() => { /* Static preview retains its local lessons. */ });
    return () => pending.current?.abort();
  },[refresh]);
  const acceptAttempt = useCallback((attempt: Attempt) => {
    setCatalog(previous => ({...previous, attempts:[attempt, ...previous.attempts.filter(item => item.id !== attempt.id)]}));
    void refresh().catch(() => undefined);
  },[refresh]);
  return {catalog, available, refresh, acceptAttempt};
}
