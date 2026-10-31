import React,{useLayoutEffect,useRef} from 'react';
import gsap from 'gsap';
import type {Scene,SceneAction,SceneObject} from './scene';

function arrowHead(from:[number,number],to:[number,number]){
 const angle=Math.atan2(to[1]-from[1],to[0]-from[0]),size=13;
 const p1:[number,number]=[to[0]-Math.cos(angle-.46)*size,to[1]-Math.sin(angle-.46)*size];
 const p2:[number,number]=[to[0]-Math.cos(angle+.46)*size,to[1]-Math.sin(angle+.46)*size];
 return`${to[0]},${to[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`;
}

export default function SceneStage({scene,onComplete,playing=true}:{scene:Scene;onComplete:()=>void;playing?:boolean}){
 const refs=useRef<Record<string,SVGElement>>({});
 const timeline=useRef<gsap.core.Timeline|null>(null);
 const timelineCurrent=()=>timeline.current;
 const done=useRef(onComplete);done.current=onComplete;
 const playRef=useRef(playing);playRef.current=playing;

 useLayoutEffect(()=>{
  const tl=gsap.timeline({paused:true});
  const at=(action:SceneAction,el:SVGElement)=>{
   if(action.kind==='show')tl.fromTo(el,{opacity:0},{opacity:1,duration:action.duration,ease:'power1.out'},action.at);
   else if(action.kind==='fade')tl.to(el,{opacity:action.opacity??0,duration:action.duration},action.at);
   else if(action.kind==='move')tl.to(el,{x:action.x,y:action.y,duration:action.duration,ease:'power2.inOut'},action.at);
   else if(action.kind==='scale')tl.to(el,{scale:action.scale,transformOrigin:'50% 50%',duration:action.duration,ease:'power2.inOut'},action.at);
   else if(action.kind==='indicate')tl.to(el,{scale:1.06,duration:Math.min(.18,action.duration),yoyo:true,repeat:1,transformOrigin:'50% 50%'},action.at);
   else if(action.kind==='dock')tl.to(el,{x:action.x,y:action.y,scale:action.scale,transformOrigin:'0 0',duration:action.duration,ease:'power2.inOut'},action.at);
   else if(action.kind==='draw'){
    const path=el as unknown as SVGPathElement;
    const length=path.getTotalLength?path.getTotalLength():1;
    tl.fromTo(el,{strokeDasharray:length,strokeDashoffset:length},{strokeDashoffset:0,duration:action.duration,ease:'power2.inOut'},action.at);
   }else if(action.kind==='morph'){
    const source=el as unknown as SVGPathElement;
    if(action.mode==='copy'){
     const clone=source.cloneNode(true) as SVGPathElement;
     source.parentNode?.insertBefore(clone, source.nextSibling);
     gsap.set(clone,{opacity:1,attr:{d:source.getAttribute('d')??'',fill:action.fill??'none','fill-opacity':0,stroke:action.stroke??source.getAttribute('stroke')??'#8bd0df'}});
     tl.to(clone,{attr:{d:action.d,'fill-opacity':action.fillOpacity??1},duration:action.duration,ease:'power2.inOut'},action.at);
    }else{
     if(action.fill)gsap.set(source,{attr:{fill:action.fill,'fill-opacity':0}});
     if(action.stroke)gsap.set(source,{attr:{stroke:action.stroke}});
     tl.to(source,{attr:{d:action.d,'fill-opacity':action.fillOpacity??1},duration:action.duration,ease:'power2.inOut'},action.at);
    }
   }
  };
  for(const action of scene.actions){const el=refs.current[action.id];if(el)at(action,el);}
  tl.set({}, {}, scene.duration);
  timeline.current=tl;
  tl.eventCallback('onComplete',()=>done.current());
  (window as Window&{__sceneStage?:{scene:Scene;timeline:gsap.core.Timeline}}).__sceneStage={scene,timeline:tl};
  if(playRef.current)tl.play();
  return()=>{tl.kill();timeline.current=null;delete (window as Window&{__sceneStage?:unknown}).__sceneStage;};
 },[scene]);

 const render=(object:SceneObject):React.ReactNode=>{
  const ref=(el:SVGElement|null)=>{if(el)refs.current[object.id]=el;else delete refs.current[object.id];};
  if(object.kind==='group')return <g key={object.id} ref={ref} opacity={object.opacity??1}>{object.children.map(render)}</g>;
  if(object.kind==='circle')return <g key={object.id} ref={ref} opacity={object.opacity??1}>
   <circle cx={object.cx} cy={object.cy} r={object.r} fill={object.fill??'none'} fillOpacity={object.fillOpacity??1} stroke={object.stroke??'#8bd0df'} strokeWidth={object.strokeWidth??2}/>
   {object.label&&<text x={object.cx} y={object.cy+(object.labelSize??18)*.35} textAnchor="middle" fill={object.labelFill??object.stroke??'#e6ecef'} fontSize={object.labelSize??18} fontFamily="Arial">{object.label}</text>}
  </g>;
  if(object.kind==='rect')return <rect key={object.id} ref={ref} x={object.x} y={object.y} width={object.width} height={object.height} rx={object.rx??4} fill={object.fill??'none'} fillOpacity={object.fillOpacity??1} stroke={object.stroke??'#8bd0df'} strokeWidth={object.strokeWidth??2} opacity={object.opacity??1}/>;
  if(object.kind==='path')return <path key={object.id} ref={ref} d={object.d} fill={object.fill??'none'} fillOpacity={object.fillOpacity??1} stroke={object.stroke??'#8bd0df'} strokeWidth={object.strokeWidth??2} opacity={object.opacity??1} strokeDasharray={object.dash}/>;
  if(object.kind==='text')return <text key={object.id} ref={ref} x={object.x} y={object.y} fill={object.fill??'#e6ecef'} fontSize={object.size} textAnchor={object.anchor??'start'} opacity={object.opacity??1} fontFamily="Arial">{object.text}</text>;
  if(object.kind==='arrow')return <g key={object.id} ref={ref} opacity={object.opacity??1}>
   <path d={`M${object.from[0]} ${object.from[1]}L${object.to[0]} ${object.to[1]}`} fill="none" stroke={object.stroke??'#8bd0df'} strokeWidth={object.strokeWidth??2}/>
   <polygon points={arrowHead(object.from,object.to)} fill={object.stroke??'#8bd0df'}/>
  </g>;
  return null;
 };

 return <svg viewBox="0 0 1440 600" className="scene-stage" aria-label={scene.title}>
  <rect width="1440" height="600" fill="#071117"/>
  {scene.objects.map(render)}
 </svg>;
}
