import { z } from "zod";
import { parseFormula } from "./functionEngine.js";
const number = z.number().finite().min(-10000).max(10000);
const curve = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/),
    expression: z.string().min(1).max(300),
    label: z.string().max(60),
    visible: z.boolean(),
    domainMin: number.nullable().default(null),
    domainMax: number.nullable().default(null),
    leftOpen: z.boolean().default(false),
    rightOpen: z.boolean().default(false),
  })
  .strict();
const parameter = z
  .object({
    name: z.string().regex(/^[a-df-wz]$/),
    value: number,
    min: number,
    max: number,
  })
  .strict();
export const sceneSchema = z
  .object({
    curves: z.array(curve).min(1).max(4),
    activeId: z.string(),
    parameters: z.array(parameter).max(8),
    mode: z.enum(["graph", "continuity", "derivative", "integral", "taylor"]),
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    x0: number,
    epsilon: z.number().min(0.001).max(100),
    delta: z.number().min(0.001).max(100),
    h: z.number().min(0.0001).max(100),
    integralStart: number,
    integralEnd: number,
    subdivisions: z.number().int().min(4).max(200),
    order: z.number().int().min(1).max(5),
  })
  .strict();
export type Scene = z.infer<typeof sceneSchema>;
export type Curve = Scene["curves"][number];
export const initialScene: Scene = {
  curves: [
    {
      id: "f",
      expression: "x^2",
      label: "f(x)",
      visible: true,
      domainMin: null,
      domainMax: null,
      leftOpen: false,
      rightOpen: false,
    },
  ],
  activeId: "f",
  parameters: [],
  mode: "graph",
  xMin: -3,
  xMax: 3,
  yMin: -2,
  yMax: 6,
  x0: 0.6,
  epsilon: 0.3,
  delta: 0.2,
  h: 0.25,
  integralStart: 0,
  integralEnd: 1,
  subdivisions: 20,
  order: 3,
};
export function validateScene(input: unknown): Scene {
  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("函数配置格式不完整，或参数超出支持范围");
  const s = parsed.data;
  if (s.xMax - s.xMin < 0.01 || s.yMax - s.yMin < 0.01)
    throw new Error("坐标范围上限必须大于下限，跨度至少为 0.01");
  if (s.integralStart >= s.integralEnd) throw new Error("积分起点必须小于终点");
  if (
    !s.curves.some((c) => c.id === s.activeId) ||
    new Set(s.curves.map((c) => c.id)).size !== s.curves.length
  )
    throw new Error("当前函数不存在或函数编号重复");
  if (new Set(s.parameters.map((p) => p.name)).size !== s.parameters.length)
    throw new Error("参数名称不能重复");
  for (const p of s.parameters)
    if (p.min >= p.max || p.value < p.min || p.value > p.max)
      throw new Error(`参数 ${p.name} 的值必须在有效范围内`);
  const required = new Set<string>();
  for (const c of s.curves) {
    if (
      c.domainMin !== null &&
      c.domainMax !== null &&
      c.domainMin >= c.domainMax
    )
      throw new Error("函数定义域的下限必须小于上限");
    parseFormula(c.expression).symbols.forEach((k) => required.add(k));
  }
  s.parameters = s.parameters.filter((p) => required.has(p.name));
  for (const name of required)
    if (!s.parameters.some((p) => p.name === name))
      s.parameters.push({ name, value: 1, min: -5, max: 5 });
  if (s.parameters.length > 8) throw new Error("一个工作区最多支持 8 个参数");
  return s;
}
export function curveEvaluator(curve: Curve, params: Record<string, number>) {
  const parsed = parseFormula(curve.expression);
  return (x: number) => {
    if (
      curve.domainMin !== null &&
      (x < curve.domainMin || (curve.leftOpen && x === curve.domainMin))
    )
      return NaN;
    if (
      curve.domainMax !== null &&
      (x > curve.domainMax || (curve.rightOpen && x === curve.domainMax))
    )
      return NaN;
    return parsed.evaluate(x, params);
  };
}
export function parseAIResult(value: unknown) {
  const result = z
    .object({
      message: z.string().min(1).max(3000),
      scene: sceneSchema.nullable(),
    })
    .strict()
    .parse(value);
  return {
    message: result.message,
    scene: result.scene ? validateScene(result.scene) : null,
  };
}
