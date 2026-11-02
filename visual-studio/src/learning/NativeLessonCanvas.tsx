import React,{useEffect,useRef,useState} from 'react';
import {api,Snapshot} from './types';import {productionDefaults} from './production';
type Bounds={id:string;x1:number;x2:number;y1:number;y2:number};
export type NativeFrame={revision?:string;expectedRevision?:string;ready:boolean;backend:string;time:number;renderMs:number;frames:number;camera:{x:number;y:number;width:number};bounds:Bounds[];experiment?:Record<string,unknown>};
type Props={sessionId:string|null;snapshot:Snapshot;update:(fn:(s:Snapshot)=>Snapshot)=>void;pause:()=>void;onReady:(ready:boolean)=>void;onFrame:(frame:NativeFrame)=>void};
export function NativeLessonCanvas({sessionId,snapshot,update,pause,onReady,onFrame}:Props){
 const image=useRef<HTMLImageElement>(null),latest=useRef(snapshot);latest.current=snapshot;const frame=useRef<NativeFrame|null>(null),last=useRef(''),drag=useRef<{kind:'region'|'pan';x:number;y:number;camera:Snapshot['camera']}|null>(null);
 const [frameNumber,setFrameNumber]=useState(0);
 const [error,setError]=useState(''),[ready,setReady]=useState(false),[region,setRegion]=useState<{left:number;top:number;width:number;height:number}|null>(null),[bounds,setBounds]=useState<Bounds[]>([]);
 const callbacks=useRef({onReady,onFrame});callbacks.current={onReady,onFrame};
 useEffect(()=>{if(!sessionId)return;let live=true,pending=false;last.current='';setReady(false);callbacks.current.onReady(false);
  const tick=async()=>{if(pending||!live)return;const s=latest.current;const state={lessonId:s.sceneId,plan:s.sceneId==='generated'?s.plan:undefined,time:s.time,experiment:s.sceneId==='generated'?{}:s.sceneId==='jose_rizal'?{focus:s.nativeFocus||''}:s.sceneId==='manim_production'?(s.production||productionDefaults):{},selected:s.selected,camera:s.camera};const encoded=JSON.stringify(state);if(encoded===last.current)return;pending=true;
   try{const result=await api<NativeFrame>('native/state',{sessionId,state});if(!live)return;if(result.ready){setFrameNumber(result.frames);frame.current=result;setBounds(result.bounds||[]);callbacks.current.onFrame(result);if(result.revision===result.expectedRevision&&Math.abs(result.time-s.time)<.15&&Object.entries(state.experiment).every(([key,value])=>result.experiment?.[key]===value)){setReady(true);callbacks.current.onReady(true);last.current=encoded;}}setError('');}
   catch(err){if(live){setError((err as Error).message);callbacks.current.onReady(false);}}finally{pending=false;}};
  void tick();const id=setInterval(tick,33);return()=>{live=false;clearInterval(id);callbacks.current.onReady(false);};
 },[sessionId]);
 useEffect(()=>{last.current='';callbacks.current.onReady(false);},[snapshot.production,snapshot.nativeFocus,snapshot.plan]);
 const point=(e:React.PointerEvent)=>{const b=image.current!.getBoundingClientRect(),width=Math.min(b.width,b.height*16/9),height=width*9/16;return{x:(e.clientX-b.left-(b.width-width)/2)/width*1280,y:(e.clientY-b.top-(b.height-height)/2)/height*720};};
 const begin=(e:React.PointerEvent)=>{if((e.target as HTMLElement).closest('button')||!ready)return;e.preventDefault();e.stopPropagation();pause();const p=point(e);const hits=(frame.current?.bounds||[]).filter(b=>p.x>=b.x1-4&&p.x<=b.x2+4&&p.y>=b.y1-4&&p.y<=b.y2+4).sort((a,b)=>(a.x2-a.x1)*(a.y2-a.y1)-(b.x2-b.x1)*(b.y2-b.y1));const hit=hits[0];if(e.button===0&&hit){update(s=>({...s,selected:[hit.id],region:null}));return;}drag.current={kind:e.button===2?'pan':'region',...p,camera:latest.current.camera};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const p=point(e);if(d.kind==='pan'){const c=d.camera||{x:0,y:0,zoom:1};update(s=>({...s,camera:{...c,x:c.x-(p.x-d.x)/1280*(frame.current?.camera.width||15),y:c.y+(p.y-d.y)/720*(frame.current?.camera.width||15)*9/16}}));}else{setRegion({left:Math.min(d.x,p.x)/1280*100,top:Math.min(d.y,p.y)/720*100,width:Math.abs(d.x-p.x)/1280*100,height:Math.abs(d.y-p.y)/720*100});}};
 const end=(e:React.PointerEvent)=>{const d=drag.current;if(d?.kind==='region'){const p=point(e),b={x1:Math.min(p.x,d.x),x2:Math.max(p.x,d.x),y1:Math.min(p.y,d.y),y2:Math.max(p.y,d.y)};update(s=>({...s,selected:[...new Set((frame.current?.bounds||[]).filter(h=>h.x2>=b.x1&&h.x1<=b.x2&&h.y2>=b.y1&&h.y1<=b.y2).map(h=>h.id))],region:b}));}drag.current=null;setRegion(null);};
 return <div className="native-production" onContextMenu={e=>e.preventDefault()} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setRegion(null);}} onWheel={e=>{pause();update(s=>({...s,camera:{...(s.camera||{x:0,y:0,zoom:1}),zoom:Math.max(.3,Math.min(3,(s.camera?.zoom||1)*(e.deltaY<0?1.1:.9)))}}));}}>
  {sessionId&&frameNumber>0&&<img ref={image} className="native-production-frame" src={`/api/visual/native/frame?sessionId=${sessionId}&frame=${frameNumber}`} alt="Live native Manim animation"/>}
  {!ready&&!error&&frameNumber===0&&<div className="native-loading">Preparing the native Manim scene…</div>}
  {error&&<div className="native-loading native-error">{error}</div>}
  {region&&<svg className="native-region-overlay" viewBox="0 0 1280 720"><rect x={region.left*12.8} y={region.top*7.2} width={region.width*12.8} height={region.height*7.2} stroke="#58c4dd" fill="#58c4dd" fillOpacity=".1"/></svg>}
  <div className="native-accessibility">{[...new Set(bounds.map(b=>b.id))].map(id=><button key={id} onClick={()=>{pause();update(s=>({...s,selected:[id],region:null}));}}>Inspect {id}</button>)}</div>
 </div>;
}
