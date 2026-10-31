import React,{memo,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import gsap from 'gsap';
import type {Font} from 'opentype.js';
import {TraceText,useLessonFont} from './TraceText';
import {traceGeometry} from './stroke';
import {generatedPacing,speechTarget,speechTargets} from './pacing';
import {visualBeatIndex} from './navigation';
import {createLessonAdapter} from './hyperframes';
import {chapterGrammar,grammarBoxes,GrammarDecor,GrammarNode} from './grammars';
import {clamp,contains,progress,type LiveSnapshot} from './geometry';
import type {StageProps,LiveLesson,LiveChapter} from './lessonTypes';
import {nodeBoxes,fitCopy,nodeCopy,diagramCopy,diagramEdge,conceptUsesGrid,gridRelationships,type NodeBox} from './layout';
import {LiveAsset as Asset,palette} from './LiveAssets';
import {DiagramArtwork} from './DiagramArtwork';
import {diagramMotions} from './diagramMotion';
const LiveAsset=memo(Asset);

const TextBlock=memo(function TextBlock({font,text,x,y,width,height,size=23,minSize=18,className='node-copy',center=false,halo=false}:{font:Font|null;text:string;x:number;y:number;width:number;height:number;size?:number;minSize?:number;className?:string;center?:boolean;halo?:boolean}){
 const fit=fitCopy(font,text,width,height,size,minSize);
 return <g className={className} data-layout-issue={fit.overflow?`Text needs more space: ${text.slice(0,80)}`:undefined}>{fit.lines.map((line,i)=><text key={i} x={center?x+width/2:x} y={y+i*fit.size*1.36} textAnchor={center?'middle':undefined} fontSize={fit.size} style={{fontFamily:"QweepsTeachingSerif,serif"}} fill="#c9d9dd" stroke={halo?'#071117':undefined} strokeWidth={halo?4:undefined} paintOrder={halo?'stroke':undefined}>{line}</text>)}</g>;
});
function WorkedTitle({font,text,time}:{font:Font|null;text:string;time:number}){
 const fit=useMemo(()=>fitCopy(font,text,530,38,29),[font,text]);
 return <g data-layout-issue={fit.overflow?'Worked-example title needs more space':undefined}>{fit.lines.map((line,i)=><TraceText key={i} font={font} text={line} x={120} y={50+i*fit.size*1.36} size={fit.size} color="#edca82" value={progress(time,i*.25,1.8)}/>)}</g>;
}
function edgePath(a:NodeBox,b:NodeBox){
 const left=a.x<b.x,from={x:a.x+(left?a.width:0),y:a.y+a.height*.8},to={x:b.x+(left?0:b.width),y:b.y+b.height*.8};
 return{d:`M${from.x} ${from.y}C${(from.x+to.x)/2} ${from.y} ${(from.x+to.x)/2} ${to.y} ${to.x} ${to.y}`,from,to};
}
function edgeLabelPoint(p:{from:{x:number;y:number};to:{x:number;y:number}},offset:number,t=.32){
 const length=Math.hypot(p.to.x-p.from.x,p.to.y-p.from.y)||1;
 let nx=-(p.to.y-p.from.y)/length,ny=(p.to.x-p.from.x)/length;
 if(ny>0){nx=-nx;ny=-ny;}
 const cx=(p.from.x+p.to.x)/2,u=1-t;
 const x=u*u*u*p.from.x+3*u*u*t*cx+3*u*t*t*cx+t*t*t*p.to.x;
 const y=u*u*u*p.from.y+3*u*u*t*p.from.y+3*u*t*t*p.to.y+t*t*t*p.to.y;
 return{x:x+nx*offset,y:y+ny*offset};
}
function Chapter({lesson,c,index,font,time,snapshot,role}:{lesson:LiveLesson;c:LiveChapter;index:number;font:Font|null;time:number;snapshot:LiveSnapshot;role:(id:string)=>React.SVGProps<SVGGElement>}){
 const v=c.visual!,textMode=v.presentation?.textMode||'descriptive',grammar=chapterGrammar(c),boxes=useMemo(()=>grammar==='cards'?nodeBoxes(v):grammarBoxes(v,grammar),[v,grammar]),copies=useMemo(()=>boxes.map(b=>nodeCopy(font,b.node,b.width,b.height,v.layout)),[boxes,font,v.layout]),active=time>=(c.visualStart??c.start)&&time<(c.visualEnd??c.end)||time>=lesson.duration&&index===lesson.chapters.length-1;
 const choice=c.visual?.experiment?.choices[snapshot.experiments?.[c.id]??-1];
 const narrating=speechTarget(c,time),narratingObjects=speechTargets(c,time);
 return <g className={`generated-beat generated-beat-${index}`} data-chapter={c.id} data-beat={index} data-teaching-method={v.presentation?.method} data-text-mode={textMode} data-narration-target={active?narrating:undefined} aria-hidden={!active} style={{pointerEvents:active?'auto':'none'}}>
  {v.layout==='matrix'&&<g className="table-heading"><path d="M45 136H1395" stroke="#6e94a3" strokeWidth="1.4"/>{v.columns.map((col,i)=><TextBlock key={i} font={font} text={col} x={i===0?65:45+290+(i-1)*(1060/(v.columns.length-1))+18} y={120} width={i===0?250:1060/(v.columns.length-1)-35} height={11} size={22}/>)}</g>}
  {v.layout==='concept'&&!conceptUsesGrid(v)&&<g className="concept-center"><rect x="540" y="215" width="360" height="210" rx="16" fill="#182d36" stroke="#d3bd82" strokeWidth="1.5"/><LiveAsset name={lesson.example?.icon||'app'} x={685} y={235} size={70}/><TextBlock font={font} text={lesson.example?.title||'Worked example'} x={565} y={340} width={310} height={75} size={27}/></g>}
  {v.layout==='timeline'&&grammar==='cards'&&<g className="timeline-axis"><path d="M75 177H1365" stroke="#648795" strokeWidth="1.4"/><text x="1365" y="150" textAnchor="end" fill="#91a9b5" fontSize="18">Ordered events · spacing is schematic</text></g>}
  {grammar!=='cards'&&<GrammarDecor v={v} g={grammar} font={font}/>}
  {v.layout==='concept'&&!conceptUsesGrid(v)&&boxes.map((box,i)=>{const right=box.x>720,x=right?900:540,y=320,bx=right?box.x:box.x+box.width,by=box.y+box.height*.5;return <path key={i} className="concept-link" data-from={box.node.id} data-link-at={box.node.at+2} d={`M${x} ${y}Q${(x+bx)/2} ${by} ${bx} ${by}`} fill="none" stroke={palette[box.node.color]} strokeWidth="1.6"/>;})}
  {gridRelationships(v).map(link=>{const box=boxes.find(b=>b.node.id===link.id)!;return <g key={link.id} className="generated-edge" data-from={link.from} data-to={link.to} data-link-at={link.at}><TextBlock font={font} text={link.text} x={box.x+4} y={box.y-7} width={box.width-8} height={5} size={18} minSize={14}/></g>;})}
  { (v.layout==='process'||v.layout==='fanin')&&grammar!=='procedure'&&v.connections.map((link,i)=>{const a=boxes.find(b=>b.node.id===link.from)!,b=boxes.find(b=>b.node.id===link.to)!,p=edgePath(a,b),gap=Math.abs(p.from.x-p.to.x),lp=edgeLabelPoint(p,24);return <g key={i} className="generated-edge" data-from={link.from} data-to={link.to} data-link-at={link.at}><path d={p.d} fill="none" stroke="#b5cdd3" strokeWidth="1.8" markerEnd="url(#generated-arrow)"/>{v.layout==='fanin'?<g className="generated-edge-label"><TextBlock font={font} text={link.label} x={lp.x-60} y={lp.y+6} width={120} height={24} size={16} minSize={12} center halo/></g>:<TextBlock font={font} text={link.label} x={Math.min(p.from.x,p.to.x)+7} y={p.from.y-126} width={gap-14} height={110} size={18} minSize={14}/>}</g>;})}
  {v.layout==='diagram'&&v.connections.map((link,i)=>{const a=boxes.find(b=>b.node.id===link.from)!,b=boxes.find(b=>b.node.id===link.to)!,p=diagramEdge(a,b,boxes,font,textMode);return <g key={i} className="generated-edge" data-from={link.from} data-to={link.to} data-link-at={link.at}><path d={p.d} fill="none" stroke="#7899a5" strokeWidth="1.4" markerEnd="url(#generated-arrow)"/>{link.label&&<g className="generated-edge-label"><TextBlock font={font} text={link.label} x={p.label.x+15} y={p.label.y+18} width={110} height={24} size={15} minSize={11} center halo/></g>}</g>;})}
  {boxes.map(({node:n,x,y,width:w,height:h},i)=>{
   const color=palette[n.color],isTable=v.layout==='matrix',isConcept=v.layout==='concept',isDiagram=v.layout==='diagram',chosen=choice?.target===n.id,copy=copies[i],diagram=isDiagram?diagramCopy(font,n,w,h,textMode):null;
   return <g key={n.id} {...role(n.id)} className="generated-object" data-at={n.at} data-narrating={narratingObjects.includes(n.id)?'true':undefined} data-chosen={chosen?'true':undefined} transform={`translate(${x} ${y})`}>
    {narratingObjects.includes(n.id)&&<rect data-no-trace="true" x="-3" y="-3" width={w+6} height={h+6} rx={isTable?4:14} stroke="#f1d697" strokeWidth="2" fill="none"/>}
    {grammar!=='cards'&&grammar!=='procedure'?<GrammarNode v={v} g={grammar} node={n} box={{node:n,x,y,width:w,height:h}} index={i} font={font} chosen={chosen}/>:<>
    <rect className={isDiagram?'diagram-hit':'object-frame'} data-no-trace={isDiagram?'true':undefined} width={w} height={h} rx={isTable?3:12} fill={isDiagram?'transparent':chosen?'#2c3a2a':'#10222c'} fillOpacity={.78} stroke={chosen?'#f1d697':isDiagram?'none':color} strokeWidth={chosen?3:1.5}/>
    {isDiagram?<>
     <g data-layout-issue={diagram!.overflow?`Diagram copy leaves insufficient space for its geometry: ${n.title}`:undefined}><DiagramArtwork node={n} width={w} height={diagram!.artHeight}/></g>
     <TextBlock font={font} text={n.title} {...diagram!.title} center={textMode==='labels'}/>
     {diagram!.showBody&&<TextBlock font={font} text={n.body} {...diagram!.body}/>}
    </>:isTable?<>
     <g className="object-art"><LiveAsset name={n.icon} x={14} y={Math.max(7,(h-34)/2)} size={34} color={color}/></g>
     <TextBlock font={font} text={n.title} x={60} y={h>62?28:24} width={210} height={h-(h>62?28:24)-5} size={21}/>
     {n.cells?.map((cell,j)=><TextBlock key={j} font={font} text={cell} x={290+j*(1060/(v.columns.length-1))+18} y={h>62?28:24} width={1060/(v.columns.length-1)-35} height={h-(h>62?28:24)-5} size={21}/>)}
    </>:<>
     <g className="object-art"><LiveAsset name={n.icon} x={22} y={24} size={isConcept||v.layout==='loci'?45:62} color={color}/></g>
     <TextBlock font={font} text={n.title} {...copy.title}/>
     {!(v.layout==='fanin'&&textMode==='labels')&&<TextBlock font={font} text={n.body} {...copy.body}/>}
     {n.tag&&(isConcept||v.layout==='loci'?<text x={82} y={17} fontSize={14} fill={color}>{n.tag}</text>:<TextBlock font={font} text={n.tag} x={23} y={h-22} width={w-46} height={28} size={18}/>)}
    </>}
    {v.layout==='timeline'&&<g className="object-art"><path d={`M${w/2} -23V0`} stroke={color} strokeWidth="1.5"/><circle cx={w/2} cy={-23} r="6" fill={color} stroke={color}/></g>}
    {v.layout==='loci'&&<text x={w-20} y="34" textAnchor="end" fill={color} fontSize="20">{i+1}</text>}
    </>}
   </g>;
  })}
  <g className="generated-conclusion"><path d="M70 516H1370" stroke="#496776" strokeWidth="1"/><TextBlock font={font} text={v.takeaway} x={70} y={548} width={1300} height={50} size={textMode==='labels'?30:25}/></g>
 </g>;
}
export default function GeneratedStage({lesson,snapshot:s,focusRequest,update,pause,onReady,interactive=true}:StageProps){
 const root=useRef<SVGSVGElement>(null),adapter=useRef<ReturnType<typeof createLessonAdapter>|null>(null),drag=useRef<{x:number;y:number;camera:LiveSnapshot['camera'];kind:'region'|'pan'}|null>(null);
 const {font,error}=useLessonFont();const[region,setRegion]=useState<LiveSnapshot['region']>(null);
 const index=visualBeatIndex(lesson.chapters,s.time),active=lesson.chapters[s.time>=lesson.duration?lesson.chapters.length-1:index],cx=720,cy=300,labelsMode=active.visual?.presentation?.textMode==='labels';
 const role=(id:string)=>({'data-role':id,'data-selected':s.selected.includes(id)?'true':'false',role:'button' as const,tabIndex:interactive&&id in active.roles?0:-1,'aria-label':`Inspect ${active.roles[id]?.split(':')[0]||id}`,
  onKeyDown:(e:React.KeyboardEvent)=>{if(interactive&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pause();update(v=>({...v,selected:[id],region:null}));}}});
 useLayoutEffect(()=>{
  if(!root.current||!font)return;const element=root.current;
  const ctx=gsap.context(()=>{const t=gsap.timeline({paused:true});t.set('.generated-beat',{opacity:0});
   lesson.chapters.forEach((c,i)=>{
    const pacing=generatedPacing(c);
    const selector=`.generated-beat-${i}`;
    const visualStart=c.visualStart??c.start;
    t.fromTo(selector,{opacity:0},{opacity:1,duration:.35},visualStart);
    if(i<lesson.chapters.length-1){if(c.visualEnd!==undefined)t.to(selector,{opacity:0,duration:.35},c.visualEnd);else{const fade=c.transitionOut??.4;t.to(selector,{opacity:0,duration:fade},c.end-fade);}}
    traceGeometry(t,element,`${selector} .table-heading,${selector} .concept-center,${selector} .timeline-axis,${selector} .comparison-table,${selector} .trace-table,${selector} .procedure-rail`,visualStart+.3,2.5,.5);
    t.fromTo(`${selector} .table-heading text,${selector} .concept-center text,${selector} .timeline-axis text,${selector} .comparison-table text,${selector} .trace-table text,${selector} .procedure-rail text`,{opacity:0},{opacity:1,duration:.45,stagger:.12},visualStart+1);
    t.fromTo(`${selector} .route-path`,{opacity:0},{opacity:1,duration:.9},visualStart+.45);
    c.visual!.nodes.forEach(n=>{const at=c.start+pacing.nodeAt(n.id),duration=pacing.nodeDuration(n.id),target=`${selector} [data-role="${CSS.escape(n.id)}"]`;traceGeometry(t,element,`${target} .object-frame,${target} .object-art`,at,duration,Math.min(.65,duration*.2));
     t.fromTo(`${target} .node-copy text,${target}>text,${target} .object-art text`,{opacity:0},{opacity:1,duration:.35,stagger:.08},at+.15);
     const drawing=element.querySelector<SVGGElement>(`${target} .diagram-motion`);
     if(drawing){t.set(drawing,{x:0,y:0,scale:1,opacity:1,transformOrigin:'center center'},0);
      for(const move of diagramMotions(c,n))t.to(drawing,{x:move.dx,y:move.dy,scale:move.scale,opacity:move.opacity,duration:move.duration,ease:'power2.inOut'},move.start);
     }
    });
    element.querySelectorAll<SVGElement>(`${selector} .generated-edge,${selector} .concept-link`).forEach((node,k)=>{
     const at=c.start+pacing.linkAt(node.dataset.from,node.dataset.to,Number(node.dataset.linkAt||3)),duration=pacing.linkDuration(node.dataset.from,node.dataset.to);node.setAttribute('data-edge-index',String(k));const q=`${selector} [data-edge-index="${k}"]`;
     traceGeometry(t,element,q,at,duration,0);t.fromTo(`${q} text`,{opacity:0},{opacity:1,duration:.35},at+duration*.65);
    });
    const conclusionAt=c.start+pacing.conclusionAt;
    traceGeometry(t,element,`${selector} .generated-conclusion`,conclusionAt,pacing.conclusionDuration,0);t.fromTo(`${selector} .generated-conclusion text`,{opacity:0},{opacity:1,duration:.4,stagger:.1},conclusionAt+.1);
   });t.set({}, {},lesson.duration);adapter.current=createLessonAdapter(t,60,lesson.id);adapter.current.seekTime(s.time);
   const w=window as Window&{__timelines?:Record<string,gsap.core.Timeline>};w.__timelines??={};w.__timelines[lesson.id]=t;
  },root);onReady(true);return()=>{adapter.current?.adapter.destroy?.();adapter.current=null;ctx.revert();onReady(false);const w=window as Window&{__timelines?:Record<string,gsap.core.Timeline>};delete w.__timelines?.[lesson.id];};
 },[font,lesson]);
 useLayoutEffect(()=>{adapter.current?.seekTime(s.time);},[s.time]);
 useEffect(()=>{if(!s.focus||!root.current)return;const target=root.current.querySelector<SVGGElement>(`[data-chapter="${CSS.escape(active.id)}"] [data-role="${CSS.escape(s.focus)}"]`);if(!target)return;
  const r=target.getBoundingClientRect(),matrix=root.current.getScreenCTM();if(!matrix||r.width<1)return;const p=new DOMPoint(r.x+r.width/2,r.y+r.height/2).matrixTransform(matrix.inverse());
  const width=r.width/matrix.a/s.camera.zoom,height=r.height/matrix.d/s.camera.zoom,screen=root.current.getBoundingClientRect();
  const x=(p.x-cx-s.camera.x)/s.camera.zoom+cx,y=(p.y-cy-s.camera.y)/s.camera.zoom+cy,zoom=clamp(Math.min(screen.width/matrix.a*.84/Math.max(width,180),screen.height/matrix.d*.85/Math.max(height,160)),1,2.5);
  update(v=>({...v,camera:{zoom,x:(cx-x)*zoom,y:(cy-y)*zoom}}));
 },[focusRequest]);
 const point=(e:{clientX:number;clientY:number})=>new DOMPoint(e.clientX,e.clientY).matrixTransform(root.current!.getScreenCTM()!.inverse());
 const down=(e:React.PointerEvent)=>{if(!interactive||!font)return;e.preventDefault();pause();const p=point(e),target=(e.target as Element).closest<SVGGElement>('[data-role]');
  if(e.button===0&&target&&target.closest(`[data-chapter="${CSS.escape(active.id)}"]`)){update(v=>({...v,selected:[target.dataset.role!],region:null}));return;}
  drag.current={x:p.x,y:p.y,camera:s.camera,kind:e.button===2?'pan':'region'};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d)return;const p=point(e);if(d.kind==='pan')update(v=>({...v,camera:{...d.camera,x:d.camera.x+p.x-d.x,y:d.camera.y+p.y-d.y},focus:''}));else setRegion({x1:Math.min(d.x,p.x),x2:Math.max(d.x,p.x),y1:Math.min(d.y,p.y),y2:Math.max(d.y,p.y)});};
 const end=()=>{if(region&&root.current){const ids:string[]=[];for(const node of root.current.querySelectorAll<SVGGElement>(`[data-chapter="${CSS.escape(active.id)}"] [data-role]`)){const r=node.getBoundingClientRect(),p=point({clientX:r.x,clientY:r.y}),q=point({clientX:r.right,clientY:r.bottom});if(r.width>0&&contains(region,{x:p.x,y:p.y,width:q.x-p.x,height:q.y-p.y}))ids.push(node.dataset.role!);}update(v=>({...v,selected:ids,region}));}drag.current=null;setRegion(null);};
 return <div className="live-stage-surface" data-composition-id={lesson.id} data-duration={lesson.duration}>{!font&&<div className="live-loading">{error||'Preparing illustration geometry…'}</div>}
  <svg ref={root} viewBox="0 0 1440 600" className="live-stage-svg" fontFamily="Georgia,serif" aria-label="Interactive generated visual lesson" onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setRegion(null);}} onContextMenu={e=>e.preventDefault()} onWheel={e=>{if(!interactive)return;pause();update(v=>({...v,camera:{...v.camera,zoom:clamp(v.camera.zoom*(e.deltaY<0?1.1:.9),.65,3)},focus:''}));}}>
   <style>{'@font-face{font-family:QweepsTeachingSerif;src:url("/live/teaching-serif.ttf") format("truetype")}'}</style><defs><marker id="generated-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="none" stroke="context-stroke" strokeWidth="1.2"/></marker></defs>
   <rect width="1440" height="600" fill="#071117"/>
   <g transform={`translate(${s.camera.x} ${s.camera.y}) translate(${cx} ${cy}) scale(${s.camera.zoom}) translate(${-cx} ${-cy})`}>
    <g className="generated-example">{labelsMode?<TextBlock font={font} text={lesson.example?.title||lesson.title} x={45} y={48} width={1350} height={32} size={23} className="example-context"/>:<><path d="M45 93H1395" stroke="#426574" strokeWidth="1"/><LiveAsset name={lesson.example?.icon||'app'} x={48} y={20} size={53}/><text x="120" y="27" fill="#7eabb9" fontSize="16" fontFamily="Arial,sans-serif">ILLUSTRATIVE WORKED EXAMPLE</text><WorkedTitle font={font} text={lesson.example?.title||lesson.title} time={s.time}/><TextBlock font={font} text={lesson.example?.description||''} x={680} y={28} width={700} height={55} size={21} className="example-description"/></>}</g>
    {lesson.chapters.map((c,i)=><Chapter key={c.id} lesson={lesson} c={c} index={i} font={font} time={s.time} snapshot={s} role={role}/>)}
   </g>
   {region&&<rect x={region.x1} y={region.y1} width={region.x2-region.x1} height={region.y2-region.y1} stroke="#edca82" fill="#edca82" fillOpacity=".08"/>}
  </svg>
 </div>;
}
