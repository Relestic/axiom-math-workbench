import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { offlineDiagnosticQuestions } from "../../../data/offline/diagnostic";
import type { DataBundleDto } from "../../../domain/dto";
import {
  mapDashboard,
  mapDiagnostic,
  mapDiagnosticResult,
  mapGraph,
  mapPractice,
} from "../../../domain/mappers";
import type {
  AppData,
  Attempt,
  CurriculumUnit,
  DataSource,
  DiagnosticResult,
  LocalBook,
} from "../../../domain/types";
import { useLocalData } from "../../../lib/localData";
import { fetchDashboardBundle, submitDiagnosticTyped } from "../api";
import { deriveOfflineProgress } from "../offline";
import { deriveOfflineGraph } from "../offlineGraph";

const emptyRun: Pick<AppData["diagnostic"], "answers" | "result"> = {
  answers: {},
  result: null,
};
const emptyDiagnostic: AppData["diagnostic"] = { questions: [], ...emptyRun };
const emptyProgress = deriveOfflineProgress([]);

type ProgressBundle = Pick<DataBundleDto, "dashboard" | "graph" | "practice">;

function mapProgress(bundle: ProgressBundle) {
  return {
    dashboard: mapDashboard(bundle.dashboard, bundle.graph, bundle.practice),
    graph: mapGraph(bundle.graph),
    practice: mapPractice(bundle.practice),
  };
}

export function useProgress(
  source: DataSource,
  attempts: readonly Attempt[],
  units: readonly CurriculumUnit[],
  books: readonly LocalBook[],
  serverUserId: string | null,
) {
  const localRun = useLocalData("axiom-offline-diagnostic", emptyRun);
  const [serverProgress, setServerProgress] = useState(() => ({
    ...emptyProgress,
    graph: deriveOfflineGraph([], [], []),
  }));
  const [serverDiagnostic, setServerDiagnostic] = useState(emptyDiagnostic);
  const requestId = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestId.current += 1;
    };
  }, []);

  const diagnostic = useMemo(
    () =>
      source === "server"
        ? serverDiagnostic
        : {
            questions: offlineDiagnosticQuestions,
            answers: localRun.value.answers ?? emptyRun.answers,
            result: localRun.value.result ?? null,
          },
    [localRun.value, serverDiagnostic, source],
  );

  const progress = useMemo(() => {
    if (source === "server") return serverProgress;
    const graph = deriveOfflineGraph(units, books, attempts);
    const { dashboard, practice } = deriveOfflineProgress(attempts);
    return {
      graph, practice,
      dashboard: {
        ...dashboard,
        graphStats: { ...dashboard.graphStats, nodes: graph.nodes.length, edges: graph.edges.length },
      },
    };
  }, [source, units, books, attempts, serverProgress]);

  const loadServer = useCallback(
    (bundle: ProgressBundle & Pick<DataBundleDto, "diagnostic">) => {
      requestId.current += 1;
      const next = mapProgress(bundle);
      setServerProgress(next);
      const diagnostic = mapDiagnostic(bundle.diagnostic);
      setServerDiagnostic({
        questions: diagnostic.questions,
        answers: diagnostic.answers,
        result: null,
      });
      return next.dashboard.summary.current.conceptId;
    },
    [],
  );

  const refreshDerived = useCallback(async () => {
    if (!serverUserId || !active.current) return;
    const current = ++requestId.current;
    try {
      const bundle = await fetchDashboardBundle();
      if (current === requestId.current) setServerProgress(mapProgress(bundle));
    } catch {
      /* A transient refresh failure must not discard the current screen. */
    }
  }, [serverUserId]);

  const submitDiagnostic = useCallback(
    async (answers: Record<string, number>): Promise<DiagnosticResult> => {
      if (source === "server") {
        const result = mapDiagnosticResult(
          await submitDiagnosticTyped(answers),
        );
        setServerDiagnostic((current) => ({ ...current, answers, result }));
        return result;
      }

      const results = diagnostic.questions.map((question, index) => {
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
      const missedConcepts = new Set(
        results.flatMap((item) =>
          !item.correct && item.conceptId ? [item.conceptId] : [],
        ),
      );
      const recommendations = Array.from(missedConcepts)
        .map((id) => units.find((unit) => unit.id === id))
        .filter((unit): unit is CurriculumUnit => Boolean(unit))
        .map((unit) => ({ id: unit.id, name: unit.title }));
      const result: DiagnosticResult = {
        correctCount: results.filter((item) => item.correct).length,
        total: results.length,
        results,
        recommendations,
      };
      localRun.write(() => ({ answers, result }));
      return result;
    },
    [diagnostic.questions, localRun.write, source, units],
  );

  return {
    ...progress,
    diagnostic,
    loadServer,
    reloadOffline: localRun.reload,
    refreshDerived,
    submitDiagnostic,
  };
}
