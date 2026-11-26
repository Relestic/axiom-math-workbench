import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppData, DataSource } from "../domain/types";
import { fetchDataBundle } from "../lib/api";
import { useSession } from "../modules/identity/api";
import { useSelectedConcept } from "../modules/identity/hooks/useSelectedConcept";
import { useExercises } from "../modules/practice/hooks/useExercises";
import { useProgress } from "../modules/progress/hooks/useProgress";
import { useNotes } from "../modules/records/hooks/useNotes";
import { useLocalCatalog } from "./useLocalCatalog";
import { useTeachingContent } from "../modules/teaching/useTeachingContent";

type DataStatus = "loading" | "ready" | "error";

type DataContextValue = ReturnType<typeof useWorkspaceData>;
const DataContext = createContext<DataContextValue | null>(null);

function useWorkspaceData(serverUserId: string | null) {
  const source: DataSource = serverUserId ? "server" : "offline";
  const [status, setStatus] = useState<DataStatus>(
    source === "offline" ? "ready" : "loading",
  );
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const active = useRef(false);

  const identity = useSelectedConcept(source);
  const local = useLocalCatalog(source === "offline");
  const practice = useExercises(source, local.catalog, local.available, local.acceptAttempt);
  const records = useNotes(source);
  const teaching = useTeachingContent(source, local.catalog.units);
  useEffect(() => {
    if (source === "offline" && local.available && !teaching.units.some(unit => unit.id === identity.selectedConceptId)) {
      const fallback = teaching.units.find(unit => unit.id === "uniform") || teaching.units[0];
      if (fallback) identity.selectConcept(fallback.id);
    }
  }, [source, local.available, teaching.units, identity.selectedConceptId, identity.selectConcept]);
  const progress = useProgress(
    source,
    practice.attempts,
    teaching.units,
    serverUserId,
  );

  const loadServer = useCallback(async () => {
    if (!active.current || !serverUserId) return;
    const current = ++requestId.current;
    setStatus("loading");
    setError("");

    try {
      const bundle = await fetchDataBundle();
      if (current !== requestId.current) return;

      const exercises = practice.loadServer(bundle);
      const units = teaching.loadServer(bundle, exercises);
      records.loadServer(bundle);
      const preferredConcept = progress.loadServer(bundle);
      identity.selectServerConcept(
        units.map((unit) => unit.id),
        preferredConcept,
      );
      setStatus("ready");
    } catch (cause) {
      if (current !== requestId.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "加载服务端学习数据失败，请稍后重试。",
      );
      setStatus("error");
    }
  }, [
    identity.selectServerConcept,
    practice.loadServer,
    progress.loadServer,
    records.loadServer,
    serverUserId,
    teaching.loadServer,
  ]);

  useEffect(() => {
    active.current = true;
    void loadServer();
    return () => {
      active.current = false;
      requestId.current += 1;
    };
  }, [loadServer]);

  const refresh = useCallback(async () => {
    if (source === "server") {
      await loadServer();
      return;
    }
    practice.reloadOffline();
    records.reloadOffline();
    progress.reloadOffline();
    await local.refresh().catch(() => undefined);
  }, [
    loadServer,
    practice.reloadOffline,
    progress.reloadOffline,
    local.refresh,
    records.reloadOffline,
    source,
  ]);

  const retry = useCallback(() => {
    void loadServer();
  }, [loadServer]);

  const submitAttempt = useCallback<typeof practice.commands.submitAttempt>(
    async (input) => {
      const attempt = await practice.commands.submitAttempt(input);
      void progress.refreshDerived();
      return attempt;
    },
    [practice.commands, progress.refreshDerived],
  );

  const rateAttempt = useCallback<typeof practice.commands.rateAttempt>(
    async (id, rating) => {
      await practice.commands.rateAttempt(id, rating);
      void progress.refreshDerived();
    },
    [practice.commands, progress.refreshDerived],
  );

  const data = useMemo<AppData>(
    () => ({
      source,
      units: teaching.units,
      classics: teaching.classics,
      exercises: practice.exercises,
      attempts: practice.attempts,
      notes: records.notes,
      bookmarks: records.bookmarks,
      diagnostic: progress.diagnostic,
      dashboard: progress.dashboard,
      graph: progress.graph,
      practice: progress.practice,
    }),
    [
      source,
      teaching.units,
      teaching.classics,
      practice.exercises,
      practice.attempts,
      records.notes,
      records.bookmarks,
      progress.diagnostic,
      progress.dashboard,
      progress.graph,
      progress.practice,
    ],
  );

  return useMemo(
    () => ({
      data,
      status,
      error,
      localBooks: local.catalog.books,
      localAvailable: local.available,
      refreshLocal: local.refresh,
      selectedConceptId: identity.selectedConceptId,
      selectConcept: identity.selectConcept,
      refresh,
      retry,
      ...practice.commands,
      submitAttempt,
      rateAttempt,
      ...records.commands,
      submitDiagnostic: progress.submitDiagnostic,
      refreshDerived: progress.refreshDerived,
    }),
    [
      data,
      status,
      error,
      local.catalog.books, local.available, local.refresh,
      identity.selectedConceptId,
      identity.selectConcept,
      refresh,
      retry,
      practice.commands,
      submitAttempt,
      rateAttempt,
      records.commands,
      progress.submitDiagnostic,
      progress.refreshDerived,
    ],
  );
}

function WorkspaceDataProvider({
  children,
  serverUserId,
}: {
  children: ReactNode;
  serverUserId: string | null;
}) {
  const value = useWorkspaceData(serverUserId);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useSession();
  const serverUserId = mode === "server" ? (user?.id ?? null) : null;
  return (
    <WorkspaceDataProvider
      key={serverUserId ?? "offline"}
      serverUserId={serverUserId}
    >
      {children}
    </WorkspaceDataProvider>
  );
}

export function useAppData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useAppData must be used inside DataProvider");
  return value;
}
