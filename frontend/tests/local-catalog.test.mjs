import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("uploaded teaching cards and local variants keep their source pages and own solution", async () => {
  const { outputFiles } = await build({entryPoints:["src/modules/teaching/localCatalog.ts"], bundle:true, write:false, format:"esm", platform:"node"});
  const {mapLocalCatalog} = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64"));
  const step = {n:1, title:"Choose a cover", text:"Take any open cover.", why:"Use compactness for this cover.",
    formula:"", uses:["compactness"], conditions:["open cover"]};
  const result = mapLocalCatalog({
    textbooks:[{id:"book1",title:"Analysis",page_count:3,pages:[{page:2,char_count:80,needs_ocr:false}]}],
    cards:[
      {id:"c0",title:"Cover",definition:"Cover",conditions:[],theorem:"",proof:[],textbook_id:"book1",page_start:1,page_end:1},
      {id:"c1",title:"Compact",definition:"Every cover has a finite subcover.",conditions:["cover"],formula:"",theorem:"Compactness",proof:[step.text],proof_steps:[step],proof_status:"ai_elaboration",textbook_id:"book1",page_start:2,page_end:3,prerequisites:["c0"]},
    ],
    exercises:[
      {id:"v1",code:"variant-1",title:"Variant",topic_id:"c1",source:"ai-variant",solution_steps:[{text:"Use the cover"}],provenance:{target_error:"endpoint"}},
      {id:"e1",code:"card-ex-"+"a".repeat(32),title:"Find a cover",statement:"Give an open cover.",topic_id:"c1",source:"textbook-exercise",
        solution_steps:["Use open balls."],provenance:{textbook_id:"book1", user_id:"learner", card_id:"c1", model:"deepseek-flash"}},
    ],
  });
  assert.equal(result.units[0].chapter,"Analysis");
  assert.deepEqual(result.units[1].textbookSource,{textbookId:"book1",pageStart:2,pageEnd:3,theorem:"Compactness"});
  assert.deepEqual(result.units.map(unit => unit.prerequisites), [[], ["c0"]]);
  assert.deepEqual(result.exercises[0].solution,["Use the cover"]);
  assert.equal(result.exercises[0].provenance.target_error,"endpoint");
  assert.deepEqual(result.units[0].proofSteps, []);
  assert.deepEqual(result.units[1].proofSteps, [step]);
  assert.deepEqual(result.units[1].proof, [step.text]);
  assert.equal(result.units[1].proofStatus, "ai_elaboration");
  assert.deepEqual(result.exercises[1].solution, ["Use open balls."]);
  assert.equal(result.exercises[1].topicId, "c1");
  assert.equal(result.exercises[1].provenance.textbook_id, "book1");
});
