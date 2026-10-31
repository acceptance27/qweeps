import React,{useMemo,useState} from 'react';
import SceneStage from './SceneStage';
import {REFERENCE_PROGRAM} from './referenceProgram';
import {compileSceneProgram} from './sceneProgram';
import './live.css';

export default function ReferenceScene(){
 const compiled=useMemo(()=>compileSceneProgram(REFERENCE_PROGRAM),[]);
 const[done,setDone]=useState(false);
 return <div className="scene-shell">
  <header className="scene-header">
   <div><span>QWEEPS · REFERENCE POSTER · COMPOUND IR</span><h1>Same route, changed rule</h1><p>hull morph + settle slots + retained dock</p></div>
   <div className="scene-meta"><strong>{compiled.ok?'PASS':'FAIL'}</strong><span>{compiled.stats.compounds} cards · {compiled.stats.actions} actions</span><em>{done?'settled':'playing'}</em></div>
  </header>
  <div className="scene-stage-wrap">
   {compiled.scene?<SceneStage scene={compiled.scene} onComplete={()=>setDone(true)}/>:<pre style={{color:'#e39a84',whiteSpace:'pre-wrap'}}>{JSON.stringify(compiled.findings,null,1)}</pre>}
  </div>
  <footer className="scene-footer"><span style={{font:'11px Arial',color:'#9bb5ba'}}>Reference only: hand-authored program, compiled by the same final-state gate the model must pass.</span></footer>
 </div>;
}
