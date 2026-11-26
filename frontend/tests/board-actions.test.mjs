import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  stdin: {
    contents: [
      'export * from "./src/modules/visualization/scene/functionScene";',
      'export * from "./src/modules/visualization/three-d/companionScene";',
      'export * from "./src/modules/visualization/three-d/types";',
    ].join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { initialScene, defaultSurfaceScene, applyFunctionActions, applySurfaceActions } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);

test("2D applies a complete explanation in one undoable edit", () => {
  const commits = [];
  const result = applyFunctionActions(initialScene, [
    { type: "set_curve", expression: "a*x^3", domainMin: -3, rightOpen: true },
    { type: "set_parameter_range", name: "a", value: 2, min: -8, max: 8 },
    { type: "set_mode", mode: "derivative" },
    { type: "set_scene_param", name: "h", value: 0.1 },
    { type: "set_range", xMin: -4, yMax: 10 },
  ], next => commits.push(next));
  assert.equal(result, true);
  assert.equal(commits.length, 1);
  const [next] = commits;
  assert.deepEqual(next.curves, [{ ...initialScene.curves[0], expression: "a*x^3", domainMin: -3, rightOpen: true }]);
  assert.deepEqual(next.parameters, [{ name: "a", value: 2, min: -8, max: 8 }]);
  assert.equal(next.mode, "derivative");
  assert.equal(next.h, 0.1);
  assert.deepEqual([next.xMin, next.xMax, next.yMin, next.yMax], [-4, 3, -2, 10]);
  assert.equal(initialScene.curves[0].expression, "x^2");
});

test("comparison curves have unique IDs and clearing keeps the selected function", () => {
  let scene = initialScene;
  const apply = (...actions) => applyFunctionActions(scene, actions, next => { scene = next; });
  assert.equal(apply({ type: "add_curve", id: "g", expression: "-x", label: "g(x)", domainMax: 0, rightOpen: true },
    { type: "add_curve", expression: "x^3" }), true);
  assert.equal(new Set(scene.curves.map(curve => curve.id)).size, 3);
  assert.equal(scene.curves[1].domainMax, 0);
  assert.equal(scene.curves[1].rightOpen, true);
  scene = { ...scene, activeId: "g" };
  assert.equal(apply({ type: "set_curve", expression: "sin(x)" }, { type: "remove_curve", id: "f" },
    { type: "clear_comparison_curves" }), true);
  assert.deepEqual(scene.curves.map(curve => [curve.id, curve.expression, curve.domainMax]), [["g", "sin(x)", 0]]);
  assert.equal(apply({ type: "clear_comparison_curves" }), "unchanged");
});

test("a rejected 2D action preserves the whole prior scene and explains the reason in Chinese", () => {
  const add = { type: "add_curve", expression: "x" };
  const cases = [
    [[add, add, add, add], /4/],
    [[{ type: "remove_curve", id: "f" }], /保留/],
    [[{ type: "set_curve", id: "unknown", expression: "x" }], /曲线/],
    [[{ type: "set_curve", expression: "import(x)" }], /函数|白名单/],
    [[{ type: "set_curve", expression: "x>0?x:0" }], /分段/],
    [[{ type: "set_range", xMin: 2.999 }], /跨度/],
    [[{ type: "set_parameter_range", name: "x", value: 1, min: -2, max: 2 }], /参数/],
    [[{ type: "set_parameter_range", name: "a", value: 1, min: -2, max: 2 }], /参数/],
  ];
  for (const [actions, reason] of cases) {
    const commits = [];
    const result = applyFunctionActions(initialScene, [{ type: "set_mode", mode: "integral" }, ...actions], next => commits.push(next));
    assert.match(result.reason, reason);
    assert.equal(commits.length, 0);
    assert.equal(initialScene.mode, "graph");
    assert.equal(initialScene.curves.length, 1);
  }
});

test("3D combines a new formula, partial range, legacy zoom and view in a single snapshot", () => {
  const commits = [];
  assert.equal(applySurfaceActions(defaultSurfaceScene, [
    { type: "set_surface_expression", expression: "sin(x)*cos(y)" },
    { type: "set_surface_range", xMin: -8, xMax: 6 },
    { type: "set_scene_param", name: "zoom", value: 1.2 },
    { type: "set_surface_view", azimuth: 80, elevation: 35 },
  ], next => commits.push(next)), true);
  assert.equal(commits.length, 1);
  const [next] = commits;
  assert.equal(next.expression, "sin(x)*cos(y)");
  assert.deepEqual([next.xMin, next.xMax, next.yMin, next.yMax], [-8, 6, -1.6, 1.6]);
  assert.deepEqual(next.view, { azimuth: 80, elevation: 35, heightScale: 1, zoom: 1.2 });
  assert.equal(defaultSurfaceScene.view.azimuth, 45);
});

test("3D rejects invalid bounds, view limits and variables without clamping or partially applying", () => {
  for (const [action, reason] of [
    [{ type: "set_surface_range", xMin: -21 }, /范围|区间/],
    [{ type: "set_surface_range", yMax: -1.5 }, /跨度/],
    [{ type: "set_surface_range", yMin: NaN }, /范围|区间/],
    [{ type: "set_surface_view", elevation: 86 }, /视角|俯仰/],
    [{ type: "set_surface_expression", expression: "a*x*y" }, /变量|参数/],
    [{ type: "set_surface_expression", expression: "   " }, /表达式/],
  ]) {
    const commits = [];
    const result = applySurfaceActions(defaultSurfaceScene, [{ type: "set_surface_expression", expression: "x-y" }, action], next => commits.push(next));
    assert.match(result.reason, reason);
    assert.equal(commits.length, 0);
    assert.equal(defaultSurfaceScene.expression, "x^2 + y^2");
  }
});

test("a surface interval exactly 0.2 wide keeps both supplied decimal endpoints", () => {
  let accepted;
  assert.equal(applySurfaceActions(defaultSurfaceScene, [{
    type: "set_surface_range", xMin: -0.3, xMax: -0.1, yMin: 19.8, yMax: 20,
  }], next => { accepted = next; }), true);
  assert.deepEqual([accepted.xMin, accepted.xMax, accepted.yMin, accepted.yMax], [-0.3, -0.1, 19.8, 20]);
});

test("the minimum 2D span accepts decimal endpoints and rejects a smaller interval", () => {
  const commits = [];
  const apply = xMax => applyFunctionActions(initialScene, [
    { type: "set_range", xMin: -0.03, xMax },
  ], next => commits.push(next));
  assert.equal(apply(-0.02), true);
  assert.deepEqual([commits[0].xMin, commits[0].xMax], [-0.03, -0.02]);
  assert.match(apply(-0.020000000001).reason, /跨度/);
  assert.equal(commits.length, 1);
});
