import React,{useEffect,useMemo,useState} from 'react';
import {api} from '../learning/types';
import {initialLiveSnapshot} from './geometry';
import GeneratedStage from './GeneratedStage';
import type {LiveChapter,LiveLesson} from './lessonTypes';
import './live.css';

type Beat={id:string;title:string;teaching?:string;layout:string};
type Plan={title:string;question:string;representation:string;example:{title:string;description:string;icon:string};beats:Beat[]};
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
     setStatus(`Chapter ${(payload.index||0)+1} ready in ${payload.elapsed??elapsed}s`);
    }
    if(payload.type==='error'){setError(payload.message||'The stream stopped.');source?.close();}
    if(payload.type==='done'){setDone(true);setStatus(`Stream complete in ${payload.elapsed??elapsed}s`);source?.close();}
   };
   source.onerror=()=>{if(!done)setStatus('Stream connection closed; waiting for the final event…')};
  }).catch((err:Error)=>setError(err.message));
  return()=>{cancelled=true;source?.close()};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [replay]);
 useEffect(()=>{if(chapters.length)setActive(chapters.length-1)},[chapters.length]);

 const current=chapters[active]||null;
 useEffect(()=>{if(current)setSnapshot({...initialLiveSnapshot(),time:current.finishedAt})},[current]);
 const lesson:LiveLesson|null=useMemo(()=>{
  if(!plan||!current)return null;
  return{id:'stream',kind:'live_generated',title:plan.title,question:plan.question,
   representation:plan.representation,duration:current.end,example:plan.example,
   chapters:[current],sources:[]};
 },[plan,current]);

 return <div className="stream-shell">
  <header className="stream-header">
   <div>
    <span>QWEEPS · CHAPTER STREAM</span>
    <h1>{plan?.title||'Preparing a lesson stream'}</h1>
   </div>
   <div className="stream-meta">
    <i className={done?'done':''}/>
    <span>{done?'Complete':`${chapters.length} chapter${chapters.length===1?'':'s'} ready`}</span>
    <strong>{elapsed}s</strong>
   </div>
  </header>
  <div className="stream-body">
   <aside className="stream-side">
    <div className="stream-draft">Draft stream · not frame-reviewed</div>
    <h2>Chapters</h2>
    {plan?.beats.map((beat,index)=>{
     const ready=index<chapters.length;
     return <button key={beat.id} className={index===active&&ready?'active':''} disabled={!ready}
      onClick={()=>setActive(index)}>
      <span>{String(index+1).padStart(2,'0')}</span>
      <div><strong>{beat.title}</strong><small>{beat.teaching||'teaching'} · {beat.layout}</small></div>
      <em>{ready?'ready':'waiting'}</em>
     </button>;
    })}
    {!plan&&<p className="stream-note">{status}</p>}
    {plan&&<p className="stream-note">{error||status}</p>}
    {chapters.length>0&&<p className="stream-note stream-count">{chapters.length} of {plan?.beats.length||'?'} directed.</p>}
   </aside>
   <main className="stream-main">
    {lesson?<div className="stream-stage">
      <GeneratedStage lesson={lesson} snapshot={snapshot} focusRequest={0} update={setSnapshot}
       pause={()=>{}} onReady={()=>{}} interactive={false}/>
     </div>:<div className="stream-wait">
      <div className="stream-pulse"/>
      <h2>{error?'Stream stopped':'Building the first chapter'}</h2>
      <p>{error||status}</p>
      <p className="stream-wait-note">The plan arrives first, then each chapter is directed, validated and appended while you watch.</p>
     </div>}
    {current&&<div className="stream-caption">
      <span>{String(active+1).padStart(2,'0')} / {String(plan?.beats.length||chapters.length).padStart(2,'0')}</span>
      <p>{current.title}</p>
      <small>{current.start.toFixed(1)}s – {current.end.toFixed(1)}s</small>
    </div>}
   </main>
  </div>
 </div>;
}
