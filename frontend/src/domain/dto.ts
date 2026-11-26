import type { AiReview } from "../modules/practice/review";
// Raw backend DTOs. Keep snake_case here; pages never see these shapes.
export type ServerUserDto = {
  id: string;
  email: string;
  display_name: string;
  role: "student" | "admin";
  course_name: string;
  week: number;
  total_weeks: number;
  progress?: {
    week: number;
    total_weeks: number;
    last_page: string;
    last_concept_id: string | null;
    daily_goal: number;
  };
};

export type CatalogDto = {
  textbook: { id: string; title: string; edition: string; page_count: number | null };
  concepts: {
    id: string;
    name: string;
    short_name: string;
    chapter_id: string | null;
  }[];
  tools: { slug: string; name: string; unlocked: boolean }[];
  stats: Record<string, number>;
  progress: {
    week: number;
    total_weeks: number;
    last_page: string;
    last_concept_id: string | null;
    daily_goal: number;
    percent: number;
  };
};

export type ConceptDetailDto = {
  id: string;
  name: string;
  short_name: string;
  definition: string;
  formula: string;
  summary: string;
  conditions: { text: string; source_page?: number | null }[];
  symbols?: { symbol: string; reading: string; meaning: string }[];
  proofs: {
    title: string;
    idea: string;
    steps: { text: string }[];
    tools: string[];
    source_page?: number | null;
  }[];
  classics: {
    name: string;
    kind?: string;
    object_definition: string;
    refutes_text: string;
    source_url?: string;
  }[];
  propositions?: {
    statement: string;
    truth: string;
    given_text: string;
    desired_text: string;
    missing_conditions: string[];
  }[];
  chapter?: { number: number; title: string } | null;
};

export type ExerciseDto = {
  id: string;
  code: string;
  topic_id: string;
  title: string;
  statement?: string;
  domain?: string;
  difficulty?: number;
  skill?: string;
  type?: string;
  hint?: string;
  checks?: string[];
  allowed_refs?: string[];
};

export type AttemptDto = {
  ai_review?: AiReview | null;
  id: string;
  exercise_id: string;
  answer_text: string;
  assistance?: {
    hints_used?: number;
    solution_viewed?: boolean;
  };
  self_rating?: "pending" | "understood" | "revisit";
  status?: string;
  feedback?: {
    ai_review_notice?: string;
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
  score?: number | null;
  created_at: string;
  exercise?: {
    id: string;
    code: string;
    title: string;
    topic_id: string;
  };
};

export type NoteDto = {
  id: string;
  text: string;
  concept_id?: string | null;
  created_at: string;
  updated_at?: string;
};

export type BookmarkDto = {
  id: string;
  target_type: string;
  target_id: string;
};

export type GraphDto = {
  nodes: {
    id: string;
    name: string;
    kind: string;
    x: number;
    y: number;
    color: string;
    size: number;
    description: string;
    detail: string;
    state: string;
  }[];
  edges: { from: string; to: string; relation: string }[];
  stats: { nodes: number; edges: number; mastered: number; gaps: number };
};

export type PracticeDto = {
  rows: {
    topic_id: string;
    name: string;
    chapter_id: string | null;
    cells: { skill: string; exercise_count: number; mastery: number }[];
  }[];
  skills: string[];
  totals: {
    cells: number;
    covered_cells: number;
    blank_cells: number;
    exercises: number;
    attempts: number;
    coverage_percent: number;
  };
};

export type DashboardDto = {
  summary: {
    streak_days: number;
    today: {
      attempts: number;
      distinct_concepts: number;
      goal: number;
      goal_percent: number;
    };
    practice: {
      attempts_total: number;
      understood_rate: number;
      average_score: number | null;
    };
    mastery: {
      overall: number;
      concepts_tracked: number;
      concept_total: number;
    };
    graph: { gaps: number };
    review: { count: number };
    current: {
      page: string;
      concept: { id: string; name: string; short_name: string } | null;
    };
  };
  catalog: { stats: Record<string, number> };
  review_queue: {
    attempt_id: string;
    exercise_id: string;
    title: string;
    topic_id: string;
    self_rating: string;
    days_since_attempt: number;
  }[];
};

export type DiagnosticDto = {
  questions: {
    id: string;
    text: string;
    options: string[];
    concept_id: string | null;
    skill: string;
  }[];
  previous: {
    answers: Record<string, number>;
    correct_count: number;
  } | null;
};

export type DiagnosticResultDto = {
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
};

export type DataBundleDto = {
  catalog: CatalogDto;
  details: ConceptDetailDto[];
  exercises: ExerciseDto[];
  attempts: AttemptDto[];
  notes: NoteDto[];
  bookmarks: BookmarkDto[];
  dashboard: DashboardDto;
  graph: GraphDto;
  practice: PracticeDto;
  diagnostic: DiagnosticDto;
};
