import type { LocalCatalog } from "../../teaching/localCatalog";
import { ApiError } from "../../../lib/api";
import { useCallback, useMemo, useState } from "react";
import {
  makeOfflineExercise,
  offlineExerciseCatalog,
} from "../../../data/offline/curriculum";
import {
  buildExercises,
  findExercise,
  mapAttempt,
} from "../../../domain/mappers";
import type { DataBundleDto } from "../../../domain/dto";
import type { Attempt, DataSource, Exercise } from "../../../domain/types";
import { useLocalData } from "../../../lib/localData";
import {
  fetchExerciseHint,
  fetchExerciseSolution,
  rateAttemptTyped,
  submitAttemptTyped, submitLocalAttempt, rateLocalAttempt,
} from "../api";

type AttemptInput = {
  exerciseId: string;
  idempotencyKey?: string;
  answer: string;
  hintsUsed: number;
  solutionViewed: boolean;
  selfRating?: Attempt["selfRating"];
};

const offlineExercises = offlineExerciseCatalog();
const emptyAttempts: Attempt[] = [];

export function useExercises(source: DataSource, catalog: LocalCatalog, localAvailable: boolean,
  acceptLocalAttempt: (attempt: Attempt) => void) {
  const offline = useLocalData("axiom-offline-attempts", emptyAttempts);
  const [serverExercises, setServerExercises] = useState<Exercise[]>([]);
  const [serverAttempts, setServerAttempts] = useState<Attempt[]>([]);
  const exercises = useMemo(() => source === "server" ? serverExercises : [...offlineExercises, ...catalog.exercises],
    [source, serverExercises, catalog.exercises]);
  const attempts = useMemo(() => {
    if (source === "server") return serverAttempts;
    const storedIds = new Set(catalog.attempts.map(item => item.id));
    return [...catalog.attempts, ...offline.value.filter(item => !storedIds.has(item.id))]
      .sort((a,b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },[source,serverAttempts,catalog.attempts,offline.value]);

  const loadServer = useCallback(
    (bundle: Pick<DataBundleDto, "exercises" | "attempts">) => {
      const exercises = buildExercises(bundle.exercises, makeOfflineExercise);
      setServerExercises(exercises);
      setServerAttempts(
        bundle.attempts
          .map(mapAttempt)
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
      );
      return exercises;
    },
    [],
  );

  const commands = useMemo(
    () => ({
      getExercise(topicId: string, coefficient: number) {
        return findExercise(exercises, topicId, coefficient);
      },
      async submitAttempt(input: AttemptInput): Promise<Attempt> {
        if (source === "server") {
          const attempt = mapAttempt(
            await submitAttemptTyped({
              exerciseId: input.exerciseId,
              answer: input.answer,
              hintsUsed: input.hintsUsed,
              solutionViewed: input.solutionViewed,
            }),
          );
          setServerAttempts((current) => [
            attempt,
            ...current.filter((item) => item.id !== attempt.id),
          ]);
          return attempt;
        }

        try {
          const dto = await submitLocalAttempt(input);
          if (!dto?.exercise_id) throw new TypeError("本机工作台未启动");
          const attempt = mapAttempt(dto);
          acceptLocalAttempt(attempt);
          return attempt;
        } catch (cause) {
          const missingLocalServer = cause instanceof TypeError || (cause instanceof ApiError && [404,405].includes(cause.status));
          if (localAvailable || !missingLocalServer) throw cause;
        }

        const exercise = exercises.find((item) => item.id === input.exerciseId);
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
        offline.write((current) => [attempt, ...current].slice(0, 150));
        return attempt;
      },
      async rateAttempt(id: string, rating: Attempt["selfRating"]) {
        if (source === "server") {
          const updated = mapAttempt(await rateAttemptTyped(id, rating));
          setServerAttempts((current) =>
            current.map((attempt) => (attempt.id === id ? updated : attempt)),
          );
          return;
        }
        if (catalog.attempts.some(attempt => attempt.id === id)) {
          acceptLocalAttempt(mapAttempt(await rateLocalAttempt(id, rating)));
          return;
        }
        offline.write((current) =>
          current.map((attempt) =>
            attempt.id === id ? { ...attempt, selfRating: rating } : attempt,
          ),
        );
      },
      async loadHint(exerciseId: string): Promise<string> {
        if (source === "server")
          return (await fetchExerciseHint(exerciseId)).hint;
        return (
          exercises.find((exercise) => exercise.id === exerciseId)?.hint || ""
        );
      },
      async loadSolution(exerciseId: string): Promise<string[]> {
        if (source === "offline") {
          return (
            exercises.find((exercise) => exercise.id === exerciseId)
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
    }),
    [exercises, offline.write, source, localAvailable, acceptLocalAttempt, catalog.attempts],
  );

  return {
    exercises,
    attempts,
    loadServer,
    reloadOffline: offline.reload,
    commands,
  };
}
