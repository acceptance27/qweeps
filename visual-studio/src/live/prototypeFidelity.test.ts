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

test('the reference uses its supplied compound geometry and reconstructs after rewind',async()=>{
 const workspace=workspaceForLesson(lesson),layout=await computeElkGraphLayout(workspace.graph);
 assert.deepEqual(layout.nodes.embed,{id:'embed',x:284,y:112,width:416,height:156});
 assert.deepEqual(layout.nodes.retrieve,{id:'retrieve',x:284,y:380,width:520,height:196});
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
