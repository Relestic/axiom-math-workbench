import { z } from "zod";

const number = z.number().finite();
const label = z.string().max(160);
const flag = z.boolean().optional();
const pair = z.tuple([number, number]);
export const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
const base = {
  id: nodeId,
  tone: z.enum(["primary", "teal", "amber", "rose", "muted"]).optional(),
};
const shape = { ...base, label: label.optional() };
const bounds = { xMin: number, xMax: number, yMin: number, yMax: number };
export const viewBoxSchema = z.strictObject(bounds).refine(box =>
  [box.xMax - box.xMin, box.yMax - box.yMin].every(span => Number.isFinite(span) && span > 0),
  "图解坐标跨度必须是有限正数");
export const diagramNodeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...shape, kind: z.literal("curve"), points: z.array(pair).min(2).max(40), smooth: flag, dashed: flag }),
  z.strictObject({ ...shape, kind: z.literal("segment"), from: pair, to: pair, dashed: flag, arrow: flag }),
  z.strictObject({ ...shape, kind: z.literal("point"), x: number, y: number, hollow: flag }),
  z.strictObject({ ...shape, kind: z.literal("pattern"), preset: z.enum(["dirichlet_layers", "thomae_stems", "step_bars"]),
    xMin: number, xMax: number, yHigh: number.optional(), yLow: number.optional(), density: z.number().int().min(4).max(40).optional() }),
  z.strictObject({ ...shape, kind: z.literal("region"), ...bounds }),
  z.strictObject({ ...base, kind: z.literal("label"), x: number, y: number, text: label }),
]);
const tick = z.strictObject({axis: z.enum(["x", "y"]), at: number, label});
export const diagramSceneSchema = z.strictObject({
  version: z.literal(1), title: z.string().max(80), caption: z.string().max(240), viewBox: viewBoxSchema,
  axes: z.strictObject({show: z.boolean(), xLabel: label.optional(), yLabel: label.optional(), ticks: z.array(tick).max(80).optional()}).optional(),
  nodes: z.array(diagramNodeSchema).max(24),
}).refine(scene => new Set(scene.nodes.map(node => node.id)).size === scene.nodes.length, "图元编号不能重复");

export type DiagramNode = z.infer<typeof diagramNodeSchema>;
export type DiagramScene = z.infer<typeof diagramSceneSchema>;
