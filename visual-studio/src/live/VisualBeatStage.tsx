import React,{useEffect,useMemo,useState} from 'react';
import GeneratedStage from './GeneratedStage';
import {initialLiveSnapshot} from './geometry';
import type {LiveChapter,LiveLesson} from './lessonTypes';

export default function VisualBeatStage({chapter}:{chapter:LiveChapter}){
 const[time,setTime]=useState(0);
 useEffect(()=>{
  let raf=0;const started=performance.now();const duration=chapter.end;
  const tick=(now:number)=>{const t=Math.min(duration,(now-started)/1000);setTime(t);if(t<duration)raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf);
 },[chapter]);
 const lesson=useMemo<LiveLesson>(()=>({
  id:`beat-${chapter.id}`,kind:'live_generated',title:chapter.title,question:chapter.question,duration:chapter.end,
  example:{title:'Illustrative case: one neuron',description:'A single unit with two inputs, a bias and a sigmoid output. Every beat uses the same case.',icon:'cpu'},
  chapters:[chapter],sources:[],
 }),[chapter]);
 const snapshot={...initialLiveSnapshot(),time};
 return <GeneratedStage lesson={lesson} snapshot={snapshot} focusRequest={0} update={()=>{}} pause={()=>{}} onReady={()=>{}}/>;
}
