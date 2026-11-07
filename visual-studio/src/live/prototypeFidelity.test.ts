import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {workspaceForLesson,backendPlayhead,graphForFrame} from './architecture/prototype/workspace';
import {computeElkGraphLayout} from './architecture/prototype/layout/elkLayout';
import {evaluateTimeline} from './architecture/prototype/timeline/evaluateTimeline';
import type {LiveLesson} from './lessonTypes';
const lesson=JSON.parse(fs.readFileSync(new URL('../../../bundled-lessons/browser-lessons/a7c4e71f90d3426b84c719ea064bd230/lesson.json',import.meta.url),'utf8')) as LiveLesson;

test('the supplied workspace retains the complete hierarchy and rich visual grammar',()=>{
 const workspace=workspaceForLesson(lesson);
 assert.equal(workspace.steps.reduce((n,s)=>n+s.duration,0),58);
 assert.equal(workspace.graph.nodes.length,8);
 const pending=workspace.graph.nodes.flatMap(n=>n.drillDownFunctionId?[n.drillDownFunctionId]:[]),found=new Set<string>(),variants=new Set<string>();
 while(pending.length){const id=pending.shift()!;if(found.has(id))continue;found.add(id);const fn=workspace.resolveFunction(id)!;assert.ok(fn);
  for(const node of fn.graph.nodes){if(node.customVisual)variants.add(node.customVisual.variant);if(node.drillDownFunctionId)pending.push(node.drillDownFunctionId);}
  for(const line of fn.codeLines){assert.ok(line.goalText||line.explanation);if(line.drillDownFunctionId)pending.push(line.drillDownFunctionId);}
 }
 assert.equal(found.size,17);
 for(const variant of ['token-tiles','vector-bars','funnel-pool','podium-rank','gate-keep-drop','heatmap-spotlight','citation-verifier'])assert.ok(variants.has(variant),variant+' must retain its specialized illustration');
 const embed=workspace.resolveFunction('fn-embed')!;
 assert.ok(embed.graph.nodes.some(n=>n.staticData));assert.ok(embed.graph.nodes.some(n=>n.nonSummary));
 assert.ok(embed.codeLines.every(l=>l.inputValue&&l.resultText&&l.atName));
});

test('the updated reference uses compact compound geometry and reconstructs after rewind',async()=>{
 const workspace=workspaceForLesson(lesson),layout=await computeElkGraphLayout(workspace.graph);
 assert.deepEqual(layout.nodes.embed,{id:'embed',x:284,y:112,width:442,height:156});
 assert.deepEqual(layout.nodes.retrieve,{id:'retrieve',x:284,y:380,width:436,height:206});
 assert.equal(layout.edges['e-context-prompt'].points.length,6);
 const at10=evaluateTimeline(10,workspace.steps,workspace.graph,layout,840,576,false);
 assert.equal(at10.step.id,workspace.steps[1].id);assert.ok(at10.activePackets.length);
 evaluateTimeline(55,workspace.steps,workspace.graph,layout,840,576,false);
 assert.deepEqual(evaluateTimeline(10,workspace.steps,workspace.graph,layout,840,576,false),at10);
});

test('generated data uses the same visual component contract without the RAG fixture layout',async()=>{
 const generated=workspaceForLesson({...lesson,id:'f'.repeat(32)});
 assert.equal(generated.isReference,false);assert.ok(generated.graph.id.startsWith('generated-'));
 assert.equal(generated.steps.length,lesson.chapters.length);assert.equal(generated.codeLines[1].text,lesson.architecture!.codeFiles[0].lines[1].text);
 const layout=await computeElkGraphLayout(generated.graph),boxes=Object.values(layout.nodes);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
});

test('reference questions map their original clock into the saved QWEEPS scope',()=>{
 const workspace=workspaceForLesson(lesson),step=workspace.steps[1],chapter=lesson.chapters[1];
 assert.equal(backendPlayhead(lesson,null,step,12,workspace.steps),chapter.start+(chapter.end-chapter.start)/2);
 const fn=workspace.resolveFunction('fn-embed')!,data=lesson.architecture!.functions['fn-embed'];
 assert.equal(backendPlayhead(lesson,'fn-embed',fn.steps[1],fn.steps[0].duration,fn.steps),data.steps[0].duration);
 const normalized=workspace.resolveFunction('emb-norm')!.graph.nodes.find(n=>n.kind==='output')?.customVisual?.floats;
 assert.ok(normalized);assert.ok(Math.abs(Math.hypot(...normalized)-1)<.0001);
});


test('generated values populate the original goal/output pane and output visualization',()=>{
 const generated=workspaceForLesson({...lesson,id:'f'.repeat(32)});
 assert.ok(generated.codeLines[1].inputValue);assert.ok(generated.codeLines[1].resultText);
 const graph={...generated.graph,nodes:[{...generated.graph.nodes[0],id:'answer',customVisual:{variant:'output-pill' as const,title:'Result'}}]};
 const shown=graphForFrame(graph,{answer:{previewLines:['result = 6']}},false);
 assert.equal(shown.nodes[0].customVisual?.highlightText,'result = 6');
 assert.equal(graphForFrame(graph,{},true),graph,'The source reference uses its original visual data unchanged');
});

import {sourceForStep} from './architecture/prototype/workspace';
import {normalizeVisual,ROW_VISUALS} from './architecture/prototype/visualData';
import {computeFocusCameraForNodes,computeOverviewCamera} from './architecture/prototype/timeline/evaluateTimeline';
import type {CustomVisualCardSpec} from './architecture/prototype/types/lesson';

test('generated playback and node inspection select the correct source file despite shared line numbers',()=>{
 const input=structuredClone(lesson);input.id='e'.repeat(32);
 const first=input.architecture!.codeFiles[0];
 const second={file:'second.py',language:'python',lines:[{lineNumber:first.lines[0].lineNumber,text:'answer = assemble(context)',explanation:'Assemble the answer'}]};
 input.architecture!.codeFiles.push(second);
 const c=input.chapters[1];c.visual!.flow!.code={file:second.file,lines:[second.lines[0].lineNumber]};
 input.architecture!.graph.nodes[0].codeReference={file:first.file,lines:[first.lines[0].lineNumber]};
 const workspace=workspaceForLesson(input);
 assert.equal(sourceForStep(workspace,null,workspace.steps[1])?.file,'second.py');
 assert.equal(sourceForStep(workspace,null,workspace.steps[1],workspace.graph.nodes[0].id)?.file,first.file);
 assert.equal(sourceForStep(workspace,null,workspace.steps[0])?.file,first.file);
 assert.ok(workspace.codeFiles!.find(f=>f.file==='second.py')!.lines[0].goalText);
});

test('all row-based visual variants display legacy payloads and retain correctly authored rows',()=>{
 for(const variant of ROW_VISUALS){
  const raw={variant,title:'Transform',lines:['request -> storyboard','storyboard -> scene']} as CustomVisualCardSpec;
  const visible=normalizeVisual(raw,'fallback');
  assert.equal(visible.rows?.length,2,variant);
  assert.equal(visible.rows?.[1].rightValue,'storyboard -> scene',variant);
  assert.equal(raw.rows,undefined,'Compatibility conversion must not mutate lesson data');
  assert.deepEqual(normalizeVisual(visible,'other').rows,visible.rows);
 }
});

test('generated frames retain input states after a result arrives and reconstruct on rewind',async()=>{
 const workspace=workspaceForLesson({...lesson,id:'e'.repeat(32)}),step=structuredClone(workspace.steps[0]);
 const [input,output]=workspace.graph.nodes;
 step.nodeDataBefore={[input.id]:{statusLabel:'Input',previewLines:['query = [1, 0]']}};
 step.nodeDataAfter={[output.id]:{statusLabel:'Ranked',previewLines:['policy = 0.9939']}};
 step.resultAt=2;
 const layout=await computeElkGraphLayout(workspace.graph);
 const evaluate=(time:number)=>evaluateTimeline(time,[step],workspace.graph,layout,900,600,true);
 const before=evaluate(0),after=evaluate(3);
 assert.deepEqual(after.nodeFrames[input.id].previewLines,['query = [1, 0]']);
 assert.deepEqual(after.nodeFrames[output.id].previewLines,['policy = 0.9939']);
 assert.deepEqual(evaluate(0),before);
});

test('generated focus and overview keep distant nodes inside short and portrait viewports',async()=>{
 const workspace=workspaceForLesson({...lesson,id:'e'.repeat(32)}),layout=await computeElkGraphLayout(workspace.graph);
 for(const [width,height] of [[360,480],[740,210],[1200,650]]){
  for(const camera of [computeFocusCameraForNodes(Object.keys(layout.nodes),layout,width,height,.04),computeOverviewCamera(layout,width,height,.04)]){
   for(const node of Object.values(layout.nodes)){
    assert.ok(node.x*camera.zoom+camera.x>=0);
    assert.ok(node.y*camera.zoom+camera.y>=0);
    assert.ok((node.x+node.width)*camera.zoom+camera.x<=width);
    assert.ok((node.y+node.height)*camera.zoom+camera.y<=height);
   }
  }
 }
});

test('calculated state changes update the actual vector bars and restore the earlier vector on rewind',async()=>{
 const workspace=workspaceForLesson({...lesson,id:'e'.repeat(32)}),step=structuredClone(workspace.steps[0]),id=workspace.graph.nodes[0].id;
 step.nodeDataBefore={[id]:{statusLabel:'Raw',previewLines:['3','4'],valueRef:'raw',visual:{variant:'vector-bars',title:'Vector',floats:[3,4]}}};
 step.nodeDataAfter={[id]:{statusLabel:'Unit',previewLines:['0.6','0.8'],valueRef:'unit',visual:{variant:'vector-bars',title:'Vector',floats:[.6,.8]}}};step.resultAt=2;
 const layout=await computeElkGraphLayout(workspace.graph);
 const graphAt=(time:number)=>graphForFrame(workspace.graph,evaluateTimeline(time,[step],workspace.graph,layout,900,600,true).nodeFrames,false);
 assert.deepEqual(graphAt(0).nodes[0].customVisual?.floats,[3,4]);
 assert.deepEqual(graphAt(3).nodes[0].customVisual?.floats,[.6,.8]);
 assert.equal(graphAt(3).nodes[0].valueRef,'unit');
 assert.deepEqual(graphAt(0).nodes[0].customVisual?.floats,[3,4]);
});

test('generated playback keeps the previous diagram through the measured reasoning bridge',async()=>{
 const input=structuredClone(lesson);input.id='e'.repeat(32);
 const next=input.chapters[1],handoff=next.start+2;next.visualStart=handoff;
 const packet=next.visual!.flow!.packets[0];
 next.narrationCues=[{target:packet.id,start:3,end:5,text:'transfer',phrase:'transfer'},{target:'takeaway',start:6,end:7,text:'result',phrase:'result'}];
 const workspace=workspaceForLesson(input),layout=await computeElkGraphLayout(workspace.graph);
 const frame=(time:number)=>evaluateTimeline(time,workspace.steps,workspace.graph,layout,900,600,true);
 assert.equal(frame(next.start+1).step.id,input.chapters[0].id);
 assert.equal(frame(handoff+1).step.id,next.id);
 assert.equal(workspace.steps[1].packets[0].start,1);
 assert.equal(workspace.steps[1].packets[0].end,3);
 assert.equal(workspace.steps[1].resultAt,4);
 assert.equal(backendPlayhead(input,null,workspace.steps[1],handoff+1,workspace.steps),handoff+1);
 assert.ok(Math.abs(workspace.steps.reduce((n,s)=>n+s.duration,0)-input.duration)<.001);
});

test('generated document cards use compact records and score bars carry relative numerical evidence',()=>{
 const docs=normalizeVisual({variant:'lookup-table',title:'Documents',rows:[{leftChip:'policy',rightValue:JSON.stringify({id:'policy',text:'Returns within 30 days',vector:[.9,.1]}),color:'sky'}]},'');
 assert.equal(docs.rows?.[0].rightValue,'[0.9,0.1]');assert.equal(docs.rows?.[0].note,'Returns within 30 days');
 const scores=normalizeVisual({variant:'score-meter',title:'Score',rows:[{leftChip:'policy',rightValue:'0.9939',color:'sky'},{leftChip:'shipping',rightValue:'0',color:'sky'}]},'');
 assert.equal(scores.rows?.[0].barPercent,100);assert.equal(scores.rows?.[1].barPercent,0);
 assert.match(scores.footerNote!,/score/);
});

import {transferLabel} from './architecture/prototype/visualData';

test('generated follow mode keeps both transfer endpoints visible and reconstructs on rewind',async()=>{
 const workspace=workspaceForLesson({...lesson,id:'e'.repeat(32)}),[source,target]=workspace.graph.nodes;
 const edge={...workspace.graph.edges[0],id:'transfer',source:source.id,target:target.id};
 const graph={...workspace.graph,nodes:[{...source,width:340,height:180},{...target,width:340,height:180}],edges:[edge]};
 const base=await computeElkGraphLayout(graph),layout={...base,nodes:{[source.id]:{id:source.id,x:0,y:0,width:340,height:180},[target.id]:{id:target.id,x:1800,y:0,width:340,height:180}},edges:{transfer:{...base.edges.transfer,points:[{x:340,y:90},{x:1800,y:90}]}}};
 const step={...workspace.steps[0],focusNodes:[source.id,target.id],activeNodes:[source.id,target.id],activeEdges:['transfer'],packets:[{id:'moving-value',edgeId:'transfer',start:2,end:4,payload:'3 → 6'}],nodeDataBefore:{},nodeDataAfter:{},resultAt:5};
 const frame=(time:number)=>evaluateTimeline(time,[step],graph,layout,390,650,false);
 const before=frame(0),after=frame(5.5);
 for(const time of [0,2,3,4,5.5])for(const id of [source.id,target.id]){
  const box=layout.nodes[id],camera=frame(time).targetCamera;
  assert.ok(box.x*camera.zoom+camera.x>=0);assert.ok((box.x+box.width)*camera.zoom+camera.x<=390);
 }
 assert.deepEqual(before.targetCamera,after.targetCamera);
 assert.deepEqual(frame(0),before);
 assert.equal(transferLabel([{id:'policy',score:.9938837},{id:'support',score:.8804711}]),'policy: 0.9939 · support: 0.8805');
 assert.ok(transferLabel('x'.repeat(400)).length<=100);
});

test('generated function drill-downs reuse the curated reference lesson and source file',()=>{
 const workspace=workspaceForLesson({...lesson,id:'f'.repeat(32),architecture:{...lesson.architecture!,renderContract:'reference'}});
 const embed=workspace.resolveFunction('fn-embed')!;
 assert.equal(embed.graph.id,'sub-graph-fn-embed');
 assert.equal(embed.fileName,'src/rag/embedder.py');
 assert.equal(embed.steps.length,3);
 assert.ok(embed.graph.nodes.find(n=>n.id==='emb-rules')?.staticData?.entries.some(e=>e.key==='toy_stopwords'));
 assert.ok(embed.graph.nodes.find(n=>n.id==='emb-tokenize')?.nonSummary);
 const source=sourceForStep(workspace,embed,embed.steps[0]);
 assert.equal(source?.file,'src/rag/embedder.py');
 assert.equal(source?.language,'trace');
 assert.ok(source?.lines.some(line=>line.lineNumber===112));
 const normalized=workspace.resolveFunction('emb-norm')!.graph.nodes.find(n=>n.kind==='output')?.customVisual?.floats;
 assert.ok(normalized);assert.ok(Math.abs(Math.hypot(...normalized)-1)<.0001);
});

test('generated level-2 function drill-downs keep the curated visual graph',()=>{
 const workspace=workspaceForLesson({...lesson,id:'f'.repeat(32),architecture:{...lesson.architecture!,renderContract:'reference'}});
 const tokenize=workspace.resolveFunction('emb-tokenize')!;
 assert.equal(tokenize.graph.id,'sub-graph-l2-tokenize');
 assert.ok(tokenize.graph.nodes.some(node=>Boolean(node.customVisual)));
});


test('all 17 reference inspect graphs keep internals inside their dynamically computed frames',async()=>{
 const workspace=workspaceForLesson(lesson),pending=workspace.graph.nodes.flatMap(n=>n.drillDownFunctionId?[n.drillDownFunctionId]:[]),seen=new Set<string>();
 while(pending.length){const id=pending.shift()!;if(seen.has(id))continue;seen.add(id);const fn=workspace.resolveFunction(id)!;assert.ok(fn);
  const original=JSON.stringify(fn.graph),layout=await computeElkGraphLayout(fn.graph),frame=layout.systemBounds!;
  assert.equal(JSON.stringify(fn.graph),original,'Layout must not mutate the lesson contract');assert.ok(frame,id+' needs a dynamic system frame');
  const level2=fn.graph.id.includes('sub-graph-l2-');
  for(const n of fn.graph.nodes){const box=layout.nodes[n.id];
   if(level2||(box.x>=frame.x&&n.kind!=='output'&&n.stepBadge!=='OUT'))assert.ok(box.x>=frame.x&&box.y>=frame.y&&box.x+box.width<=frame.x+frame.width&&box.y+box.height<=frame.y+frame.height,id+' must enclose '+n.id);
   if(n.drillDownFunctionId)pending.push(n.drillDownFunctionId);
  }
  for(const line of fn.codeLines)if(line.drillDownFunctionId)pending.push(line.drillDownFunctionId);
 }
 assert.equal(seen.size,17);
 const layout=await computeElkGraphLayout(workspace.graph),retrieve=layout.compounds!.retrieve;
 const dropped=retrieve.children.find(c=>c.isDropBranch)!,last=retrieve.children.filter(c=>!c.isDropBranch).at(-1)!;
 assert.ok(dropped.y>=last.y+last.h);assert.ok(dropped.x+dropped.w<=layout.nodes.retrieve.width);assert.ok(dropped.y+dropped.h<=layout.nodes.retrieve.height);
});

test('a generated function sharing a seed ID retains its authored source and timing without the reference contract',()=>{
 const generated=structuredClone(lesson);generated.id='d'.repeat(32);delete generated.architecture!.renderContract;
 const raw=generated.architecture!.functions['fn-embed'];raw.codeFiles=[{file:'my_embed.py',language:'python',lines:[{lineNumber:1,text:'def custom_embed(x): return x',explanation:'My actual function'}]}];
 raw.graph.nodes.forEach(n=>{n.codeReference={file:'my_embed.py',lines:[1]};});raw.steps.forEach(s=>{s.flow.code={file:'my_embed.py',lines:[1]};});
 const fn=workspaceForLesson(generated).resolveFunction('fn-embed')!;
 assert.equal(fn.fileName,'my_embed.py');assert.equal(fn.steps.reduce((n,s)=>n+s.duration,0),raw.steps.reduce((n,s)=>n+s.duration,0));
 assert.equal(fn.graph.layoutStyle,undefined);
});
