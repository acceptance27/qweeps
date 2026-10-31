import React,{memo,useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../learning/types';
import {initialLiveSnapshot} from './geometry';
import GeneratedStage from './GeneratedStage';
import type {LiveChapter,LiveLesson} from './lessonTypes';
import './live.css';

type Beat={id:string;title:string;teaching?:string;layout:string};
type Plan={title:string;question:string;representation:string;example:{title:string;description:string;icon:string};beats:Beat[]};
type GateFinding={code?:string;severity?:string;message?:string;selector?:string;section?:string};
type Check={status:'checking'|'ready'|'blocked'|'error';findings:GateFinding[];message?:string;at?:number};
type StreamEvent={
 type:'stage'|'plan'|'chapter'|'done'|'error'|'ping';
 stage?:string;title?:string;question?:string;representation?:string;example?:Plan['example'];beats?:Beat[];
 index?:number;chapter?:LiveChapter;duration?:number;elapsed?:number;message?:string;lessonId?:string;chapters?:number;
};

const DEFAULT_TOPIC='Teach me in three beats how one artificial neuron computes its output from weighted inputs.';
const MAX_GATES=2;

const GateSurface=memo(function GateSurface({target,plan,onReady}:{
 target:LiveChapter;plan:Plan;onReady:(ready:boolean)=>void;
}){
 const lesson=useMemo<LiveLesson>(()=>({id:`stream-gate-${target.id}`,kind:'live_generated',
  title:plan.title,question:plan.question,representation:plan.representation,duration:target.end,
  example:plan.example,chapters:[target],sources:[]}),[target,plan]);
 const snapshot=useMemo(()=>({...initialLiveSnapshot(),time:target.finishedAt}),[target]);
 return <div data-gate={target.id} className="stream-gate-surface" aria-hidden="true">
  <GeneratedStage lesson={lesson} snapshot={snapshot} focusRequest={0} update={()=>{}}
   pause={()=>{}} onReady={onReady} interactive={false}/>
 </div>;
});

export default function ChapterStream({topic,replay,methods=false}:{topic?:string;replay?:string;methods?:boolean}){
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
 const[arrivals,setArrivals]=useState<Record<string,number>>({});
 const[gateQueue,setGateQueue]=useState<LiveChapter[]>([]);
 const[gateTargets,setGateTargets]=useState<LiveChapter[]>([]);
 const[gateReady,setGateReady]=useState<Record<string,boolean>>({});
 const gateStarted=useRef<Set<string>>(new Set());
 const clock=()=>Math.round((Date.now()-started)/1000);

 useEffect(()=>{const timer=setInterval(()=>setElapsed(clock()),1000);return()=>clearInterval(timer)},[started]);
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
  void api<{id:string}>('live/stream',{question:topic||DEFAULT_TOPIC,methods}).then(job=>{
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
     setArrivals(previous=>({...previous,[payload.chapter!.id]:payload.elapsed??clock()}));
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
 }, [replay,methods]);
 useEffect(()=>{if(chapters.length)setActive(chapters.length-1)},[chapters.length]);

 const current=chapters[active]||null;
 const currentCheck=current?checks[current.id]:undefined;
 useEffect(()=>{if(current)setSnapshot({...initialLiveSnapshot(),time:current.finishedAt})},[current]);

 // Fill two gate slots, active chapter first, then lesson order. A check does
 // not block the stream; later chapters are authored while these run.
 useEffect(()=>{
  const slots=MAX_GATES-gateTargets.length;
  if(slots<=0||!gateQueue.length)return;
  const order=new Map(chapters.map((chapter,index)=>[chapter.id,index]));
  const rank=(chapter:LiveChapter)=>chapter.id===current?.id?0:1+(order.get(chapter.id)??99);
  const take=[...gateQueue].sort((a,b)=>rank(a)-rank(b)).slice(0,slots);
  setGateTargets(previous=>[...previous,...take]);
  setGateQueue(previous=>previous.filter(chapter=>!take.some(target=>target.id===chapter.id)));
 },[gateTargets,gateQueue,chapters,current?.id]);

 // Each target gets its own hidden surface. Start its check only after that
 // surface has mounted and sought to the finished frame.
 useEffect(()=>{
  for(const target of gateTargets){
   if(checks[target.id]||gateStarted.current.has(target.id)||!gateReady[target.id])continue;
   gateStarted.current.add(target.id);
   void (async()=>{
    setChecks(previous=>({...previous,[target.id]:{status:'checking',findings:[]}}));
    await new Promise(resolve=>setTimeout(resolve,250));
    const svg=document.querySelector<SVGSVGElement>(`[data-gate="${target.id}"] svg.live-stage-svg`);
    if(!svg){
     setChecks(previous=>({...previous,[target.id]:{status:'error',findings:[],message:'The gate surface did not mount.',at:clock()}}));
    }else{
     try{
      const result=await api<{ok:boolean;findings:GateFinding[]}>(`live/check`,{svg:svg.outerHTML,chapter:target.id});
      setChecks(previous=>({...previous,[target.id]:{status:result.ok?'ready':'blocked',findings:result.findings||[],at:clock()}}));
     }catch(err){
      setChecks(previous=>({...previous,[target.id]:{status:'error',findings:[],message:(err as Error).message,at:clock()}}));
     }
    }
    gateStarted.current.delete(target.id);
    setGateTargets(previous=>previous.filter(chapter=>chapter.id!==target.id));
    setGateReady(previous=>{const next={...previous};delete next[target.id];return next});
   })();
  }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[gateTargets,gateReady,checks]);

 const lesson:LiveLesson|null=useMemo(()=>{
  if(!plan||!current)return null;
  return{id:'stream',kind:'live_generated',title:plan.title,question:plan.question,
   representation:plan.representation,duration:current.end,example:plan.example,
   chapters:[current],sources:[]};
 },[plan,current]);


 const readyCount=chapters.filter(chapter=>checks[chapter.id]?.status==='ready').length;
 const blockedCount=chapters.filter(chapter=>checks[chapter.id]?.status==='blocked'||checks[chapter.id]?.status==='error').length;
 const checkingCount=chapters.filter(chapter=>checks[chapter.id]?.status==='checking').length;
 const pendingCount=chapters.length-readyCount-blockedCount-checkingCount;
 const headline=!plan?'Preparing a lesson stream':blockedCount?`${blockedCount} chapter${blockedCount===1?'':'s'} blocked`:
  checkingCount||gateTargets.length||gateQueue.length?`Checking chapter frames`:
  done&&readyCount===chapters.length?'Stream complete':`${readyCount} of ${chapters.length} passed`;
 const chapterState=(index:number)=>{
  if(index>=chapters.length)return 'waiting';
  return checks[chapters[index].id]?.status||'authored';
 };
 const stateLabel=(state:string)=>state==='checking'?'checking':state==='ready'?'ready':state==='blocked'?'blocked':state==='error'?'error':state==='authored'?'pending':'waiting';
 const note=error||(done&&!blockedCount&&!checkingCount&&!gateTargets.length&&!gateQueue.length&&readyCount===chapters.length
  ?'All chapters passed the browser gate.'
  :status);

 return <div className="stream-shell">
  <header className="stream-header">
   <div>
    <span>QWEEPS · CHAPTER STREAM</span>
    <h1>{plan?.title||'Preparing a lesson stream'}</h1>
   </div>
   <div className="stream-meta">
    <i className={blockedCount?'blocked':done&&!checkingCount&&!gateTargets.length&&!gateQueue.length?'done':''}/>
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
     const arrived=arrivals[beat.id],checked=checks[beat.id]?.at;
     return <button key={beat.id} className={index===active&&available?'active':''} disabled={!available}
      onClick={()=>setActive(index)}>
      <span>{String(index+1).padStart(2,'0')}</span>
      <div><strong>{beat.title}</strong><small>{beat.teaching||'teaching'} · {beat.layout}</small>
       {available&&<small className="stream-arrival">arrived {arrived??'…'}s{checked!==undefined?` · ready ${checked}s`:''}</small>}
      </div>
      <em className={state}>{stateLabel(state)}</em>
     </button>;
    })}
    {!plan&&<p className="stream-note">{note}</p>}
    {plan&&<p className="stream-note">{note}</p>}
    {chapters.length>0&&<p className="stream-note stream-count">
      {readyCount} passed · {blockedCount} blocked · {pendingCount+checkingCount} pending
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
  {plan&&gateTargets.map(target=><GateSurface key={target.id} target={target} plan={plan}
   onReady={ready=>setGateReady(previous=>previous[target.id]===ready?previous:{...previous,[target.id]:ready})}/>)}
 </div>;
}
