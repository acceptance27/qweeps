import React,{useState} from 'react';
import SceneStage from './SceneStage';
import {METHODS_SCENES} from './methodsScenes';
import './live.css';

export default function MethodsScenes(){
 const[index,setIndex]=useState(0),[playing,setPlaying]=useState(true),[finished,setFinished]=useState(false);
 const scene=METHODS_SCENES[index];
 const select=(next:number)=>{setIndex(next);setFinished(false);setPlaying(true);};
 const complete=()=>{if(index<METHODS_SCENES.length-1)setIndex(index+1);else{setFinished(true);setPlaying(false);}};
 return <div className="scene-shell">
  <header className="scene-header">
   <div><span>QWEEPS · EIGHT BEATS · SCENE GRAMMAR</span><h1>{scene.title}</h1><p>{scene.question}</p></div>
   <div className="scene-meta"><strong>{String(index+1).padStart(2,'0')} / {String(METHODS_SCENES.length).padStart(2,'0')}</strong><span>{scene.teaching}</span><em>{finished?'complete':playing?'playing':'paused'}</em></div>
  </header>
  <div className="scene-stage-wrap"><SceneStage key={scene.id} scene={scene} playing={playing} onComplete={complete}/></div>
  <footer className="scene-footer">
   <button onClick={()=>{setFinished(false);setPlaying(p=>!p);}}>{playing?'Pause':'Play'}</button>
   <button onClick={()=>select(0)}>Restart</button>
   <div className="scene-rail">
    {METHODS_SCENES.map((item,i)=><button key={item.id} className={i===index?'active':''} onClick={()=>select(i)}><span>{String(i+1).padStart(2,'0')}</span>{item.title}</button>)}
   </div>
  </footer>
 </div>;
}
