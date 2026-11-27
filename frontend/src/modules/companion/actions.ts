import { z } from "zod";
import { diagramSceneSchema, diagramNodeSchema, nodeId, viewBoxSchema } from "../visualization/diagram/schema";

const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const number = z.preprocess(value =>
  typeof value === "string" && decimal.test(value.trim()) ? Number(value) : value, z.number().finite());
const boolean = z.preprocess(value => {
  if (typeof value === "string") {
    if (value.trim() === "true") return true;
    if (value.trim() === "false") return false;
  }
  return value;
}, z.boolean());
const expression = z.string().min(1).max(300);
const curve = {
  id: z.string().optional(),
  expression,
  label: z.string().optional(),
  domainMin: number.optional(),
  domainMax: number.optional(),
  leftOpen: boolean.optional(),
  rightOpen: boolean.optional(),
};
const range = {
  xMin: number.optional(), xMax: number.optional(),
  yMin: number.optional(), yMax: number.optional(),
};

const action = z.discriminatedUnion("type", [
  z.strictObject({type: z.literal("set_diagram"), scene: diagramSceneSchema.refine(
    scene => scene.nodes.length >= 1 && scene.nodes.length <= 16, "一次绘制需要 1–16 个图元")}),
  z.strictObject({type: z.literal("upsert_diagram_node"), node: diagramNodeSchema}),
  z.strictObject({type: z.literal("remove_diagram_node"), id: nodeId}),
  z.strictObject({type: z.literal("set_diagram_view"), viewBox: viewBoxSchema}),
  z.strictObject({type: z.literal("highlight_proof_step"), ref: z.string().min(1).max(160)}),
  z.strictObject({type: z.literal("set_scene_param"), name: z.string().min(1).max(100), value: number}),
  z.strictObject({type: z.literal("set_curve"), ...curve}),
  z.strictObject({type: z.literal("add_curve"), ...curve}),
  z.strictObject({type: z.literal("remove_curve"), id: z.string()}),
  z.strictObject({type: z.literal("clear_comparison_curves")}),
  z.strictObject({type: z.literal("set_range"), ...range}),
  z.strictObject({type: z.literal("set_mode"), mode: z.enum(["graph", "continuity", "derivative", "integral", "taylor"])}),
  z.strictObject({type: z.literal("set_parameter_range"), name: z.string().regex(/^[a-df-wz]$/),
    value: number, min: number, max: number}),
  z.strictObject({type: z.literal("set_surface_expression"), expression}),
  z.strictObject({type: z.literal("set_surface_range"), ...range}),
  z.strictObject({type: z.literal("set_surface_view"), azimuth: number.optional(),
    elevation: number.optional(), heightScale: number.optional()}),
]);
export const actionSchema = z.preprocess(input => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null));
}, action).refine(patch => {
  if (patch.type !== "set_range" && patch.type !== "set_surface_range") return true;
  return patch.xMin !== undefined || patch.xMax !== undefined || patch.yMin !== undefined || patch.yMax !== undefined;
}, "至少需要一个范围边界（xMin、xMax、yMin 或 yMax）");
export type WorkspaceAction = z.infer<typeof actionSchema>;

export function actionError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue.code === "custom") return issue.message;
  if (issue.code === "unrecognized_keys") return "不支持字段 " + issue.keys.join("、");
  const field = issue.path[0];
  if (field === "type") return "不支持的操作类型";
  return field ? `字段 ${String(field)} 缺失或取值无效` : "缺少有效的操作类型";
}
