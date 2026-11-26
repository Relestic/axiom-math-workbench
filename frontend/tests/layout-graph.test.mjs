import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/pages/maps/layoutGraph.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
});
const { layoutGraph } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);

function card(id, textbookId, pageStart, extra = {}) {
  return Object.freeze({ id, name: id.repeat(4), textbookId, textbookTitle: textbookId,
    pageStart, x: -250, y: 900, color: "teal", progress: null, prerequisites: [],
    connections: [], description: "", detail: "", ...extra });
}

test("course and book lanes enclose every card, in page and creation order, without overlap", () => {
  const nodes = Object.freeze([
    card("before", "Analysis", 7), card("other", "Calculus", 9), card("course"),
    card("first", "Analysis", 1), card("after", "Analysis", 7), card("theorem", "Analysis", 10),
  ]);
  const edges = Object.freeze([
    Object.freeze(["first", "before", "sequence"]), Object.freeze(["before", "theorem", "prerequisite"]),
  ]);
  const graph = layoutGraph(nodes, edges);
  assert.deepEqual(graph, layoutGraph(nodes, edges));
  assert.deepEqual(graph.lanes.map(lane => lane.id), ["builtin", "Analysis", "Calculus"]);
  assert.deepEqual(graph.lanes.map(lane => lane.nodeCount), [1, 4, 1]);
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const [first, before, after] = ["first", "before", "after"].map(id => byId.get(id));
  assert.ok(first.y < before.y && before.y < after.y);
  assert.equal(first.x, after.x);
  assert.equal(before.y - first.y, 88);
  assert.equal(byId.get("theorem").x - before.x, 240);
  for (const [i, lane] of graph.lanes.entries()) {
    const prev = graph.lanes[i - 1];
    if (prev) assert.equal(lane.y - prev.y - prev.height, 64);
    assert.ok(lane.x >= graph.bounds.x && lane.x + lane.width <= graph.bounds.x + graph.bounds.width);
    assert.ok(lane.y >= graph.bounds.y && lane.y + lane.height <= graph.bounds.y + graph.bounds.height);
    for (const node of graph.nodes.filter(node => node.laneId === lane.id)) {
      assert.equal(node.width, 200);
      assert.equal(node.height, 64);
      assert.ok(node.x >= lane.x && node.x + node.width <= lane.x + lane.width);
      assert.ok(node.y >= lane.y + 48 && node.y + node.height <= lane.y + lane.height);
    }
  }
  for (const [i, a] of graph.nodes.entries()) {
    for (const b of graph.nodes.slice(i + 1)) assert.ok(
      a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
    );
  }
});

test("longest prerequisite path sets layers even when a shortcut appears first", () => {
  const graph = layoutGraph(["a", "b", "c", "d", "e"].map(id => card(id)), [
    ["a", "c", "prerequisite"], ["a", "b", "prerequisite"], ["b", "d", "prerequisite"],
    ["d", "c", "prerequisite"], ["c", "e", "implication"],
  ]);
  assert.deepEqual(Object.fromEntries(graph.nodes.map(n => [n.id, n.layer])), { a: 0, b: 1, c: 3, d: 2, e: 0 });
});

test("DFS downgrades back edges and deduplicates displayed tuples while preserving distinct relations", () => {
  const edges = [
    ["a", "b", "prerequisite"], ["a", "b", "implication"], ["a", "b", "prerequisite"],
    ["b", "c", "prerequisite"], ["c", "a", "prerequisite"],
    ["c", "a", "implication"], ["c", "a", "sequence"],
  ];
  const graph = layoutGraph(["a", "b", "c"].map(id => card(id, "book")), edges);
  assert.deepEqual(graph.edges, [
    ["a", "b", "prerequisite"], ["a", "b", "implication"], ["b", "c", "prerequisite"],
    ["c", "a", "sequence"], ["c", "a", "implication"],
  ]);
  assert.deepEqual(graph.nodes.map(n => n.layer), [0, 1, 2]);
  assert.equal(edges[4][2], "prerequisite");
});

test("filtering a book drops foreign, hidden and missing endpoints and recomputes its actual bounds", () => {
  const nodes = [card("local", "own", 2), card("case", "own", 1, { kind: "case" }),
    card("ext", "own", 4, { kind: "extension" }), card("foreign", "other", 5)];
  const edges = [["local", "case", "case"], ["ext", "local", "extension"],
    ["local", "foreign", "prerequisite"], ["gone", "local", "prerequisite"]];
  assert.deepEqual(layoutGraph(nodes, edges).edges, []);
  const graph = layoutGraph(nodes.filter(n => n.textbookId === "own"), edges);
  assert.deepEqual(graph.nodes.map(n => n.id), ["local"]);
  const [lane] = graph.lanes;
  assert.deepEqual(graph.bounds, { x: lane.x, y: lane.y, width: lane.width, height: lane.height });
  assert.deepEqual(layoutGraph([], edges).bounds, { x: 0, y: 0, width: 0, height: 0 });
});

test("a long prerequisite chain with a closing back edge does not depend on JavaScript call-stack depth", () => {
  const nodes = Array.from({ length: 15000 }, (_, i) => card(String(i), "book", i + 1));
  const edges = nodes.slice(1).map((node, i) => [nodes[i].id, node.id, "prerequisite"]);
  edges.push([nodes.at(-1).id, nodes[0].id, "prerequisite"]);
  const graph = layoutGraph(nodes, edges);
  assert.equal(graph.nodes.at(-1).layer, nodes.length - 1);
  assert.equal(graph.edges.at(-1)[2], "sequence");
  assert.ok(Number.isFinite(graph.bounds.width));
});
