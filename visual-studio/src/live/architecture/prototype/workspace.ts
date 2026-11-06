import {normalizeVisual,generatedNodeSize,ROW_VISUALS,transferLabel} from './visualData';
import {referenceValues} from './referenceValues';
import type {LiveChapter,LiveLesson} from '../../lessonTypes';
import type {DataVisual,FlowGraph,FlowStep,GroundingMode,NodeData} from '../types';
import {ANSWER_PY_LINES,LESSON_TITLE,RAG_GRAPH} from './data/ragGraph';
import {RAG_STEPS} from './data/ragSteps';
import {resolveSubFunctionLesson} from './data/subFunctionLessons';
import type {ArchitectureGraph,CodeLineItem,CustomVisualCardSpec,NodeAccentColor,Step,SubFunctionLesson} from './types/lesson';

export const REFERENCE_LESSON_ID='a7c4e71f90d3426b84c719ea064bd230';
export type WorkspaceCodeFile={file:string;language:string;lines:CodeLineItem[]};
export type Workspace={isReference:boolean;title:string;graph:ArchitectureGraph;steps:Step[];codeLines:CodeLineItem[];codeFiles?:WorkspaceCodeFile[];tradeoffs?:string[];grounding:GroundingMode;assumptions:string[];limitations:string[];resolveFunction:(id:string|null)=>SubFunctionLesson|null};
const accents:Record<string,NodeAccentColor>={blue:'sky',green:'mint',gold:'amber',coral:'rose',purple:'violet',white:'teal',muted:'teal'};
function adaptVisual(visual:DataVisual):CustomVisualCardSpec{
 return {...visual,rows:visual.rows?.map(row=>({...row,color:accents[row.color||'blue']||'sky'})),tiles:visual.tiles?.map(tile=>({...tile,color:accents[tile.color||'blue']||'sky'}))} as CustomVisualCardSpec;
}
function adaptNodeData(data:Record<string,NodeData>){
 return Object.fromEntries(Object.entries(data).map(([id,state])=>[id,{...state,visual:state.visual?adaptVisual(state.visual):undefined}]));
}
function fitGraphToSteps(graph:ArchitectureGraph,steps:Step[]):ArchitectureGraph{
 return{...graph,nodes:graph.nodes.map(node=>{
  const states=steps.flatMap(step=>[step.nodeDataBefore[node.id],step.nodeDataAfter[node.id]]).filter(Boolean);
  const sizes=states.map(state=>generatedNodeSize({...node,customVisual:normalizeVisual(state!.visual||{...node.customVisual!,lines:state!.previewLines},node.defaultPreview,node.accentColor)}));
  return{...node,width:Math.max(node.width,...sizes.map(size=>size.width)),height:Math.max(node.height,...sizes.map(size=>size.height))};
 })};
}
function adaptGraph(graph:FlowGraph):ArchitectureGraph{
 const result:ArchitectureGraph={id:'generated-'+graph.id,title:graph.title,nodes:graph.nodes.map(node=>({
  ...node,subtitle:node.kind,roleSummary:node.description,iconName:node.kind==='store'?'database':node.kind==='search'?'search':'code',
  accentColor:accents[node.color]||'sky',width:480,height:300,
  codeReference:{file:node.codeReference?.file||'',lines:node.codeReference?.lines||[],snippet:''},
  runtimeRows:!!node.visual&&ROW_VISUALS.has(node.visual.variant)&&!node.visual.rows?.length,
  customVisual:node.visual?{...node.visual,title:node.visual.title||node.label,
   rows:node.visual.rows?.map(r=>({...r,color:accents[r.color||node.color]||'sky'})),
   tiles:node.visual.tiles?.map(t=>({...t,color:accents[t.color||node.color]||'sky'}))} as CustomVisualCardSpec:
   {variant:'paper-card',title:node.label,lines:[node.defaultPreview],footerNote:node.description}
 })),edges:graph.edges.map(e=>({...e,relationship:e.relationship==='control'?'data':e.relationship}))};
 result.nodes=result.nodes.map(node=>{const visual=normalizeVisual(node.customVisual!,node.defaultPreview,node.accentColor);return{...node,customVisual:visual,...generatedNodeSize({...node,customVisual:visual})};});
 return result;
}
function adaptStep(row:{id:string;title:string;question:string;narration:string;insight:string;duration:number;flow:FlowStep},index:number,chapter?:LiveChapter,visualOffset=0,values:Record<string,unknown>={}):Step{
 const flow=row.flow;
 return{id:row.id,beatNumber:index+1,title:row.title,question:row.question,narration:row.narration,duration:row.duration,
  focusNodes:flow.focusNodes,activeNodes:flow.focusNodes,activeEdges:flow.activeEdges,code:flow.code,
  packets:flow.packets.map(p=>{const cue=chapter?.narrationCues?.find(c=>c.target===p.id);return{...p,payload:p.valueRef&&p.valueRef in values?transferLabel(values[p.valueRef]):transferLabel(p.payload),start:Math.max(0,(cue?.start??p.start)-visualOffset),end:(cue?.end??p.end)-visualOffset};}).filter(p=>p.end>p.start),
  stateBefore:flow.stateBefore,stateAfter:flow.stateAfter,nodeDataBefore:adaptNodeData(flow.nodeDataBefore),nodeDataAfter:adaptNodeData(flow.nodeDataAfter),
  takeaway:row.insight,resultAt:chapter?.narrationCues?.find(c=>c.target==='takeaway')?Math.max(0,chapter.narrationCues.find(c=>c.target==='takeaway')!.start-visualOffset):undefined,drillDownFunctionId:flow.drillDownFunctionId};
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
const referenceWorkspace:Workspace={isReference:true,title:LESSON_TITLE,graph:referenceValues(RAG_GRAPH),steps:referenceValues(RAG_STEPS),codeLines:referenceValues(ANSWER_PY_LINES),grounding:'illustrative',assumptions:['Prepared shop-policy example; retrieval scores and documents are illustrative.'],limitations:['This is a displayed trace, not a live model or retrieval execution.'],resolveFunction:referenceFunction};
/** The original walkthrough keeps its 58-second transport; contextual answers map to the saved lesson scope. */
export function backendPlayhead(lesson:LiveLesson,scope:string|null,step:Step,playhead:number,steps:Step[]){
 if(lesson.id!==REFERENCE_LESSON_ID)return playhead;
 const index=Math.max(0,steps.findIndex(s=>s.id===step.id)),start=steps.slice(0,index).reduce((n,s)=>n+s.duration,0);
 const fraction=Math.max(0,Math.min(1,(playhead-start)/step.duration));
 const module=scope?lesson.architecture?.functions[scope]:undefined;
 if(module){const i=module.steps.findIndex(s=>s.id===step.id);if(i>=0)return module.steps.slice(0,i).reduce((n,s)=>n+s.duration,0)+fraction*module.steps[i].duration;}
 const chapter=lesson.chapters.find(c=>c.id===step.id);return chapter?chapter.start+fraction*(chapter.end-chapter.start):playhead;
}
function goalLines(lines:CodeLineItem[],steps:Step[],file?:string):CodeLineItem[]{
 return lines.map(line=>{const step=steps.find(s=>(!file||s.code.file===file)&&s.code.lines.includes(line.lineNumber));if(!step)return line;
  const representative=step.code.lines[0]===line.lineNumber;
  return{...line,goalText:line.goalText||line.explanation||step.question,inputLabel:line.inputLabel||(representative?'@input':undefined),inputValue:line.inputValue||(representative?JSON.stringify(step.stateBefore):undefined),outputLabel:line.outputLabel||(representative?'@output':undefined),resultText:line.resultText||(representative?JSON.stringify(step.stateAfter):undefined)};});
}
export function graphForFrame(graph:ArchitectureGraph,frames:Record<string,{previewLines:string[];statusLabel?:string;visual?:CustomVisualCardSpec;valueRef?:string}>,isReference:boolean):ArchitectureGraph{
 if(isReference)return graph;
 return{...graph,nodes:graph.nodes.map(node=>{const preview=frames[node.id]?.previewLines;
  if(!preview?.length||!node.customVisual)return node;
  const visual=normalizeVisual(frames[node.id].visual||node.customVisual,node.defaultPreview,node.accentColor);
  const dynamicRows=ROW_VISUALS.has(visual.variant)&&node.runtimeRows===true;
  return{...node,defaultPreview:preview.join(' · '),valueRef:frames[node.id].valueRef??node.valueRef,customVisual:{...visual,lines:preview,rows:dynamicRows&&!frames[node.id].visual?preview.map((text,i)=>({leftChip:String(i+1),rightValue:text,color:node.accentColor})):visual.rows,footerNote:[frames[node.id].statusLabel,visual.footerNote].filter(Boolean).join(' · '),highlightText:visual.variant==='output-pill'?preview.join(' · '):visual.highlightText}};
 })};
}
export function workspaceForLesson(lesson:LiveLesson):Workspace{
 if(lesson.id===REFERENCE_LESSON_ID)return referenceWorkspace;
 const architecture=lesson.architecture!;
 const values=architecture.workedExample?.values||{};
 const functions:Record<string,SubFunctionLesson>={};
 for(const [id,fn] of Object.entries(architecture.functions)){
  const parent=Object.values(architecture.functions).find(p=>p.id!==id&&p.graph.nodes.some(n=>n.drillDownFunctionId===id));
  functions[id]={id,functionName:fn.title,signature:fn.title,fileName:fn.codeFiles[0].file,
   codebaseRange:'Displayed source excerpt',totalModuleLines:Math.max(...fn.codeFiles.flatMap(f=>f.lines.map(l=>l.lineNumber))),
   summary:fn.summary,parentBeatNumber:1,parentNodeId:'',parentFunctionId:parent?.id,
   graph:adaptGraph(fn.graph),codeFiles:fn.codeFiles.map(file=>({...file,lines:goalLines(file.lines,fn.steps.map((s,i)=>adaptStep(s,i,undefined,0,values)),file.file)})),codeLines:goalLines(fn.codeFiles[0].lines,fn.steps.map((s,i)=>adaptStep(s,i,undefined,0,values)),fn.codeFiles[0].file),steps:fn.steps.map((s,i)=>adaptStep(s,i,undefined,0,values))};
  functions[id].graph=fitGraphToSteps(functions[id].graph,functions[id].steps);
 }
 const module=lesson.architectureScope?architecture.functions[lesson.architectureScope]:architecture;
 const steps=lesson.chapters.map((c,i)=>{
  const start=i===0?0:c.visualStart??c.start,next=lesson.chapters[i+1],end=next?(next.visualStart??next.start):lesson.duration;
  return adaptStep({...c,duration:end-start,insight:c.insight||c.visual!.takeaway,flow:c.visual!.flow!},i,c,start-c.start,values);
 });
 return{isReference:false,title:lesson.title,graph:fitGraphToSteps(adaptGraph(module.graph),steps),codeFiles:module.codeFiles.map(file=>({...file,lines:goalLines(file.lines,steps,file.file)})),codeLines:goalLines(module.codeFiles[0].lines,steps,module.codeFiles[0].file),
  steps,tradeoffs:architecture.tradeoffs??[],grounding:architecture.grounding??'illustrative',assumptions:architecture.assumptions??[],limitations:architecture.limitations??[],
  resolveFunction:id=>id?functions[id]||null:null};
}

export function sourceForStep(workspace:Workspace,fn:SubFunctionLesson|null,step:Step,selected?:string){
 const graph=fn?.graph||workspace.graph,reference=graph.nodes.find(n=>n.id===selected)?.codeReference||step.code;
 const files=fn?.codeFiles||workspace.codeFiles;
 return files?.find(file=>file.file===reference.file)||files?.[0];
}
