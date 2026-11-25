/**
 * Public cross-module contracts.
 *
 * Keep IDs as strings at every boundary. The backend uses the same string IDs
 * for concept / exercise / attempt / scene / note. When a field changes, update
 * the frontend type and the matching Pydantic schema in the same task.
 */

export type ConceptId = string;
export type ExerciseId = string;
export type AttemptId = string;
export type SceneId = string;
export type NoteId = string;

export type { Scene } from "../lib/plotScene";
export type { Exercise } from "../domain/types";
export type { Attempt, AttemptFeedback } from "../domain/types";
export type { Note } from "../domain/types";
export type { GraphNode, GraphEdge } from "../domain/types";
