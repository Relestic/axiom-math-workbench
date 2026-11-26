import { z } from "zod";

const number = z.number().finite();
const expression = z.string().min(1).max(300);
const curve = {
  id: z.string().optional(),
  expression,
  label: z.string().optional(),
  domainMin: number.optional(),
  domainMax: number.optional(),
  leftOpen: z.boolean().optional(),
  rightOpen: z.boolean().optional(),
};
const range = {
  xMin: number.optional(), xMax: number.optional(),
  yMin: number.optional(), yMax: number.optional(),
};

export const actionSchema = z.discriminatedUnion("type", [
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
export type WorkspaceAction = z.infer<typeof actionSchema>;
