import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExercises,
  buildUnits,
  mapAttempt,
  mapDashboard,
  mapDiagnostic,
  mapGraph,
  mapNotes,
  mapPractice,
} from "../.test-build-mappers/domain/mappers.js";

const catalog = {
  textbook: { id: "book", title: "Demo", edition: "1", page_count: 10 },
  concepts: [
    { id: "uniform", name: "一致连续", short_name: "一致连续", chapter_id: "ch-4" },
  ],
  tools: [{ slug: "epsilon_delta", name: "ε–δ 语言", unlocked: true }],
  stats: { concepts: 1 },
  progress: {
    week: 1,
    total_weeks: 12,
    last_page: "dashboard",
    last_concept_id: "uniform",
    daily_goal: 8,
    percent: 10,
  },
};

const detail = {
  id: "uniform",
  name: "一致连续",
  short_name: "一致连续",
  definition: "定义",
  formula: "∀ε>0 ∃δ>0",
  summary: "摘要",
  conditions: [{ text: "定义域明确", source_page: 7 }],
  symbols: [{ symbol: "δ", reading: "delta", meaning: "统一距离" }],
  proofs: [
    {
      title: "证明",
      idea: "用量词交换",
      steps: [{ text: "固定 ε" }, { text: "选取 δ" }],
      tools: ["epsilon_delta"],
      source_page: 8,
    },
  ],
  classics: [
    {
      name: "1/x",
      kind: "counterexample",
      object_definition: "开区间上的连续函数",
      refutes_text: "连续但不一致连续",
      source_url: "https://example.com",
    },
  ],
  propositions: [
    {
      statement: "连续蕴含一致连续",
      truth: "false",
      given_text: "连续",
      desired_text: "一致连续",
      missing_conditions: ["闭区间"],
    },
  ],
  chapter: { number: 4, title: "连续" },
};

const exerciseDto = {
  id: "ex-1",
  code: "uniform-2",
  topic_id: "uniform",
  title: "证明一致连续",
  hint: "服务端提示",
  checks: ["检查 δ"],
  allowed_refs: ["epsilon_delta"],
  difficulty: 2,
  skill: "独立证明",
  type: "proof",
};

const localExercise = {
  id: "uniform-2",
  topicId: "uniform",
  coefficient: 2,
  title: "本地题目",
  hint: "本地提示",
  solution: ["第一步", "第二步"],
  checks: ["本地检查"],
};

test("buildUnits maps catalog, proof steps and symbols", () => {
  const exercises = buildExercises([exerciseDto], () => localExercise);
  const units = buildUnits(
    catalog,
    [detail],
    exercises,
    catalog.tools,
    { uniform: "https://example.com/ch4" },
  );
  assert.equal(units.length, 1);
  assert.equal(units[0].title, "一致连续");
  assert.equal(units[0].chapter, "第 4 章");
  assert.deepEqual(units[0].proof, ["固定 ε", "选取 δ"]);
  assert.equal(units[0].symbols[0].reading, "delta");
  assert.equal(units[0].source, "https://example.com/ch4");
});

test("buildExercises merges server metadata and local solution", () => {
  const exercises = buildExercises([exerciseDto], () => localExercise);
  assert.equal(exercises[0].id, "uniform-2");
  assert.equal(exercises[0].coefficient, 2);
  assert.equal(exercises[0].hint, "服务端提示");
  assert.deepEqual(exercises[0].solution, ["第一步", "第二步"]);
  assert.deepEqual(exercises[0].checks, ["检查 δ"]);
});

test("mapAttempt and mapNotes keep server identity and rating", () => {
  const attempt = mapAttempt({
    id: "a1",
    exercise_id: "ex-1",
    answer_text: "答案",
    assistance: { hints_used: 1, solution_viewed: false },
    self_rating: "revisit",
    status: "submitted",
    feedback: { summary: "需要补充条件" },
    created_at: "2026-11-05T10:00:00Z",
    exercise: {
      id: "ex-1",
      code: "uniform-2",
      title: "证明一致连续",
      topic_id: "uniform",
    },
  });
  assert.equal(attempt.topicId, "uniform");
  assert.equal(attempt.coefficient, 2);
  const variant = mapAttempt({exercise_id: "variant-0123456789abcdef0123456789abcdef"});
  assert.equal(variant.coefficient, 0);
  assert.equal(attempt.selfRating, "revisit");
  assert.equal(attempt.feedback.summary, "需要补充条件");
  assert.equal(mapNotes([
    {
      id: "n1",
      text: "笔记",
      concept_id: "uniform",
      created_at: "2026-11-05T10:00:00Z",
    },
  ])[0].conceptId, "uniform");
});

test("mapGraph and mapPractice normalize backend field names", () => {
  const graph = mapGraph({
    nodes: [
      {
        id: "lecture-node",
        concept_id: "uniform",
        name: "一致连续",
        kind: "concept",
        x: 1,
        y: 2,
        color: "#fff",
        size: 10,
        description: "描述",
        detail: "细节",
        state: "current",
      },
      {
        id: "mvt",
        name: "中值定理",
        kind: "concept",
        x: 3,
        y: 4,
        color: "#fff",
        size: 10,
        description: "描述",
        detail: "细节",
        state: "locked",
      },
    ],
    edges: [{ from: "lecture-node", to: "mvt", relation: "prerequisite_for" }],
    stats: { nodes: 2, edges: 1, mastered: 0, gaps: 1 },
  });
  assert.equal(graph.edges[0][2], "prerequisite");
  assert.equal(graph.nodes[0].progress, 62);
  assert.deepEqual(graph.nodes.map(node => node.conceptId), ["uniform", "mean-value"]);
  assert.deepEqual(graph.nodes[0].connections, ["中值定理"]);

  const practice = mapPractice({
    rows: [
      {
        topic_id: "uniform",
        name: "一致连续",
        chapter_id: "ch-4",
        cells: [{ skill: "定义理解", exercise_count: 4, mastery: 50 }],
      },
    ],
    skills: ["定义理解"],
    totals: {
      cells: 40,
      covered_cells: 8,
      blank_cells: 32,
      exercises: 32,
      attempts: 10,
      coverage_percent: 20,
    },
  });
  assert.equal(practice.modules[0].counts[0], 4);
  assert.equal(practice.totals.coveragePercent, 20);
});

test("mapDashboard and mapDiagnostic expose stable view-model fields", () => {
  const graph = {
    nodes: [],
    edges: [],
    stats: { nodes: 20, edges: 28, mastered: 9, gaps: 5 },
  };
  const practice = {
    rows: [],
    skills: [],
    totals: {
      cells: 40,
      covered_cells: 8,
      blank_cells: 32,
      exercises: 32,
      attempts: 10,
      coverage_percent: 20,
    },
  };
  const dashboard = mapDashboard(
    {
      summary: {
        streak_days: 4,
        today: { attempts: 2, distinct_concepts: 1, goal: 8, goal_percent: 25 },
        practice: { attempts_total: 10, understood_rate: 40, average_score: null },
        mastery: { overall: 55, concepts_tracked: 4, concept_total: 8 },
        graph: { gaps: 5 },
        review: { count: 4 },
        current: { page: "desk/exercises", concept: { id: "uniform", name: "一致连续", short_name: "一致连续" } },
      },
      catalog: { stats: { concepts: 8 } },
      review_queue: [],
    },
    graph,
    practice,
  );
  assert.equal(dashboard.summary.practice.attemptsTotal, 10);
  assert.equal(dashboard.summary.current.page, "desk/exercises");
  assert.equal(dashboard.graphStats.edges, 28);
  assert.equal(dashboard.practiceTotals.coveragePercent, 20);

  const diagnostic = mapDiagnostic({
    questions: [
      {
        id: "q1",
        text: "问题",
        options: ["A", "B"],
        concept_id: "uniform",
        skill: "定义理解",
      },
    ],
    previous: { answers: { q1: 1 }, correct_count: 1 },
  });
  assert.deepEqual(diagnostic.answers, { 0: 1 });
  assert.equal(diagnostic.questions[0].conceptId, "uniform");
});
