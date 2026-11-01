import React,{useEffect,useState} from 'react';
import {NativeLessonCanvas,type NativeFrame} from './NativeLessonCanvas';
import {api,initialSnapshot,type Snapshot} from './types';
import {MASSLESS_MANIM_PLAN} from './masslessManimPlan';
import './learning.css';

export default function ManimTest(){
 const[sessionId,setSessionId]=useState<string|null>(null);
 const[snapshot,setSnapshot]=useState<Snapshot>(()=>({...initialSnapshot('generated'),plan:MASSLESS_MANIM_PLAN,time:0}));
 const[playing,setPlaying]=useState(true),[ready,setReady]=useState(false),[error,setError]=useState(''),[frame,setFrame]=useState<NativeFrame|null>(null);
 useEffect(()=>{void api<{sessionId:string}>('session',{}).then(r=>setSessionId(r.sessionId)).catch(e=>setError(String(e)));},[]);
 useEffect(()=>{
  if(!playing)return;let raf=0;let previous=performance.now();
  const tick=(now:number)=>{const dt=Math.min(.08,(now-previous)/1000);previous=now;setSnapshot(s=>{const next=Math.min(MASSLESS_MANIM_PLAN.beats[0].duration,s.time+dt);if(next>=MASSLESS_MANIM_PLAN.beats[0].duration)setPlaying(false);return{...s,time:next};});raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[playing]);
 const duration=MASSLESS_MANIM_PLAN.beats[0].duration;
 return <main className="native-production-page">
  <header className="native-production-header"><div><span>QWEEPS · NATIVE MANIMGL TEST</span><h1>Massless matter · one live native beat</h1><p>ManimGL frames streamed from a Python process, not SVG.</p></div><div className="native-production-meta"><strong>{ready?'READY':'RENDERING'}</strong><span>{frame?.renderMs?`${frame.renderMs} ms/frame`:'warming up'}</span><em>{snapshot.time.toFixed(1)} / {duration}s</em></div></header>
  {error&&<div className="native-production-error">{error}</div>}
  <div className="native-production-stage"><NativeLessonCanvas sessionId={sessionId} snapshot={snapshot} update={setSnapshot} pause={()=>setPlaying(false)} onReady={setReady} onFrame={setFrame}/></div>
  <footer className="native-production-transport"><button onClick={()=>{if(snapshot.time>=duration)setSnapshot(s=>({...s,time:0}));setPlaying(p=>!p);}}>{playing?'Pause':'Play'}</button><button onClick={()=>{setSnapshot(s=>({...s,time:0}));setPlaying(false);}}>Restart</button><span>{ready?'Native ManimGL / OpenGL':'Preparing ManimGL…'}</span></footer>
 </main>;
}
