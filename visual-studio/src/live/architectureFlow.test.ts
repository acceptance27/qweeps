import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {layoutGraph} from './architecture/layout';
import {cameraAt,flowContext,flowFrame,functionLesson} from './architecture/timeline';
import {polylinePoint} from './architecture/geometry';
import type {FlowGraph,GraphLayout} from './architecture/types';
import type {LiveChapter,LiveLesson} from './lessonTypes';

const graph:FlowGraph={id:'same-id',title:'One transfer',nodes:[
 {id:'input',label:'Input',kind:'input',color:'blue',description:'Three enters.',defaultPreview:'3'},
 {id:'output',label:'Output',kind:'output',color:'green',description:'Six leaves.',defaultPreview:'6'}],
 edges:[{id:'transfer',source:'input',target:'output',label:'Double',relationship:'data',description:'Multiply by two.'}]};
const layout:GraphLayout={width:600,height:240,nodes:{input:{x:0,y:0,width:200,height:180},output:{x:400,y:0,width:200,height:180}},
 edges:{transfer:{points:[{x:0,y:0},{x:100,y:0}],label:{x:50,y:0}}}};
function chapter():LiveChapter{return{id:'double',title:'Double',question:'What changes?',years:'',roles:{},sources:[],safeguard:'Illustrative.',
 narration:'Three is doubled to six.',narrationAt:0,audio:'',start:0,end:10,finishedAt:9,cues:[],
 narrationCues:[{target:'transfer-value',start:3,end:5,text:'is doubled',phrase:'is doubled'},
 {target:'takeaway',start:7,end:9,text:'to six',phrase:'to six'}],
 visual:{layout:'architecture_flow',nodes:[],connections:[],columns:[],takeaway:'Six leaves.',
 flow:{focusNodes:['input','output'],activeEdges:['transfer'],packets:[{id:'transfer-value',edgeId:'transfer',start:1,end:2,payload:'3 → 6'}],
 code:{file:'main.py',lines:[2]},nodeDataBefore:{input:{statusLabel:'Input',previewLines:['3']}},
 nodeDataAfter:{output:{statusLabel:'Result',previewLines:['6']}},stateBefore:{value:3},stateAfter:{value:6}}}};}

test('automatic layout separates nodes and routes a converging system',async()=>{
 const input:FlowGraph={...graph,nodes:[...graph.nodes,{...graph.nodes[0],id:'second',label:'Second input'}],
 edges:[...graph.edges,{...graph.edges[0],id:'other',source:'second'}]};
 const result=await layoutGraph(input),boxes=Object.values(result.nodes);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Node rectangles must not overlap');
 }
 for(const edge of input.edges){const points=result.edges[edge.id].points;assert.ok(points.length>=2);assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));}
});

test('layout cache uses topology and contents when an ID is reused',async()=>{
 const first=await layoutGraph(graph);
 const changed={...graph,nodes:[{...graph.nodes[0],label:'A changed, substantially longer input label'},graph.nodes[1],{...graph.nodes[0],id:'third'}]};
 const second=await layoutGraph(changed);
 assert.notEqual(first,second);assert.ok(second.nodes.third);assert.equal(first.nodes.third,undefined);
 assert.equal(await layoutGraph(graph),first);
});

test('cycle edges are layout relationships rather than recursive lesson navigation',async()=>{
 const loop={...graph,edges:[...graph.edges,{...graph.edges[0],id:'return',source:'output',target:'input'}]};
 const result=await layoutGraph(loop);assert.ok(result.edges.return.points.length>=2);
});

test('packets follow measured words and reconstruct after pause, forward seek and rewind',()=>{
 const c=chapter(),before=JSON.stringify(c);
 const a=flowFrame(c,4,graph,layout);
 assert.equal(a.packets[0].x,50);assert.equal(a.packets[0].y,0);assert.equal(a.packets[0].progress,.5);
 assert.deepEqual(a.variables,{value:3});
 const end=flowFrame(c,8,graph,layout);assert.deepEqual(end.variables,{value:6});assert.equal(end.packets.length,0);
 assert.deepEqual(flowFrame(c,4,graph,layout),a);assert.deepEqual(flowFrame(c,4,graph,layout),a);
 assert.equal(JSON.stringify(c),before,'Seeking must not mutate lesson data');
});

test('polyline distance follows bends instead of interpolating directly across a corner',()=>{
 assert.deepEqual(polylinePoint([{x:0,y:0},{x:20,y:0},{x:20,y:80}],.5),{x:20,y:30});
});

test('camera transitions reconstruct identically when seeking across a chapter boundary',()=>{
 const first=chapter(),next={...chapter(),id:'next',start:10,end:20,visualStart:12,
 visual:{...chapter().visual!,flow:{...chapter().visual!.flow!,focusNodes:['output']}}};
 const chapters=[first,next],a=cameraAt(chapters,next,12.3,layout,900,600);
 cameraAt(chapters,next,18,layout,900,600);
 assert.deepEqual(cameraAt(chapters,next,12.3,layout,900,600),a);
});

test('prepared function levels preserve root context and expose the current code and values',()=>{
 const lesson=JSON.parse(fs.readFileSync(new URL('../../../bundled-lessons/browser-lessons/a7c4e71f90d3426b84c719ea064bd230/lesson.json',import.meta.url),'utf8')) as LiveLesson;
 const child=functionLesson(lesson,'fn-embed')!,inner=functionLesson(child,'emb-norm')!;
 assert.equal(child.rootLessonId,lesson.id);assert.equal(inner.rootLessonId,lesson.id);
 assert.notEqual(child.id,inner.id);assert.equal(inner.architectureScope,'emb-norm');
 const context=flowContext(child,child.chapters[0],0,['emb-tokenize'])!;
 assert.equal(context.scope,'fn-embed');assert.ok(context.source?.lines.length);assert.equal(context.illustrative,true);
 assert.equal(functionLesson(child,'absent'),null);
});

test('portrait follow mode carries the transfer into the destination and rewinds to its source',()=>{
 const c=chapter(),mobileLayout:GraphLayout={...layout,edges:{transfer:{points:[{x:200,y:90},{x:400,y:90}],label:{x:300,y:90}}}};
 const first=cameraAt([c],c,0,mobileLayout,390,650);
 const result=cameraAt([c],c,8,mobileLayout,390,650);
 assert.ok(result.zoom>=.62,'Portrait focus must preserve readable node text');
 const target=mobileLayout.nodes.output;
 assert.ok(Math.abs(target.x+target.width/2-(195-result.x)/result.zoom)<1,'Destination must remain centered after transfer');
 assert.ok(first.x>result.x,'Following a rightward transfer must advance the camera');
 assert.deepEqual(cameraAt([c],c,0,mobileLayout,390,650),first);
});
