import React,{useEffect,useMemo,useRef,useState} from 'react';
import SceneStage from './SceneStage';
import {compileSceneProgram} from './sceneProgram';
import {METHOD_LABELS,METHOD_ORDER,METHOD_PROGRAMS} from './methodsPrograms';
import './live.css';

const SHAPES:Record<string,string>={
 comparison:'3 cards · shared criteria rows · conclusion',
 procedure:'3 step cards · rail · result',
 algorithm:'trace rows · state column · conclusion',
 narrative:'axis · dated stations · conclusion',
 recall:'route · three stations · mnemonic',
};

function currentGrammar(){
 const value=new URLSearchParams(window.location.search).get('g')??'comparison';
 return METHOD_ORDER.includes(value)?value:'comparison';
}

export default function MethodsPrograms(){
 const[grammar,setGrammar]=useState(currentGrammar),[settled,setSettled]=useState(false);
 const stageKey=useRef(0);const[,bump]=useState(0);
 const program=METHOD_PROGRAMS[grammar];
 const compiled=useMemo(()=>compileSceneProgram(program),[program]);
 const settle=()=>{const stage=(window as Window&{__sceneStage?:{timeline:{pause:()=>void;seek:(t:number)=>void;duration:()=>number}}}).__sceneStage;if(stage){stage.timeline.pause();stage.timeline.seek(stage.timeline.duration());setSettled(true);}};
 const replay=()=>{setSettled(false);stageKey.current+=1;bump(value=>value+1);};
 const choose=(next:string)=>{const url=new URL(window.location.href);url.searchParams.set('g',next);window.history.replaceState({},'',url);setGrammar(next);setSettled(false);stageKey.current+=1;};
 useEffect(()=>{const timer=window.setTimeout(settle,150);return()=>window.clearTimeout(timer);},[grammar]);
 return <div className="scene-shell">
  <header className="scene-header">
   <div><span>QWEEPS · METHOD BEATS · COMPOUND IR</span><h1>{program.title}</h1><p>{METHOD_LABELS[grammar]} · {SHAPES[grammar]}</p></div>
   <div className="scene-meta"><strong>{compiled.ok?'PASS':'FAIL'}</strong><span>{compiled.stats.compounds} compounds · {compiled.stats.slots} slots</span><em>{settled?'settled':compiled.ok?'playing':'checking'}</em></div>
  </header>
  <nav className="poster-tabs" aria-label="Method beat">
   {METHOD_ORDER.map(item=><button key={item} className={item===grammar?'active':''} onClick={()=>choose(item)}>{METHOD_LABELS[item]}</button>)}
  </nav>
  <div className="scene-stage-wrap">
   {compiled.scene?<SceneStage key={`${grammar}-${stageKey.current}`} scene={compiled.scene} onComplete={()=>setSettled(true)}/>:<pre style={{color:'#e39a84',whiteSpace:'pre-wrap'}}>{JSON.stringify(compiled.findings,null,1)}</pre>}
  </div>
  <footer className="scene-footer">
   <div style={{display:'flex',gap:8}}>
    <button className="poster-action" onClick={replay}>Replay</button>
    <button className="poster-action" onClick={settle}>Hold settled poster</button>
   </div>
   <span style={{font:'11px Arial',color:'#9bb5ba'}}>{compiled.stats.actions} actions · density {compiled.stats.density} slots/compound · hold {compiled.stats.hold}s · {compiled.stats.startsPer10s} starts/10s</span>
  </footer>
 </div>;
}
