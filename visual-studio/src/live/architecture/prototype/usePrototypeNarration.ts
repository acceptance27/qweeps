import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../../../learning/types';
import {NarrationTransport} from '../../../learning/NarrationTransport';
import type {LiveLesson} from '../../lessonTypes';
import type {Step} from './types/lesson';

export function usePrototypeNarration(lesson:LiveLesson,steps:Step[],stepIndex:number,playhead:number,playing:boolean,voice:boolean,scope:string|null,isReference:boolean,pause:()=>void){
 const [status,setStatus]=useState('');
 const transport=useRef<NarrationTransport|null>(null);
 const latest=useRef({playhead,steps,stepIndex,scope});latest.current={playhead,steps,stepIndex,scope};
 const continuous=!isReference&&!scope?lesson.audioTrack:undefined;
 const step=steps[stepIndex],key=continuous?.key||step.narration;
 const anchor=steps.slice(0,stepIndex).reduce((n,s)=>n+s.duration,0);
 const pending=useRef(false);
 useEffect(()=>()=>transport.current?.dispose(),[]);
 useEffect(()=>{
  if(!voice||!playing){pending.current=false;transport.current?.pause();return;}
  if(!transport.current)transport.current=new NarrationTransport(async text=>(await api<{url:string}>('narration',{text})).url,()=>{});
  const player=transport.current;
  if(continuous)player.seed(continuous.key,continuous.url);
  let active=true;pending.current=true;setStatus('Preparing narration…');
  void player.prepare(key).then(()=>{
   if(!active)return;
   const seconds=continuous?latest.current.playhead:Math.max(0,(latest.current.playhead-anchor)/step.duration*player.duration);
   pending.current=false;setStatus('');return player.playFrom(seconds);
  }).catch(e=>{if(active){pending.current=false;setStatus((e as Error).message||'Narration unavailable');pause();}});
  return()=>{active=false;pending.current=false;player.pause();};
 },[voice,playing,key,scope,lesson.id]);
 const clock=useCallback(()=>{
  if(!voice)return null;
  const player=transport.current,state=latest.current;
  if(pending.current||!player?.isReady)return state.playhead;
  if(continuous)return player.position;
  const start=state.steps.slice(0,state.stepIndex).reduce((n,s)=>n+s.duration,0),duration=state.steps[state.stepIndex].duration;
  return start+(player.position/Math.max(.01,player.duration))*duration+(player.position>=player.duration-.025?.01:0);
 },[voice,continuous]);
 return{clock,status};
}
