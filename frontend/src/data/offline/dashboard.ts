import type { DashboardData } from "../../domain/types";
import { offlineCurriculum, offlineExerciseCatalog } from "./curriculum";
import { offlineNodes, offlineEdges } from "./graph";
import { offlinePracticeModules, offlinePracticeSkills } from "./practice";

const totalCells = offlinePracticeModules.reduce(
  (sum, module) => sum + module.counts.length,
  0,
);
const coveredCells = offlinePracticeModules.reduce(
  (sum, module) => sum + module.counts.filter((count) => count > 0).length,
  0,
);
const exercises = offlineExerciseCatalog().length;

export const offlineDashboard: DashboardData = {
  summary: {
    streakDays: 0,
    today: { attempts: 0, distinctConcepts: 0, goal: 8, goalPercent: 0 },
    practice: { attemptsTotal: 0, understoodRate: 0, averageScore: null },
    mastery: {
      overall: 46,
      conceptsTracked: 0,
      conceptTotal: offlineCurriculum.length,
    },
    graph: { gaps: 0 },
    review: { count: 0 },
    current: {
      page: "dashboard",
      conceptId: "uniform",
      conceptName: "一致连续",
    },
  },
  catalogStats: {
    concepts: offlineCurriculum.length,
    chapters: 12,
    exercises,
  },
  graphStats: {
    nodes: offlineNodes.length,
    edges: offlineEdges.length,
    mastered: 0,
    gaps: 0,
  },
  practiceTotals: {
    cells: totalCells,
    coveredCells,
    blankCells: Math.max(0, totalCells - coveredCells),
    exercises,
    attempts: 0,
    coveragePercent: totalCells
      ? Math.round((coveredCells / totalCells) * 100)
      : 0,
  },
  reviewItems: [],
};

export const offlinePractice = {
  skills: offlinePracticeSkills,
  modules: offlinePracticeModules,
  totals: {
    cells: totalCells,
    coveredCells,
    blankCells: Math.max(0, totalCells - coveredCells),
    exercises,
    attempts: 0,
    coveragePercent: totalCells
      ? Math.round((coveredCells / totalCells) * 100)
      : 0,
  },
};
