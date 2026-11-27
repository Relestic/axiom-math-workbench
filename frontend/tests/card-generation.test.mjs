import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints:["src/modules/teaching/localTextbooks.ts"], bundle:true, write:false, platform:"node", format:"esm",
  define:{"import.meta.env.VITE_API_BASE":JSON.stringify("__SAME_ORIGIN__")},
});
const { completeCards } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64"));
const cards = [{id:"first", title:"连续"}, {id:"second", title:"一致连续"}];

test("a failed proof still gets its exercise and the next card is completed in order", async t => {
  const events = [], failures = [], progress = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    events.push(url);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.has("Authorization"), false);
    return Response.json({}, {status:url.endsWith("first/proof") ? 404 : 200});
  });
  await completeCards(cards, {stopped:() => false, progress:text => progress.push(text),
    failed:label => failures.push(label), refresh:async () => { events.push("refresh"); }});
  assert.deepEqual(events, [
    "/api/v1/local/cards/first/proof", "/api/v1/local/cards/first/exercises", "refresh",
    "/api/v1/local/cards/second/proof", "/api/v1/local/cards/second/exercises", "refresh",
  ]);
  assert.deepEqual(failures, ["《连续》的证明拆解"]);
  assert.match(progress.at(-1), /2 \/ 2.*配套练习/);
});

test("stop during a pending proof finishes that request and schedules no exercises or later cards", async t => {
  let finish, stopped = false, refreshes = 0;
  const request = new Promise(resolve => { finish = resolve; });
  const fetch = t.mock.method(globalThis, "fetch", () => request);
  const task = completeCards(cards, {stopped:() => stopped, progress:() => {}, failed:assert.fail,
    refresh:async () => { refreshes++; }});
  assert.equal(fetch.mock.callCount(), 1);
  stopped = true;
  finish(Response.json({}));
  await task;
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(refreshes, 1);
});
