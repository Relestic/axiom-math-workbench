import { parse, type MathNode } from "mathjs";
import { hasMinimumSpan } from "../../../lib/interval";
import { defaultSurfaceScene, type SurfaceScene } from "./types";

const functions = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "log",
  "sqrt",
  "abs",
  "floor",
  "ceil",
  "round",
  "sign",
  "min",
  "max",
]);
const operators = new Set([
  "+",
  "-",
  "*",
  "/",
  "^",
  "<",
  ">",
  "<=",
  ">=",
  "==",
  "!=",
  "and",
  "or",
  "not",
]);
const types = new Set([
  "ConstantNode",
  "SymbolNode",
  "OperatorNode",
  "FunctionNode",
  "ParenthesisNode",
  "ConditionalNode",
]);

export type SurfaceFormula = {
  tree: MathNode;
  evaluate: (x: number, y: number) => number;
};

export function parseSurfaceExpression(expression: string): SurfaceFormula {
  if (!expression.trim() || expression.length > 300) {
    throw new Error("曲面表达式需为 1–300 个字符");
  }
  let tree: MathNode;
  try {
    tree = parse(
      expression
        .replaceAll("π", "pi")
        .replaceAll("²", "^2")
        .replaceAll("³", "^3")
        .replaceAll("×", "*")
        .replaceAll("÷", "/"),
    );
  } catch {
    throw new Error("曲面表达式语法有误，请检查括号、乘号和函数名");
  }
  let count = 0;
  tree.traverse((node: any, _path: any, parent: any) => {
    if (++count > 120 || !types.has(node.type)) {
      throw new Error("仅支持数学运算、函数调用与条件表达式");
    }
    if (node.type === "OperatorNode" && !operators.has(node.op)) {
      throw new Error("暂不支持这个运算符");
    }
    if (
      node.type === "ConstantNode" &&
      (typeof node.value !== "number" || !Number.isFinite(node.value))
    ) {
      throw new Error("常量必须是有限实数");
    }
    if (
      node.type === "FunctionNode" &&
      (!node.fn?.isSymbolNode ||
        !functions.has(node.fn.name) ||
        node.args.length > 3)
    ) {
      throw new Error("表达式包含不支持的函数");
    }
    if (node.type === "SymbolNode") {
      if (parent?.type === "FunctionNode" && parent.fn === node) return;
      if (["x", "y", "e", "pi"].includes(node.name)) return;
      throw new Error(
        `曲面只支持自变量 x、y；不支持 ${node.name}。参数化曲面暂未开放`,
      );
    }
  });
  const compiled = tree.compile();
  return {
    tree,
    evaluate: (x: number, y: number) => {
      try {
        const value = compiled.evaluate(new Map(Object.entries({ x, y })));
        if (
          typeof value === "number" &&
          Number.isFinite(value) &&
          Math.abs(value) < 1e8
        ) {
          return value;
        }
        return NaN;
      } catch {
        return NaN;
      }
    },
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeSurfaceScene(input: unknown): SurfaceScene {
  const source = (input || {}) as Partial<SurfaceScene>;
  const expression =
    typeof source.expression === "string" && source.expression.trim()
      ? source.expression.trim()
      : defaultSurfaceScene.expression;
  parseSurfaceExpression(expression);
  let xMin = Number(source.xMin);
  let xMax = Number(source.xMax);
  let yMin = Number(source.yMin);
  let yMax = Number(source.yMax);
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) {
    xMin = defaultSurfaceScene.xMin;
    xMax = defaultSurfaceScene.xMax;
    yMin = defaultSurfaceScene.yMin;
    yMax = defaultSurfaceScene.yMax;
  }
  xMin = clamp(xMin, -20, 19.8);
  xMax = clamp(xMax, -19.8, 20);
  yMin = clamp(yMin, -20, 19.8);
  yMax = clamp(yMax, -19.8, 20);
  if (!hasMinimumSpan(xMin, xMax, 0.2)) xMax = xMin + 0.2;
  if (!hasMinimumSpan(yMin, yMax, 0.2)) yMax = yMin + 0.2;
  const view = source.view || defaultSurfaceScene.view;
  const display = source.display || defaultSurfaceScene.display;
  return {
    expression,
    xMin,
    xMax,
    yMin,
    yMax,
    resolution: Math.round(
      clamp(Number(source.resolution) || defaultSurfaceScene.resolution, 10, 64),
    ),
    view: {
      azimuth: clamp(
        Number(view.azimuth ?? defaultSurfaceScene.view.azimuth),
        0,
        360,
      ),
      elevation: clamp(
        Number(view.elevation ?? defaultSurfaceScene.view.elevation),
        5,
        85,
      ),
      heightScale: clamp(
        Number(view.heightScale ?? defaultSurfaceScene.view.heightScale),
        0.2,
        3,
      ),
      zoom: clamp(
        Number(view.zoom ?? defaultSurfaceScene.view.zoom),
        0.5,
        2,
      ),
    },
    display: {
      opacity: clamp(
        Number(display.opacity ?? defaultSurfaceScene.display.opacity),
        0.2,
        1,
      ),
      wireframe: Boolean(display.wireframe),
      showAxes: Boolean(display.showAxes),
      palette: ["violet", "teal", "amber", "mono"].includes(
        String(display.palette),
      )
        ? display.palette
        : "violet",
    },
  };
}

export type SurfaceGrid = {
  xs: number[];
  ys: number[];
  values: number[][];
  zMin: number;
  zMax: number;
  finiteCount: number;
};

export function sampleSurface(scene: SurfaceScene): SurfaceGrid {
  const formula = parseSurfaceExpression(scene.expression);
  const n = Math.max(10, Math.min(64, Math.round(scene.resolution)));
  const xs = Array.from(
    { length: n + 1 },
    (_, i) => scene.xMin + ((scene.xMax - scene.xMin) * i) / n,
  );
  const ys = Array.from(
    { length: n + 1 },
    (_, i) => scene.yMin + ((scene.yMax - scene.yMin) * i) / n,
  );
  const values = ys.map((y) => xs.map((x) => formula.evaluate(x, y)));
  let zMin = Infinity;
  let zMax = -Infinity;
  let finiteCount = 0;
  for (const row of values) {
    for (const value of row) {
      if (Number.isFinite(value)) {
        finiteCount += 1;
        zMin = Math.min(zMin, value);
        zMax = Math.max(zMax, value);
      }
    }
  }
  if (!finiteCount) {
    return { xs, ys, values, zMin: -1, zMax: 1, finiteCount: 0 };
  }
  if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) {
    zMin = -1;
    zMax = 1;
  }
  if (zMax - zMin < 0.05) {
    zMin -= 0.025;
    zMax += 0.025;
  }
  return { xs, ys, values, zMin, zMax, finiteCount };
}
