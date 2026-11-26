import { conceptIdForGraphNode } from "./graphConcept.js";
import type {
  Attempt,
  ClassicSet,
  CurriculumUnit,
  DashboardData,
  DiagnosticQuestion,
  DiagnosticResult,
  Exercise,
  GraphEdge,
  GraphNode,
  Note,
  PracticeModule,
} from "./types";
import type {
  AttemptDto,
  CatalogDto,
  ConceptDetailDto,
  DashboardDto,
  DiagnosticDto,
  ExerciseDto,
  GraphDto,
  NoteDto,
  PracticeDto,
} from "./dto";

type OfflineExerciseFactory = (
  topicId: string,
  coefficient: number,
) => Exercise;

export function buildUnits(
  catalog: CatalogDto,
  details: ConceptDetailDto[],
  exercises: Exercise[],
  tools: { slug: string; name: string }[],
  sources: Record<string, string>,
): CurriculumUnit[] {
  const detailById = new Map(details.map((detail) => [detail.id, detail]));
  const toolNames = new Map(tools.map((tool) => [tool.slug, tool.name]));
  return catalog.concepts.map((summary) => {
    const detail = detailById.get(summary.id);
    const topicExercises = exercises.filter(
      (exercise) => exercise.topicId === summary.id,
    );
    const proofSteps =
      detail?.proofs.flatMap((proof) =>
        proof.steps?.length
          ? proof.steps.map((step) => step.text)
          : [proof.idea].filter(Boolean),
      ) || [];
    const toolChips = Array.from(
      new Set(
        (detail?.proofs || []).flatMap((proof) =>
          (proof.tools || []).map((slug) => toolNames.get(slug) || slug),
        ),
      ),
    );
    const classic = detail?.classics?.[0];
    const firstExercise = topicExercises[0];
    return {
      id: summary.id,
      title: detail?.name || summary.name,
      short: detail?.short_name || summary.short_name,
      chapter: detail?.chapter ? `第 ${detail.chapter.number} 章` : "",
      definition: detail?.definition || detail?.summary || "",
      formula: detail?.formula || "",
      proof: proofSteps.length ? proofSteps : [detail?.definition || ""],
      example: classic?.object_definition || classic?.refutes_text || "",
      exercise: firstExercise?.title || "",
      solution: [],
      hint: firstExercise?.hint || detail?.proofs?.[0]?.idea || "",
      conditions: (detail?.conditions || []).map((condition) =>
        condition.source_page
          ? `${condition.text}（p.${condition.source_page}）`
          : condition.text,
      ),
      prerequisites: detail?.prerequisites ?? [],
      tools: toolChips.length ? toolChips : ["ε–δ 语言", "定义"],
      symbols: (detail?.symbols || []).map((symbol) => ({
        symbol: symbol.symbol,
        reading: symbol.reading,
        meaning: symbol.meaning,
      })),
      source: sources[summary.id] || classic?.source_url || "",
    };
  });
}

export function buildExercises(
  dtos: ExerciseDto[],
  fallback: OfflineExerciseFactory,
): Exercise[] {
  return dtos.map((dto) => {
    const suffix = Number(dto.code.split("-").pop());
    const coefficient =
      Number.isInteger(suffix) && suffix >= 2 && suffix <= 5 ? suffix : 2;
    const local = fallback(dto.topic_id, coefficient);
    return {
      id: dto.code,
      topicId: dto.topic_id,
      coefficient,
      title: dto.title || local.title,
      hint: dto.hint || local.hint,
      solution: local.solution,
      checks: dto.checks?.length ? dto.checks : local.checks,
      allowedRefs: dto.allowed_refs || [],
      difficulty: dto.difficulty,
      skill: dto.skill,
      type: dto.type,
    };
  });
}

export function findExercise(
  exercises: Exercise[],
  topicId: string,
  coefficient: number,
): Exercise | undefined {
  return (
    exercises.find(
      (exercise) =>
        exercise.topicId === topicId && exercise.coefficient === coefficient,
    ) || exercises.find((exercise) => exercise.topicId === topicId)
  );
}

export function mapAttempt(dto: AttemptDto): Attempt {
  const code = dto.exercise?.code || dto.exercise_id;
  const suffix = Number(code.split("-").pop());
  return {
    id: dto.id,
    exerciseId: code,
    topicId: dto.exercise?.topic_id || code.split("-")[0] || "",
    coefficient: code.startsWith("variant-") ? 0 : (Number.isInteger(suffix) && suffix >= 2 && suffix <= 5 ? suffix : 2),
    title: dto.exercise?.title || code || "练习作答",
    answer: dto.answer_text,
    hints: Boolean(dto.assistance?.hints_used),
    solutionSeen: Boolean(dto.assistance?.solution_viewed),
    createdAt: dto.created_at,
    selfRating: dto.self_rating || "pending",
    status: dto.status,
    score: dto.score,
    feedback: dto.feedback,
    aiReview: dto.ai_review,
  };
}

export function mapNotes(dtos: NoteDto[]): Note[] {
  return dtos.map((dto) => ({
    id: dto.id,
    text: dto.text,
    date: new Date(dto.updated_at || dto.created_at).toLocaleString("zh-CN"),
    conceptId: dto.concept_id,
  }));
}

export function mapGraph(dto: GraphDto): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const progressByState: Record<string, number> = {
    mastered: 82,
    current: 62,
    unlocked_not_started: 24,
    locked: 0,
    locked_extension: 0,
    counterexample: 38,
  };
  const relationMap: Record<string, GraphEdge[2]> = {
    prerequisite_for: "prerequisite",
    uses_in_proof: "prerequisite",
    implies: "implication",
    counterexample_to: "case",
    example_of: "case",
    generalizes: "extension",
  };
  const edges: GraphEdge[] = dto.edges.map((edge) => [
    edge.from,
    edge.to,
    relationMap[edge.relation] || "prerequisite",
  ]);
  const names = new Map(dto.nodes.map((node) => [node.id, node.name]));
  const nodes: GraphNode[] = dto.nodes.map((node) => ({
    id: node.id,
    conceptId: node.concept_id ?? conceptIdForGraphNode(node.id),
    name: node.name,
    x: node.x,
    y: node.y,
    color: node.color,
    size: node.size,
    kind:
      node.kind === "case"
        ? "case"
        : node.kind === "extension"
          ? "extension"
          : undefined,
    progress: progressByState[node.state] ?? 0,
    description: node.description,
    prerequisites: edges
      .filter(([, target]) => target === node.id)
      .map(([source]) => names.get(source) || source),
    connections: edges
      .filter(([source]) => source === node.id)
      .map(([, target]) => names.get(target) || target),
    detail: node.detail || node.description,
    state: node.state,
  }));
  return { nodes, edges };
}

export function mapPractice(dto: PracticeDto): {
  skills: string[];
  modules: PracticeModule[];
  totals: Record<string, number>;
} {
  return {
    skills: dto.skills,
    modules: dto.rows.map((row) => ({
      id: row.topic_id,
      name: row.name,
      label: row.chapter_id ? `章节 ${row.chapter_id}` : "当前课程",
      counts: row.cells.map((cell) => cell.exercise_count),
      scores: row.cells.map((cell) => cell.mastery),
    })),
    totals: {
      cells: dto.totals.cells,
      coveredCells: dto.totals.covered_cells,
      blankCells: dto.totals.blank_cells,
      exercises: dto.totals.exercises,
      attempts: dto.totals.attempts,
      coveragePercent: dto.totals.coverage_percent,
    },
  };
}

export function mapDashboard(
  dto: DashboardDto,
  graph: GraphDto,
  practice: PracticeDto,
): DashboardData {
  return {
    summary: {
      streakDays: dto.summary.streak_days,
      today: {
        attempts: dto.summary.today.attempts,
        distinctConcepts: dto.summary.today.distinct_concepts,
        goal: dto.summary.today.goal,
        goalPercent: dto.summary.today.goal_percent,
      },
      practice: {
        attemptsTotal: dto.summary.practice.attempts_total,
        understoodRate: dto.summary.practice.understood_rate,
        averageScore: dto.summary.practice.average_score,
      },
      mastery: {
        overall: dto.summary.mastery.overall,
        conceptsTracked: dto.summary.mastery.concepts_tracked,
        conceptTotal: dto.summary.mastery.concept_total,
      },
      graph: { gaps: dto.summary.graph.gaps },
      review: { count: dto.summary.review.count },
      current: {
        page: dto.summary.current.page,
        conceptId: dto.summary.current.concept?.id || null,
        conceptName:
          dto.summary.current.concept?.short_name ||
          dto.summary.current.concept?.name ||
          null,
      },
    },
    catalogStats: dto.catalog.stats,
    graphStats: {
      nodes: graph.stats.nodes,
      edges: graph.stats.edges,
      mastered: graph.stats.mastered,
      gaps: graph.stats.gaps,
    },
    practiceTotals: {
      cells: practice.totals.cells,
      coveredCells: practice.totals.covered_cells,
      blankCells: practice.totals.blank_cells,
      exercises: practice.totals.exercises,
      attempts: practice.totals.attempts,
      coveragePercent: practice.totals.coverage_percent,
    },
    reviewItems: (dto.review_queue || []).map((item) => ({
      attemptId: item.attempt_id,
      exerciseId: item.exercise_id,
      title: item.title,
      topicId: item.topic_id,
      selfRating: item.self_rating,
      daysSinceAttempt: item.days_since_attempt,
    })),
  };
}

export function mapClassicSets(
  detailById: Map<string, ConceptDetailDto>,
  fallback: ClassicSet[],
): ClassicSet[] {
  return fallback.map((base) => {
    const detail = detailById.get(base.id);
    if (!detail) return base;
    const proposition =
      detail.propositions?.find((item) => item.truth === "false") ||
      detail.propositions?.[0];
    const counterexample = detail.classics?.find(
      (item) => item.kind === "counterexample",
    );
    return {
      ...base,
      statement: proposition?.statement || base.statement,
      given: proposition?.given_text || base.given,
      conclusion: proposition?.desired_text || base.conclusion,
      repair:
        proposition?.missing_conditions?.length
          ? proposition.missing_conditions.join("；")
          : base.repair,
      negativeCopy: counterexample?.refutes_text || base.negativeCopy,
    };
  });
}

export function mapDiagnostic(dto: DiagnosticDto): {
  questions: DiagnosticQuestion[];
  answers: Record<number, number>;
  previousCorrect: number | null;
} {
  const questions = dto.questions.map((question) => ({
    id: question.id,
    text: question.text,
    options: question.options,
    conceptId: question.concept_id,
    skill: question.skill,
  }));
  const index = new Map(questions.map((question, position) => [question.id, position]));
  const answers: Record<number, number> = {};
  for (const [questionId, value] of Object.entries(
    dto.previous?.answers || {},
  )) {
    const position = index.get(questionId);
    if (position !== undefined) answers[position] = Number(value);
  }
  return {
    questions,
    answers,
    previousCorrect: dto.previous?.correct_count ?? null,
  };
}

export function mapDiagnosticResult(dto: {
  id: string;
  correct_count: number;
  total: number;
  results: {
    question_id: string;
    selected: number;
    correct_index: number;
    correct: boolean;
    reason: string;
    concept_id: string | null;
  }[];
  recommendations: { id: string; name: string }[];
}): DiagnosticResult {
  return {
    id: dto.id,
    correctCount: dto.correct_count,
    total: dto.total,
    results: dto.results.map((item) => ({
      questionId: item.question_id,
      selected: item.selected,
      correctIndex: item.correct_index,
      correct: item.correct,
      reason: item.reason,
      conceptId: item.concept_id,
    })),
    recommendations: dto.recommendations,
  };
}
