import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const compiled = await build({
  stdin: {
    contents: [
      'export * from "./src/modules/visualization/scene/functionScene";',
      'export * from "./src/modules/visualization/three-d/engine";',
      'export * from "./src/modules/visualization/three-d/companionScene";',
      'export * from "./src/modules/visualization/three-d/types";',
      'export { curveEvaluator } from "./src/lib/plotScene";',
    ].join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const {
  applyFunctionActions, initialScene, curveEvaluator,
  applySurfaceActions, defaultSurfaceScene, normalizeSurfaceScene, parseSurfaceExpression,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);

test("2D companion accepts textbook function labels, operations and aliases", () => {
  let scene;
  const actions = [
    { type: "set_curve", expression: "f（x） = ln（e）−2·sgn（x）" },
    { type: "add_curve", expression: "g(x)=arcsin(x)+arccos(x)–arctan(x)" },
    { type: "add_curve", expression: "y=0" },
  ];
  assert.equal(applyFunctionActions(initialScene, actions, next => { scene = next; }), true);
  assert.deepEqual(scene.curves.map(curve => curve.expression), [
    "log(e)-2*sign(x)", "asin(x)+acos(x)-atan(x)", "0",
  ]);
  const values = scene.curves.map(curve => curveEvaluator(curve, {})(1));
  assert.deepEqual(values, [-1, Math.PI / 4, 0]);
});

test("manual surface input and companion actions store and evaluate the same formula", () => {
  for (const [input, canonical, value] of [
    ["f（x, y） = ln（e） + x·arctan（y）", "log(e) + x*atan(y)", 1 + Math.PI / 2],
    ["z = −2", "-2", -2],
    ["y == 1 ? x : 0", "y == 1 ? x : 0", 2],
  ]) {
    const scene = normalizeSurfaceScene({ ...defaultSurfaceScene, expression: input });
    assert.equal(scene.expression, canonical);
    assert.equal(parseSurfaceExpression(input).evaluate(2, 1), value);
    let committed;
    assert.equal(applySurfaceActions(defaultSurfaceScene, [
      { type: "set_surface_expression", expression: input },
    ], next => { committed = next; }), true);
    assert.deepEqual(committed, scene);
  }
});

test("dialect conversion still rejects invalid right-hand sides and unsupported assignments", () => {
  for (const expression of ["f(x)=", "z=a=2", "t(x)=x", "y=xln(x)", "y=sgn"]) {
    let committed = false;
    const result = applyFunctionActions(initialScene, [
      { type: "set_curve", expression },
    ], () => { committed = true; });
    assert.equal(typeof result.reason, "string");
    assert.equal(committed, false);
    assert.throws(() => normalizeSurfaceScene({ ...defaultSurfaceScene, expression }));
  }
});
