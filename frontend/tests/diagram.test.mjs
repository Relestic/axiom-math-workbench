import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: { resolveDir:process.cwd(), contents:[
    'export * from "./src/modules/visualization/diagram/schema";',
    'export * from "./src/modules/visualization/diagram/actions";',
    'export * from "./src/modules/visualization/diagram/presets";',
    'export * from "./src/data/offline/curriculum";',
    'export * from "./src/modules/visualization/cardVisual";',
    'export * from "./src/modules/records/archiveStorage";',
  ].join("\n") }, bundle:true, platform:"node", format:"esm", write:false,
});
const { diagramSceneSchema, diagramPresets, offlineCurriculum, cardVisualSchema, applyDiagramActions,
  validateLearningStorage, readBrowserArchive, exportBrowserArchive } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64"));

test("all eight lessons and four offline diagrams validate against the live board contracts", () => {
  assert.equal(offlineCurriculum.length, 8);
  assert.equal(diagramPresets.length, 4);
  diagramPresets.forEach(scene => diagramSceneSchema.parse(scene));
  const visuals = Object.fromEntries(offlineCurriculum.map(unit => [unit.id, cardVisualSchema.parse(unit.visual)]));
  assert.equal(visuals.riemann.board, "diagram");
  assert.deepEqual(visuals.derivative.functionScene.curves.map(c => c.expression), ["x^2","abs(x)"]);
  assert.deepEqual(visuals.primitive.functionScene.curves.map(c => c.expression), ["0.5*x^2","0.5*x^2 + 1","x"]);
  assert.deepEqual(["x0","epsilon","delta"].map(k => visuals.continuous.functionScene[k]), [0.5,0.4,0.2]);
  assert.equal(visuals.uniform.functionScene.mode, "continuity");
  assert.deepEqual(["xMin","xMax"].map(k => visuals["mean-value"].functionScene[k]), [-2,2]);
  assert.equal(visuals.taylor.functionScene.order, 2);
  assert.deepEqual(["integralStart","integralEnd"].map(k => visuals.integral.functionScene[k]), [0,2]);
});

test("diagram and multi-board card edits survive the archive round trip", async () => {
  const diagramScene = diagramPresets[2];
  const disk = {"axiom-last-page":"desk/diagram", "axiom-diagram-scene":JSON.stringify(diagramScene),
    "axiom-card-visual-first":JSON.stringify({board:"diagram",diagramScene, functionScene:offlineCurriculum[0].visual.functionScene})};
  assert.deepEqual(await readBrowserArchive(exportBrowserArchive(disk)), disk);
  assert.deepEqual(validateLearningStorage({"axiom-last-page":"desk/proof"}), {"axiom-last-page":"desk/proof"});
  const point = {id:"p",kind:"point",x:0,y:0};
  for (const nodes of [[point,point], [Object.assign({},point,{style:"color:red"})],
    [{...point,tone:"blue"}], [{...point,id:"m/2"}], [{...point,x:Infinity}],
    [{id:"c",kind:"curve",points:[[0,0]]}], Array.from({length:25},(_,i) => ({...point,id:String(i)}))]) {
    assert.throws(() => validateLearningStorage({...disk, "axiom-diagram-scene":JSON.stringify({...diagramScene,nodes})}));
  }
});

test("a diagram batch validates before committing and leaves one undo entry", () => {
  const original = diagramPresets[0], next = diagramPresets[1];
  const edits = [], commit = s => edits.push(s);
  const replacement = {type:"set_diagram", scene:next};
  const marker = {type:"upsert_diagram_node",node:{kind:"point",id:"p",x:0.5,y:0.5}};
  assert.ok(applyDiagramActions(original,[replacement, {type:"remove_diagram_node",id:"absent"}],commit).reason);
  assert.equal(edits.length,0);
  assert.equal(applyDiagramActions(original,[replacement, marker, {type:"set_diagram_view",viewBox:original.viewBox}],commit),true);
  assert.equal(edits.length,1);
  assert.equal(edits[0].nodes.at(-1).id,"p");
  assert.deepEqual(edits[0].viewBox, original.viewBox);
  assert.equal(applyDiagramActions(edits[0],[marker],commit),"unchanged");
  assert.equal(edits.length,1);
});
