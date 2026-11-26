import assert from "node:assert/strict";
import { build } from "esbuild";
import test from "node:test";

const compiled = await build({
  entryPoints: ["src/modules/progress/offline.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
});
const { deriveOfflineProgress } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`
);

test("offline progress derives the same totals and review queue from saved attempts", () => {
  const now = new Date(2026, 10, 25, 12);
  const attempts = Object.freeze([
    Object.freeze({
      id: "review",
      exerciseId: "uniform-2",
      topicId: "uniform",
      title: "Review",
      answer: "saved answer",
      createdAt: now.toISOString(),
      selfRating: "revisit",
    }),
    Object.freeze({
      id: "done",
      exerciseId: "uniform-3",
      topicId: "uniform",
      title: "Done",
      answer: "another answer",
      createdAt: new Date(2026, 10, 24, 12).toISOString(),
      selfRating: "understood",
    }),
  ]);
  const { dashboard, practice } = deriveOfflineProgress(attempts, now);

  assert.equal(dashboard.summary.current.page, "dashboard");
  assert.equal(dashboard.summary.today.attempts, 1);
  assert.equal(dashboard.summary.today.distinctConcepts, 1);
  assert.equal(dashboard.summary.streakDays, 2);
  assert.equal(dashboard.summary.practice.understoodRate, 50);
  assert.equal(dashboard.summary.review.count, 1);
  assert.equal(dashboard.reviewItems[0].attemptId, "review");
  assert.equal(dashboard.practiceTotals.attempts, 2);
  assert.equal(practice.totals.attempts, 2);
  assert.equal(attempts[0].answer, "saved answer");
});
