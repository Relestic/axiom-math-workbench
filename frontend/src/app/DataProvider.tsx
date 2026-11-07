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
import {
  fetchExerciseHint,
  fetchExerciseSolution,
  rateAttemptTyped,
  submitAttemptTyped,
} from "../modules/practice/api";
import {
  createNoteTyped,
  deleteNoteRequest,
  toggleBookmarkRequest,
} from "../modules/records/api";
import {
  fetchDashboardBundle,
  submitDiagnosticTyped,
} from "../modules/progress/api";
import { useSession } from "../modules/identity/api";
import {
  buildExercises,
  buildUnits,
  findExercise,
  mapAttempt,
  mapClassicSets,
  mapDashboard,
  mapDiagnostic,
  mapDiagnosticResult,
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
  saveOfflineAttempts,
  saveOfflineNotes,
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

const OFFLINE_BOOKMARKS = "axiom-offline-bookmarks";
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

function readOfflineBookmarks(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_BOOKMARKS) || "[]");
  } catch {
    return [];
  }
}

function saveOfflineBookmarks(ids: string[]): void {
  try {
    localStorage.setItem(OFFLINE_BOOKMARKS, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function bumpOfflineDashboard(
  dashboard: DashboardData,
  attempts: Attempt[],
): DashboardData {
  const summary = {
    ...dashboard.summary,
    practice: {
      ...dashboard.summary.practice,
      attemptsTotal: attempts.length,
    },
    today: {
      ...dashboard.summary.today,
      attempts: attempts.filter(
        (attempt) =>
          new Date(attempt.createdAt).toDateString() === new Date().toDateString(),
      ).length,
    },
    review: {
      count: attempts.filter(
        (attempt) =>
          attempt.selfRating === "revisit" || attempt.selfRating === "pending",
      ).length,
    },
  };
  return {
    ...dashboard,
    summary,
    practiceTotals: {
      ...dashboard.practiceTotals,
      attempts: attempts.length,
    },
  };
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

  const submitAttempt = useCallback(
    async (input: {
      exerciseId: string;
      answer: string;
      hintsUsed: number;
      solutionViewed: boolean;
      selfRating?: Attempt["selfRating"];
    }): Promise<Attempt> => {
      if (session.mode === "server") {
        const dto = await submitAttemptTyped({
          exerciseId: input.exerciseId,
          answer: input.answer,
          hintsUsed: input.hintsUsed,
          solutionViewed: input.solutionViewed,
        });
        const attempt = mapAttempt(dto);
        setData((current) => ({
          ...current,
          attempts: [attempt, ...current.attempts],
        }));
        void refreshDerived();
        return attempt;
      }
      const exercise = data.exercises.find(
        (item) => item.id === input.exerciseId,
      );
      const attempt: Attempt = {
        id: crypto.randomUUID(),
        exerciseId: input.exerciseId,
        topicId: exercise?.topicId || input.exerciseId.split("-")[0],
        coefficient: exercise?.coefficient || 2,
        title: exercise?.title || input.exerciseId,
        answer: input.answer,
        hints: input.hintsUsed > 0,
        solutionSeen: input.solutionViewed,
        createdAt: new Date().toISOString(),
        selfRating: input.selfRating || "pending",
      };
      setData((current) => {
        const attempts = [attempt, ...current.attempts];
        saveOfflineAttempts(attempts);
        return {
          ...current,
          attempts,
          dashboard: bumpOfflineDashboard(current.dashboard, attempts),
        };
      });
      return attempt;
    },
    [data.exercises, refreshDerived, session.mode],
  );

  const rateAttempt = useCallback(
    async (id: string, rating: Attempt["selfRating"]) => {
      if (session.mode === "server") {
        await rateAttemptTyped(id, rating);
      }
      setData((current) => {
        const attempts = current.attempts.map((attempt) =>
          attempt.id === id ? { ...attempt, selfRating: rating } : attempt,
        );
        if (session.mode === "offline") saveOfflineAttempts(attempts);
        return {
          ...current,
          attempts,
          dashboard: bumpOfflineDashboard(current.dashboard, attempts),
        };
      });
      if (session.mode === "server") void refreshDerived();
    },
    [refreshDerived, session.mode],
  );

  const saveNote = useCallback(
    async (text: string, conceptId?: string): Promise<Note> => {
      if (session.mode === "server") {
        const dto = await createNoteTyped(text, conceptId);
        const note = mapNotes([dto])[0];
        setData((current) => ({
          ...current,
          notes: [note, ...current.notes],
        }));
        return note;
      }
      const note: Note = {
        id: crypto.randomUUID(),
        text,
        date: new Date().toLocaleString("zh-CN"),
        conceptId: conceptId || null,
      };
      setData((current) => {
        const notes = [note, ...current.notes];
        saveOfflineNotes(notes);
        return { ...current, notes };
      });
      return note;
    },
    [session.mode],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (session.mode === "server") {
        await deleteNoteRequest(id);
      }
      setData((current) => {
        const notes = current.notes.filter((note) => note.id !== id);
        if (session.mode === "offline") saveOfflineNotes(notes);
        return { ...current, notes };
      });
    },
    [session.mode],
  );

  const toggleBookmark = useCallback(
    async (conceptId: string) => {
      const active = data.bookmarks.includes(conceptId);
      if (session.mode === "server") {
        await toggleBookmarkRequest(conceptId, !active);
      }
      setData((current) => {
        const bookmarks = active
          ? current.bookmarks.filter((id) => id !== conceptId)
          : [...current.bookmarks, conceptId];
        if (session.mode === "offline") saveOfflineBookmarks(bookmarks);
        return { ...current, bookmarks };
      });
    },
    [data.bookmarks, session.mode],
  );

  const loadHint = useCallback(
    async (exerciseId: string): Promise<string> => {
      if (session.mode !== "server") {
        return (
          data.exercises.find((exercise) => exercise.id === exerciseId)?.hint ||
          ""
        );
      }
      const result = await fetchExerciseHint(exerciseId);
      return result.hint;
    },
    [data.exercises, session.mode],
  );

  const loadSolution = useCallback(
    async (exerciseId: string): Promise<string[]> => {
      if (session.mode !== "server") {
        return (
          data.exercises.find((exercise) => exercise.id === exerciseId)
            ?.solution || []
        );
      }
      const result = await fetchExerciseSolution(exerciseId);
      return (result.steps || [])
        .map((step) =>
          step.title ? `${step.title}：${step.text || ""}` : step.text || "",
        )
        .filter(Boolean);
    },
    [data.exercises, session.mode],
  );

  const submitDiagnostic = useCallback(
    async (answers: Record<string, number>): Promise<DiagnosticResult> => {
      if (session.mode === "server") {
        const dto = await submitDiagnosticTyped(answers);
        const result = mapDiagnosticResult(dto);
        setData((current) => ({
          ...current,
          diagnostic: { ...current.diagnostic, answers, result },
        }));
        return result;
      }
      const questions = data.diagnostic.questions;
      const results = questions.map((question, index) => {
        const selected = answers[index] ?? -1;
        const correctIndex = question.correctIndex ?? 0;
        return {
          questionId: question.id,
          selected,
          correctIndex,
          correct: selected === correctIndex,
          reason: question.reason || "",
          conceptId: question.conceptId || null,
        };
      });
      const correctCount = results.filter((item) => item.correct).length;
      const recommendations = Array.from(
        new Set(
          results
            .filter((item) => !item.correct && item.conceptId)
            .map((item) => item.conceptId as string),
        ),
      )
        .map((id) => data.units.find((unit) => unit.id === id))
        .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
        .map((unit) => ({ id: unit.id, name: unit.title }));
      const result: DiagnosticResult = {
        correctCount,
        total: questions.length,
        results,
        recommendations,
      };
      setData((current) => ({
        ...current,
        diagnostic: { ...current.diagnostic, answers, result },
      }));
      return result;
    },
    [data.diagnostic.questions, data.units, session.mode],
  );

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
