import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/components/Math/notation.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { splitMath, toLatex } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64")
);

test("recovers unmarked ASCII subscripts, operators, and sequences from legacy cards", () => {
  const sample = "对于线性方程 lu=0，若 u1,...,un 都是解，则任意常数线性组合 c1u1(x)+…+cnun(x) 也是解（cj 为常数）。";
  const parts = splitMath(sample);
  const inline = parts.filter(p => p.kind === "inline").map(p => toLatex(p.text).trim());
  assert.deepEqual(inline, [
    "lu=0",
    "u_{1},\\ldots ,u_{n}",
    "c_{1}u_{1}(x)+\\ldots +c_{n}u_{n}(x)",
    "c_{j}",
  ]);
});

test("renders underscore pairs like c_1,c_2 while keeping English prose as text", () => {
  const parts = splitMath("任取常数 c_1,c_2，参考 UC Davis 分析讲义与 Heine–Cantor 定理。");
  const math = parts.filter(p => p.kind === "inline").map(p => p.text.trim());
  const text = parts.filter(p => p.kind === "text").map(p => p.text).join("");
  assert.deepEqual(math, ["c_1,c_2"]);
  assert.ok(text.includes("UC Davis"));
  assert.ok(text.includes("Heine–Cantor"));
});
