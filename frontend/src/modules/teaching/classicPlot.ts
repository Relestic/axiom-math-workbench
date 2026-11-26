import type { ClassicKind } from "../../domain/types";
import { parseFormula, sampleCurve } from "../../lib/functionEngine";

const functions = {
  line: { formula: "x", a: 0, b: 1, top: 1.1 },
  reciprocal: { formula: "1/x", a: 0, b: 1, top: 8 },
  absolute: { formula: "abs(x)", a: -1, b: 1, top: 1.1 },
  square: { formula: "x^2", a: -1, b: 1, top: 1.1 },
  step: { formula: "x < 0.5 ? 0 : 1", a: 0, b: 1, top: 1.2 },
};

export function sampleClassic(kind: Exclude<ClassicKind, "dirichlet">) {
  const description = functions[kind];
  const { a, b, top } = description;
  const fn = parseFormula(description.formula).evaluate;
  const sampled = sampleCurve(fn, a, b, top);
  const segments: [number, number][][] = [];
  let points: [number, number][] = [];
  let previous: number | undefined;
  for (let i = 0; i < sampled.x.length; i++) {
    const x = sampled.x[i], y = sampled.y[i];
    const jump = kind === "step" && previous !== undefined && previous < 0.5 && x !== null && x >= 0.5;
    const visible = x !== null && y !== null && y <= top && !(kind === "reciprocal" && x === b);
    if (jump || !visible) {
      if (points.length) segments.push(points);
      points = [];
    }
    if (visible) points.push([x, y]);
    previous = x ?? undefined;
  }
  if (points.length) segments.push(points);
  return { ...description, segments };
}
