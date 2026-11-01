import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../learning/types';
import VisualBeatStage from './VisualBeatStage';
import type {LiveChapter} from './lessonTypes';
import './live.css';

type Beat={id:string;title:string;teaching:string;status:'waiting'|'generating'|'repairing'|'ready'|'error';chapter?:LiveChapter;seconds?:number;attempts?:number;error?:string};

function Tile({beat}:{beat:Beat}){
 return <article className={`factory-tile ${beat.status}`}>
  <header>
   <div><span>{beat.teaching}</span><h2>{beat.title}</h2></div>
   <div className="factory-tile-meta">
    <strong>{beat.status==='ready'?'PASS':beat.status==='error'?'FAIL':beat.status==='repairing'?'REPAIR':beat.status==='generating'?'WRITING':'WAIT'}</strong>
    <span>{beat.seconds!=null?`${beat.seconds}s`:'—'}{beat.attempts?` · try ${beat.attempts}`:''}</span>
   </div>
  </header>
  <div className="factory-stage">
   {beat.chapter?<VisualBeatStage chapter={beat.chapter}/>:<div className="factory-placeholder">{beat.error??(beat.status==='generating'?'Model is writing this beat…':'Waiting for the model…')}</div>}
  </div>
  <footer>
   <span>{beat.chapter?`${beat.chapter.visual?.nodes.length??0} nodes · ${beat.chapter.visual?.layout??'visual'} · takeaway`:'The existing LiveVisual renderer owns the cards.'}</span>
   {beat.status==='ready'&&<span className="ok">existing card renderer</span>}
  </footer>
 </article>;
}

export default function BeatFactory(){
 const[beats,setBeats]=useState<Beat[]>([]),[stage,setStage]=useState('Starting the factory…'),[model,setModel]=useState(''),[total,setTotal]=useState<number|null>(null),[error,setError]=useState(''),[running,setRunning]=useState(false);
 const source=useRef<EventSource|null>(null);
 const start=async()=>{
  source.current?.close();setBeats([]);setTotal(null);setError('');setStage('Starting the factory…');setRunning(true);
  try{
   const job=await api<{id:string}>('visual-beats/start',{});
   const stream=new EventSource(`/api/visual/visual-beats/stream/${job.id}`);source.current=stream;
   stream.onmessage=(message)=>{
    const event=JSON.parse(message.data);
    if(event.type==='start'){setModel(event.model||'');setBeats((event.beats||[]).map((beat:Omit<Beat,'status'>)=>({...beat,status:'waiting'})));setStage('Briefs sent; waiting for the first beat…');}
    else if(event.type==='beat_start'){setBeats(list=>list.map(beat=>beat.id===event.id?{...beat,status:'generating'}:beat));setStage(`Writing ${event.teaching} beat…`);}
    else if(event.type==='repair'){setBeats(list=>list.map(beat=>beat.id===event.id?{...beat,status:'repairing'}:beat));setStage('The schema gate rejected a beat; one repair attempt…');}
    else if(event.type==='visual'){setBeats(list=>list.map(beat=>beat.id===event.id?{...beat,status:'ready',chapter:event.chapter,seconds:event.seconds,attempts:event.attempts}:beat));setStage(`Beat ready: ${event.title}`);}
    else if(event.type==='beat_error'){setBeats(list=>list.map(beat=>beat.id===event.id?{...beat,status:'error',error:event.error,seconds:event.seconds}:beat));setStage(`Beat failed: ${event.title}`);}
    else if(event.type==='done'){setTotal(event.total);setRunning(false);setStage('All five beats finished.');stream.close();}
    else if(event.type==='error'){setError(event.error);setRunning(false);stream.close();}
   };
   stream.onerror=()=>{if(running)setError('The beat stream disconnected.');};
  }catch(e){setError((e as Error).message);setRunning(false);}
 };
 useEffect(()=>{void start();return()=>source.current?.close();},[]);
 const done=useMemo(()=>beats.filter(beat=>beat.status==='ready').length,[beats]);
 return <div className="factory-shell">
  <header className="factory-header">
   <div><span>QWEEPS · BEAT FACTORY · LIVEVISUAL STREAM</span><h1>Five beats, written by the model</h1><p>Slot JSON → existing LiveVisual renderer → old card design.</p></div>
   <div className="factory-meta"><strong>{done}/{beats.length||5}</strong><span>{model||'model'}</span><em>{total!=null?`${total}s total`:running?'streaming':'idle'}</em></div>
  </header>
  <div className="factory-status"><span className={error?'bad':'ok'}>{error||stage}</span><button onClick={()=>void start()} disabled={running}>{running?'Running…':'Run again'}</button></div>
  <div className="factory-progress">{beats.map(beat=><span key={beat.id} className={beat.status}>{beat.status==='ready'?'✓ ':beat.status==='error'?'× ':''}{beat.teaching}</span>)}</div>
  <div className="factory-grid">{beats.map(beat=><Tile key={beat.id} beat={beat}/>)}</div>
  {!beats.length&&<div className="factory-empty">Waiting for the model to return the first LiveVisual beat…</div>}
 </div>;
}
