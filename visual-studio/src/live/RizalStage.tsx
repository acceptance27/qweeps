import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import gsap from 'gsap';
import manifest from '../../public/lessons/rizal_live.json';
import {useLessonFont} from './TraceText';
import {RizalPanels} from './RizalPanels';
import {traceGeometry} from './stroke';
import {clamp,contains,ease,morph,progress,type LiveSnapshot,type XY} from './geometry';
import {createLessonAdapter} from './hyperframes';
const manuscript:XY[]=[{x:-70,y:-90},{x:50,y:-90},{x:70,y:-70},{x:70,y:90},{x:-70,y:90}];
const bookOutline:XY[]=[{x:-64*.95,y:-86*.95},{x:50*.95,y:-86*.95},{x:64*.95,y:-72*.95},{x:64*.95,y:86*.95},{x:-64*.95,y:86*.95}];
export const roleTime:Record<string,number>={'calamba':8,'gomburza':18,'medical-lens':29,'education-route':53,'madrid':48,'writing-pen':60,'noli-printing':63,'noli':77,'fili':88,'readers':101,'colonial-abuses':101,'la-liga':114,'exile-route':118,'dapitan':120,'clinic':127,'school':133,'waterworks':142,'katipunan':143,'revolution-august':156,'execution-december':174,'chronology-test':183,'influence':184,'farewell':178,'monument':196,'legacy-books':196,'rizal-law':205,'contributions':215};
type Props={snapshot:LiveSnapshot;focusRequest:number;update:(fn:(s:LiveSnapshot)=>LiveSnapshot)=>void;pause:()=>void;onReady:(v:boolean)=>void};
export function RizalStage({snapshot:s,focusRequest,update,pause,onReady}:Props){
 const root=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number;camera:LiveSnapshot['camera'];kind:'region'|'pan'}|null>(null);
 const frameAdapter=useRef<ReturnType<typeof createLessonAdapter>|null>(null);
 const {font,error}=useLessonFont();const[region,setRegion]=useState<null|{x1:number;y1:number;x2:number;y2:number}>(null);
 const chapter=Math.max(0,manifest.chapters.findIndex(c=>s.time>=c.start&&s.time<c.end));
 const active=manifest.chapters[s.time>=manifest.duration?5:chapter];
 const view=active.id==='dapitan'?[10,0,1420,620]:active.id==='1896'?[20,35,1400,590]:[20,35,1400,535],cx=view[0]+view[2]/2,cy=view[1]+view[3]/2;
 const role=(id:string)=>({'data-role':id,'data-selected':s.selected.includes(id)?'true':'false',role:'button' as const,tabIndex:id in active.roles?0:-1,'aria-label':`Inspect ${id.replaceAll('-',' ')}`,
   onKeyDown:(e:React.KeyboardEvent)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pause();update(v=>({...v,selected:[id],region:null}));}}});
 useLayoutEffect(()=>{
  if(!root.current||!font)return;
  const element=root.current;
  const ctx=gsap.context(()=>{
   const t=gsap.timeline({paused:true});
   t.set('.live-scene',{opacity:0});
   manifest.chapters.forEach((c,i)=>{t.fromTo(`.scene-${i}`,{opacity:0},{opacity:1,duration:.45},c.start);if(i<5)t.to(`.scene-${i}`,{opacity:0,duration:.45},c.end-.45);});
   const show=(selector:string,at:number,duration=.4)=>t.fromTo(selector,{opacity:0},{opacity:1,duration,ease:'power1.out'},at);
   const draw=(selector:string,at:number,duration=2.5,stagger=.65)=>traceGeometry(t,element,selector,at,duration,stagger);
   const copy=(selector:string,at:number)=>t.fromTo(`${selector} .copy-line`,{opacity:0},{opacity:1,duration:.45,stagger:.22,ease:'power1.out'},at);
   const dossier=(selector:string,at:number)=>{draw(`${selector} > .dossier-frame`,at,1.6,0);copy(selector,at+.5);};
   dossier('.origins-dossier',.4);draw('.origins-art',3.2,3.6);show('.origins-art text',6.2);
   dossier('.gomburza-dossier',9.5);draw('.gomburza-art',12,3.8);show('.gomburza-art text',14.5);
   dossier('.medical-dossier',20);draw('.medical-study',22,4.4,1);show('.medical-study text',26);
   draw('.journey-frame',34.2,1.6);show('.journey-heading',34.8);draw('.journey-coasts',35,3.6,.6);draw('.journey-pins',37,1.7,.6);show('.journey-pins text',38);
   draw('.education-journey',38.5,5,0);draw('.study-journey',44,5,0);copy('.journey-map',35.5);
   dossier('.journey-work',45);draw('.writing-study',50,4.8,0);show('.printing-note',57);
   dossier('.noli-dossier',67.3);draw('.noli-art',68.5,3.5);show('.noli-art text',71.5);
   dossier('.fili-dossier',79);draw('.fili-art',81,3.5);show('.fili-art text',84);
   dossier('.readers-dossier',91);draw('.reading-art',94,4);show('.reading-art text',97);
   show('.liga-note',105.3);copy('.liga-note',106);draw('.exile-map .live-map-geometry',107,3.5,.6);draw('.exile-map .live-map-pin',110,1.4,.5);show('.exile-map text',111);draw('.exile-travel',111.5,3.8,0);
   dossier('.clinic-dossier',116);draw('.clinic-art',119,4);show('.clinic-art text',123);
   dossier('.school-dossier',124);draw('.school-art',127,4);dossier('.water-dossier',133);draw('.water-art > path:not(.water-channel):not(.water-drop)',135,2.5);show('.water-art text',137);draw('.water-channel',137,4,0);draw('.water-drop',141,.8,0);show('.katipunan-note',141);
   draw('.chronology-axis',145.3,2);show('.chronology-axis text',146);draw('.revolution-event circle',147,1,0);draw('.revolution-track',148,4.5,0);show('.revolution-event text',150);
   dossier('.trial-dossier',157);show('.execution-event',163);draw('.execution-event circle',163,1,0);draw('.farewell-art',168,3.8,.6);copy('.farewell-art',171);
   draw('.order-proof',176,3,0);copy('.chronology-comparison',178);show('.chronology-comparison > g:last-child',181);
   dossier('.memory-books',186.3);draw('.memory-book-art',188,3);draw('.memory-monument',191,2.4);show('.memory-monument text',193);
   dossier('.memory-law',196);draw('.memory-law-art',199,3.5);show('.memory-law-art text',202);
   dossier('.memory-readers',205);draw('.memory-reader-art',207,4);show('.memory-reader-art text',210);
   t.set({}, {},manifest.duration);frameAdapter.current=createLessonAdapter(t);frameAdapter.current.seekTime(s.time);
   const w=window as Window&{__timelines?:Record<string,gsap.core.Timeline>};w.__timelines??={};w.__timelines['qweeps-rizal-live']=t;
  },root);
  onReady(true);return()=>{frameAdapter.current?.adapter.destroy?.();frameAdapter.current=null;ctx.revert();onReady(false);const w=window as Window&{__timelines?:Record<string,gsap.core.Timeline>};delete w.__timelines?.['qweeps-rizal-live'];};
 },[font]);
 useLayoutEffect(()=>{frameAdapter.current?.seekTime(s.time);},[s.time]);
 useEffect(()=>{if(!s.focus||!root.current)return;
  if(['chronology-test','influence','revolution-august','execution-december','education-route'].includes(s.focus)){
   update(v=>({...v,camera:{x:0,y:0,zoom:1}}));return;
  }
  const target=root.current.querySelector<SVGGElement>(`[data-role="${CSS.escape(s.focus)}"]`);if(!target)return;
  const r=target.getBoundingClientRect(),matrix=root.current.getScreenCTM();if(!matrix||r.width<1)return;
  const p=new DOMPoint(r.x+r.width/2,r.y+r.height/2).matrixTransform(matrix.inverse());
  const width=r.width/matrix.a/s.camera.zoom,height=r.height/matrix.d/s.camera.zoom;
  const x=(p.x-cx-s.camera.x)/s.camera.zoom+cx,y=(p.y-cy-s.camera.y)/s.camera.zoom+cy;
  const screen=root.current.getBoundingClientRect();
  const zoom=clamp(Math.min(screen.width/matrix.a*.86/Math.max(width,180),screen.height/matrix.d*.86/Math.max(height,160)),1,2.5);
  update(v=>({...v,camera:{zoom,x:(cx-x)*zoom,y:(cy-y)*zoom}}));
 },[focusRequest]);
 const point=(e:{clientX:number;clientY:number})=>{const matrix=root.current!.getScreenCTM()!;return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());};
 const down=(e:React.PointerEvent)=>{if(!font)return;e.preventDefault();pause();const p=point(e),target=(e.target as Element).closest<SVGGElement>('[data-role]');
  if(e.button===0&&target&&target.closest(`[data-chapter="${active.id}"]`)){update(v=>({...v,selected:[target.dataset.role!],region:null}));return;}
  drag.current={x:p.x,y:p.y,camera:s.camera,kind:e.button===2?'pan':'region'};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const p=point(e);if(d.kind==='pan')update(v=>({...v,camera:{...d.camera,x:d.camera.x+p.x-d.x,y:d.camera.y+p.y-d.y},focus:''}));else setRegion({x1:Math.min(d.x,p.x),x2:Math.max(d.x,p.x),y1:Math.min(d.y,p.y),y2:Math.max(d.y,p.y)});};
 const end=()=>{if(region&&root.current){const ids:string[]=[];for(const node of root.current.querySelectorAll<SVGGElement>(`[data-chapter="${active.id}"] [data-role]`)){const rect=node.getBoundingClientRect(),p=point({clientX:rect.x,clientY:rect.y}),q=point({clientX:rect.right,clientY:rect.bottom});if(rect.width>0&&contains(region,{x:p.x,y:p.y,width:q.x-p.x,height:q.y-p.y}))ids.push(node.dataset.role!);}update(v=>({...v,selected:ids,region}));}drag.current=null;setRegion(null);};
 const pageMorph=progress(s.time,64.5,3.2),carry=ease(progress(s.time,64,3.8));
 return <div className="live-stage-surface" data-composition-id="qweeps-rizal-live" data-width="1440" data-height="800" data-duration={manifest.duration}>{!font&&<div className="live-loading">{error||'Preparing the lesson…'}</div>}
 <svg ref={root} viewBox={view.join(' ')} className="live-stage-svg" aria-label="Interactive Rizal visual lesson" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setRegion(null);}} onContextMenu={e=>e.preventDefault()} onWheel={e=>{pause();const zoom=clamp(s.camera.zoom*(e.deltaY<0?1.1:.9),.65,3);update(v=>({...v,camera:{...v.camera,zoom},focus:''}));}}>
 <defs><marker id="live-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="context-stroke" strokeWidth="1.3"/></marker></defs>
 <rect width="1440" height="800" fill="#071117"/>
 <g transform={`translate(${s.camera.x} ${s.camera.y}) translate(${cx} ${cy}) scale(${s.camera.zoom}) translate(${-cx} ${-cy})`}>
 <RizalPanels time={s.time} font={font} role={role} active={active.id}/>
 {s.time>=64&&s.time<71&&<g data-motion="manuscript-to-book" transform={`translate(${1170-910*carry} ${450-60*carry})`} opacity={progress(s.time,64,.45)*(1-progress(s.time,68.5,2.5))}><path d={morph(manuscript,bookOutline,pageMorph)} fill="#16252a" stroke="#edca82" strokeWidth="2"/><path d="M-40-38H37M-40-15H37M-40 8H37M-40 31H23" stroke="#edca82" opacity={1-pageMorph} strokeWidth="1.2"/></g>}
 </g>
 {region&&<rect x={region.x1} y={region.y1} width={region.x2-region.x1} height={region.y2-region.y1} fill="#86ccd9" fillOpacity=".08" stroke="#86ccd9" strokeWidth="1"/>}
 </svg></div>;
}
