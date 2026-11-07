import test from "node:test";
import assert from "node:assert/strict";
import { localError, safeDelta, poly } from "../.test-build/src/lib/explorationMath.js";

const base = {
  topic: "continuity",
  dimension: 2,
  fn: "square",
  x0: 0.6,
  delta: 0.06,
  epsilon: 0.08,
};
const close = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test("x² 的误差使用邻域极值，并正确截断定义域端点", () => {
  close(localError(base), 0.0756);
  close(localError({ ...base, x0: 0.98, delta: 0.1 }), 0.186);
  close(safeDelta(base), Math.sqrt(0.36 + 0.08) - 0.6);
});

test("√x 在靠近 0 时仍给出有限的精确误差", () => {
  const c = { ...base, fn: "sqrt", x0: 0.03, delta: 0.05 };
  close(localError(c), Math.sqrt(0.03));
});

test("1/x 的邻域触及被排除的零点时，误差上确界无穷大", () => {
  assert.equal(
    localError({ ...base, fn: "inverse", x0: 0.03, delta: 0.04 }),
    Infinity,
  );
  close(localError({ ...base, fn: "inverse", x0: 0.5, delta: 0.1 }), 0.5);
});

test("sin(1/x) 捕获内部极值，不只比较两个端点", () => {
  const c = { ...base, fn: "oscillation", x0: 0.1, delta: 0.04 };
  close(localError(c), 1 + Math.abs(Math.sin(10)));
  close(localError({ ...c, delta: 0.11 }), 1 + Math.abs(Math.sin(10)));
});

test("三维误差同时受单位圆盘边界约束", () => {
  const c = { ...base, dimension: 3, x0: 0.9, delta: 0.2 };
  const r = Math.hypot(0.9, -0.35);
  close(localError(c), Math.max(1 - r * r, r * r - (r - 0.2) ** 2));
});

test("推荐 δ 的内部值在所有支持函数上满足精度要求", () => {
  for (const fn of ["square", "sqrt", "inverse", "oscillation"]) {
    for (const x0 of [0.03, 0.1, 0.6, 0.98]) {
      const c = { ...base, fn, x0 };
      const d = safeDelta(c);
      assert.ok(d > 0 && d <= 1);
      assert.ok(localError(c, d * 0.999) < c.epsilon, `${fn}, x0=${x0}`);
    }
  }
});

test("eˣ 有限阶 Taylor 近似的误差受 Lagrange 余项界控制", () => {
  for (let n = 1; n <= 8; n++)
    for (const x of [-1, -0.8, -0.3, 0, 0.3, 0.8, 1]) {
      const factorial = Array.from({ length: n + 1 }, (_, i) => i + 1).reduce(
        (a, b) => a * b,
        1,
      );
      const bound = (Math.E * Math.abs(x) ** (n + 1)) / factorial;
      assert.ok(Math.abs(Math.exp(x) - poly(x, n)) <= bound + 1e-14);
    }
});
