import React,{useEffect,useMemo,useState} from 'react';
import {api} from '../learning/types';
import {initialLiveSnapshot} from './geometry';
import GeneratedStage from './GeneratedStage';
import type {LiveChapter,LiveLesson} from './lessonTypes';
import './live.css';

type Beat={id:string;title:string;teaching?:string;layout:string};
type Plan={title:string;question:string;representation:string;example:{title:string;description:string;icon:string};beats:Beat[]};
type GateFinding={code?:string;severity?:string;message?:string;selector?:string;section?:string};
type Check={status:'checking'|'ready'|'blocked'|'error';findings:GateFinding[];message?:string};
type StreamEvent={
 type:'stage'|'plan'|'chapter'|'done'|'error'|'ping';
 stage?:string;title?:string;question?:string;representation?:string;example?:Plan['example'];beats?:Beat[];
 index?:number;chapter?:LiveChapter;duration?:number;elapsed?:number;message?:string;lessonId?:string;chapters?:number;
};

const DEFAULT_TOPIC='Teach me in three beats how one artificial neuron computes its output from weighted inputs.';

export default function ChapterStream({topic,replay}:{topic?:string;replay?:string}){
 const[plan,setPlan]=useState<Plan|null>(null);
 const[chapters,setChapters]=useState<LiveChapter[]>([]);
 const[active,setActive]=useState(0);
 const[status,setStatus]=useState('Starting a streaming lesson…');
 const[error,setError]=useState('');
 const[done,setDone]=useState(false);
 const[started]=useState(()=>Date.now());
 const[elapsed,setElapsed]=useState(0);
 const[snapshot,setSnapshot]=useState(initialLiveSnapshot());
 const[checks,setChecks]=useState<Record<string,Check>>({});
 const[gateQueue,setGateQueue]=useState<LiveChapter[]>([]);
 const[gateTarget,setGateTarget]=useState<LiveChapter|null>(null);
 const[gateDrawing,setGateDrawing]=useState(false);

 useEffect(()=>{const timer=setInterval(()=>setElapsed(Math.round((Date.now()-started)/1000)),1000);return()=>clearInterval(timer)},[started]);
 useEffect(()=>{
  let source:EventSource|null=null,cancelled=false;
  if(replay){
   void api<LiveLesson>(`live/stream-lesson/${replay}`).then(lesson=>{
    if(cancelled)return;
    setPlan({title:lesson.title,question:lesson.question,representation:lesson.representation||'',
     example:lesson.example||{title:'',description:'',icon:'app'},
     beats:lesson.chapters.map(c=>({id:c.id,title:c.title,teaching:c.teaching,
      layout:c.visual?.layout||'diagram'}))});
    setChapters(lesson.chapters);setActive(lesson.chapters.length-1);setDone(true);
    setGateQueue(lesson.chapters);
    setStatus(`Replay of a completed stream · ${lesson.duration.toFixed(1)}s`);
   }).catch((err:Error)=>setError(err.message));
   return()=>{cancelled=true};
  }
  void api<{id:string}>('live/stream',{question:topic||DEFAULT_TOPIC}).then(job=>{
   if(cancelled)return;
   source=new EventSource(`/api/visual/live/stream/${job.id}`);
   source.onmessage=event=>{
    let payload:StreamEvent;
    try{payload=JSON.parse(event.data)}catch{return}
    if(payload.type==='ping')return;
    if(payload.type==='stage')setStatus(payload.stage||'Working…');
    if(payload.type==='plan'){
     setPlan({title:payload.title||'',question:payload.question||'',representation:payload.representation||'',
      example:payload.example||{title:'',description:'',icon:'app'},beats:payload.beats||[]});
     setStatus('Plan ready; directing the first chapter…');
    }
    if(payload.type==='chapter'&&payload.chapter){
     setChapters(previous=>[...previous,payload.chapter!]);
     setGateQueue(previous=>[...previous,payload.chapter!]);
     setStatus(`Chapter ${(payload.index||0)+1} authored in ${payload.elapsed??elapsed}s · checking frame`);
    }
    if(payload.type==='error'){setError(payload.message||'The stream stopped.');source?.close();}
    if(payload.type==='done'){setDone(true);setStatus('Stream authored; checking each chapter frame');source?.close();}
   };
   source.onerror=()=>{if(!done)setStatus('Stream connection closed; waiting for the final event…')};
  }).catch((err:Error)=>setError(err.message));
  return()=>{cancelled=true;source?.close()};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [replay]);
 useEffect(()=>{if(chapters.length)setActive(chapters.length-1)},[chapters.length]);

 const current=chapters[active]||null;
 const currentCheck=current?checks[current.id]:undefined;
 useEffect(()=>{if(current)setSnapshot({...initialLiveSnapshot(),time:current.finishedAt})},[current]);

 // Gate one chapter at a time on a hidden surface, so switching the visible
 // chapter cannot invalidate the SVG being checked.
 useEffect(()=>{
  if(gateTarget||!gateQueue.length)return;
  setGateTarget(gateQueue[0]);
  setGateQueue(previous=>previous.slice(1));
  setGateDrawing(false);
 },[gateTarget,gateQueue]);
 useEffect(()=>{setGateDrawing(false)},[gateTarget?.id]);
 useEffect(()=>{
  if(!gateTarget||!gateDrawing)return;
  let alive=true;
  const run=async()=>{
   setChecks(previous=>({...previous,[gateTarget.id]:{status:'checking',findings:[]}}));
   await new Promise(resolve=>setTimeout(resolve,300));
   const svg=document.querySelector<SVGSVGElement>('.stream-gate-surface svg.live-stage-svg');
   if(!svg){
    if(alive)setChecks(previous=>({...previous,[gateTarget.id]:{status:'error',findings:[],message:'The gate surface did not mount.'}}));
    if(alive){setGateTarget(null);setGateDrawing(false);}
    return;
   }
   try{
    const result=await api<{ok:boolean;findings:GateFinding[];errors?:number;warnings?:number}>('live/check',{svg:svg.outerHTML,chapter:gateTarget.id});
    if(alive)setChecks(previous=>({...previous,[gateTarget.id]:{status:result.ok?'ready':'blocked',findings:result.findings||[]}}));
   }catch(err){
    if(alive)setChecks(previous=>({...previous,[gateTarget.id]:{status:'error',findings:[],message:(err as Error).message}}));
   }
   if(alive){setGateTarget(null);setGateDrawing(false);}
  };
  void run();
  return()=>{alive=false};
 },[gateTarget?.id,gateDrawing]);

 const lesson:LiveLesson|null=useMemo(()=>{
  if(!plan||!current)return null;
  return{id:'stream',kind:'live_generated',title:plan.title,question:plan.question,
   representation:plan.representation,duration:current.end,example:plan.example,
   chapters:[current],sources:[]};
 },[plan,current]);
 const gateLesson:LiveLesson|null=useMemo(()=>{
  if(!plan||!gateTarget)return null;
  return{id:'stream-gate',kind:'live_generated',title:plan.title,question:plan.question,
   representation:plan.representation,duration:gateTarget.end,example:plan.example,
   chapters:[gateTarget],sources:[]};
 },[plan,gateTarget]);

 const readyCount=chapters.filter(chapter=>checks[chapter.id]?.status==='ready').length;
 const blockedCount=chapters.filter(chapter=>checks[chapter.id]?.status==='blocked'||checks[chapter.id]?.status==='error').length;
 const checkingCount=chapters.filter(chapter=>checks[chapter.id]?.status==='checking').length;
 const pendingCount=chapters.length-readyCount-blockedCount-checkingCount;
 const headline=!plan?'Preparing a lesson stream':blockedCount?`${blockedCount} chapter${blockedCount===1?'':'s'} blocked`:
  checkingCount||gateTarget||gateQueue.length?`Checking chapter frames`:
  done&&readyCount===chapters.length?'Stream complete':`${readyCount} of ${chapters.length} passed`;
 const chapterState=(index:number)=>{
  if(index>=chapters.length)return 'waiting';
  return checks[chapters[index].id]?.status||'authored';
 };
 const stateLabel=(state:string)=>state==='checking'?'checking':state==='ready'?'ready':state==='blocked'?'blocked':state==='error'?'error':state==='authored'?'pending':'waiting';
 const note=error||(done&&!blockedCount&&!checkingCount&&!gateTarget&&!gateQueue.length&&readyCount===chapters.length
  ?'All chapters passed the browser gate.'
  :status);

 return <div className="stream-shell">
  <header className="stream-header">
   <div>
    <span>QWEEPS · CHAPTER STREAM</span>
    <h1>{plan?.title||'Preparing a lesson stream'}</h1>
   </div>
   <div className="stream-meta">
    <i className={blockedCount?'blocked':done&&!checkingCount&&!gateTarget&&!gateQueue.length?'done':''}/>
    <span>{headline}</span>
    <strong>{elapsed}s</strong>
   </div>
  </header>
  <div className="stream-body">
   <aside className="stream-side">
    <div className="stream-draft">Draft stream · gate runs per chapter</div>
    <h2>Chapters</h2>
    {plan?.beats.map((beat,index)=>{
     const state=chapterState(index),available=index<chapters.length;
     return <button key={beat.id} className={index===active&&available?'active':''} disabled={!available}
      onClick={()=>setActive(index)}>
      <span>{String(index+1).padStart(2,'0')}</span>
      <div><strong>{beat.title}</strong><small>{beat.teaching||'teaching'} · {beat.layout}</small></div>
      <em className={state}>{stateLabel(state)}</em>
     </button>;
    })}
    {!plan&&<p className="stream-note">{note}</p>}
    {plan&&<p className="stream-note">{note}</p>}
    {chapters.length>0&&<p className="stream-note stream-count">
      {readyCount} passed · {blockedCount} blocked · {pendingCount+checkingCount+(gateTarget?1:0)} pending
    </p>}
   </aside>
   <main className="stream-main">
    {lesson?<div className="stream-stage">
      <GeneratedStage lesson={lesson} snapshot={snapshot} focusRequest={0} update={setSnapshot}
       pause={()=>{}} onReady={()=>{}} interactive={false}/>
     </div>:<div className="stream-wait">
      <div className="stream-pulse"/>
      <h2>{error?'Stream stopped':'Building the first chapter'}</h2>
      <p>{error||status}</p>
      <p className="stream-wait-note">The plan arrives first, then each chapter is directed, validated and checked in Chrome before it is marked ready.</p>
     </div>}
    {current&&<div className="stream-caption">
      <span>{String(active+1).padStart(2,'0')} / {String(plan?.beats.length||chapters.length).padStart(2,'0')}</span>
      <p>{current.title}</p>
      <small>{current.start.toFixed(1)}s – {current.end.toFixed(1)}s</small>
    </div>}
    {currentCheck&&(currentCheck.status==='blocked'||currentCheck.status==='error')&&
     <div className="stream-findings">
      <strong>{currentCheck.status==='blocked'?'Blocked by the browser gate':'Gate error'}</strong>
      {currentCheck.message&&<p>{currentCheck.message}</p>}
      <ul>
       {currentCheck.findings.slice(0,8).map((finding,index)=>
        <li key={index}><span>{finding.severity||'info'}</span> <code>{finding.code||'finding'}</code> {finding.message}</li>)}
      </ul>
     </div>}
   </main>
  </div>
  {gateLesson&&<div className="stream-gate-surface" aria-hidden="true">
   <GeneratedStage lesson={gateLesson} snapshot={{...initialLiveSnapshot(),time:gateTarget!.finishedAt}}
    focusRequest={0} update={()=>{}} pause={()=>{}} onReady={setGateDrawing} interactive={false}/>
  </div>}
 </div>;
}
