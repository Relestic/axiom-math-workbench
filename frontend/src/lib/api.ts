/// <reference types="vite/client" />

import type {
  BookmarkDto,
  DashboardDto,
  DataBundleDto,
  DiagnosticDto,
  DiagnosticResultDto,
  ExerciseDto,
  GraphDto,
  NoteDto,
  PracticeDto,
  ServerUserDto,
} from "../domain/dto";

const configuredBase = import.meta.env.VITE_API_BASE as string | undefined;
export const API_BASE =
  configuredBase === "__SAME_ORIGIN__"
    ? ""
    : (configuredBase || "http://127.0.0.1:8000").replace(/\/+$/, "");

const SESSION_KEY = "axiom-api-session";

export type ServerUser = ServerUserDto;

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  user: ServerUser;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(
    status: number,
    message: string,
    code = "request_failed",
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* The app can still run without persistence. */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return await response.text();
}

function toApiError(response: Response, data: unknown): ApiError {
  const error =
    data && typeof data === "object" && "error" in data
      ? (data as { error?: { message?: string; code?: string; details?: unknown } })
          .error
      : undefined;
  return new ApiError(
    response.status,
    error?.message || `请求失败（HTTP ${response.status}）`,
    error?.code || "request_failed",
    error?.details,
  );
}

let refreshPromise: Promise<StoredSession> | null = null;

async function refreshAccessToken(): Promise<StoredSession> {
  const stored = getStoredSession();
  if (!stored) throw new ApiError(401, "登录已失效，请重新登录", "unauthorized");
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(apiUrl("/api/v1/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      });
      const data = await parseResponse(response);
      if (!response.ok) {
        clearSession();
        throw toApiError(response, data);
      }
      const body = data as {
        access_token: string;
        refresh_token: string;
        user: ServerUser;
      };
      const next: StoredSession = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        user: body.user,
      };
      storeSession(next);
      return next;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean; retryAuth?: boolean } = {},
): Promise<T> {
  const auth = options.auth ?? true;
  const retryAuth = options.retryAuth ?? true;
  const session = getStoredSession();
  const headers = new Headers(init.headers || {});
  if (auth && session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(apiUrl(path), { ...init, headers });
  const data = await parseResponse(response);
  if (response.status === 401 && auth && retryAuth && session?.refreshToken) {
    try {
      await refreshAccessToken();
      return apiFetch<T>(path, init, { auth, retryAuth: false });
    } catch {
      /* fall through to the original error */
    }
  }
  if (!response.ok) throw toApiError(response, data);
  return data as T;
}

export type LoginResult = {
  user: ServerUser;
  access_token: string;
  refresh_token: string;
};

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
    { auth: false, retryAuth: false },
  );
  storeSession({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    user: result.user,
  });
  return result;
}

export async function registerRequest(input: {
  invite_code: string;
  email: string;
  password: string;
  display_name: string;
}): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>(
    "/api/v1/auth/register",
    { method: "POST", body: JSON.stringify(input) },
    { auth: false, retryAuth: false },
  );
  storeSession({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    user: result.user,
  });
  return result;
}

export async function logoutRequest(): Promise<void> {
  const stored = getStoredSession();
  try {
    await apiFetch(
      "/api/v1/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: stored?.refreshToken || null }),
      },
      { retryAuth: false },
    );
  } catch {
    /* Local logout must still succeed if the server is unreachable. */
  }
  clearSession();
}

export async function meRequest(): Promise<ServerUser> {
  return apiFetch<ServerUser>("/api/v1/auth/me");
}

export async function updateProfile(input: {
  display_name?: string;
  week?: number;
  daily_goal?: number;
}): Promise<ServerUser> {
  return apiFetch<ServerUser>("/api/v1/auth/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function searchRequest(query: string): Promise<{
  query: string;
  total: number;
  items: {
    type: string;
    id: string;
    title: string;
    subtitle: string;
    route: string;
    meta?: Record<string, unknown>;
  }[];
}> {
  return apiFetch(
    `/api/v1/search?q=${encodeURIComponent(query)}&limit=20`,
  );
}

export type ServerExercise = {
  id: string;
  code: string;
  topic_id: string;
  title: string;
  statement: string;
  domain: string;
  difficulty: number;
  skill: string;
  type: string;
  hint: string;
  hint_available: boolean;
  solution_available: boolean;
  checks: string[];
  allowed_refs: string[];
  review_status: string;
};

export async function deleteNoteRequest(id: string): Promise<void> {
  await apiFetch(`/api/v1/notes/${id}`, { method: "DELETE" });
}

export async function toggleBookmarkRequest(
  targetId: string,
  active: boolean,
): Promise<void> {
  if (active) {
    await apiFetch("/api/v1/bookmarks", {
      method: "POST",
      body: JSON.stringify({ target_type: "concept", target_id: targetId }),
    });
  } else {
    await apiFetch(`/api/v1/bookmarks/concept/${encodeURIComponent(targetId)}`, {
      method: "DELETE",
    });
  }
}

export async function fetchExerciseSolution(exerciseId: string): Promise<{
  steps: { title?: string; text?: string }[];
  common_errors?: { text: string }[];
  notice?: string;
}> {
  return apiFetch(`/api/v1/exercises/${exerciseId}/solution`);
}

export async function fetchExerciseHint(exerciseId: string): Promise<{ hint: string }> {
  return apiFetch(`/api/v1/exercises/${exerciseId}/hint`);
}

async function fetchLegacyDataBundle(): Promise<DataBundleDto> {
  const catalog = await apiFetch<DataBundleDto["catalog"]>("/api/v1/catalog");
  const details = await Promise.all(
    catalog.concepts.map((concept) =>
      apiFetch<DataBundleDto["details"][number]>(
        `/api/v1/concepts/${concept.id}`,
      ),
    ),
  );
  const [
    exerciseData,
    dashboard,
    graph,
    practice,
    notesData,
    attemptsData,
    bookmarkData,
    diagnostic,
  ] = await Promise.all([
    apiFetch<{ items: ExerciseDto[] }>("/api/v1/exercises?limit=100"),
    apiFetch<DashboardDto>("/api/v1/dashboard"),
    apiFetch<GraphDto>(
      "/api/v1/graph?scope=all&include_extensions=true&include_examples=true",
    ),
    apiFetch<PracticeDto>("/api/v1/progress/practice-map"),
    apiFetch<{ items: NoteDto[] }>("/api/v1/notes?limit=100"),
    apiFetch<{ items: DataBundleDto["attempts"][number][] }>(
      "/api/v1/attempts?limit=100",
    ),
    apiFetch<{ items: BookmarkDto[] }>("/api/v1/bookmarks"),
    apiFetch<DiagnosticDto>("/api/v1/diagnostic"),
  ]);
  return {
    catalog,
    details,
    exercises: exerciseData.items,
    attempts: attemptsData.items,
    notes: notesData.items,
    bookmarks: bookmarkData.items,
    dashboard,
    graph,
    practice,
    diagnostic,
  };
}

export async function fetchDataBundle(): Promise<DataBundleDto> {
  try {
    return await apiFetch<DataBundleDto>("/api/v1/bootstrap");
  } catch (cause) {
    // Keep compatibility with a backend started before /bootstrap existed.
    if (cause instanceof ApiError && cause.status === 404) {
      return fetchLegacyDataBundle();
    }
    throw cause;
  }
}

export async function fetchDashboardBundle(): Promise<{
  dashboard: DashboardDto;
  graph: GraphDto;
  practice: PracticeDto;
}> {
  const [dashboard, graph, practice] = await Promise.all([
    apiFetch<DashboardDto>("/api/v1/dashboard"),
    apiFetch<GraphDto>(
      "/api/v1/graph?scope=all&include_extensions=true&include_examples=true",
    ),
    apiFetch<PracticeDto>("/api/v1/progress/practice-map"),
  ]);
  return { dashboard, graph, practice };
}

export async function createNoteTyped(
  text: string,
  conceptId?: string,
): Promise<NoteDto> {
  return apiFetch("/api/v1/notes", {
    method: "POST",
    body: JSON.stringify({ text, concept_id: conceptId || null }),
  });
}

export async function submitDiagnosticTyped(
  answers: Record<string, number>,
): Promise<DiagnosticResultDto> {
  return apiFetch("/api/v1/diagnostic", {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function submitAttemptTyped(input: {
  exerciseId: string;
  answer: string;
  hintsUsed: number;
  solutionViewed: boolean;
}): Promise<DataBundleDto["attempts"][number]> {
  return apiFetch("/api/v1/attempts", {
    method: "POST",
    body: JSON.stringify({
      exercise_id: input.exerciseId,
      answer_text: input.answer,
      hints_used: input.hintsUsed,
      solution_viewed: input.solutionViewed,
      idempotency_key: `web-${input.exerciseId}-${Date.now()}`,
    }),
  });
}

export async function rateAttemptTyped(
  attemptId: string,
  rating: "pending" | "understood" | "revisit",
): Promise<DataBundleDto["attempts"][number]> {
  return apiFetch(`/api/v1/attempts/${attemptId}`, {
    method: "PATCH",
    body: JSON.stringify({ self_rating: rating }),
  });
}
