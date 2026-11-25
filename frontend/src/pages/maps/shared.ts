import type { GraphEdge, GraphNode } from "../../domain/types";

export type MapProps = {
  onNavigate: (page: string) => void;
  notify: (text: string) => void;
};

export const total = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0);

export function level(
  score: number,
): "empty" | "low" | "medium" | "good" | "strong" {
  if (!score) return "empty";
  if (score < 40) return "low";
  if (score < 60) return "medium";
  if (score < 80) return "good";
  return "strong";
}

export type { GraphEdge, GraphNode };
