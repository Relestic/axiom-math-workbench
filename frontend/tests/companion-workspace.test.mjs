import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const compiled = await build({
  stdin: {
    contents: [
      'export * from "./src/modules/companion/workspace";',
      'export * from "./src/modules/companion/reply";',
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
  define: { "import.meta.env.VITE_API_BASE": '""' },
});
const {
  queryWorkspace, registerWorkspaceEndpoint, initialScene, applyFunctionScene, localReply,
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

test("a lecture reply reveals an unmounted proof and delivers its batch once it registers", async () => {
  const workspace = queryWorkspace("textbook");
  const actions = [{ type: "highlight_proof_step", ref: "uniform:2" }];
  const navigation = new EventTarget();
  const seen = [];
  let remove;
  globalThis.window = navigation;
  navigation.addEventListener("axiom:reveal-pane", event => {
    assert.equal(event.detail.pane, "proof");
    queueMicrotask(() => {
      remove = registerWorkspaceEndpoint("proof", {
        query: () => ({}),
        command: batch => { seen.push(batch); return true; },
      });
    });
  });
  try {
    assert.equal(await workspace.dispatchActions(actions, new AbortController().signal), true);
    assert.deepEqual(seen, [actions]);
  } finally {
    remove?.();
    delete globalThis.window;
  }
});

test("leaving a requested target before it mounts cancels delivery", async () => {
  const controller = new AbortController();
  let changed = false;
  globalThis.window = new EventTarget();
  const delivered = queryWorkspace("textbook").dispatchActions(
    [{ type: "set_scene_param", name: "zoom", value: 1.3 }], controller.signal,
  );
  controller.abort();
  const remove = registerWorkspaceEndpoint("surface", {
    query: () => ({}), command: () => { changed = true; return true; },
  });
  try {
    assert.equal(await delivered, false);
    assert.equal(changed, false);
  } finally {
    remove();
    delete globalThis.window;
  }
});

test("a stale target or mixed-target batch never causes a partial edit", async () => {
  let changed = false;
  const endpoint = () => ({ query: () => ({}), command: () => { changed = true; return true; } });
  const remove = registerWorkspaceEndpoint("explore", endpoint());
  const snapshot = queryWorkspace("textbook");
  const update = registerWorkspaceEndpoint("explore", endpoint());
  try {
    const signal = new AbortController().signal;
    const sceneAction = { type: "set_scene_param", name: "x0", value: 2 };
    assert.equal(await snapshot.dispatchActions([sceneAction], signal), false);
    assert.equal(await queryWorkspace("textbook").dispatchActions([
      sceneAction, { type: "highlight_proof_step", ref: "uniform:3" },
    ], signal), false);
    assert.equal(changed, false);
  } finally {
    update(); remove();
  }
});

test("an active 2D plot keeps a user parameter whose name matches a surface control", async () => {
  let opacity = 0.4;
  const remove = registerWorkspaceEndpoint("explore", {
    query: () => ({ function_scene: { controls: {x0:0}, parameters:[{ name: "opacity", value: opacity }] } }),
    command: ([action]) => { opacity = action.value; return true; },
  });
  try {
    const ok = await queryWorkspace("explore").dispatchActions(
      [{ type: "set_scene_param", name: "opacity", value: 0.7 }], new AbortController().signal,
    );
    assert.equal(ok, true);
    assert.equal(opacity, 0.7);
  } finally {
    remove();
  }
});

test("offline quick prompts explain the selected example's repair and actual lecture conditions", () => {
  const unit = { definition: "定义", formula: "f", conditions:["连续", "闭区间"], tools:["列紧性"] };
  const classic = { repair: "把开区间改为闭区间" };
  assert.match(localReply("怎样补全条件", unit, classic, {}).display_markdown, /把开区间改为闭区间/);
  assert.match(localReply("梳理条件", unit, classic, {}).display_markdown, /闭区间/);
  assert.match(localReply("这一步的依据", unit, classic, {step:"取子列"}).display_markdown, /列紧性/);
});

test("lecture context advertises only the available sibling plot controls and parameter bounds", () => {
  const remove = registerWorkspaceEndpoint("explore", {query: () => ({function_scene: {
    active_expression: "a*x", controls: {x0:2}, parameters: [{ name:"a", value:1, min:-5, max:5 }],
  }})});
  try {
    assert.deepEqual(queryWorkspace("textbook").context.available_scene_controls, {explore:{
      controls:{x0:2}, parameters:[{name:"a", value:1, min:-5, max:5}],
    }});
  } finally {
    remove();
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
    ]), false);
    assert.equal(commits, 0);
    assert.equal(scene.parameters[0].value, 1);
    assert.equal(workspace.applyActions([
      { type: "set_scene_param", name: "a", value: 3 },
      { type: "set_scene_param", name: "subdivisions", value: 28 },
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
