import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const compiled = await build({
  stdin: {
    contents: [
      'export * from "./src/modules/companion/workspace";',
      'export * from "./src/modules/companion/context";',
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
  queryWorkspace, queryDeskWorkspace, registerWorkspaceEndpoint, initialScene, applyFunctionScene, localReply,
  actionSchema, fitCompanionContext, requestReply, companionErrorMessage, formatActionNotice,
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

test("a stale target is detected before any mixed-target command is issued", async () => {
  let changed = false;
  const endpoint = () => ({ query: () => ({}), command: () => { changed = true; return true; } });
  const remove = registerWorkspaceEndpoint("explore", endpoint());
  const snapshot = queryWorkspace("textbook");
  const update = registerWorkspaceEndpoint("explore", endpoint());
  try {
    const signal = new AbortController().signal;
    const sceneAction = { type: "set_scene_param", name: "x0", value: 2 };
    assert.equal(await snapshot.dispatchActions([sceneAction], signal), false);
    assert.equal(await snapshot.dispatchActions([
      { type: "highlight_proof_step", ref: "uniform:3" }, sceneAction,
    ], signal), false);
    assert.equal(changed, false);
  } finally {
    update(); remove();
  }
});

test("a desk reply reveals each target and groups its actions into a single undoable edit", async () => {
  const revealed = [], batches = [];
  const action = {type:"set_curve", expression:"sin(x)"};
  const range = {type:"set_range", xMin:-4};
  const highlight = {type:"highlight_proof_step", ref:"unit:1"};
  const surface = {type:"set_surface_expression", expression:"x*y"};
  const cleanups = [];
  globalThis.window = new EventTarget();
  window.addEventListener("axiom:reveal-pane", ({detail:{pane}}) => {
    revealed.push(pane);
    queueMicrotask(() => cleanups.push(registerWorkspaceEndpoint(pane, {
      query: () => ({}), command: batch => { batches.push(batch); return true; },
    })));
  });
  try {
    const workspace = queryDeskWorkspace("textbook", "pdf", true);
    assert.deepEqual(workspace.context.board, {mounted:false, tab:"pdf", collapsed:true});
    assert.equal(await workspace.dispatchActions([highlight, action, surface, range], new AbortController().signal), true);
    assert.deepEqual(revealed, ["proof", "explore", "surface"]);
    assert.deepEqual(batches, [[highlight], [action, range], [surface]]);
  } finally {
    cleanups.forEach(remove => remove());
    delete globalThis.window;
  }
});

test("desk context is scoped to the selected board, study step and proof references", () => {
  const step = {ref:"lesson:0", title:"第一步", text:"当前步骤"};
  const curve = {id:"f", expression:"a*x", domainMin:null, domainMax:2, label:"f", visible:true};
  const cleanups = [
    registerWorkspaceEndpoint("textbook", {query: () => ({lecture:{
      conditions:["连续"], proof_steps:[step, {ref:"lesson:1", text:"其他步骤".repeat(1000)}],
    }})}),
    registerWorkspaceEndpoint("proof", {query: () => ({proof:{
      current_step:step, steps:[step,{ref:"lesson:1",text:"其他步骤".repeat(1000)}],
    }})}),
    registerWorkspaceEndpoint("explore", {query: () => ({function_scene:{
      active_expression:"a*x", mode:"graph", range:{xMin:-1,xMax:1,yMin:-2,yMax:2}, curves:[curve],
      controls:{x0:0.5}, parameters:[{name:"a",min:-1,max:1,value:0.5}],
    }})}),
    registerWorkspaceEndpoint("surface", {query: () => ({surface_scene:{
      expression:"x*y", range:{xMin:-1,xMax:1,yMin:-2,yMax:2}, view:{azimuth:45}, display:{opacity:1},
    }})}),
  ];
  try {
    const lecture = queryDeskWorkspace("textbook","pdf",false).context;
    assert.deepEqual(lecture.lecture, {conditions:["连续"], proof_refs:["lesson:0","lesson:1"]});
    assert.deepEqual(lecture.board,{mounted:false, tab:"pdf", collapsed:false});
    assert.equal(lecture.function_scene, undefined);
    const workspace = queryDeskWorkspace("proof","explore",true).context;
    assert.deepEqual(workspace.board,{mounted:true, tab:"explore", collapsed:true});
    assert.deepEqual(workspace.proof.current_step, step);
    assert.deepEqual(workspace.proof.refs, ["lesson:0","lesson:1"]);
    assert.equal(workspace.proof.steps, undefined);
    assert.equal(workspace.function_scene.active_expression,"a*x");
    assert.equal(workspace.function_scene.curves[0].visible,undefined);
    assert.equal(workspace.available_scene_controls,undefined);
    assert.equal(workspace.surface_scene,undefined);
    const other = queryDeskWorkspace("proof","surface",false).context;
    assert.deepEqual(Object.keys(other.surface_scene).sort(), ["expression","range","view"]);
  } finally {
    cleanups.forEach(remove => remove());
  }
});

test("a board validation refusal reaches the companion with its original Chinese reason", async () => {
  const reason = "对比曲线最多 4 条";
  const remove = registerWorkspaceEndpoint("explore", {
    query: () => ({}), command: () => ({reason}),
  });
  try {
    const result = await queryWorkspace("explore").dispatchActions([
      {type:"add_curve", expression:"x"},
    ],new AbortController().signal);
    assert.deepEqual(result, {count: 1, reason});
  } finally { remove(); }
});

test("a refused board batch counts all rolled-back actions and excludes successful targets", async () => {
  const reason = "曲面区间跨度太小";
  const remove2D = registerWorkspaceEndpoint("explore", {query: () => ({}), command: () => true});
  const remove3D = registerWorkspaceEndpoint("surface", {query: () => ({}), command: () => ({reason})});
  globalThis.window = new EventTarget();
  try {
    const result = await queryWorkspace("explore").dispatchActions([
      {type:"set_curve", expression:"x"},
      {type:"set_surface_expression", expression:"x*y"},
      {type:"set_surface_range", xMin:0, xMax:0},
    ], new AbortController().signal);
    assert.deepEqual(result, {count:2, reason});
  } finally { remove2D(); remove3D(); delete globalThis.window; }
});

test("long imported passages and escaped text fit the request budget without truncating plot IDs", () => {
  const original = {
    definition:"定义".repeat(4000), formula:"x", lecture:{conditions:Array(20).fill('"'.repeat(3000))},
    proof:{current_step:{ref:"kept-ref", text:"长段".repeat(2000)}},
    board:{mounted:true, tab:"explore", collapsed:false},
    function_scene:{curves:[{id:"stable-id", expression:"a*x"}]},
  };
  const fitted = fitCompanionContext(original);
  assert.ok(JSON.stringify(fitted).length <= 22000);
  assert.ok(fitted.excerpted);
  assert.deepEqual(fitted.function_scene, original.function_scene);
  assert.deepEqual(fitted.board, original.board);
  assert.equal(fitted.proof.current_step.ref, "kept-ref");
  assert.ok(original.definition.length > fitted.definition.length);
});

test("the response reader distinguishes malformed explanations from connectivity failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({display_markdown:"", spoken_text:""});
    const ask = () => requestReply("定义",{},[],new AbortController().signal);
    await assert.rejects(ask, error => companionErrorMessage(error).includes("格式校验失败"));
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(ask, error => companionErrorMessage(error).includes("网络"));
    globalThis.fetch = async () => Response.json({error:{code:"companion_format",message:"上游格式"}}, {status:502});
    await assert.rejects(ask, error => companionErrorMessage(error).includes("格式校验失败"));
    globalThis.fetch = async () => Response.json({
      display_markdown:"讲解", spoken_text:"讲解", actions:[{type:"set_curve",expression:"x",scene:{}},
        {type:"set_surface_view",elevation:35}, {type:"set_curve",expression:"x"}],
    });
    assert.deepEqual((await ask()).actions, [{type:"set_surface_view",elevation:35},{type:"set_curve",expression:"x"}]);
    assert.equal(actionSchema.safeParse({type:"set_parameter_range",name:"e",value:1,min:0,max:2}).success,false);
    assert.equal(actionSchema.safeParse({type:"set_mode",mode:"taylor"}).success,true);
  } finally { globalThis.fetch = originalFetch; }
});

test("reply preserves original drop indices and keeps diagnostics out of speech", async () => {
  const originalFetch = globalThis.fetch;
  const serverDrop = {index:1, type:"invalid", reason:"不支持的操作类型"};
  try {
    globalThis.fetch = async () => Response.json({
      display_markdown:"观察常函数", spoken_text:"观察常函数", dropped:[serverDrop],
      actions:[
        {type:"set_curve", expression:"2", id:"001", domainMin:null, leftOpen:"false"},
        {type:"set_range", xMax:null},
        {type:"set_scene_param", name:"x0", value:" -1.2e1 "},
        {type:"set_surface_range", xMin:"-1px"},
      ],
    });
    const reply = await requestReply("改图", {}, [], new AbortController().signal);
    assert.deepEqual(reply.actions, [
      {type:"set_curve", expression:"2", id:"001", leftOpen:false},
      {type:"set_scene_param", name:"x0", value:-12},
    ]);
    assert.deepEqual(reply.dropped.map(d => d.index), [1,2,4]);
    assert.deepEqual(reply.dropped[0], serverDrop);
    assert.match(reply.dropped[1].reason, /边界/);
    assert.match(reply.dropped[2].reason, /xMin/);
    const notice = formatActionNotice(reply.dropped, {count:2, reason:"曲线数量超限"});
    assert.match(notice, /^有 5 项黑板操作未执行：/);
    assert.ok(notice.includes(serverDrop.reason) && notice.includes("曲线数量超限"));
    assert.equal(reply.spoken_text, "观察常函数");
  } finally { globalThis.fetch = originalFetch; }
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
