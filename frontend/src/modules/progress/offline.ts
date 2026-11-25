import type { AppData, Attempt } from "../../domain/types";
import {
  offlineDashboard,
  offlinePractice,
} from "../../data/offline/dashboard";

function dayNumber(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

export function deriveOfflineProgress(
  attempts: readonly Attempt[],
  now = new Date(),
): Pick<AppData, "dashboard" | "practice"> {
  const today = dayNumber(now);
  const studiedDays = new Set<number>();
  const todayConcepts = new Set<string>();
  const reviewItems: AppData["dashboard"]["reviewItems"] = [];
  const scores: number[] = [];
  let todayAttempts = 0;
  let understood = 0;

  for (const attempt of attempts) {
    const day = dayNumber(new Date(attempt.createdAt));
    if (Number.isFinite(day)) studiedDays.add(day);
    if (day === today) {
      todayAttempts += 1;
      todayConcepts.add(attempt.topicId);
    }
    if (attempt.selfRating === "understood") understood += 1;
    if (attempt.score != null && Number.isFinite(attempt.score))
      scores.push(attempt.score);
    if (attempt.selfRating === "pending" || attempt.selfRating === "revisit") {
      reviewItems.push({
        attemptId: attempt.id,
        exerciseId: attempt.exerciseId,
        title: attempt.title,
        topicId: attempt.topicId,
        selfRating: attempt.selfRating,
        daysSinceAttempt: Number.isFinite(day) ? Math.max(0, today - day) : 0,
      });
    }
  }

  let streakDays = 0;
  let day = studiedDays.has(today) ? today : today - 1;
  while (studiedDays.has(day)) {
    streakDays += 1;
    day -= 1;
  }

  const goal = offlineDashboard.summary.today.goal;
  return {
    dashboard: {
      ...offlineDashboard,
      summary: {
        ...offlineDashboard.summary,
        streakDays,
        today: {
          attempts: todayAttempts,
          distinctConcepts: todayConcepts.size,
          goal,
          goalPercent: goal
            ? Math.round(Math.min(100, (todayConcepts.size / goal) * 100))
            : 0,
        },
        practice: {
          attemptsTotal: attempts.length,
          understoodRate: attempts.length
            ? Math.round((understood / attempts.length) * 100)
            : 0,
          averageScore: scores.length
            ? Math.round(
                scores.reduce((sum, score) => sum + score, 0) / scores.length,
              )
            : null,
        },
        review: { count: reviewItems.length },
      },
      practiceTotals: {
        ...offlineDashboard.practiceTotals,
        attempts: attempts.length,
      },
      reviewItems,
    },
    practice: {
      ...offlinePractice,
      totals: { ...offlinePractice.totals, attempts: attempts.length },
    },
  };
}
