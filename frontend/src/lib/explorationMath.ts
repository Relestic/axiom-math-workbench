export type Topic = "continuity" | "derivative" | "taylor" | "integral";
export type FunctionId =
  | "square"
  | "sqrt"
  | "inverse"
  | "oscillation"
  | "absolute";
export type Config = {
  topic: Topic;
  dimension: 2 | 3;
  fn: FunctionId;
  epsilon: number;
  delta: number;
  x0: number;
  h: number;
  n: number;
  angle: number;
  elevation: number;
  band: boolean;
  neighborhood: boolean;
  danger: boolean;
  grid: boolean;
  sampling: "left" | "midpoint" | "right";
  zoom: number;
};
export const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
export const fmt = (n: number, digits = 3) =>
  Number.isFinite(n) ? n.toFixed(digits) : "无界";
export const fact = (n: number): number => (n < 2 ? 1 : n * fact(n - 1));
export const poly = (x: number, n: number) =>
  Array.from({ length: n + 1 }, (_, k) => x ** k / fact(k)).reduce(
    (a, b) => a + b,
    0,
  );
export const f = (id: FunctionId, x: number) =>
  id === "sqrt"
    ? Math.sqrt(Math.max(0, x))
    : id === "inverse"
      ? 1 / x
      : id === "oscillation"
        ? Math.sin(1 / x)
        : id === "absolute"
          ? Math.abs(x)
          : x * x;
export function localError(c: Config, d = c.delta): number {
  if (c.dimension === 3) {
    const r = Math.hypot(c.x0, -0.35);
    return Math.max(
      Math.min(1, r + d) ** 2 - r * r,
      r * r - Math.max(0, r - d) ** 2,
    );
  }
  const lo = Math.max(0, c.x0 - d),
    hi = Math.min(1, c.x0 + d),
    y = f(c.fn, c.x0);
  if (c.fn === "inverse" && lo <= 0) return Infinity;
  if (c.fn === "oscillation") {
    if (lo <= 0) return 1 + Math.abs(y);
    const a = 1 / hi,
      b = 1 / lo;
    let values = [Math.sin(a), Math.sin(b)];
    if (
      Math.ceil((a - Math.PI / 2) / (Math.PI * 2)) <=
      Math.floor((b - Math.PI / 2) / (Math.PI * 2))
    )
      values.push(1);
    if (
      Math.ceil((a + Math.PI / 2) / (Math.PI * 2)) <=
      Math.floor((b + Math.PI / 2) / (Math.PI * 2))
    )
      values.push(-1);
    return Math.max(...values.map((v) => Math.abs(v - y)));
  }
  return Math.max(Math.abs(f(c.fn, lo) - y), Math.abs(f(c.fn, hi) - y));
}
export function safeDelta(c: Config) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    if (localError(c, m) < c.epsilon) lo = m;
    else hi = m;
  }
  return lo;
}
