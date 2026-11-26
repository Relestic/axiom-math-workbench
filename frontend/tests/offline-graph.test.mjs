import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const bundle = await build({
  entryPoints: ["src/modules/progress/offlineGraph.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
});
const { deriveOfflineGraph } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);

const books = [{ id: "one", title: "Analysis I" }, { id: "two", title: "Analysis II" }];
function card(id, book, page, prerequisites = []) {
  return { id, title: id, definition: `Definition ${id}`, prerequisites,
    textbookSource: { textbookId: book, pageStart: page, pageEnd: page, theorem: "" } };
}
const cards = [
  card("earlier-created", "one", 8),
  card("first-page", "one", 3),
  card("later-created", "one", 8, ["missing", "other-book", "later-created"]),
  card("last-card", "one", 9, ["first-page", "earlier-created", "first-page"]),
  card("other-book", "two", 2, ["first-page"]),
];

test("uncited cards follow page then creation order, and cited cards use only live same-book prerequisites", () => {
  const graph = deriveOfflineGraph(cards, books, []);
  const local = new Set(cards.map(unit => unit.id));
  assert.deepEqual(graph.edges.filter(([from, to]) => local.has(from) || local.has(to)), [
    ["first-page", "earlier-created", "sequence"],
    ["earlier-created", "later-created", "sequence"],
    ["first-page", "last-card", "prerequisite"],
    ["earlier-created", "last-card", "prerequisite"],
  ]);
  assert.deepEqual(graph.nodes.filter(n => n.textbookId).map(n => n.id),
    ["first-page", "earlier-created", "later-created", "last-card", "other-book"]);
  const last = graph.nodes.find(n => n.id === "last-card");
  assert.deepEqual([last.conceptId, last.textbookId, last.textbookTitle, last.pageStart, last.detail],
    ["last-card", "one", "Analysis I", 9, "Definition last-card"]);
  for (const [id, conceptId] of [["continuity", "continuous"], ["mvt", "mean-value"], ["derivative", "derivative"]]) {
    assert.equal(graph.nodes.find(n => n.id === id).conceptId, conceptId);
  }
  assert.ok(graph.edges.some(([a, b, relation]) => a === "real" && b === "sequence" && relation === "prerequisite"));
});

test("removing a book excludes its nodes and every dependent edge, even if old cards or attempts are supplied", () => {
  const graph = deriveOfflineGraph(cards, books.slice(1), [{ topicId: "last-card", score: 100 }]);
  assert.deepEqual(graph.nodes.filter(n => n.textbookId).map(n => n.id), ["other-book"]);
  const present = new Set(graph.nodes.map(n => n.id));
  assert.ok(graph.edges.every(([from, to]) => present.has(from) && present.has(to)));
});

test("practice without a score stays distinct from no practice and from a graded zero", () => {
  const attempts = [
    { topicId: "later-created", score: null, selfRating: "pending", createdAt: "2026-11-02" },
    { topicId: "earlier-created", score: 0, selfRating: "revisit", createdAt: "2026-11-02" },
    { topicId: "last-card", score: 60, selfRating: "understood", createdAt: "2026-11-03" },
    { topicId: "last-card", score: 100, selfRating: "revisit", createdAt: "2026-11-01" },
  ];
  const { nodes } = deriveOfflineGraph(cards, books, attempts);
  const result = id => {
    const { state, progress } = nodes.find(n => n.id === id);
    return [state, progress];
  };
  assert.deepEqual(result("first-page"), ["unpracticed", null]);
  assert.deepEqual(result("later-created"), ["practiced", null]);
  assert.deepEqual(result("earlier-created"), ["needs_review", 0]);
  assert.deepEqual(result("last-card"), ["practiced", 80]);
});
