import {useCallback,useEffect,useRef,useState} from 'react';
import {RemixApp,REMIX_ENGINE_REVISION,compileSourceCodeToWalkthrough,getInitialQweepsRepoWalkthrough,type RemixBundle} from './runtime.js';
import {currentBundle} from './bundleRevision';
import type {LiveLesson} from '../../lessonTypes';
import './remix.css';

function importedBundle(lesson?:LiveLesson):RemixBundle|undefined{
 if(!lesson)return undefined;
 if(/qweeps/i.test(lesson.title))return getInitialQweepsRepoWalkthrough();
 const files=lesson.architecture?.codeFiles||[];
 if(!files.length)return undefined;
 return compileSourceCodeToWalkthrough({title:lesson.title,fileName:files[0].file,sourceCode:files.map(f=>f.lines.map(l=>l.text).join('\n')).join('\n\n'),sampleInput:lesson.question});
}
export default function RemixWorkspace({legacyLesson}:{legacyLesson?:LiveLesson}){
 const[loaded,setLoaded]=useState<{bundle?:RemixBundle}|null>(null),[error,setError]=useState('');
 const saveVersion=useRef(0),pendingSave=useRef(Promise.resolve());
 useEffect(()=>{let alive=true;const id=new URLSearchParams(location.search).get('walkthrough');
  if(!id){setLoaded({bundle:importedBundle(legacyLesson)});return;}
  void fetch('/api/architecture/walkthroughs/'+encodeURIComponent(id)).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);if(alive)setLoaded({bundle:currentBundle(body.bundle)});}).catch(e=>{if(alive)setError(String(e.message));});
  return()=>{alive=false;};
 },[legacyLesson]);
 const save=useCallback((bundle:RemixBundle)=>{const version=++saveVersion.current;
  pendingSave.current=pendingSave.current.catch(()=>{}).then(async()=>{
   const response=await fetch('/api/architecture/walkthroughs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bundle:{...bundle,engineRevision:REMIX_ENGINE_REVISION}})});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not save the architecture.');
   if(version===saveVersion.current){history.replaceState(null,'','/?architecture=1&walkthrough='+body.id);setError('');}
  }).catch(e=>{if(version===saveVersion.current)setError(e.message);});
 },[]);
 if(!loaded)return <div className="qweeps-remix grid h-[100dvh] place-items-center">{error||'Opening architecture…'}</div>;
 return <div className="qweeps-remix antialiased"><RemixApp initialBundle={loaded.bundle} initialCompilerOpen={new URLSearchParams(location.search).get('compile')==='1'} onBundleChange={save} onExit={()=>{location.href='/?home=1';}}/>{error&&<div role="status" className="fixed bottom-28 right-4 z-50 rounded border border-[#E0BE72] bg-[#142B25] p-3 text-sm">{error}</div>}</div>;
}
