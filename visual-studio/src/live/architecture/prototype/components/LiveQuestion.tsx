import {backendPlayhead,workspaceForLesson} from '../workspace';
import {useEffect,useRef,useState} from 'react';
import {api} from '../../../../learning/types';
import type {LiveLesson} from '../../../lessonTypes';
import type {ArchitectureGraph,Step} from '../types/lesson';

export type LiveQuestionProps={lesson:LiveLesson;activeSubFunctionId:string|null;activeGraph:ArchitectureGraph;currentStep:Step;playhead:number;selectedNodeId:string|null;variables:Record<string,unknown>;onAsk:()=>void};
export function LiveQuestion({lesson,activeSubFunctionId,activeGraph,currentStep,playhead,selectedNodeId,variables,onAsk}:LiveQuestionProps){
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef<AbortController|null>(null),session=useRef<string|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function ask(){
  if(busy||!question.trim())return;onAsk();setBusy(true);setError('');setAnswer('');
  const controller=new AbortController();request.current=controller;
  const timeout=setTimeout(()=>controller.abort(),180000);
  try{
   session.current??=(await api<{sessionId:string}>('session',{},controller.signal)).sessionId;
   const workspace=workspaceForLesson(lesson),scope=activeSubFunctionId||lesson.architectureScope||null;
   const steps=scope?workspace.resolveFunction(scope)?.steps||workspace.steps:workspace.steps;
   const time=backendPlayhead(lesson,scope,currentStep,playhead,steps);
   const reply=await api<{answer:string;sources?:{title:string;url:string}[]}>('ask',{sessionId:session.current,question,mode:'question',context:{
    sceneId:'live_generated',lessonId:lesson.rootLessonId||lesson.id,architectureScope:activeSubFunctionId||lesson.architectureScope,
    time,prototypePlayhead:playhead,selection:selectedNodeId?[selectedNodeId]:[],
    architectureContext:{graph:activeGraph.title,currentStep,selectedNodes:activeGraph.nodes.filter(n=>n.id===selectedNodeId),variables,code:currentStep.code},
    browserRenderer:{backend:'user-provided architecture prototype',live:true}}},controller.signal);
   if(!controller.signal.aborted)setAnswer(reply.answer);
  }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
  finally{clearTimeout(timeout);setBusy(false);request.current=null;}
 }
 return <details className="rounded border border-[#7BD3B0] bg-[#0B1717] p-3">
  <summary className="cursor-pointer text-xs font-semibold text-[#7BD3B0]">Ask your own question · QWEEPS AI</summary>
  <form onSubmit={e=>{e.preventDefault();void ask();}} className="mt-3 space-y-2">
   <label className="block text-xs text-[#B5C5BD]" htmlFor="architecture-question">About {selectedNodeId||currentStep.title}</label>
   <textarea id="architecture-question" aria-label="Ask QWEEPS about this trace" rows={3} maxLength={4000} value={question} onChange={e=>setQuestion(e.target.value)} disabled={busy} className="w-full resize-none rounded border border-[#486356] bg-[#142B25] p-2 text-sm text-[#EEF3E9]"/>
   {busy?<button type="button" onClick={()=>{request.current?.abort();}} className="rounded border border-[#486356] px-3 py-2 text-xs">Stop request</button>:<button type="submit" disabled={!question.trim()} className="rounded border border-[#E0BE72] bg-[#E0BE72] px-3 py-2 text-xs font-semibold text-[#0B1717] disabled:opacity-40">Ask QWEEPS</button>}
   {answer&&<p className="text-sm leading-relaxed text-[#EEF3E9]" role="status">{answer}</p>}
   {error&&<p role="alert" className="text-xs text-[#FCA5A5]">{error}</p>}
  </form>
 </details>;
}
