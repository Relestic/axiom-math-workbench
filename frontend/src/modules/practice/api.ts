/**
 * Practice module data access.
 * Pages/commands must go through this boundary rather than importing lib/api
 * directly. The underlying transport stays shared in lib/api.ts.
 */
export {
  fetchExerciseHint,
  fetchExerciseSolution,
  rateAttemptTyped,
  submitAttemptTyped,
} from "../../lib/api";


import { apiFetch } from "../../lib/api";
import type { AttemptDto, ExerciseDto } from "../../domain/dto";

export function submitLocalAttempt(input: {
  exerciseId:string; answer:string; hintsUsed:number; solutionViewed:boolean; idempotencyKey?:string;
}) {
  return apiFetch<AttemptDto>("/api/v1/local/attempts", {method:"POST", body:JSON.stringify({
    exercise_id:input.exerciseId, answer_text:input.answer, hints_used:input.hintsUsed,
    solution_viewed:input.solutionViewed, idempotency_key:input.idempotencyKey || crypto.randomUUID(),
  })},{auth:false});
}

export function rateLocalAttempt(id:string, rating:string) {
  return apiFetch<AttemptDto>("/api/v1/local/attempts/" + encodeURIComponent(id) + "/self-rating", {
    method:"PATCH",body:JSON.stringify({self_rating:rating}),
  },{auth:false});
}

export function generateLocalVariant(attemptId:string, focus?:string) {
  return apiFetch<ExerciseDto>("/api/v1/local/exercises/variant", {method:"POST",
    body:JSON.stringify({attempt_id:attemptId, error_focus:focus || undefined}),
  },{auth:false});
}
