import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  AppData,
  DiagnosticResult,
} from "../../domain/types";
import { mapDiagnosticResult } from "../../domain/mappers";
import type { SessionValue } from "../../lib/session";
import { submitDiagnosticTyped } from "./api";

type Params = {
  session: SessionValue;
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
};

export function useProgressActions({ session, data, setData }: Params) {
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
    [data.diagnostic.questions, data.units, session.mode, setData],
  );

  return { submitDiagnostic };
}
