import {referenceValues} from './referenceValues';
import type {LiveChapter,LiveLesson} from '../../lessonTypes';
import type {FlowGraph,FlowStep} from '../types';
import {ANSWER_PY_LINES,LESSON_TITLE,RAG_GRAPH} from './data/ragGraph';
import {RAG_STEPS} from './data/ragSteps';
import {resolveSubFunctionLesson} from './data/subFunctionLessons';
import type {ArchitectureGraph,CodeLineItem,CustomVisualCardSpec,NodeAccentColor,Step,SubFunctionLesson} from './types/lesson';

export const REFERENCE_LESSON_ID='a7c4e71f90d3426b84c719ea064bd230';
export type Workspace={isReference:boolean;title:string;graph:ArchitectureGraph;steps:Step[];codeLines:CodeLineItem[];resolveFunction:(id:string|null)=>SubFunctionLesson|null};
const accents:Record<string,NodeAccentColor>={blue:'sky',green:'mint',gold:'amber',coral:'rose',purple:'violet',white:'teal',muted:'teal'};
function adaptGraph(graph:FlowGraph):ArchitectureGraph{
 return{id:'generated-'+graph.id,title:graph.title,nodes:graph.nodes.map(node=>({
  ...node,subtitle:node.kind,roleSummary:node.description,iconName:node.kind==='store'?'database':node.kind==='search'?'search':'code',
  accentColor:accents[node.color]||'sky',width:480,height:300,
  codeReference:{file:node.codeReference?.file||'',lines:node.codeReference?.lines||[],snippet:''},
  customVisual:node.visual?{...node.visual,title:node.visual.title||node.label,
   rows:node.visual.rows?.map(r=>({...r,color:accents[r.color||node.color]||'sky'})),
   tiles:node.visual.tiles?.map(t=>({...t,color:accents[t.color||node.color]||'sky'}))} as CustomVisualCardSpec:
   {variant:'paper-card',title:node.label,lines:[node.defaultPreview],footerNote:node.description}
 })),edges:graph.edges.map(e=>({...e,relationship:e.relationship==='control'?'data':e.relationship}))};
}
function adaptStep(row:{id:string;title:string;question:string;narration:string;insight:string;duration:number;flow:FlowStep},index:number,chapter?:LiveChapter):Step{
 const flow=row.flow;
 return{id:row.id,beatNumber:index+1,title:row.title,question:row.question,narration:row.narration,duration:row.duration,
  focusNodes:flow.focusNodes,activeNodes:flow.focusNodes,activeEdges:flow.activeEdges,code:flow.code,
  packets:flow.packets.map(p=>{const cue=chapter?.narrationCues?.find(c=>c.target===p.id);return{...p,start:cue?.start??p.start,end:cue?.end??p.end};}),
  stateBefore:flow.stateBefore,stateAfter:flow.stateAfter,nodeDataBefore:flow.nodeDataBefore,nodeDataAfter:flow.nodeDataAfter,
  takeaway:row.insight,resultAt:chapter?.narrationCues?.find(c=>c.target==='takeaway')?.start,drillDownFunctionId:flow.drillDownFunctionId};
}
const referenceFunctions=new Map<string,SubFunctionLesson>();
function referenceFunction(id:string|null){
 if(!id)return null;const saved=referenceFunctions.get(id);if(saved)return saved;
 const raw=resolveSubFunctionLesson(id);if(!raw)return null;const fn=referenceValues(raw);
 if(id==='fn-embed'){
  const rules=fn.graph.nodes.find(n=>n.id==='emb-rules');rules?.staticData?.entries.push({key:'toy_stopwords',value:'do, I, have, to, a',color:'rose'});
  fn.steps[0].narration+=' This toy cleanup also drops the stopwords do, I, have, to, and a.';
 }
 if(id==='emb-tokenize')fn.steps[1].narration+=' This toy cleanup explicitly removes do, I, have, to, and a as stopwords.';
 referenceFunctions.set(id,fn);return fn;
}
const referenceWorkspace:Workspace={isReference:true,title:LESSON_TITLE,graph:referenceValues(RAG_GRAPH),steps:referenceValues(RAG_STEPS),codeLines:referenceValues(ANSWER_PY_LINES),resolveFunction:referenceFunction};
/** The original walkthrough keeps its 58-second transport; contextual answers map to the saved lesson scope. */
export function backendPlayhead(lesson:LiveLesson,scope:string|null,step:Step,playhead:number,steps:Step[]){
 const index=Math.max(0,steps.findIndex(s=>s.id===step.id)),start=steps.slice(0,index).reduce((n,s)=>n+s.duration,0);
 const fraction=Math.max(0,Math.min(1,(playhead-start)/step.duration));
 const module=scope?lesson.architecture?.functions[scope]:undefined;
 if(module){const i=module.steps.findIndex(s=>s.id===step.id);if(i>=0)return module.steps.slice(0,i).reduce((n,s)=>n+s.duration,0)+fraction*module.steps[i].duration;}
 const chapter=lesson.chapters.find(c=>c.id===step.id);return chapter?chapter.start+fraction*(chapter.end-chapter.start):playhead;
}
function goalLines(lines:CodeLineItem[],steps:Step[]):CodeLineItem[]{
 return lines.map(line=>{const step=steps.find(s=>s.code.lines.includes(line.lineNumber));if(!step)return line;
  return{...line,goalText:line.goalText||line.explanation||step.question,inputLabel:line.inputLabel||'@input',inputValue:line.inputValue||JSON.stringify(step.stateBefore),outputLabel:line.outputLabel||'@output',resultText:line.resultText||JSON.stringify(step.stateAfter)};});
}
export function graphForFrame(graph:ArchitectureGraph,frames:Record<string,{previewLines:string[]}>,isReference:boolean):ArchitectureGraph{
 if(isReference)return graph;
 return{...graph,nodes:graph.nodes.map(node=>{const preview=frames[node.id]?.previewLines;
  if(!preview?.length||!node.customVisual)return node;
  return{...node,customVisual:{...node.customVisual,lines:preview,highlightText:node.customVisual.variant==='output-pill'?preview.join(' · '):node.customVisual.highlightText}};
 })};
}
export function workspaceForLesson(lesson:LiveLesson):Workspace{
 if(lesson.id===REFERENCE_LESSON_ID)return referenceWorkspace;
 const architecture=lesson.architecture!;
 const functions:Record<string,SubFunctionLesson>={};
 for(const [id,fn] of Object.entries(architecture.functions)){
  const parent=Object.values(architecture.functions).find(p=>p.id!==id&&p.graph.nodes.some(n=>n.drillDownFunctionId===id));
  functions[id]={id,functionName:fn.title,signature:fn.title,fileName:fn.codeFiles[0].file,
   codebaseRange:'Displayed source excerpt',totalModuleLines:Math.max(...fn.codeFiles.flatMap(f=>f.lines.map(l=>l.lineNumber))),
   summary:fn.summary,parentBeatNumber:1,parentNodeId:'',parentFunctionId:parent?.id,
   graph:adaptGraph(fn.graph),codeLines:goalLines(fn.codeFiles[0].lines,fn.steps.map((s,i)=>adaptStep(s,i))),steps:fn.steps.map((s,i)=>adaptStep(s,i))};
 }
 const module=lesson.architectureScope?architecture.functions[lesson.architectureScope]:architecture;
 const steps=lesson.chapters.map((c,i)=>adaptStep({...c,duration:c.end-c.start,insight:c.insight||c.visual!.takeaway,flow:c.visual!.flow!},i,c));
 return{isReference:false,title:lesson.title,graph:adaptGraph(module.graph),codeLines:goalLines(module.codeFiles[0].lines,steps),
  steps,
  resolveFunction:id=>id?functions[id]||null:null};
}
