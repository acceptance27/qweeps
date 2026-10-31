import React,{useEffect,useMemo,useState} from 'react';
import SceneStage from './SceneStage';
import {compileSceneProgram,type SceneProgram} from './sceneProgram';
import './live.css';

export default function ModelScenePreview(){
 const[program,setProgram]=useState<SceneProgram|null>(null),[error,setError]=useState(''),[done,setDone]=useState(false);
 useEffect(()=>{void fetch('/live/model-scene.json').then(r=>r.json()).then(setProgram).catch(e=>setError(String(e)));},[]);
 const compiled=useMemo(()=>program?compileSceneProgram(program):null,[program]);
 return <div className="scene-shell">
  <header className="scene-header">
   <div><span>QWEEPS · MODEL-AUTHORED SCENE · COMPOUND IR</span><h1>{program?.title||'Loading model scene'}</h1><p>Muse output → compiler hulls/slots → settled poster</p></div>
   <div className="scene-meta"><strong>{compiled?(compiled.ok?'PASS':'FAIL'):'…'}</strong><span>{compiled?`${compiled.stats.compounds} compounds · ${compiled.stats.actions} actions`:''}</span><em>{done?'settled':compiled?.ok?'playing':'checking'}</em></div>
  </header>
  <div className="scene-stage-wrap">
   {error?<pre style={{color:'#e39a84'}}>{error}</pre>:compiled?.scene?<SceneStage scene={compiled.scene} onComplete={()=>setDone(true)}/>:<pre style={{color:'#9bb5ba'}}>{compiled?JSON.stringify(compiled.findings,null,1):'Loading…'}</pre>}
  </div>
  <footer className="scene-footer"><span style={{font:'11px Arial',color:'#9bb5ba'}}>Unedited Muse program; compiled and gated by the same P1 path as the reference.</span></footer>
 </div>;
}
