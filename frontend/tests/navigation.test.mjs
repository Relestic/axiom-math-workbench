import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const {outputFiles} = await build({entryPoints:["src/navigation.ts"],bundle:true,platform:"node",format:"esm",write:false});
const route = await import("data:text/javascript;base64,"+Buffer.from(outputFiles[0].contents).toString("base64"));

test("legacy deep links replace the current history entry and resume the exact pane", () => {
  const location = {hash:"#proof"};
  const replaced = [];
  const history = {replaceState(_state, _title, hash){replaced.push(hash);location.hash=hash;}};
  const saved = {getItem(){return "practice-map";}};
  assert.equal(route.pageFromHash(location,history,saved),"desk/proof");
  assert.deepEqual(replaced,["#desk/proof"]);
  assert.equal(route.pageFromHash(location,history,saved),"desk/proof");
  assert.equal(replaced.length,1);
  location.hash="";
  assert.equal(route.pageFromHash(location,history,saved),"atlas/practice-map");
});

test("all four sections and their historical aliases have a unique canonical route", () => {
  assert.deepEqual(route.navigation.map(([id]) => id), ["dashboard","desk","atlas","shelf"]);
  for (const [section, children] of Object.entries(route.subpages)) {
    for (const pane of Object.keys(children)) {
      assert.equal(route.normalizeRoute(pane), section + "/" + pane);
      assert.equal(route.normalizeRoute(section + "/" + pane), section + "/" + pane);
    }
  }
  assert.equal(route.normalizeRoute("shelf/proof"), undefined);
});
