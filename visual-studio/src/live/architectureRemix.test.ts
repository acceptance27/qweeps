import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {getInitialQweepsRepoWalkthrough,compileSourceCodeToWalkthrough,PROCEDURAL_PIPELINE_PRESETS,validateLessonData,computeElkGraphLayout,evaluateTimeline,applyAiExplanatoryGaps,REMIX_ENGINE_REVISION} from './architecture/remix/runtime.js';
import {currentBundle} from './architecture/remix/bundleRevision';

test('replacement preserves upstream core files and only renames the AI provider in teaching/UI text',()=>{
 const root=new URL('../../../vendor/architecture-remix/',import.meta.url);
 const manifest=JSON.parse(fs.readFileSync(new URL('UPSTREAM.json',root),'utf8'));
 for(const [file,hash] of Object.entries(manifest.unchangedCoreFiles))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,root))).digest('hex'),hash,file);
 for(const [file,hash] of Object.entries(manifest.providerLabelChanges||{})){
  const original=fs.readFileSync(new URL(file,root),'utf8').replaceAll('OpenCode Go',file.endsWith('AskQweepsDrawer.tsx')?'Gemini 3.8 Flash':'Gemini');
  assert.equal(createHash('sha256').update(original).digest('hex'),hash,file);
 }
});

test('the supplied repository walkthrough and all pipeline presets compile using the complete replacement engine',()=>{
 const repo=getInitialQweepsRepoWalkthrough();
 assert.equal(Object.keys(repo.subFunctions).length,17);
 for(const bundle of [repo,...PROCEDURAL_PIPELINE_PRESETS.map(p=>compileSourceCodeToWalkthrough(p))]){
  assert.equal(validateLessonData(bundle.macroGraph,bundle.macroSteps).valid,true);
  for(const fn of Object.values(bundle.subFunctions))assert.equal(validateLessonData(fn.graph,fn.steps,Math.max(fn.totalModuleLines,...fn.codeLines.map(l=>l.lineNumber))).valid,true,fn.functionName);
 }
});

test('explanatory gap filling preserves procedural identities, geometry and example values',()=>{
 const original=compileSourceCodeToWalkthrough(PROCEDURAL_PIPELINE_PRESETS[0]);
 const enriched=applyAiExplanatoryGaps(original,{beatExplanations:[{beatNumber:1,question:'Where does it enter?',narration:'The request enters this pipeline.',takeaway:'The input is preserved.',goalText:'Accept the question.',lineExplanation:'Read the incoming request.'}]},10);
 assert.notEqual(enriched.macroSteps[0].narration,original.macroSteps[0].narration);
 assert.deepEqual(enriched.macroGraph.nodes.map(n=>({id:n.id,width:n.width,height:n.height,compound:n.compoundContainer})),original.macroGraph.nodes.map(n=>({id:n.id,width:n.width,height:n.height,compound:n.compoundContainer})));
 assert.deepEqual(enriched.macroGraph.edges,original.macroGraph.edges);
 assert.deepEqual(enriched.macroGraph.workedExampleLedger,original.macroGraph.workedExampleLedger);
});

test('the replacement timeline reconstructs the same frame after a forward seek and rewind',async()=>{
 const b=getInitialQweepsRepoWalkthrough(),layout=await computeElkGraphLayout(b.macroGraph);
 const first=evaluateTimeline(12,b.macroSteps,b.macroGraph,layout,1000,600,false);
 evaluateTimeline(40,b.macroSteps,b.macroGraph,layout,1000,600,false);
 assert.deepEqual(evaluateTimeline(12,b.macroSteps,b.macroGraph,layout,1000,600,false),first);
});

test('saved source is recompiled after an engine update and matching revisions are left intact',()=>{
 const old=compileSourceCodeToWalkthrough(PROCEDURAL_PIPELINE_PRESETS[1]);old.engineRevision='previous-engine';
 old.macroGraph.title='Old compiled graph';
 const refreshed=currentBundle(old);
 assert.equal(refreshed.engineRevision,REMIX_ENGINE_REVISION);
 assert.equal(refreshed.sourceCode,old.sourceCode);assert.equal(refreshed.sampleInput,old.sampleInput);assert.equal(refreshed.title,old.title);
 assert.notEqual(refreshed.macroGraph.title,'Old compiled graph');
 assert.equal(currentBundle(refreshed),refreshed);
});

test('reactive output waits for the incoming packet, then advances through the preview and can rewind',async()=>{
 const b=getInitialQweepsRepoWalkthrough(),graph=b.macroGraph,layout=await computeElkGraphLayout(graph);
 const step=b.macroSteps.find(s=>s.packets.length&&s.packets.some(p=>graph.edges.find(e=>e.id===p.edgeId)?.target!=='question'))!;
 const packet=step.packets[0],target=graph.edges.find(e=>e.id===packet.edgeId)!.target;
 type Frame={nodeFrames:Record<string,{reactiveStage:string;reactiveProgress:number;outputRevealProgress:number}>};
 const sample=(t:number)=>(evaluateTimeline(t,[step],graph,layout,1000,600,false) as Frame).nodeFrames[target];
 const before=sample(Math.max(0,packet.end-.2));
 assert.equal(before.reactiveProgress,0);assert.equal(before.outputRevealProgress,0);
 const after=sample(Math.min(step.duration-.01,packet.end+1.7));
 assert.equal(after.reactiveStage,'ready');assert.equal(after.outputRevealProgress,1);
 assert.deepEqual(sample(Math.max(0,packet.end-.2)),before);
});
