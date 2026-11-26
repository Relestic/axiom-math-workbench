import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";

const compiled = await build({
  stdin: { contents: 'export * from "./src/modules/teaching/classicPlot"; export * from "./src/modules/teaching/counterexample";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "cjs", external: ["mathjs"],
  define: { "import.meta.env.VITE_API_BASE": '""' },
});
const exported = {};
new Function("module", "require", compiled.outputFiles[0].text)(exported, createRequire(import.meta.url));
const { sampleClassic, counterexampleNote } = exported.exports;

test("经典反例按表达式采样并在阶跃处分段", () => {
  const { segments } = sampleClassic("step");
  assert.equal(segments.length, 2);
  assert.ok(segments[0].every(([x,y]) => x < 0.5 && y === 0));
  assert.ok(segments[1].every(([x,y]) => x >= 0.5 && y === 1));
  for (const [x,y] of sampleClassic("reciprocal").segments.flat()) {
    assert.ok(x > 0 && x < 1 && Math.abs(y - 1 / x) < 1e-9);
  }
  const square = sampleClassic("square").segments[0];
  assert.ok(square.length > 100 && square.every(([x,y]) => Math.abs(y - x*x) < 1e-9));
});

test("反例笔记包含函数、开闭区间及每一条依据的原始标签", () => {
  const findings = ["symbolic","numeric-sample","definition-only","model-explanation"].map(verdict_basis => ({verdict_basis,text:"检验记录"}));
  const note = counterexampleNote({expression:"1/x",interval:"(0, 1]",findings});
  assert.ok(note.includes("f(x) = 1/x · (0, 1]"));
  for (const {verdict_basis} of findings) assert.ok(note.includes(`[verdict_basis=${verdict_basis}]`));
});
