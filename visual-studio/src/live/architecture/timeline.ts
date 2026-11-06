import type {LiveChapter,LiveLesson} from '../lessonTypes';
import type {FlowGraph,FlowCamera,FlowStep,GraphLayout,NodeData} from './types';
import {polylinePoint} from './geometry';

const clamp=(n:number,a=0,b=1)=>Math.min(b,Math.max(a,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
export function architectureModule(lesson:LiveLesson){
 const root=lesson.architecture;if(!root)return null;
 return lesson.architectureScope?root.functions[lesson.architectureScope]||null:root;
}
export function flowFrame(chapter:LiveChapter,time:number,graph:FlowGraph,layout:GraphLayout,history:LiveChapter[]=[]){
 const flow=chapter.visual!.flow!,duration=chapter.end-chapter.start,local=clamp(time-chapter.start,0,duration);
 const start=chapter.visualStart??chapter.start;
 const end=chapter.visualEnd??chapter.end;
 const resultAt=chapter.narrationCues?.find(c=>c.target==='takeaway')?.start??duration*.7;
 const completed=local>=Math.max(start-chapter.start,resultAt);
 const nodeData:Record<string,NodeData>={};
 const completedEdges=new Set<string>();
 for(const earlier of history){
  if(earlier.start>=chapter.start)break;
  Object.assign(nodeData,earlier.visual?.flow?.nodeDataAfter||{});
  for(const id of earlier.visual?.flow?.activeEdges||[])completedEdges.add(id);
 }
 Object.assign(nodeData,flow.nodeDataBefore,completed?flow.nodeDataAfter:{});
 const packets=flow.packets.flatMap(packet=>{
  const cue=chapter.narrationCues?.find(c=>c.target===packet.id);
  const at=Math.max(start-chapter.start,cue?.start??packet.start);
  const finish=cue?Math.min(end-chapter.start,Math.max(at+.25,cue.end)):packet.end;
  if(local<at||local>finish)return[];
  const route=layout.edges[packet.edgeId];if(!route)return[];
  const progress=clamp((local-at)/Math.max(.001,finish-at));
  return[{...packet,progress,...polylinePoint(route.points,progress)}];
 });
 const focus=new Set(flow.focusNodes);
 for(const edge of graph.edges)if(flow.activeEdges.includes(edge.id)){focus.add(edge.source);focus.add(edge.target);}
 return{flow,local,completed,nodeData,completedEdges,packets,focus,
  variables:completed?flow.stateAfter:flow.stateBefore,progress:clamp(local/duration)};
}
export function focusCamera(layout:GraphLayout,ids:string[],width:number,height:number,overview=false):FlowCamera{
 let boxes=ids.map(id=>layout.nodes[id]).filter(Boolean);
 if(!boxes.length)boxes=Object.values(layout.nodes);
 const fit=(items:typeof boxes)=>{
  const x=Math.min(...items.map(b=>b.x)),y=Math.min(...items.map(b=>b.y));
  const right=Math.max(...items.map(b=>b.x+b.width)),bottom=Math.max(...items.map(b=>b.y+b.height));
  const zoom=Math.min(1.35,(width-56)/Math.max(1,right-x+60),(height-124)/Math.max(1,bottom-y+40));
  return{x:width/2-(x+right)/2*zoom,y:40+(height-124)/2-(y+bottom)/2*zoom,zoom:Math.max(.08,zoom)};
 };
 const all=fit(boxes);
 // On narrow viewports keep the principal input/result readable; overview remains explicit.
 return !overview&&all.zoom<.62&&boxes.length>1?fit([boxes[0]]):all;
}
function phaseCamera(chapter:LiveChapter,time:number,layout:GraphLayout,width:number,height:number){
 const flow=chapter.visual!.flow!,all=focusCamera(layout,flow.focusNodes,width,height,true);
 if(all.zoom>=.62||flow.focusNodes.length===1)return all;
 const local=time-chapter.start;
 const timings=flow.packets.map(packet=>{const cue=chapter.narrationCues?.find(c=>c.target===packet.id);
  return{packet,start:cue?.start??packet.start,end:cue?.end??packet.end};}).sort((a,b)=>a.start-b.start);
 const transfer=[...timings].reverse().find(p=>local>=p.start);
 if(transfer){
  const edge=layout.edges[transfer.packet.edgeId];
  if(edge){const progress=ease((local-transfer.start)/Math.max(.25,transfer.end-transfer.start));
   const position=polylinePoint(edge.points,progress),base=focusCamera(layout,[flow.focusNodes[0]],width,height);
   const target=Object.values(layout.nodes).sort((a,b)=>Math.hypot(a.x+a.width/2-position.x,a.y+a.height/2-position.y)-Math.hypot(b.x+b.width/2-position.x,b.y+b.height/2-position.y))[0];
   const settle=ease((local-transfer.end)/.75);
   const x=position.x+(target.x+target.width/2-position.x)*settle,y=position.y+(target.y+target.height/2-position.y)*settle;
   return{zoom:base.zoom,x:width/2-x*base.zoom,y:40+(height-124)/2-y*base.zoom};}
 }
 return focusCamera(layout,[flow.focusNodes[0]],width,height);
}
export function cameraAt(chapters:LiveChapter[],chapter:LiveChapter,time:number,layout:GraphLayout,width:number,height:number,reduced=false){
 const next=phaseCamera(chapter,time,layout,width,height);
 const index=chapters.indexOf(chapter),previous=chapters[index-1];
 if(!previous?.visual?.flow||reduced)return next;
 const prior=phaseCamera(previous,previous.end,layout,width,height);
 const p=ease((time-(chapter.visualStart??chapter.start))/.75);
 return{x:prior.x+(next.x-prior.x)*p,y:prior.y+(next.y-prior.y)*p,zoom:prior.zoom+(next.zoom-prior.zoom)*p};
}
export function flowContext(lesson:LiveLesson,chapter:LiveChapter,time:number,selection:string[]){
 const module=architectureModule(lesson),flow=chapter.visual?.flow;if(!module||!flow)return undefined;
 const resultAt=chapter.narrationCues?.find(c=>c.target==='takeaway')?.start??(chapter.end-chapter.start)*.7;
 const after=time-chapter.start>=resultAt;
 return{scope:lesson.architectureScope||'overview',illustrative:lesson.architecture?.illustrative,
  graph:module.graph.title,selectedNodes:module.graph.nodes.filter(n=>selection.includes(n.id)),
  code:flow.code,source:module.codeFiles.find(f=>f.file===flow.code.file),
  variables:after?flow.stateAfter:flow.stateBefore,nodeData:after?flow.nodeDataAfter:flow.nodeDataBefore};
}

/** Convert a prepared function into an ordinary lesson. Narration transport stays in the parent player. */
export function functionLesson(parent:LiveLesson,functionId:string):LiveLesson|null{
 const root=parent.architecture,fn=root?.functions[functionId];if(!root||!fn)return null;
 const rootId=parent.rootLessonId||parent.id;
 let hash=2166136261;for(const c of rootId+':'+functionId)hash=Math.imul(hash^c.charCodeAt(0),16777619);
 const id=(hash>>>0).toString(16).padStart(8,'0').repeat(4);
 let clock=0;
 const chapters:LiveChapter[]=fn.steps.map(row=>{
  const nodes=focalNodes(row.flow,fn.graph);const start=clock;clock+=row.duration;
  return{id:row.id,title:row.title,question:row.question,insight:row.insight,safeguard:row.safeguard,narration:row.narration,
   start,end:clock,finishedAt:clock-1.5,narrationAt:.3,audio:'',years:'',sources:[],sourcePages:[],teaching:'architecture',
   roles:Object.fromEntries(nodes.map(n=>[n.id,n.title+': '+n.body])),
   cues:[{at:0,text:row.question},{at:row.duration*.7,text:row.insight}],
   visual:{layout:'architecture_flow',nodes,connections:[],columns:[],takeaway:row.insight,flow:row.flow,
    presentation:{method:'Architecture execution trace',why:row.question,visualEvidence:row.insight,textMode:'labels'}}};
 });
 return{id,rootLessonId:rootId,architectureScope:functionId,kind:'live_generated',title:fn.title,question:fn.summary,
  representation:parent.representation,example:parent.example,sources:parent.sources,documentId:parent.documentId,
  documentTitle:parent.documentTitle,architecture:root,chapters,duration:clock};
}
function focalNodes(flow:FlowStep,graph:FlowGraph){
 const ids=new Set(flow.focusNodes);for(const edge of graph.edges)if(flow.activeEdges.includes(edge.id)){ids.add(edge.source);ids.add(edge.target);}
 return graph.nodes.filter(n=>ids.has(n.id)).map((n,i)=>({id:n.id,title:n.label,body:n.description,color:n.color,icon:'code',at:.6+i*1.3,tag:n.kind}));
}
