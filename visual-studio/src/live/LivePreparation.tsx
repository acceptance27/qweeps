import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../learning/types';
import {initialLiveSnapshot} from './geometry';
import type {LiveJob,LiveLesson} from './lessonTypes';
import GeneratedStage from './GeneratedStage';

const afterPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
let fontData:Promise<string>|null=null;
async function capture(svg:SVGSVGElement){
 const r=svg.getBoundingClientRect(),clone=svg.cloneNode(true) as SVGSVGElement;
 clone.setAttribute('width',String(r.width));clone.setAttribute('height',String(r.height));clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 fontData??=fetch('/live/teaching-serif.ttf').then(r=>r.arrayBuffer()).then(buffer=>{let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);return btoa(binary);});
 const style=clone.querySelector('style');if(style)style.textContent=`@font-face{font-family:QweepsTeachingSerif;src:url(data:font/ttf;base64,${await fontData}) format('truetype')}`;
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
 try{const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Could not inspect the browser illustration.'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=Math.round(r.width);canvas.height=Math.round(r.height);const ctx=canvas.getContext('2d')!;ctx.fillStyle='#071117';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.94).split(',')[1];
 }finally{URL.revokeObjectURL(url);}
}
export default function LivePreparation({jobId,onReady,onCancel,onRetry}:{jobId:string;onReady:(lesson:LiveLesson)=>void;onCancel:()=>void;onRetry?:(job:LiveJob)=>void}){
 const[job,setJob]=useState<LiveJob|null>(null),[error,setError]=useState(''),[drawingReady,setDrawingReady]=useState(false),[snapshot,setSnapshot]=useState(initialLiveSnapshot),[captureStatus,setCaptureStatus]=useState('');
 const sheet=useRef<HTMLDivElement>(null),reviewed=useRef(''),completed=useRef(false),callback=useRef(onReady);callback.current=onReady;
 const candidate=useMemo(()=>job?.candidate,[job?.id,job?.revision,job?.status==='awaiting_review']);
 useEffect(()=>{let alive=true,pending=false;const poll=async()=>{if(pending||completed.current)return;pending=true;try{const result=await api<LiveJob>(`live/jobs/${jobId}`);if(!alive)return;setJob(result);if(result.status==='ready'){const lesson=await api<LiveLesson>(`live/lessons/${result.lessonId}`);if(alive){completed.current=true;callback.current(lesson);}}else if(result.status==='failed')setError(result.error||'Lesson preparation failed.');}catch(e){if(alive)setError((e as Error).message);}finally{pending=false;}};
  void poll();const id=setInterval(poll,1200);return()=>{alive=false;clearInterval(id);};},[jobId]);
 useEffect(()=>{if(job?.status!=='awaiting_review'||!candidate||!drawingReady)return;const key=jobId+':'+job.revision;if(reviewed.current===key)return;reviewed.current=key;let cancelled=false;
  async function inspect(){try{await document.fonts.ready;const frames=[];for(let i=0;i<candidate!.chapters.length;i++){const c=candidate!.chapters[i];const positions=c.visual?.layout==='diagram'?['early','middle','finished'] as const:['early','finished'] as const;for(const position of positions){if(cancelled)return;const time=position==='finished'?c.finishedAt:position==='middle'?(c.start+c.finishedAt)/2:c.start+Math.min(3,(c.end-c.start)*.15);setCaptureStatus(`Checking illustration ${i+1} of ${candidate!.chapters.length}`);setSnapshot({...initialLiveSnapshot(),time});await afterPaint();const svg=sheet.current?.querySelector('svg.live-stage-svg') as SVGSVGElement|null;if(!svg)throw new Error('The live review surface did not mount.');frames.push({chapter:i,position,time,base64:await capture(svg)});}}
   if(!cancelled){setCaptureStatus('Reviewing the explanation against its sources…');const layoutIssues=Array.from(sheet.current?.querySelectorAll('[data-layout-issue]')||[]).map(e=>({beat:e.closest('[data-chapter]')?.getAttribute('data-chapter'),problem:e.getAttribute('data-layout-issue')}));await api('live/review',{jobId,revision:job!.revision,frames,layoutIssues});}
  }catch(e){if(!cancelled)setError((e as Error).message);}}
  void inspect();return()=>{cancelled=true;};
 },[job?.status,job?.revision,candidate,drawingReady,jobId]);
 return <div className="live-preparation" role="dialog" aria-label="Preparing your live lesson"><div className="live-preparation-card"><span>QWEEPS · LIVE VISUAL LEARNING</span><h2>{error?'Preparation stopped':'Building your explanation'}</h2><p role="status">{error||(job?.status==='awaiting_review'?captureStatus:'')||job?.stage||'Reading your request…'}</p><p className="live-preparation-note">Source material → teaching plan → illustrations and motion → visual review</p>{error&&job?.status==='failed'&&onRetry&&<button onClick={()=>onRetry(job)}>{job.canResume?'Resume saved preparation':'Try again'}</button>}<button onClick={onCancel}>{error?'Return':'Cancel preparation'}</button></div>
  {candidate&&<div ref={sheet} className="live-review-surface" aria-hidden="true"><GeneratedStage lesson={candidate} snapshot={snapshot} focusRequest={0} update={setSnapshot} pause={()=>{}} onReady={setDrawingReady} interactive={false}/></div>}
 </div>;
}
