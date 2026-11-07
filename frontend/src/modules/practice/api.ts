/**
 * Practice module data access.
 * Pages/commands must go through this boundary rather than importing lib/api
 * directly. The underlying transport stays shared in lib/api.ts.
 */
import { apiFetch } from "../../lib/api";
import type { AttemptDto } from "../../domain/dto";

export {
  fetchExerciseHint,
  fetchExerciseSolution,
  rateAttemptTyped,
  submitAttemptTyped,
} from "../../lib/api";

export type DiscussionTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ExerciseGrade = {
  score: number;
  verdict: "strong" | "partial" | "needs_work";
  summary: string;
  strengths: string[];
  gaps: string[];
  next_steps: string[];
};

export type DiscussionResult = {
  message: string;
  provider?: string;
  model?: string;
};

export async function discussExercise(input: {
  exercise_id: string;
  answer_text: string;
  message: string;
  history: DiscussionTurn[];
}): Promise<DiscussionResult> {
  return apiFetch<DiscussionResult>("/api/v1/ai/exercises/discuss", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitExerciseWithAI(input: {
  exercise_id: string;
  answer_text: string;
  history: DiscussionTurn[];
  hints_used: number;
  solution_viewed: boolean;
}): Promise<AttemptDto> {
  return apiFetch<AttemptDto>("/api/v1/ai/exercises/submit", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
