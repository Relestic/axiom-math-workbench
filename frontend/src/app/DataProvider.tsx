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
import { fetchDataBundle } from "../lib/api";
import { usePracticeActions } from "../modules/practice/usePracticeActions";
import { useRecordActions } from "../modules/records/useRecordActions";
import { readOfflineBookmarks } from "../modules/records/offline";
import { fetchDashboardBundle } from "../modules/progress/api";
import { useProgressActions } from "../modules/progress/useProgressActions";
import { useSession } from "../modules/identity/api";
import {
  buildExercises,
  buildUnits,
  findExercise,
  mapAttempt,
  mapClassicSets,
  mapDashboard,
  mapDiagnostic,
  mapGraph,
  mapNotes,
  mapPractice,
} from "../domain/mappers";
import type {
  AppData,
  Attempt,
  ClassicSet,
  DashboardData,
  DiagnosticResult,
  Exercise,
  Note,
} from "../domain/types";
import {
  buildOfflineData,
  makeOfflineExercise,
  offlineClassics,
  offlineSources,
} from "../data/offline";

type DataStatus = "loading" | "ready" | "error";

type DataContextValue = {
  data: AppData;
  status: DataStatus;
  error: string;
  selectedConceptId: string;
  selectConcept: (id: string) => void;
  refresh: () => Promise<void>;
  retry: () => void;
  getExercise: (topicId: string, coefficient: number) => Exercise | undefined;
  submitAttempt: (input: {
    exerciseId: string;
    answer: string;
    hintsUsed: number;
    solutionViewed: boolean;
    selfRating?: Attempt["selfRating"];
  }) => Promise<Attempt>;
  rateAttempt: (
    id: string,
    rating: Attempt["selfRating"],
  ) => Promise<void>;
  saveNote: (text: string, conceptId?: string) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
  toggleBookmark: (conceptId: string) => Promise<void>;
  loadHint: (exerciseId: string) => Promise<string>;
  loadSolution: (exerciseId: string) => Promise<string[]>;
  submitDiagnostic: (answers: Record<string, number>) => Promise<DiagnosticResult>;
  refreshDerived: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

const LEGACY_SNAPSHOTS = [
  "axiom-notes",
  "axiom-attempts",
  "axiom-favorites",
  "axiom-dashboard",
  "axiom-diagnostic",
  "axiom-classics",
];

function clearLegacySnapshots(): void {
  try {
    for (const key of LEGACY_SNAPSHOTS) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [data, setData] = useState<AppData>(() => ({
    ...buildOfflineData(),
    bookmarks: readOfflineBookmarks(),
  }));
  const [status, setStatus] = useState<DataStatus>(
    session.mode === "offline" ? "ready" : "loading",
  );
  const [error, setError] = useState("");
  const [selectedConceptId, setSelectedConceptId] = useState(
    () => localStorage.getItem("axiom-offline-concept") || "uniform",
  );
  const loadedFor = useRef<string | null>(null);
  const requestId = useRef(0);

  const mapServerBundle = useCallback(
    async (): Promise<AppData> => {
      const bundle = await fetchDataBundle();
      const exercises = buildExercises(bundle.exercises, makeOfflineExercise);
      const units = buildUnits(
        bundle.catalog,
        bundle.details,
        exercises,
        bundle.catalog.tools,
        offlineSources,
      );
      const graph = mapGraph(bundle.graph);
      const practice = mapPractice(bundle.practice);
      const notes = mapNotes(bundle.notes);
      const attempts = bundle.attempts
        .map(mapAttempt)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      const dashboard = mapDashboard(
        bundle.dashboard,
        bundle.graph,
        bundle.practice,
      );
      const classics = mapClassicSets(
        new Map(bundle.details.map((detail) => [detail.id, detail])),
        offlineClassics,
      );
      const diagnostic = mapDiagnostic(bundle.diagnostic);
      return {
        source: "server",
        units,
        exercises,
        attempts,
        notes,
        bookmarks: bundle.bookmarks
          .filter((bookmark) => bookmark.target_type === "concept")
          .map((bookmark) => bookmark.target_id),
        diagnostic: {
          questions: diagnostic.questions,
          answers: diagnostic.answers,
          result: null,
        },
        dashboard,
        graph,
        practice,
        classics,
      };
    },
    [],
  );

  const loadServer = useCallback(async () => {
    clearLegacySnapshots();
    const current = ++requestId.current;
    setStatus("loading");
    setError("");
    try {
      const next = await mapServerBundle();
      if (current !== requestId.current) return;
      setData(next);
      const preferred =
        next.units.find(
          (unit) => unit.id === next.dashboard.summary.current.conceptId,
        )?.id ||
        next.units.find(
          (unit) =>
            unit.id ===
            (localStorage.getItem("axiom-offline-concept") || "uniform"),
        )?.id ||
        next.units[0]?.id ||
        "uniform";
      setSelectedConceptId(preferred);
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
  }, [mapServerBundle]);

  useEffect(() => {
    if (session.mode === "offline") {
      clearLegacySnapshots();
      setData({ ...buildOfflineData(), bookmarks: readOfflineBookmarks() });
      setSelectedConceptId(
        localStorage.getItem("axiom-offline-concept") || "uniform",
      );
      setStatus("ready");
      setError("");
      loadedFor.current = "offline";
      return;
    }
    if (session.mode === "server" && session.user) {
      if (loadedFor.current === session.user.id) return;
      loadedFor.current = session.user.id;
      void loadServer();
      return;
    }
    loadedFor.current = null;
    setStatus("loading");
  }, [loadServer, session.mode, session.user?.id]);

  useEffect(() => {
    if (session.mode === "offline") {
      try {
        localStorage.setItem("axiom-offline-concept", selectedConceptId);
      } catch {
        /* ignore */
      }
    }
  }, [selectedConceptId, session.mode]);

  const selectConcept = useCallback((id: string) => {
    setSelectedConceptId(id);
  }, []);

  const refreshDerived = useCallback(async () => {
    if (session.mode !== "server") return;
    try {
      const derived = await fetchDashboardBundle();
      setData((current) => ({
        ...current,
        dashboard: mapDashboard(
          derived.dashboard,
          derived.graph,
          derived.practice,
        ),
        graph: mapGraph(derived.graph),
        practice: mapPractice(derived.practice),
      }));
    } catch {
      /* A transient refresh failure must not discard the current screen. */
    }
  }, [session.mode]);

  const refresh = useCallback(async () => {
    if (session.mode === "offline") {
      clearLegacySnapshots();
      setData({ ...buildOfflineData(), bookmarks: readOfflineBookmarks() });
      return;
    }
    await loadServer();
  }, [loadServer, session.mode]);

  const retry = useCallback(() => {
    if (session.mode === "server") void loadServer();
  }, [loadServer, session.mode]);

  const getExercise = useCallback(
    (topicId: string, coefficient: number) =>
      findExercise(data.exercises, topicId, coefficient),
    [data.exercises],
  );

  const { submitAttempt, rateAttempt, loadHint, loadSolution } =
    usePracticeActions({ session, data, setData, refreshDerived });
  const { saveNote, deleteNote, toggleBookmark } = useRecordActions({
    session,
    data,
    setData,
  });
  const { submitDiagnostic } = useProgressActions({ session, data, setData });

  const value = useMemo<DataContextValue>(
    () => ({
      data,
      status,
      error,
      selectedConceptId,
      selectConcept,
      refresh,
      retry,
      getExercise,
      submitAttempt,
      rateAttempt,
      saveNote,
      deleteNote,
      toggleBookmark,
      loadHint,
      loadSolution,
      submitDiagnostic,
      refreshDerived,
    }),
    [
      data,
      status,
      error,
      selectedConceptId,
      selectConcept,
      refresh,
      retry,
      getExercise,
      submitAttempt,
      rateAttempt,
      saveNote,
      deleteNote,
      toggleBookmark,
      loadHint,
      loadSolution,
      submitDiagnostic,
      refreshDerived,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("useAppData must be used inside DataProvider");
  return value;
}
