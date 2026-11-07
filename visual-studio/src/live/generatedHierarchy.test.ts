import test from 'node:test';
import assert from 'node:assert/strict';
import {computeElkGraphLayout} from './architecture/prototype/layout/elkLayout';
import {evaluateTimeline} from './architecture/prototype/timeline/evaluateTimeline';
import {functionBlueprint} from './architecture/prototype/functionBlueprint';
import type {ArchitectureGraph,GraphNode,ComputedGraphLayout,Step} from './architecture/prototype/types/lesson';
function node(id:string,childIds:string[]=[]):GraphNode{return{id,label:id,kind:'transform',iconName:'FileCode2',accentColor:'sky',subtitle:'',description:id,roleSummary:id,defaultPreview:'',codeReference:{file:'demo.py',lines:[1],snippet:''},width:180,height:120,
 children:childIds.map(id=>({id,label:id,color:'sky',icon:'FileCode2'})),connections:[],structure:'source'};}
function checkBounds(graph:ArchitectureGraph,layout:ComputedGraphLayout){
 const bounds=layout.systemBounds!;assert.ok(bounds);
 for(const n of graph.nodes){const box=layout.nodes[n.id];assert.ok(box.x>=bounds.x&&box.y>=bounds.y&&box.x+box.width<=bounds.x+bounds.width&&box.y+box.height<=bounds.y+bounds.height);
  for(const child of layout.compounds?.[n.id]?.children||[]){assert.ok(child.x>=0&&child.y>=0&&child.x+child.w<=box.width&&child.y+child.h<=box.height);}}
 const boxes=Object.values(layout.nodes);for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
}

test('generated compound wires preserve a branch and disconnected files without synthesizing a chain',async()=>{
 const parent=node('parent',['first','left','right','independent']);
 parent.connections=[{id:'first-left',from:{child:'first'},to:{child:'left'},relationship:'data'},{id:'first-right',from:{child:'first'},to:{child:'right'},relationship:'data'}];
 const graph={id:'generated-branch',title:'Branch',nodes:[parent],edges:[]};
 const layout=await computeElkGraphLayout(graph);assert.equal(layout.engineUsed,'elk');checkBounds(graph,layout);
 assert.deepEqual(Object.keys(layout.internalEdges!).sort(),['first-left','first-right']);
 assert.equal(layout.compounds!.parent.internalWires.length,2);
 const boxes=layout.children!.parent;assert.ok(boxes.first.x<boxes.left.x&&boxes.first.x<boxes.right.x);
 assert.notEqual(boxes.left.y,boxes.right.y);
});

test('disconnected containers have no decorative dependency wires or wall ports',async()=>{
 const graph={id:'generated-isolated',title:'Files',nodes:[node('api',['server.py','store.py']),node('web',['player.ts','style.ts'])],edges:[]};
 const layout=await computeElkGraphLayout(graph);checkBounds(graph,layout);
 for(const spec of Object.values(layout.compounds!)){assert.equal(spec.internalWires.length,0);assert.equal(spec.leftPortsY.length,0);assert.equal(spec.rightPortsY.length,0);}
});

test('ELK follows dependency direction even when the authored node array is reversed',async()=>{
 const graph:ArchitectureGraph={id:'generated-reversed',title:'Chain',nodes:[node('c'),node('b'),node('a')],edges:[
 {id:'ab',source:'a',target:'b',label:'',relationship:'reference',description:''},{id:'bc',source:'b',target:'c',label:'',relationship:'reference',description:''}]};
 const layout=await computeElkGraphLayout(graph);checkBounds(graph,layout);
 assert.ok(layout.nodes.a.x<layout.nodes.b.x&&layout.nodes.b.x<layout.nodes.c.x);
 for(const e of graph.edges){assert.equal(layout.edges[e.id].sourcePort.x,layout.nodes[e.source].x+layout.nodes[e.source].width);assert.equal(layout.edges[e.id].targetPort.x,layout.nodes[e.target].x);}
});

test('cross-container imports bind to actual file children and enclosure grows beyond the old fixed boundary',async()=>{
 const a=node('api',['server','unrelated']),b=node('web',['player','independent']);
 const graph:ArchitectureGraph={id:'generated-bindings',title:'Bindings',nodes:[a,b],edges:[{id:'import',source:'api',sourceChild:'server',target:'web',targetChild:'player',label:'import',description:'static import',relationship:'reference'}]};
 const layout=await computeElkGraphLayout(graph);checkBounds(graph,layout);
 const ac=layout.compounds!.api,bc=layout.compounds!.web;
 const start=layout.edges.import.sourcePort,end=layout.edges.import.targetPort;
 assert.equal(ac.internalWires[0].points.at(-1)!.y+layout.nodes.api.y,start.y);
 assert.equal(bc.internalWires[0].points[0].y+layout.nodes.web.y,end.y);
 assert.equal(ac.internalWires.length,1);assert.equal(bc.internalWires.length,1);
});

test('internal packet paths reconstruct at the same measured playhead after arbitrary rewind',async()=>{
 const parent=node('pipeline',['plan','render']);parent.structure=undefined;
 parent.connections=[{id:'plan-render',from:{child:'plan'},to:{child:'render'},relationship:'data'}];
 const graph={id:'generated-playback',title:'Playback',nodes:[parent],edges:[]};
 const layout=await computeElkGraphLayout(graph);
 const step:Step={id:'beat',beatNumber:1,title:'Prepare',question:'How?',narration:'Plan then render.',duration:10,focusNodes:['pipeline'],activeNodes:['pipeline'],activeEdges:['plan-render'],packets:[{edgeId:'plan-render',start:1,end:8,payload:'plan'}],code:{file:'demo.py',lines:[1]},stateBefore:{},stateAfter:{},nodeDataBefore:{},nodeDataAfter:{},takeaway:'A plan feeds rendering.'};
 const before=evaluateTimeline(4,[step],graph,layout,900,600,false);evaluateTimeline(9,[step],graph,layout,900,600,false);
 assert.deepEqual(evaluateTimeline(4,[step],graph,layout,900,600,false),before);
 assert.ok(before.activePackets[0].x>layout.nodes.pipeline.x);
});

test('source focus follows the inspected file inside a large compound instead of shrinking its text',async()=>{
 const parent=node('backend',Array.from({length:8},(_,i)=>'source-'+i));
 parent.children!.forEach((c,i)=>{c.codeReference={file:'module'+i+'.py',lines:[1]};});
 const graph={id:'generated-repository-focus',title:'Source',nodes:[parent,node('other',['web'])],edges:[]};
 const layout=await computeElkGraphLayout(graph);
 const step:Step={id:'beat',beatNumber:1,title:'Prepare',question:'How?',narration:'Inspect the planner.',duration:10,focusNodes:['backend','other'],activeNodes:['backend'],activeEdges:[],packets:[],code:{file:'module4.py',lines:[1]},stateBefore:{},stateAfter:{},nodeDataBefore:{},nodeDataAfter:{},takeaway:'Static source.'};
 const frame=evaluateTimeline(4,[step],graph,layout,650,400,false);
 assert.ok(frame.targetCamera.zoom>=.7);
 const child=layout.children!.backend['source-4'],centerX=layout.nodes.backend.x+child.x+child.width/2;
 assert.ok(Math.abs(centerX*frame.targetCamera.zoom+frame.targetCamera.x-325)<1);
});

test('several references to the same file share one boundary port and preserve east-to-west endpoints',async()=>{
 const a=node('a',['caller-a']),b=node('b',['caller-b']),target=node('target',['actual-file']);
 const graph:ArchitectureGraph={id:'generated-reference-ports',title:'References',nodes:[a,b,target],edges:[
 {id:'at',source:'a',sourceChild:'caller-a',target:'target',targetChild:'actual-file',label:'imports',description:'',relationship:'reference'},
 {id:'bt',source:'b',sourceChild:'caller-b',target:'target',targetChild:'actual-file',label:'imports',description:'',relationship:'reference'}]};
 const layout=await computeElkGraphLayout(graph);assert.equal(layout.compounds!.target.leftPortsY.length,1);
 for(const edge of graph.edges){const route=layout.edges[edge.id];
  assert.equal(route.sourcePort.x,layout.nodes[edge.source].x+layout.nodes[edge.source].width);
  assert.equal(route.targetPort.x,layout.nodes[edge.target].x);
 }
 assert.equal(layout.compounds!.a.children[0].showInputPort,false);
 assert.equal(layout.compounds!.a.children[0].showOutputPort,true);
 assert.equal(layout.compounds!.target.children[0].showInputPort,true);
 assert.equal(layout.compounds!.target.children[0].showOutputPort,false);
});

test('system design routes external question through a wall socket into a function and returns an external result',async()=>{
 const question={...node('question'),kind:'input' as const,structure:undefined,width:220,height:124};
 const fn={...node('answer',['embed','generate']),structure:undefined};
 fn.connections=[{id:'embedding-to-generation',from:{child:'embed'},to:{child:'generate'},label:'context',relationship:'data'}];
 const output={...node('result'),kind:'output' as const,structure:undefined,width:220,height:124};
 const graph:ArchitectureGraph={id:'generated-system-boundary',systemContract:true,title:'answer(question)',nodes:[question,fn,output],edges:[
  {id:'question-in',source:'question',target:'answer',targetChild:'embed',label:'question',relationship:'data',description:'Declared input'},
  {id:'answer-out',source:'answer',sourceChild:'generate',target:'result',label:'answer',relationship:'data',description:'Declared result'}]};
 const layout=await computeElkGraphLayout(graph),frame=layout.systemBounds!;
 assert.ok(layout.nodes.question.x+layout.nodes.question.width<frame.x);
 assert.ok(layout.nodes.result.x>frame.x+frame.width);
 assert.equal(layout.edges['question-in'].boundaryPort?.x,frame.x);
 assert.equal(layout.edges['answer-out'].boundaryPort?.x,frame.x+frame.width);
 for(const id of ['question-in','answer-out'])assert.ok(layout.edges[id].points.some(p=>p.x===layout.edges[id].boundaryPort!.x&&p.y===layout.edges[id].boundaryPort!.y));
 assert.ok(layout.internalEdges?.['embedding-to-generation']);
 assert.equal(layout.issues?.length,0);
});

test('the enclosing call becomes the frame, while the question continues from its wall into the first function',async()=>{
 const question={...node('question'),kind:'input' as const,structure:undefined,width:220,height:116};
 const wrapper={...node('answer-call'),structure:undefined};
 const embed={...node('embed',['tokenize','normalize']),structure:undefined};
 const output={...node('answer'),kind:'output' as const,structure:undefined,width:220,height:116};
 const graph:ArchitectureGraph={id:'generated-wrapper',systemContract:true,systemNodeId:wrapper.id,title:'answer(question)',nodes:[question,wrapper,embed,output],edges:[
  {id:'question-wall',source:question.id,target:wrapper.id,label:'question',relationship:'data',description:''},
  {id:'wall-function',source:wrapper.id,target:embed.id,label:'question',relationship:'data',description:''},
  {id:'result',source:embed.id,target:output.id,label:'answer',relationship:'data',description:''}]};
 const layout=await computeElkGraphLayout(graph),wall=layout.edges['question-wall'].targetPort;
 assert.equal(wall.x,layout.systemBounds!.x);
 assert.deepEqual(layout.edges['wall-function'].sourcePort,wall);
 assert.equal(layout.edges['wall-function'].targetPort.x,layout.nodes.embed.x);
 assert.deepEqual(layout.nodes[wrapper.id],{id:wrapper.id,...layout.systemBounds});
 assert.equal(layout.issues?.length,0);
 const step:Step={id:'entry',beatNumber:1,title:'Entry',question:'Where does it enter?',narration:'Question enters embed.',duration:10,focusNodes:[question.id,wrapper.id,embed.id],activeNodes:[question.id,embed.id],activeEdges:['question-wall','wall-function'],attentionCues:[{target:question.id,start:0,end:10}],packets:[],code:{file:'demo.py',lines:[1]},stateBefore:{},stateAfter:{},nodeDataBefore:{},nodeDataAfter:{},takeaway:'The outer call contains the function.'};
 const camera=evaluateTimeline(0,[step],graph,layout,840,550,false).targetCamera;
 for(const id of [question.id,embed.id]){const box=layout.nodes[id];assert.ok(box.x*camera.zoom+camera.x>=0);assert.ok((box.x+box.width)*camera.zoom+camera.x<=840);}
});

test('the feedback takeaway keeps the declared return route and both stages visible when following narration',async()=>{
 const construct={...node('construct'),structure:undefined},review={...node('review'),structure:undefined};
 const graph:ArchitectureGraph={id:'generated-review-cycle',systemContract:true,title:'Review',nodes:[construct,review],edges:[
  {id:'candidate',source:construct.id,target:review.id,label:'candidate',relationship:'data',description:''},
  {id:'retry',source:review.id,target:construct.id,label:'findings',relationship:'control',description:''}]};
 const layout=await computeElkGraphLayout(graph);
 const step:Step={id:'review',beatNumber:1,title:'Review',question:'Why repeat?',narration:'Findings return to construction.',duration:10,focusNodes:['construct','review'],activeNodes:['construct','review'],activeEdges:['candidate','retry'],attentionCues:[{target:'review',start:0,end:10}],packets:[],code:{file:'demo.py',lines:[1]},stateBefore:{},stateAfter:{},nodeDataBefore:{},nodeDataAfter:{},takeaway:'Revision is a cycle.'};
 const camera=evaluateTimeline(9,[step],graph,layout,900,600,false).targetCamera;
 for(const p of [...layout.edges.retry.points,...['construct','review'].flatMap(id=>{const b=layout.nodes[id];return[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}];})]){
  assert.ok(p.x*camera.zoom+camera.x>=0&&p.x*camera.zoom+camera.x<=900);
  assert.ok(p.y*camera.zoom+camera.y>=0&&p.y*camera.zoom+camera.y<=600);
 }
});

test('function blueprints group only connected source operations and preserve both branch paths and the final result',async()=>{
 const input={...node('inputs'),kind:'input' as const,sourceKind:'signature' as const};
 const output={...node('outcomes'),kind:'output' as const,sourceKind:'result' as const};
 const operations=['read','check','yes','no','return'].map(id=>({...node(id),sourceKind:'operation' as const}));
 const edges=[['in','inputs','read'],['read-check','read','check'],['true','check','yes'],['false','check','no'],['yes-return','yes','return'],['no-return','no','return'],['out','return','outcomes']].map(([id,source,target])=>({id,source,target,label:id,relationship:'control' as const,description:''}));
 const original:ArchitectureGraph={id:'generated-inspect',title:'prepare(request)',nodes:[input,...operations,output],edges};
 const step:Step={id:'test',beatNumber:1,title:'Choose',question:'Which path?',narration:'Check the request.',duration:10,focusNodes:['check','yes','no'],activeNodes:['check'],activeEdges:['true','false'],packets:[],code:{file:'demo.py',lines:[1]},stateBefore:{},stateAfter:{},nodeDataBefore:{},nodeDataAfter:{},takeaway:'Both are possible paths.'};
 const projected=functionBlueprint(original,[step]);
 const represented=[...projected.graph.edges.map(e=>e.id),...projected.graph.nodes.flatMap(n=>(n.connections||[]).map(c=>c.id))];
 assert.deepEqual(represented.sort(),edges.map(e=>e.id).sort());
 assert.deepEqual(projected.graph.nodes.flatMap(n=>(n.children||[]).map(c=>c.id)).sort(),operations.map(n=>n.id).sort());
 assert.deepEqual(projected.steps[0].focusOperations,['check','yes','no']);
 assert.equal(original.nodes.length,7); // The evidence contract is unchanged.
 const layout=await computeElkGraphLayout(projected.graph),frame=layout.systemBounds!;
 assert.ok(layout.nodes.inputs.x+layout.nodes.inputs.width<frame.x);
 assert.ok(layout.nodes.outcomes.x>frame.x+frame.width);
 assert.equal(layout.issues?.length,0);
});
