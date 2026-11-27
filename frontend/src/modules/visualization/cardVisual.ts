import { z } from "zod";
import { sceneSchema, validateScene, type Scene } from "../../lib/plotScene";
import { diagramSceneSchema, type DiagramScene } from "./diagram/schema";
import { normalizeSurfaceScene } from "./three-d/engine";
import type { SurfaceScene } from "./three-d/types";
import { hasMinimumSpan } from "../../lib/interval";

export const storedSurfaceSchema = z.strictObject({
  expression: z.string().min(1).max(300),
  xMin: z.number().min(-20), xMax: z.number().max(20), yMin: z.number().min(-20), yMax: z.number().max(20),
  resolution: z.number().int().min(10).max(64),
  view: z.strictObject({azimuth: z.number().min(0).max(360), elevation: z.number().min(5).max(85),
    heightScale: z.number().min(0.2).max(3), zoom: z.number().min(0.5).max(2)}),
  display: z.strictObject({opacity: z.number().min(0.2).max(1), wireframe: z.boolean(),
    showAxes: z.boolean(), palette: z.enum(["violet","teal","amber","mono"])}),
}).refine(s => s.xMax > s.xMin && s.yMax > s.yMin);
const surfaceSchema = storedSurfaceSchema
  .refine(s => hasMinimumSpan(s.xMin,s.xMax,0.2) && hasMinimumSpan(s.yMin,s.yMax,0.2))
  .transform((s, ctx) => {
    try { return normalizeSurfaceScene(s); }
    catch { ctx.addIssue({code:"custom", message:"曲面配图未通过数学校验"}); return z.NEVER; }
  });

export type Board = "explore" | "surface" | "diagram";
export type CardScenes = {functionScene?: Scene; surfaceScene?: SurfaceScene; diagramScene?: DiagramScene};
export type CardVisual = CardScenes & {board: Board; summary?: string};
export type CardEdits = CardScenes & {board?: Board};
const boardSchema = z.enum(["explore", "surface", "diagram"]);
const functionSchema = sceneSchema.transform((s, ctx) => {
  try { return validateScene(s); }
  catch { ctx.addIssue({code:"custom", message:"函数配图未通过数学校验"}); return z.NEVER; }
});
const summary = z.string().max(240).optional();
export const cardVisualSchema = z.discriminatedUnion("board", [
  z.strictObject({board: z.literal("explore"), summary, functionScene: functionSchema}),
  z.strictObject({board: z.literal("surface"), summary, surfaceScene: surfaceSchema}),
  z.strictObject({board: z.literal("diagram"), summary, diagramScene: diagramSceneSchema}),
]);
export const editsSchema = z.strictObject({
  board: boardSchema.optional(), functionScene: functionSchema.optional(),
  surfaceScene: surfaceSchema.optional(), diagramScene: diagramSceneSchema.optional(),
});
export const sceneField = {explore: "functionScene", surface: "surfaceScene", diagram: "diagramScene"} as const;
const keyPrefix = "axiom-card-visual-";
export function readCardEdits(id: string): CardEdits {
  try {
    const raw = localStorage.getItem(keyPrefix + id);
    if (raw) return editsSchema.parse(JSON.parse(raw));
    // Adopt pre-M17 standalone boards once, on the originally selected card.
    if (Object.keys(localStorage).some(key => key.startsWith(keyPrefix))) return {};
    const old: CardEdits = {};
    for (const [key, board] of [["function","explore"],["surface","surface"],["diagram","diagram"]] as const) {
      const legacy = localStorage.getItem("axiom-" + key + "-scene");
      if (legacy) {
        try {
          const parsed: unknown = JSON.parse(legacy);
          const value = board === "surface" ? normalizeSurfaceScene(storedSurfaceSchema.parse(parsed)) : parsed;
          Object.assign(old, editsSchema.parse({[sceneField[board]]: value}));
          old.board ??= board;
        } catch { /* A damaged legacy board does not discard the other boards. */ }
      }
    }
    return old;
  } catch { return {}; }
}
export function saveCardEdits(id: string, edits: CardEdits) {
  localStorage.setItem(keyPrefix + id, JSON.stringify(edits));
}
