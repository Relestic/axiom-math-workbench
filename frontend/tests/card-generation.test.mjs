import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints:["src/modules/teaching/localTextbooks.ts"], bundle:true, write:false, platform:"node", format:"esm",
  define:{"import.meta.env.VITE_API_BASE":JSON.stringify("__SAME_ORIGIN__")},
});
const { buildTextbook, generateCardExercises } = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64"));

function textbook(count) {
  return {id: "book", title: "教材", page_count: count,
    pages: Array.from({length: count}, (_, index) => ({page: index + 1, char_count: 30, needs_ocr: false}))};
}

test("205 pages are extracted ten at a time across empty batches and blank or scanned pages", async t => {
  const book = textbook(205);
  const scans = [10, 11, 12, 15, 16];
  for (const page of book.pages) {
    if (scans.includes(page.page)) Object.assign(page, {needs_ocr: true, char_count: 0});
    if (page.page >= 21 && page.page <= 30) page.char_count = 0;
  }
  const cachedBook = structuredClone(book);
  const calls = [], progress = [], published = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith("/ocr-pages")) {
      calls.push(["ocr", ...body.pages.map(image => image.page)]);
      for (const page of cachedBook.pages) {
        if (body.pages.some(image => image.page === page.page)) {
          Object.assign(page, {needs_ocr: false, char_count: page.page === 11 ? 0 : 24});
        }
      }
      return Response.json(cachedBook);
    }
    assert.equal(url, "/api/v1/local/textbooks/book/extract-cards");
    calls.push([body.page_start, body.page_end]);
    const cards = [31, 201].includes(body.page_start) ? [{id: String(body.page_start), title: "定义"}] : [];
    return Response.json({cards});
  });
  const total = await buildTextbook(book, 1, 205, {
    stopped: () => false, progress: text => progress.push(text), cardsAdded: id => published.push(id),
    renderPages: async pages => pages.map(page => ({page, image_data_url: "fixture"})),
    refresh: async () => calls.push("refresh"),
  });
  assert.equal(total, 2);
  assert.deepEqual(published, ["31", "201"]);
  assert.deepEqual(calls.slice(0, 10), [
    ["ocr", 10], "refresh", [1, 10], ["ocr", 11, 12, 15], "refresh",
    ["ocr", 16], "refresh", [11, 20], [31, 40], "refresh",
  ]);
  assert.deepEqual(calls.slice(10), [
    [41, 50], [51, 60], [61, 70], [71, 80], [81, 90], [91, 100], [101, 110], [111, 120],
    [121, 130], [131, 140], [141, 150], [151, 160], [161, 170], [171, 180], [181, 190],
    [191, 200], [201, 205], "refresh",
  ]);
  assert.ok(progress.includes("正在识别扫描页：第 11–15 / 205 页…"));
  assert.ok(progress.includes("正在快速建书：第 201–205 / 205 页 · 已生成 1 张学习卡片…"));
});

test("an entirely blank OCR window advances to the next window's text", async t => {
  const book = textbook(12);
  for (const page of book.pages.slice(0, 10)) page.char_count = 0;
  book.pages[0].needs_ocr = true;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push(JSON.parse(init.body));
    if (url.endsWith("/ocr-pages")) {
      const cached = structuredClone(book);
      cached.pages[0].needs_ocr = false;
      return Response.json(cached);
    }
    return Response.json({cards: []});
  });
  const image = {page: 1, image_data_url: "fixture"};
  const total = await buildTextbook(book, 1, 12, {stopped: () => false, progress: () => {},
    cardsAdded: assert.fail, renderPages: async () => [image], refresh: async () => {}});
  assert.equal(total, 0);
  assert.deepEqual(requests, [{pages: [image]}, {page_start: 11, page_end: 12}]);
});

test("stopping in OCR finishes caching the group and sends no extraction request", async t => {
  const book = textbook(20);
  book.pages[0] = {page: 1, char_count: 0, needs_ocr: true};
  let stopped = false;
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    calls.push(url);
    return Response.json(book);
  });
  const total = await buildTextbook(book, 1, 20, {
    stopped: () => stopped, progress: () => {}, cardsAdded: assert.fail,
    renderPages: async () => { stopped = true; return [{page: 1, image_data_url: "fixture"}]; },
    refresh: async () => calls.push("refresh"),
  });
  assert.equal(total, 0);
  assert.deepEqual(calls, ["/api/v1/local/textbooks/book/ocr-pages", "refresh"]);
});

test("manual and automatic requests share an in-flight exercise for the same card", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", (url, init) => new Promise(resolve => {
    calls.push({url, body: JSON.parse(init.body), finish: () => resolve(Response.json({exercises: []}))});
  }));
  const first = generateCardExercises("a");
  const same = generateCardExercises("a", 1, "concept");
  const other = generateCardExercises("b");
  assert.equal(calls.length, 2);
  for (const call of calls) call.finish();
  await Promise.all([first, same, other]);
  const again = generateCardExercises("a");
  assert.equal(calls.length, 3);
  calls[2].finish();
  await again;
});
