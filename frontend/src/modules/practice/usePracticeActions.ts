import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AppData, Attempt } from "../../domain/types";
import { mapAttempt } from "../../domain/mappers";
import { saveOfflineAttempts } from "../../data/offline";
import type { SessionValue } from "../../lib/session";
import { bumpOfflineDashboard } from "../progress/dashboard";
import {
  fetchExerciseHint,
  fetchExerciseSolution,
  rateAttemptTyped,
  submitAttemptTyped,
} from "./api";

type Params = {
  session: SessionValue;
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  refreshDerived: () => Promise<void>;
};

export function usePracticeActions({
  session,
  data,
  setData,
  refreshDerived,
}: Params) {
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
    [data.exercises, refreshDerived, session.mode, setData],
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
    [refreshDerived, session.mode, setData],
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

  return { submitAttempt, rateAttempt, loadHint, loadSolution };
}
