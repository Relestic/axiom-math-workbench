import type { Attempt, DashboardData } from "../../domain/types";

export function bumpOfflineDashboard(
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
          new Date(attempt.createdAt).toDateString() ===
          new Date().toDateString(),
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
