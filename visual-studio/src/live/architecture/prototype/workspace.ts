import {normalizeVisual,generatedNodeSize,ROW_VISUALS,transferLabel} from './visualData';
import {functionBlueprint} from './functionBlueprint';
import {referenceValues} from './referenceValues';
import type {LiveChapter,LiveLesson} from '../../lessonTypes';
import type {DataVisual,FlowGraph,FlowStep,GroundingMode,NodeData} from '../types';
import {ANSWER_PY_LINES,LESSON_TITLE,RAG_GRAPH} from './data/ragGraph';
import {RAG_STEPS} from './data/ragSteps';
import {adaptGeneratedSubFunctionLesson,resolveSubFunctionLesson} from './data/subFunctionLessons';
import type {ArchitectureGraph,CodeLineItem,CompoundContainerSpec,CustomVisualCardSpec,NodeAccentColor,Step,SubFunctionLesson} from './types/lesson';

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
  if(node.compoundContainer||node.layoutLocked)return node;
  const states=steps.flatMap(step=>[step.nodeDataBefore[node.id],step.nodeDataAfter[node.id]]).filter(Boolean);
  if(!node.customVisual&&!states.some(state=>state?.visual))return node;
  const sizes=states.map(state=>generatedNodeSize({...node,customVisual:normalizeVisual(state!.visual||{...node.customVisual!,lines:state!.previewLines},node.defaultPreview,node.accentColor)}));
  return{...node,width:Math.max(node.width,...sizes.map(size=>size.width)),height:Math.max(node.height,...sizes.map(size=>size.height))};
 })};
}
function graphNodeSize(node:FlowGraph['nodes'][number]) {
 const count=node.children?.length||0;
 if(!count)return{width:480,height:300};
 return{width:count<=3?520:680,height:count<=3?260:count<=6?360:460};
}
function adaptGraph(graph:FlowGraph):ArchitectureGraph{
 const isSeedGraph=graph.id==='qweeps-rag-4col-architecture';
 const incoming=new Map<string,number>();const outgoing=new Map<string,number>();
 for(const node of graph.nodes){incoming.set(node.id,0);outgoing.set(node.id,0);}
 for(const edge of graph.edges){incoming.set(edge.target,(incoming.get(edge.target)||0)+1);outgoing.set(edge.source,(outgoing.get(edge.source)||0)+1);}
 const seenIncoming=new Map<string,number>();const seenOutgoing=new Map<string,number>();
 const result:ArchitectureGraph={id:'generated-'+graph.id,systemContract:graph.systemContract,systemNodeId:graph.systemNodeId,title:graph.title,compactRowAssignment:graph.compactRowAssignment,nodes:graph.nodes.map(node=>{
  const exact=node.compoundContainer as CompoundContainerSpec|undefined;
  const compoundContainer=exact;
  const compoundWidth=compoundContainer?Math.max(236,...compoundContainer.children.map(child=>child.x+child.w))+24:undefined;
  const compoundHeight=compoundContainer?Math.max(156,...compoundContainer.children.map(child=>child.y+child.h))+24:undefined;
  const explicit=node.width!==undefined&&node.height!==undefined?{width:node.width,height:node.height}:graphNodeSize(node);
  return{
  ...node,subtitle:node.structure==='source'?(node.sourceKind==='function'?'source function':node.sourceKind==='operation'?'source operation':node.sourceKind==='signature'?'input':node.sourceKind==='result'?'result and effects':'source modules'):node.kind,roleSummary:node.description,iconName:node.structure==='source'?'FileCode2':node.kind==='store'?'Database':node.kind==='search'?'SearchCheck':node.kind==='input'?'MessageSquareQuote':node.kind==='output'?'CheckCircle2':'FileCode2',
  accentColor:accents[node.color]||'sky',...explicit,layoutLocked:node.width!==undefined&&node.height!==undefined,
  ...(compoundWidth&&compoundHeight&&!exact?{width:compoundWidth,height:compoundHeight}:{}),
  codeReference:{file:node.codeReference?.file||'',lines:node.codeReference?.lines||[],snippet:''},
  runtimeRows:!!node.visual&&ROW_VISUALS.has(node.visual.variant)&&!node.visual.rows?.length,
  children:node.children?.map(child=>({...child,color:accents[child.color]||'sky'})),
  // Compatibility for the scanner's former no-import fallback, whose links
  // were array-order placeholders rather than repository evidence.
  connections:graph.id.startsWith('repository-')?node.connections?.filter(c=>!(c.label==='source dependency'&&/^connect-\d+$/.test(c.id))):node.connections,
  compoundContainer,
  customVisual:node.visual?{...node.visual,title:node.visual.title||node.label,
   rows:node.visual.rows?.map(r=>({...r,color:accents[r.color||node.color]||'sky'})),
   tiles:node.visual.tiles?.map(t=>({...t,color:accents[t.color||node.color]||'sky'}))} as CustomVisualCardSpec:
   isSeedGraph?undefined:{variant:'paper-card',title:node.label,lines:[node.defaultPreview],footerNote:node.description}
 };}),
  edges:graph.edges.filter(e=>!graph.id.startsWith('repository-')||(!graph.nodes.find(n=>n.id===e.target)?.children?.length||Boolean(e.targetChild))&&(!graph.nodes.find(n=>n.id===e.source)?.children?.length||Boolean(e.sourceChild))).map(e=>{const targetIndex=seenIncoming.get(e.target)||0;const sourceIndex=seenOutgoing.get(e.source)||0;seenIncoming.set(e.target,targetIndex+1);seenOutgoing.set(e.source,sourceIndex+1);
   return{...e,relationship:e.relationship,targetPortIndex:(incoming.get(e.target)||0)>1?targetIndex:0,sourcePortIndex:(outgoing.get(e.source)||0)>1?sourceIndex:0};})};
 result.nodes=result.nodes.map(node=>{if(graph.systemContract&&!node.children?.length&&(node.kind==='input'||node.kind==='output'||node.external))return {...node,customVisual:undefined,width:220,height:Math.max(116,64+Math.ceil(node.defaultPreview.length/28)*17)};if(node.compoundContainer||node.layoutLocked||!node.customVisual)return node;const visual=normalizeVisual(node.customVisual,node.defaultPreview,node.accentColor);return{...node,customVisual:visual,...generatedNodeSize({...node,customVisual:visual})};});
 return result;
}
function adaptStep(row:{id:string;title:string;question:string;narration:string;insight:string;duration:number;flow:FlowStep},index:number,chapter?:LiveChapter,visualOffset=0,values:Record<string,unknown>={}):Step{
 const flow=row.flow;
 return{id:row.id,beatNumber:index+1,title:row.title,question:row.question,narration:row.narration,duration:row.duration,
  attentionCues:chapter?.narrationCues?.filter(c=>c.attention!==false).map(c=>({target:c.target,start:Math.max(0,c.start-visualOffset),end:c.end-visualOffset})),
  focusNodes:flow.focusNodes,focusOperations:flow.focusOperations,activeNodes:flow.focusNodes,activeEdges:flow.activeEdges,code:flow.code,
  packets:flow.packets.map(p=>{const cue=chapter?.narrationCues?.find(c=>c.target===p.id);return{...p,payload:p.valueRef&&p.valueRef in values?transferLabel(values[p.valueRef]):transferLabel(p.payload),start:Math.max(0,(cue?.start??p.start)-visualOffset),end:(cue?.end??p.end)-visualOffset};}).filter(p=>p.end>p.start),
  stateBefore:flow.stateBefore,stateAfter:flow.stateAfter,nodeDataBefore:adaptNodeData(flow.nodeDataBefore),nodeDataAfter:adaptNodeData(flow.nodeDataAfter),
  takeaway:row.insight,resultAt:chapter?.narrationCues?.find(c=>c.target==='takeaway')?Math.max(0,chapter.narrationCues.find(c=>c.target==='takeaway')!.start-visualOffset):undefined,drillDownFunctionId:flow.drillDownFunctionId};
}
const referenceFunctions=new Map<string,SubFunctionLesson>();
function referenceFunction(id:string|null){
 if(!id)return null;const saved=referenceFunctions.get(id);if(saved)return saved;
 const raw=resolveSubFunctionLesson(id);if(!raw)return null;const fn=referenceValues(raw);fn.graph={...fn.graph,layoutStyle:'reference'};
 if(id==='fn-embed'){
  const rules=fn.graph.nodes.find(n=>n.id==='emb-rules');rules?.staticData?.entries.push({key:'toy_stopwords',value:'do, I, have, to, a',color:'rose'});
  fn.steps[0].narration+=' This toy cleanup also drops the stopwords do, I, have, to, and a.';
 }
 if(id==='emb-tokenize')fn.steps[1].narration+=' This toy cleanup explicitly removes do, I, have, to, and a as stopwords.';
 referenceFunctions.set(id,fn);return fn;
}
const referenceWorkspace:Workspace={isReference:true,title:LESSON_TITLE,graph:{...referenceValues(RAG_GRAPH),layoutStyle:'reference'},steps:referenceValues(RAG_STEPS),codeLines:referenceValues(ANSWER_PY_LINES),grounding:'illustrative',assumptions:['Prepared shop-policy example; retrieval scores and documents are illustrative.'],limitations:['This is a displayed trace, not a live model or retrieval execution.'],resolveFunction:referenceFunction};
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
  return{...line,file:line.file||file,goalText:line.goalText||line.explanation||step.question,inputLabel:line.inputLabel||(representative&&Object.keys(step.stateBefore).length?'@input':undefined),inputValue:line.inputValue||(representative&&Object.keys(step.stateBefore).length?JSON.stringify(step.stateBefore):undefined),outputLabel:line.outputLabel||(representative&&Object.keys(step.stateAfter).length?'@output':undefined),resultText:line.resultText||(representative&&Object.keys(step.stateAfter).length?JSON.stringify(step.stateAfter):undefined)};});
}
function codeFileMap(files:WorkspaceCodeFile[]|undefined):Record<string,CodeLineItem[]>{
 return Object.fromEntries((files||[]).map(file=>[file.file,file.lines.map(line=>({...line,file:line.file||file.file}))]));
}
function workedLedger(values:Record<string,unknown>):Record<string,string>{
 return Object.fromEntries(Object.entries(values).map(([key,value])=>[key.startsWith('$')?key:`$${key}`,typeof value==='string'?value:JSON.stringify(value)]));
}
function withCodeContract(graph:ArchitectureGraph,files:WorkspaceCodeFile[]|undefined,values:Record<string,unknown>):ArchitectureGraph{
 return{...graph,codeFiles:codeFileMap(files),workedExampleLedger:workedLedger(values)};
}
export function graphForFrame(graph:ArchitectureGraph,frames:Record<string,{previewLines:string[];statusLabel?:string;visual?:CustomVisualCardSpec;valueRef?:string}>,isReference:boolean):ArchitectureGraph{
 if(isReference)return graph;
 return{...graph,nodes:graph.nodes.map(node=>{const frame=frames[node.id],preview=frame?.previewLines;
  if(!preview?.length)return node;
  const sourceVisual=frame.visual||node.customVisual;
  if(!sourceVisual)return{...node,defaultPreview:preview.join(' · '),valueRef:frame.valueRef??node.valueRef};
  const visual=normalizeVisual(sourceVisual,node.defaultPreview,node.accentColor);
  const dynamicRows=ROW_VISUALS.has(visual.variant)&&node.runtimeRows===true;
  return{...node,defaultPreview:preview.join(' · '),valueRef:frame.valueRef??node.valueRef,customVisual:{...visual,lines:preview,rows:dynamicRows&&!frame.visual?preview.map((text,i)=>({leftChip:String(i+1),rightValue:text,color:node.accentColor})):visual.rows,footerNote:[frame.statusLabel,visual.footerNote].filter(Boolean).join(' · '),highlightText:visual.variant==='output-pill'?preview.join(' · '):visual.highlightText}};
 })};
}
export function workspaceForLesson(lesson:LiveLesson):Workspace{
 if(lesson.id===REFERENCE_LESSON_ID)return referenceWorkspace;
 const architecture=lesson.architecture!;
 const values=architecture.workedExample?.values||{};
 const functions:Record<string,SubFunctionLesson>={};
 for(const [id,fn] of Object.entries(architecture.functions)){
  const parent=Object.values(architecture.functions).find(p=>p.id!==id&&p.graph.nodes.some(n=>n.drillDownFunctionId===id))||Object.values(architecture.functions).find(p=>p.id!==id&&p.graph.nodes.some(n=>n.children?.some(c=>c.drillDownFunctionId===id)));
  const fnSteps=fn.steps.map((s,i)=>adaptStep(s,i,undefined,0,values));
  const fnFiles=fn.codeFiles.map(file=>({...file,lines:goalLines(file.lines,fnSteps,file.file)}));
  const built={id,interface:fn.interface,view:fn.view,functionName:fn.title,signature:fn.title,fileName:fn.codeFiles[0].file,
   codebaseRange:fn.view==='source'?'Function input/output contract':'Prepared function contract',totalModuleLines:Math.max(...fn.codeFiles.flatMap(f=>f.lines.map(l=>l.lineNumber))),
   summary:fn.summary,parentBeatNumber:1,parentNodeId:'',parentFunctionId:fn.parentFunctionId||parent?.id,parentFunctionName:(fn.parentFunctionId?architecture.functions[fn.parentFunctionId]?.title:undefined)||parent?.title,
   graph:withCodeContract(fitGraphToSteps(adaptGraph(fn.graph),fnSteps),fnFiles,values),codeFiles:fnFiles,codeLines:goalLines(fn.codeFiles[0].lines,fnSteps,fn.codeFiles[0].file),steps:fnSteps};
  if(architecture.renderContract==='reference'){
   const adapted=adaptGeneratedSubFunctionLesson(built);
   functions[id]=referenceFunction(adapted.id)??referenceValues(adapted);
   functions[id]={...functions[id],graph:{...functions[id].graph,layoutStyle:'reference'}};
  }else {
   const sourceOrLogic=fn.view!=='visual';
   const graph={...built.graph,nodes:built.graph.nodes.map(node=>{
    if(!sourceOrLogic||node.children?.length)return node;
    if(node.interface){const rows=[...node.interface.inputs,...node.interface.outputs];return {...node,label:node.sourceKind==='result'?'Outputs & effects':'Inputs',customVisual:undefined,staticData:undefined,nonSummary:undefined,width:240,height:Math.max(124,74+Math.min(3,Math.max(1,rows.length))*22)};}
    const inputs=node.parameters||built.graph.edges.filter(e=>e.target===node.id).map(e=>e.label);
    if(fn.view==='source'){
     const declaration=node.sourceKind==='signature';
     return {...node,label:node.teachingLabel||node.label,description:node.teachingDescription||node.description,defaultPreview:node.teachingDescription||node.defaultPreview,customVisual:undefined,staticData:undefined,
      nonSummary:{blockTitle:node.teachingLabel||node.label,inputs:inputs.map(name=>({name,value:declaration?'declared parameter':'possible source path'})),goalTitle:declaration?'Declaration':'Source operation',goalText:node.teachingDescription||(node.kind==='search'?node.label:node.description),outputLabel:'Possible result',outputValue:node.kind==='output'?'Result or failure passed to the caller':node.kind==='search'?'Matching branch continues':'Updated state or the next operation'},
      width:400,height:Math.min(500,132+inputs.length*30+Math.ceil((node.kind==='search'?node.label:node.description).length/46)*21)};
    }
    return {...node,customVisual:undefined,nonSummary:node.kind==='input'||node.kind==='output'?undefined:{blockTitle:node.teachingLabel||node.label,inputs:inputs.map(name=>({name,value:'prepared example'})),goalTitle:'Goal',goalText:node.description,outputLabel:'Output',outputValue:node.defaultPreview},staticData:node.kind==='input'||node.kind==='output'?{header:node.label,entries:[{key:'value',value:node.signature||node.defaultPreview}]}:undefined,
      width:Math.max(300,Math.min(470,250+node.description.length*.5)),height:Math.max(180,Math.min(340,160+inputs.length*24+Math.ceil(node.description.length/65)*16))};
   })};
   const blueprint=fn.view==='source'?functionBlueprint(graph,built.steps):{graph,steps:built.steps};
   functions[id]={...built,...blueprint};
  }
 }
 const module=lesson.architectureScope?architecture.functions[lesson.architectureScope]:architecture;
 const rootGraph=adaptGraph(module.graph);
 if(module===architecture&&architecture.functionCatalog?.length){
  const counts=new Map<string,number>();for(const item of architecture.functionCatalog)counts.set(item.file,(counts.get(item.file)||0)+1);
  if(!rootGraph.systemContract)for(const node of rootGraph.nodes)for(const child of node.children||[]){const count=counts.get(child.codeReference?.file||'');if(count!==undefined)child.value=`${count} ${count===1?'function':'functions'}`;}
 }
 const steps=lesson.chapters.map((c,i)=>{
  const start=i===0?0:c.visualStart??c.start,next=lesson.chapters[i+1],end=next?(next.visualStart??next.start):lesson.duration;
  return adaptStep({...c,duration:end-start,insight:c.insight||c.visual!.takeaway,flow:c.visual!.flow!},i,c,start-c.start,values);
 });
 const moduleFiles=module.codeFiles.map(file=>({...file,lines:goalLines(file.lines,steps,file.file)}));
 return{isReference:false,title:lesson.title,graph:{...withCodeContract(fitGraphToSteps(rootGraph,steps),moduleFiles,values),...(architecture.renderContract==='reference'?{layoutStyle:'reference' as const}:{})},codeFiles:moduleFiles,codeLines:goalLines(module.codeFiles[0].lines,steps,module.codeFiles[0].file),
  steps,tradeoffs:architecture.tradeoffs??[],grounding:architecture.grounding??'illustrative',assumptions:architecture.assumptions??[],limitations:architecture.limitations??[],
  resolveFunction:id=>id?functions[id]||null:null};
}

export function sourceForStep(workspace:Workspace,fn:SubFunctionLesson|null,step:Step,selected?:string){
 const graph=fn?.graph||workspace.graph,reference=graph.nodes.find(n=>n.id===selected)?.codeReference||graph.nodes.flatMap(n=>n.children||[]).find(n=>n.id===selected)?.codeReference||step.code;
 const files=fn?.codeFiles;
 if(files?.length)return files.find(file=>file.file===reference.file)||files[0];
 if(fn?.codeLines?.length)return{file:fn.fileName||reference.file,language:'trace',lines:fn.codeLines};
 return workspace.codeFiles?.find(file=>file.file===reference.file)||workspace.codeFiles?.[0];
}
