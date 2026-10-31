import React,{useEffect,useMemo} from 'react';
import SceneStage from './SceneStage';
import {compileSceneProgram} from './sceneProgram';
import {clamp,type LiveSnapshot} from './geometry';
import type {LiveChapter} from './lessonTypes';

export default function SceneChapterStage({chapter,time,interactive=true,pause,update,onReady,selected}:{
 chapter:LiveChapter;time:number;interactive?:boolean;pause:()=>void;
 update:(fn:(s:LiveSnapshot)=>LiveSnapshot)=>void;onReady:(v:boolean)=>void;selected:string[];
}){
 const compiled=useMemo(()=>chapter.scene?compileSceneProgram(chapter.scene):null,[chapter.scene]);
 const ok=!!compiled?.ok;
 useEffect(()=>{onReady(ok);return()=>onReady(false);},[ok]);
 if(!compiled?.ok)return <div className="live-loading" role="alert">{compiled?`Scene gate failed: ${compiled.findings.filter(f=>f.severity==='error').map(f=>f.code).join(', ')}`:'Scene missing'}</div>;
 const scene=compiled.scene!;
 const local=clamp(time-chapter.start,0,scene.duration);
 const select=(id:string)=>{
  if(!interactive)return;
  const role=Object.keys(chapter.roles).find(key=>id===key||id.startsWith(`${key}-`))??id;
  pause();update(s=>({...s,selected:[role],focus:role,region:null}));
 };
 return <div className="live-stage-surface scene-chapter-surface">
  <SceneStage key={chapter.id} scene={scene} time={local} playing={false} onComplete={()=>{}} onSelect={select} selected={selected}/>
 </div>;
}
