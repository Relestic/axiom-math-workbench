import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const compiled = await build({
  stdin: {
    contents: [
      'export * from "./src/modules/companion/workspace";',
      'export * from "./src/app/workspaceEndpoints";',
      'export * from "./src/modules/visualization/scene/functionScene";',
      'export * from "./src/modules/visualization/scene/parameterBatch";',
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
const {
  queryWorkspace, registerWorkspaceEndpoint, initialScene, applyFunctionScene,
  functionParameterCandidate, sceneParameterBatch, defaultSurfaceScene, surfaceParameterCandidate,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`
);

test("the selected route queries the live endpoint and refuses obsolete commands", () => {
  const action = { type: "highlight_proof_step", ref: "uniform:1" };
  const liveContext = { proof: { current: "uniform:0" } };
  let calls = 0;
  const cleanup = registerWorkspaceEndpoint("proof", {
    query: () => liveContext,
    command: ([request]) => {
      if (request.type !== action.type || request.ref !== action.ref) return false;
      calls += 1;
      return true;
    },
  });
  try {
    assert.deepEqual(queryWorkspace("textbook").context, {});
    assert.equal(queryWorkspace("textbook").apply(action), false);
    const proof = queryWorkspace("proof");
    assert.deepEqual(proof.context, { proof: { current: "uniform:0" } });
    proof.context.proof.current = "fake";
    assert.equal(liveContext.proof.current, "uniform:0");
    assert.equal(proof.apply({ type: action.type, ref: "fake" }), false);
    assert.equal(proof.isCurrent(), true);
    assert.equal(proof.apply(action), true);
    assert.equal(proof.apply(action), false);
    assert.equal(calls, 1);
    const removeNew = registerWorkspaceEndpoint("proof", {
      query: () => ({ proof: { current: "uniform:1" } }),
    });
    try {
      cleanup();
      assert.equal(proof.isCurrent(), false);
      assert.equal(proof.apply(action), false);
      assert.deepEqual(queryWorkspace("proof").context, { proof: { current: "uniform:1" } });
    } finally {
      removeNew();
    }
  } finally {
    cleanup();
  }
  assert.deepEqual(queryWorkspace("proof").context, {});
});

test("an edit invalidates an unconsumed snapshot and exercise context is read-only", () => {
  const action = { type: "set_scene_param", name: "x0", value: 3 };
  let calls = 0;
  const unregisterOriginal = registerWorkspaceEndpoint("explore", {
    query: () => ({ function_scene: { active_expression: "x^2" } }),
    command: () => { calls += 1; return true; },
  });
  const original = queryWorkspace("explore");
  unregisterOriginal();
  const unregisterEdited = registerWorkspaceEndpoint("explore", {
    query: () => ({ function_scene: { active_expression: "x^3" } }),
  });
  const unregisterExercise = registerWorkspaceEndpoint("exercises", {
    query: () => ({ exercise: { draft_answer: "证明草稿" } }),
  });
  try {
    assert.equal(original.isCurrent(), false);
    assert.equal(original.apply(action), false);
    assert.equal(calls, 0);
    const exercise = queryWorkspace("exercises");
    assert.equal(exercise.context.exercise.draft_answer, "证明草稿");
    assert.equal(exercise.apply(action), false);
  } finally {
    unregisterEdited();
    unregisterExercise();
  }
});

test("2D suggestions edit existing parameters and visible analysis controls through validation", () => {
  const scene = applyFunctionScene({
    ...initialScene,
    curves: [{ ...initialScene.curves[0], expression: "a*x" }],
    mode: "integral",
  });
  assert.equal(functionParameterCandidate(scene, "a", 3).parameters[0].value, 3);
  assert.equal(functionParameterCandidate(scene, "subdivisions", 24).subdivisions, 24);
  for (const [name, value] of [
    ["a", 1], ["a", -6], ["b", 3], ["subdivisions", 4.5],
    ["integralStart", 2], ["epsilon", 1], ["x0", NaN], ["constructor", 12],
  ]) assert.equal(functionParameterCandidate(scene, name, value), null);
  assert.equal(scene.parameters[0].value, 1);
});

test("one reply can apply two validated parameters in a single scene update", () => {
  let scene = applyFunctionScene({
    ...initialScene,
    curves: [{ ...initialScene.curves[0], expression: "a*x" }],
    mode: "integral",
  });
  let commits = 0;
  const unregister = registerWorkspaceEndpoint("explore", {
    query: () => ({ function_scene: scene }),
    command: (actions) => {
      const next = sceneParameterBatch(scene, actions, functionParameterCandidate);
      if (!next) return false;
      scene = next;
      commits += 1;
      return true;
    },
  });
  try {
    const workspace = queryWorkspace("explore");
    assert.equal(workspace.applyActions([
      { type: "set_scene_param", name: "a", value: 3 },
      { type: "set_scene_param", name: "subdivisions", value: 28 },
      { type: "set_scene_param", name: "subdivisions", value: 3.5 },
    ]), true);
    assert.equal(scene.parameters[0].value, 3);
    assert.equal(scene.subdivisions, 28);
    assert.equal(commits, 1);
  } finally {
    unregister();
  }
});

test("3D suggestions use numeric view and display controls without clamping", () => {
  const scene = defaultSurfaceScene;
  assert.equal(surfaceParameterCandidate(scene, "zoom", 1.5).view.zoom, 1.5);
  assert.equal(surfaceParameterCandidate(scene, "opacity", 0.5).display.opacity, 0.5);
  for (const [name, value] of [
    ["zoom", 1], ["zoom", 8], ["opacity", 0.1], ["elevation", 0],
    ["wireframe", 0], ["azimuth", Infinity], ["constructor", 2],
  ]) assert.equal(surfaceParameterCandidate(scene, name, value), null);
  assert.equal(scene.view.zoom, 1);
});
