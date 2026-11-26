import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const { outputFiles } = await build({entryPoints:["src/modules/records/archiveStorage.ts"],bundle:true,write:false,format:"esm",platform:"node"});
const {validateLearningStorage} = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64"));
test("a saved variant selection and stepwise review survive browser archive validation", () => {
 const selected = "variant-" + "a".repeat(32);
 const attempt = {id:"a",exerciseId:selected,topicId:"uniform",coefficient:0,title:"证明题",answer:"我的证法",hints:false,solutionSeen:false,createdAt:"2026-01-01T00:00:00Z",selfRating:"pending",
   aiReview:{summary:"对照量词",steps:[{step:"第一步",assessment:"量词范围未明确",suggestion:"说明取点范围"}],error_focus:"量词"}};
 const input = {"axiom-exercise-variant-uniform":selected,"axiom-offline-attempts":JSON.stringify([attempt])};
 assert.deepEqual(validateLearningStorage(input),input);
});

test("archived examples resume the lecture and preserve both board conversations", () => {
  const chat = JSON.stringify([{role: "user", content: "看一下导数"}]);
  for (const oldPage of ["examples", "desk/examples"]) {
    const snapshot = {"axiom-last-page": oldPage, "axiom-function-chat": chat, "axiom-surface-chat": chat};
    assert.deepEqual(validateLearningStorage(snapshot), {...snapshot, "axiom-last-page": "desk/textbook"});
  }
});
