import { z } from "zod";
import { validateScene } from "../../lib/plotScene";
import { validRoutes, normalizeRoute } from "../../navigation";
import { normalizeSurfaceScene } from "../visualization/three-d/engine";

const id = z.string().min(1);
const strings = z.array(z.string());
const number = z.number();
const index = z.number().int().nonnegative();
const positive = number.positive();
const note = z.strictObject({
  id,
  text: z.string(),
  date: z.string(),
  conceptId: id.nullish(),
});
const feedback = z.strictObject({
  status: z.string().optional(),
  summary: z.string().optional(),
  observations: z
    .array(
      z.strictObject({
        type: z.string().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
  needs_review: z.boolean().optional(),
  checker: z.string().optional(),
  score: number.nullish(),
  correct: z.boolean().nullish(),
  criteria: z
    .array(
      z.strictObject({
        id,
        label: z.string(),
        weight: number,
        met: z.boolean(),
      }),
    )
    .optional(),
  reference_answer: z.string().optional(),
  answer_candidate: z.string().optional(),
  grading_scope: z.string().optional(),
  missing_steps: strings.optional(),
});
const attempt = z.strictObject({
  id,
  exerciseId: id,
  topicId: id,
  coefficient: number,
  title: z.string(),
  answer: z.string(),
  hints: z.boolean(),
  solutionSeen: z.boolean(),
  createdAt: z.string().refine((date) => Number.isFinite(Date.parse(date))),
  selfRating: z.enum(["pending", "understood", "revisit"]),
  status: z.string().optional(),
  score: number.nullish(),
  feedback: feedback.optional(),
});
const diagnostic = z.strictObject({
  answers: z.record(z.string().regex(/^\d+$/), index),
  result: z
    .strictObject({
      id: id.optional(),
      correctCount: index,
      total: index,
      results: z.array(
        z.strictObject({
          questionId: id,
          selected: z.number().int().min(-1),
          correctIndex: index,
          correct: z.boolean(),
          reason: z.string(),
          conceptId: id.nullish(),
        }),
      ),
      recommendations: z
        .array(z.strictObject({ id, name: z.string() }))
        .optional(),
    })
    .nullable(),
});
const chat = z.array(
  z.strictObject({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  }),
);
const exploration = z
  .strictObject({
    topic: z.enum(["continuity", "derivative", "taylor", "integral"]),
    dimension: z.union([z.literal(2), z.literal(3)]),
    fn: z.enum(["square", "sqrt", "inverse", "oscillation", "absolute"]),
    epsilon: positive,
    delta: positive,
    x0: number,
    h: positive,
    n: index.max(200),
    angle: number,
    elevation: number,
    band: z.boolean(),
    neighborhood: z.boolean(),
    danger: z.boolean(),
    grid: z.boolean(),
    sampling: z.enum(["left", "midpoint", "right"]),
    zoom: positive,
  })
  .partial()
  .required({ topic: true, fn: true });
const surface = z
  .strictObject({
    expression: id,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    resolution: index.min(10).max(64),
    view: z.strictObject({
      azimuth: number.min(0).max(360),
      elevation: number.min(5).max(85),
      heightScale: number.min(0.2).max(3),
      zoom: number.min(0.5).max(2),
    }),
    display: z.strictObject({
      opacity: number.min(0.2).max(1),
      wireframe: z.boolean(),
      showAxes: z.boolean(),
      palette: z.enum(["violet", "teal", "amber", "mono"]),
    }),
  })
  .refine(
    (scene) =>
      scene.xMin >= -20 &&
      scene.xMax <= 20 &&
      scene.xMax > scene.xMin &&
      scene.yMin >= -20 &&
      scene.yMax <= 20 &&
      scene.yMax > scene.yMin,
  );
const assistance = z.strictObject({ hint: z.boolean(), solution: z.boolean() });

type ValidateEntry = (value: string) => unknown;
const json =
  (schema: z.ZodType): ValidateEntry =>
  (value) =>
    schema.parse(JSON.parse(value));
const validators = new Map<string, ValidateEntry>([
  ["axiom-offline-attempts", json(z.array(attempt))],
  ["axiom-offline-diagnostic", json(diagnostic)],
  ["axiom-offline-notes", json(z.array(note))],
  ["axiom-offline-bookmarks", json(z.array(id))],
  ["axiom-function-scene", (value) => validateScene(JSON.parse(value))],
  ["axiom-function-chat", json(chat)],
  [
    "axiom-surface-scene",
    (value) => normalizeSurfaceScene(surface.parse(JSON.parse(value))),
  ],
  ["axiom-surface-chat", json(chat)],
  ["axiom-exploration", json(exploration)],
  ["axiom-exploration-chat", json(chat)],
  [
    "axiom-observations",
    json(
      z.array(
        z.strictObject({ id: number, text: z.string(), time: z.string() }),
      ),
    ),
  ],
  ["axiom-name", (value) => z.string().max(16).parse(value)],
  ["axiom-theme", (value) => z.enum(["light", "dark"]).parse(value)],
  ["axiom-companion-muted", json(z.boolean())],
  ["axiom-offline-concept", (value) => id.parse(value)],
  ["axiom-last-page", (value) => z.enum(validRoutes).parse(value)],
]);
const prefixes: [string, ValidateEntry][] = [
  ["axiom-draft-", (value) => value],
  ["axiom-assistance-", json(assistance)],
  [
    "axiom-exercise-variant-",
    (value) =>
      z
        .string()
        .regex(/^[2-5]$/)
        .parse(value),
  ],
];

function validator(key: string): ValidateEntry | undefined {
  return (
    validators.get(key) ??
    prefixes.find(
      ([prefix]) =>
        key.startsWith(prefix) &&
        /^[\w.-]{1,160}$/.test(key.slice(prefix.length)),
    )?.[1]
  );
}

export type LearningStorage = Record<string, string>;

export function readLearningStorage(
  storage: Storage = localStorage,
): LearningStorage {
  const entries: [string, string][] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || !validator(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

export function validateLearningStorage(input: unknown): LearningStorage {
  const result = z.record(z.string(), z.string()).safeParse(input);
  if (!result.success) throw new Error("存档缺少有效的浏览器学习记录。");
  for (const [key, value] of Object.entries(result.data)) {
    const validate = validator(key);
    if (!validate) throw new Error("存档包含不支持的浏览器数据项。");
    try {
      validate(value);
      if (key === "axiom-last-page") result.data[key] = normalizeRoute(value)!;
    } catch {
      throw new Error(
        `学习记录格式无效（${validators.has(key) ? key : "练习草稿或选项"}）。`,
      );
    }
  }
  return result.data;
}

export function replaceLearningStorage(
  snapshot: LearningStorage,
  storage: Storage = localStorage,
) {
  const before = readLearningStorage(storage);
  const write = (values: LearningStorage) => {
    Object.keys(readLearningStorage(storage)).forEach((key) =>
      storage.removeItem(key),
    );
    Object.entries(values).forEach(([key, value]) =>
      storage.setItem(key, value),
    );
  };
  try {
    write(snapshot);
  } catch {
    try {
      write(before);
    } catch {
      throw new Error("浏览器写入失败，原有学习记录也无法恢复。");
    }
    throw new Error("浏览器无法写入存档，已恢复原有学习记录。");
  }
  return () => write(before);
}

const browserArchive = z.strictObject({
  format: z.literal("axiom-learning-browser"),
  version: z.literal(1),
  storage: z.unknown(),
});

export function exportBrowserArchive(storage: LearningStorage): Blob {
  return new Blob(
    [JSON.stringify({ format: "axiom-learning-browser", version: 1, storage })],
    { type: "application/json" },
  );
}

export async function readBrowserArchive(file: File): Promise<LearningStorage> {
  let body: unknown;
  try {
    body = JSON.parse(await file.text());
  } catch {
    throw new Error("无法读取浏览器存档 JSON。");
  }
  const parsed = browserArchive.safeParse(body);
  if (!parsed.success) throw new Error("浏览器存档格式或版本不受支持。");
  return validateLearningStorage(parsed.data.storage);
}
