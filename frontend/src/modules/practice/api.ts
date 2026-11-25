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
