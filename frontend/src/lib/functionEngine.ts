import { parse, derivative, type MathNode } from "mathjs";

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
export function parseFormula(expression: string) {
  if (!expression.trim() || expression.length > 300)
    throw new Error("表达式需为 1–300 个字符");
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
    throw new Error("公式语法有误，请检查括号、乘号和分段条件");
  }
  let count = 0;
  const symbols = new Set<string>();
  tree.traverse((node: any, _path: any, parent: any) => {
    if (++count > 120 || !types.has(node.type))
      throw new Error("仅支持数学运算、函数调用与条件表达式");
    if (node.type === "OperatorNode" && !operators.has(node.op))
      throw new Error("暂不支持这个运算符");
    if (
      node.type === "ConstantNode" &&
      (typeof node.value !== "number" || !Number.isFinite(node.value))
    )
      throw new Error("常量必须是有限实数");
    if (
      node.type === "FunctionNode" &&
      (!node.fn?.isSymbolNode ||
        !functions.has(node.fn.name) ||
        node.args.length > 3)
    )
      throw new Error("表达式包含不支持的函数");
    if (node.type === "SymbolNode") {
      if (parent?.type === "FunctionNode" && parent.fn === node) return;
      if (["x", "e", "pi"].includes(node.name)) return;
      if (!/^[a-df-wz]$/.test(node.name))
        throw new Error(
          `不支持变量 ${node.name}；自变量用 x，参数用 a、b、c 等单个字母`,
        );
      symbols.add(node.name);
    }
  });
  const compiled = tree.compile();
  return {
    tree,
    symbols: [...symbols].sort(),
    evaluate: (x: number, parameters: Record<string, number> = {}) => {
      try {
        const value = compiled.evaluate(
          new Map(Object.entries({ ...parameters, x })),
        );
        return typeof value === "number" &&
          Number.isFinite(value) &&
          Math.abs(value) < 1e12
          ? value
          : NaN;
      } catch {
        return NaN;
      }
    },
  };
}
export type Formula = ReturnType<typeof parseFormula>;
export type Evaluator = (x: number) => number;
export function numericalSlope(fn: Evaluator, x: number) {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  const y = fn(x);
  const left = (y - fn(x - h)) / h,
    right = (fn(x + h) - y) / h;
  const finer = (fn(x + h / 2) - fn(x - h / 2)) / h;
  if (
    ![left, right, finer].every(Number.isFinite) ||
    Math.abs(left - right) > 0.005 * (1 + Math.abs(finer)) ||
    Math.abs((left + right) / 2 - finer) > 0.005 * (1 + Math.abs(finer))
  )
    return null;
  return finer;
}
export function symbolicDerivative(formula: Formula) {
  try {
    return derivative(formula.tree, "x").toString();
  } catch {
    return null;
  }
}
export function taylorModel(
  formula: Formula,
  x0: number,
  params: Record<string, number>,
  order: number,
) {
  let unsupported = false;
  formula.tree.traverse((n: any) => {
    if (
      n.type === "ConditionalNode" ||
      (n.type === "FunctionNode" &&
        ["abs", "floor", "ceil", "round", "sign", "min", "max"].includes(
          n.fn.name,
        ))
    )
      unsupported = true;
  });
  if (unsupported) return null;
  try {
    let node = formula.tree;
    let factorial = 1;
    const coefficients: number[] = [];
    for (let k = 0; k <= order; k++) {
      if (k) {
        node = derivative(node, "x");
        factorial *= k;
      }
      const v = node
        .compile()
        .evaluate(new Map(Object.entries({ ...params, x: x0 })));
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      coefficients.push(v / factorial);
    }
    return {
      coefficients,
      evaluate: (x: number) =>
        coefficients.reduce((s, c, k) => s + c * (x - x0) ** k, 0),
    };
  } catch {
    return null;
  }
}
// Refine sharp changes; leave gaps at undefined values and unresolved jumps.
export function sampleCurve(
  fn: Evaluator,
  min: number,
  max: number,
  ySpan: number,
) {
  const x: (number | null)[] = [],
    y: (number | null)[] = [];
  let budget = 7000;
  const add = (a: number, b: number) => {
    x.push(a);
    y.push(b);
  };
  const gap = () => {
    if (x.at(-1) !== null) {
      x.push(null);
      y.push(null);
    }
  };
  function segment(
    a: number,
    fa: number,
    b: number,
    fb: number,
    depth: number,
  ) {
    if (--budget <= 0) {
      gap();
      return;
    }
    const m = (a + b) / 2,
      fm = fn(m);
    if (![fa, fb, fm].every(Number.isFinite)) {
      gap();
      if (Number.isFinite(fb)) add(b, fb);
      return;
    }
    const curved =
      Math.abs(fm - (fa + fb) / 2) > ySpan * 0.012 ||
      Math.abs(fb - fa) > ySpan * 1.5;
    if (curved && depth < 7) {
      segment(a, fa, m, fm, depth + 1);
      segment(m, fm, b, fb, depth + 1);
    } else if (curved) {
      gap();
      add(b, fb);
    } else add(b, fb);
  }
  let a = min,
    fa = fn(a);
  if (Number.isFinite(fa)) add(a, fa);
  for (let i = 1; i <= 320; i++) {
    const b = min + ((max - min) * i) / 320,
      fb = fn(b);
    segment(a, fa, b, fb, 0);
    a = b;
    fa = fb;
  }
  return { x, y };
}
export function midpointSum(fn: Evaluator, a: number, b: number, n: number) {
  let value = 0;
  const dx = (b - a) / n;
  for (let i = 0; i <= n; i++)
    if (!Number.isFinite(fn(a + i * dx))) return null;
  for (let i = 0; i < n; i++) {
    const y = fn(a + (i + 0.5) * dx);
    if (!Number.isFinite(y)) return null;
    value += y * dx;
  }
  return Number.isFinite(value) ? value : null;
}
