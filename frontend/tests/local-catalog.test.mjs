import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

test("uploaded teaching cards and local variants keep their source pages and own solution", async () => {
  const { outputFiles } = await build({entryPoints:["src/modules/teaching/localCatalog.ts"], bundle:true, write:false, format:"esm", platform:"node"});
  const {mapLocalCatalog} = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].contents).toString("base64"));
  const result = mapLocalCatalog({
    textbooks:[{id:"book1",title:"Analysis",page_count:3,pages:[{page:2,char_count:80,needs_ocr:false}]}],
    cards:[
      {id:"c0",title:"Cover",definition:"Cover",conditions:[],theorem:"",proof:[],textbook_id:"book1",page_start:1,page_end:1},
      {id:"c1",title:"Compact",definition:"Every cover has a finite subcover.",conditions:["cover"],formula:"",theorem:"Compactness",proof:["choose a cover"],textbook_id:"book1",page_start:2,page_end:3,prerequisites:["c0"]},
    ],
    exercises:[{id:"v1",code:"variant-1",title:"Variant",topic_id:"c1",source:"ai-variant",solution_steps:[{text:"Use the cover"}],provenance:{target_error:"endpoint"}}]
  });
  assert.equal(result.units[0].chapter,"Analysis");
  assert.deepEqual(result.units[1].textbookSource,{textbookId:"book1",pageStart:2,pageEnd:3,theorem:"Compactness"});
  assert.deepEqual(result.units.map(unit => unit.prerequisites), [[], ["c0"]]);
  assert.deepEqual(result.exercises[0].solution,["Use the cover"]);
  assert.equal(result.exercises[0].provenance.target_error,"endpoint");
});
