export type CurriculumUnit = {
  id: string;
  title: string;
  short: string;
  chapter: string;
  definition: string;
  formula: string;
  proof: string[];
  example: string;
  exercise: string;
  solution: string[];
  hint: string;
  conditions: string[];
  tools: string[];
  source: string;
  symbols?: { symbol: string; reading: string; meaning: string }[];
};

export type Exercise = {
  id: string;
  topicId: string;
  coefficient: number;
  title: string;
  hint: string;
  solution: string[];
  checks: string[];
  allowedRefs?: string[];
  difficulty?: number;
  skill?: string;
  type?: string;
};

export type AttemptFeedback = {
  status?: string;
  summary?: string;
  observations?: { type?: string; message?: string }[];
  needs_review?: boolean;
  checker?: string;
  score?: number | null;
  correct?: boolean | null;
  criteria?: { id: string; label: string; weight: number; met: boolean }[];
  reference_answer?: string;
  answer_candidate?: string;
  grading_scope?: string;
  missing_steps?: string[];
};

export type Attempt = {
  id: string;
  exerciseId: string;
  topicId: string;
  coefficient: number;
  title: string;
  answer: string;
  hints: boolean;
  solutionSeen: boolean;
  createdAt: string;
  selfRating: "pending" | "understood" | "revisit";
  status?: string;
  score?: number | null;
  feedback?: AttemptFeedback;
};

export type Note = {
  id: string;
  text: string;
  date: string;
  conceptId?: string | null;
};

export type GraphRelation = "prerequisite" | "implication" | "case" | "extension";

export type GraphNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  size?: number;
  kind?: "case" | "extension";
  progress: number;
  description: string;
  prerequisites: string[];
  connections: string[];
  detail: string;
  state?: string;
};

export type GraphEdge = [string, string, GraphRelation];

export type PracticeModule = {
  id: string;
  name: string;
  label: string;
  counts: number[];
  scores: number[];
};

export type ClassicKind =
  | "line"
  | "square"
  | "step"
  | "reciprocal"
  | "absolute"
  | "dirichlet";

export type ClassicSet = {
  id: string;
  label: string;
  statement: string;
  given: string;
  conclusion: string;
  repair: string;
  positive: string;
  negative: string;
  positiveKind: ClassicKind;
  negativeKind: ClassicKind;
  positiveCopy: string;
  negativeCopy: string;
  positiveTags: string[];
  negativeTags: string[];
};

export type DiagnosticQuestion = {
  id: string;
  text: string;
  options: string[];
  conceptId?: string | null;
  skill?: string;
  correctIndex?: number;
  reason?: string;
};

export type DiagnosticResultItem = {
  questionId: string;
  selected: number;
  correctIndex: number;
  correct: boolean;
  reason: string;
  conceptId?: string | null;
};

export type DiagnosticResult = {
  id?: string;
  correctCount: number;
  total: number;
  results: DiagnosticResultItem[];
  recommendations?: { id: string; name: string }[];
};

export type DashboardSummary = {
  streakDays: number;
  today: {
    attempts: number;
    distinctConcepts: number;
    goal: number;
    goalPercent: number;
  };
  practice: {
    attemptsTotal: number;
    understoodRate: number;
    averageScore: number | null;
  };
  mastery: {
    overall: number;
    conceptsTracked: number;
    conceptTotal: number;
  };
  graph: { gaps: number };
  review: { count: number };
  current: {
    page: string;
    conceptId: string | null;
    conceptName: string | null;
  };
};

export type DashboardData = {
  summary: DashboardSummary;
  catalogStats: Record<string, number>;
  graphStats: { nodes: number; edges: number; mastered: number; gaps: number };
  practiceTotals: {
    cells: number;
    coveredCells: number;
    blankCells: number;
    exercises: number;
    attempts: number;
    coveragePercent: number;
  };
  reviewItems: {
    attemptId: string;
    exerciseId: string;
    title: string;
    topicId: string;
    selfRating: string;
    daysSinceAttempt: number;
  }[];
};

export type DataSource = "server" | "offline";

export type AppData = {
  source: DataSource;
  units: CurriculumUnit[];
  exercises: Exercise[];
  attempts: Attempt[];
  notes: Note[];
  bookmarks: string[];
  diagnostic: {
    questions: DiagnosticQuestion[];
    answers: Record<number, number>;
    result: DiagnosticResult | null;
  };
  dashboard: DashboardData;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  practice: { skills: string[]; modules: PracticeModule[]; totals: Record<string, number> };
  classics: ClassicSet[];
};
