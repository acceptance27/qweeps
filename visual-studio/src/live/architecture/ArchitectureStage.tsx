import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,Code2,Compass,CornerDownRight,Eye,Focus,MessageCircle,Network,X,ZoomIn,ZoomOut} from 'lucide-react';
import type {StageProps} from '../lessonTypes';
import {visualBeatIndex} from '../navigation';
import {architectureModule,cameraAt,flowFrame,focusCamera} from './timeline';
import {layoutGraph,pathFor,wrap} from './layout';
import type {FlowNode,GraphLayout,NodeData,Point} from './types';
import './architecture.css';

const paint={blue:'#91c6d6',green:'#8fc7a8',gold:'#e0be72',coral:'#e4a18c',purple:'#bdabe0',white:'#eef3e9',muted:'#9eb4b5'};
const activate=(event:React.KeyboardEvent,fn:()=>void)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();fn();}};
const shorten=(value:string,max:number)=>value.length>max?value.slice(0,max-1)+'…':value;

function NodeContents({node,data,width,height}:{node:FlowNode;data?:NodeData;width:number;height:number}){
 const visual=node.visual,color=paint[node.color],top=52+wrap(node.label,width-44,18).length*22;
 const lines=data?.previewLines.length?data.previewLines:visual?.lines?.length?visual.lines:node.defaultPreview?[node.defaultPreview]:[node.description];
 if(visual?.variant==='vector-bars'&&visual.floats?.length){
  const values=visual.floats,max=Math.max(...values.map(Math.abs),1),barWidth=(width-44)/values.length;
  const baseline=top+61;
  return <g className="flow-data-visual"><path d={`M22 ${baseline}H${width-22}`} stroke="#688477"/>
   {values.map((n,i)=>{const h=Math.abs(n)/max*44;return <g key={i}><rect x={24+i*barWidth} y={n<0?baseline:baseline-h} width={Math.max(3,barWidth-7)} height={h} fill={n<0?paint.coral:color}/><text x={25+i*barWidth} y={top+120} fontSize="13" fill="#edf1e8">{n.toFixed(2)}</text></g>;})}
   <text x="22" y={top+153} fontSize="12" fill="#a9beb4">{node.drillDownFunctionId?'':shorten(visual.footerNote||'Illustrative values',36)}</text>
  </g>;
 }
 if(visual?.rows?.length&&!data?.previewLines.length){
  const rows=visual.rows.slice(0,Math.max(1,Math.floor((height-top-25)/34)));
  return <g>{rows.map((row,i)=><g key={i} transform={`translate(18 ${top+i*34})`}>
   <rect width={width-36} height="29" fill="#0d211c" stroke="#425e50"/>
   <text x="9" y="19" fontSize="13" fill={color}>{shorten(row.leftChip,15)}</text>
   <text x={width-46} y="19" textAnchor="end" fontSize="13" fill="#e5eee7">{shorten(row.rightValue,19)}</text>
  </g>)}</g>;
 }
 if(visual?.tiles?.length&&!data?.previewLines.length){
  const tiles=visual.tiles.slice(0,12),columns=3,w=(width-44)/columns;
  return <g>{tiles.map((tile,i)=><g key={i} transform={`translate(${20+(i%columns)*w} ${top+Math.floor(i/columns)*43})`}>
   <rect width={w-7} height="34" fill="#132d25" stroke={color}/><text x="8" y="22" fontSize="13" fill="#e5eee7">{shorten(tile.text,10)}</text>
  </g>)}</g>;
 }
 const wrapped=lines.flatMap(line=>wrap(line,width-44,14));
 const visible=Math.max(1,Math.floor((height-top-31)/21));
 return <g className="flow-node-values">{wrapped.slice(0,visible).map((line,i)=><text key={i} x="22" y={top+14+i*21} fill="#d9e5da" fontSize="14">{i===visible-1&&wrapped.length>visible?shorten(line,Math.max(8,line.length-2))+' …':line}</text>)}
  {wrapped.length>visible&&<text x="22" y={height-17} fill={color} fontSize="12">Inspect for full values</text>}
 </g>;
}

export default function ArchitectureStage({lesson,snapshot,update,pause,onReady,interactive=true,onDrill,onAskNode,onSeek}:StageProps){
 const host=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
 const [bounds,setBounds]=useState({width:1440,height:600}),[layoutState,setLayoutState]=useState<{source:object;layout:GraphLayout}|null>(null),[error,setError]=useState('');
 const [tab,setTab]=useState<'diagram'|'code'>('diagram'),[codeOffset,setCodeOffset]=useState(0);
 const readyCallback=useRef(onReady);readyCallback.current=onReady;
 const module=architectureModule(lesson)!;
 const graph=module.graph;
 const layout=layoutState?.source===graph?layoutState.layout:null;
 const reduced=typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 const chapter=lesson.chapters[visualBeatIndex(lesson.chapters,snapshot.time)];
 const flow=chapter.visual!.flow!;
 const selected=graph.nodes.find(n=>snapshot.selected.includes(n.id));
 const compact=bounds.width<700||(bounds.width<850&&bounds.height>400);
 const size={width:bounds.width,height:Math.max(120,bounds.height-(compact?44:0))};
 const codeWidth=compact?(tab==='code'?size.width:0):Math.min(420,Math.max(320,size.width*.3));
 const graphWidth=compact&&tab==='code'?0:size.width-codeWidth;
 const frame=useMemo(()=>layout?flowFrame(chapter,snapshot.time,graph,layout,lesson.chapters):null,[chapter,snapshot.time,graph,layout,lesson.chapters]);
 const drag=useRef<{start:Point;camera:{x:number;y:number;zoom:number}}|null>(null);

 useEffect(()=>{
  const node=host.current;if(!node)return;
  const resize=()=>{const r=node.getBoundingClientRect();if(r.width>0&&r.height>0)setBounds({width:r.width,height:r.height});};
  resize();const observer=new ResizeObserver(resize);observer.observe(node);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{let alive=true;setError('');setLayoutState(null);readyCallback.current(false);
  layoutGraph(graph).then(result=>{if(alive){setLayoutState({source:graph,layout:result});readyCallback.current(true);}}).catch(e=>{if(alive)setError(String(e.message||e));});
  return()=>{alive=false;readyCallback.current(false);};
 },[graph]);

 let camera=layout?cameraAt(lesson.chapters,chapter,snapshot.time,layout,graphWidth||size.width,size.height,reduced):{x:0,y:0,zoom:1};
 if(layout&&snapshot.focus==='flow-overview')camera=focusCamera(layout,Object.keys(layout.nodes),graphWidth,size.height,true);
 else if(snapshot.focus==='flow-manual')camera=snapshot.camera;
 else if(layout&&snapshot.focus&&layout.nodes[snapshot.focus])camera=focusCamera(layout,[snapshot.focus],graphWidth,size.height);
 const reference=selected?.codeReference||flow.code;
 const file=module.codeFiles.find(f=>f.file===reference.file)||module.codeFiles[0];
 const columns=Math.max(18,Math.floor((codeWidth-62)/8.4));
 const rows=useMemo(()=>file.lines.flatMap(line=>{
  const chunks:string[]=[];const source=line.text||' ';
  for(let i=0;i<source.length;i+=columns)chunks.push(source.slice(i,i+columns));
  return chunks.map((text,index)=>({line,text,continuation:index>0}));
 }),[file,columns]);
 const activeCode=file.lines.find(line=>flow.code.lines.includes(line.lineNumber));
 const visibleRows=Math.max(1,Math.floor((size.height-143)/21));
 const boundedOffset=Math.min(codeOffset,Math.max(0,rows.length-visibleRows));
 useEffect(()=>{const index=rows.findIndex(row=>reference.lines.includes(row.line.lineNumber));setCodeOffset(Math.max(0,index-2));},[chapter.id,selected?.id,file.file,columns]);

 const select=useCallback((id:string)=>{if(!interactive)return;pause();update(s=>({...s,selected:[id],region:null}));},[interactive,pause,update]);
 const setMode=(focus:string)=>{pause();update(s=>({...s,focus,camera:{x:0,y:0,zoom:1}}));};
 const point=(e:{clientX:number;clientY:number})=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
 const panStart=(e:React.PointerEvent)=>{
  if(!interactive||(e.target as Element).closest('[data-flow-node],[data-flow-code]'))return;
  e.preventDefault();pause();const p=point(e);drag.current={start:p,camera};e.currentTarget.setPointerCapture(e.pointerId);
 };
 const panMove=(e:React.PointerEvent)=>{if(!drag.current)return;const p=point(e),d=drag.current;update(s=>({...s,focus:'flow-manual',camera:{...d.camera,x:d.camera.x+p.x-d.start.x,y:d.camera.y+p.y-d.start.y}}));};
 const zoom=(multiplier:number)=>{
  if(!interactive)return;pause();const z=Math.max(.12,Math.min(2.5,camera.zoom*multiplier)),cx=graphWidth/2,cy=size.height/2;
  update(s=>({...s,focus:'flow-manual',camera:{zoom:z,x:cx-(cx-camera.x)*z/camera.zoom,y:cy-(cy-camera.y)*z/camera.zoom}}));
 };
 const keyPrefix=useRef('flow-'+Math.random().toString(36).slice(2)).current;
 const codeClick=(line:typeof file.lines[number])=>{
  if(!interactive)return;pause();
  if(line.drillDownFunctionId){onDrill?.(line.drillDownFunctionId);return;}
  const target=lesson.chapters.find(c=>c.visual?.flow?.code.file===file.file&&c.visual.flow.code.lines.includes(line.lineNumber));
  if(target)onSeek?.(target.visualStart??target.start);
 };
 const scrollCode=(amount:number)=>setCodeOffset(Math.max(0,Math.min(rows.length-visibleRows,boundedOffset+amount)));

 return <div ref={host} className={`live-stage-surface architecture-stage ${compact?'flow-compact':''}`}>
  {compact&&<div className="flow-mobile-tabs" role="tablist" aria-label="Architecture lesson view">
   <button type="button" role="tab" aria-selected={tab==='diagram'} onClick={()=>setTab('diagram')}><Network size={15}/>Diagram</button>
   <button type="button" role="tab" aria-selected={tab==='code'} onClick={()=>setTab('code')}><Code2 size={15}/>Code</button>
  </div>}
  {error?<div className="flow-error" role="alert">Could not lay out this architecture: {error}</div>:!layout?<div className="flow-loading">Arranging the architecture…</div>:<>
  <svg ref={svg} fontFamily="Arial, sans-serif" className="live-stage-svg flow-svg" viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height}
   aria-label="Interactive architecture and code trace" data-flow-ready="true" data-chapter={chapter.id} data-flow-time={snapshot.time.toFixed(3)}
   onPointerDown={panStart} onPointerMove={panMove} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
   onContextMenu={e=>e.preventDefault()} onWheel={e=>{if(e.target instanceof Element&&e.target.closest('[data-flow-code]')){scrollCode(e.deltaY>0?3:-3);return;}zoom(e.deltaY<0?1.1:1/1.1);}}>
   <defs>
    <clipPath id={keyPrefix+'-graph'}><rect x={codeWidth} width={graphWidth} height={size.height}/></clipPath>
    <clipPath id={keyPrefix+'-code'}><rect width={codeWidth} y="55" height={size.height-120}/></clipPath>
    <marker id={keyPrefix+'-arrow'} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="context-stroke" strokeWidth="1.5"/></marker>
    <pattern id={keyPrefix+'-grid'} width="24" height="24" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="1.5" height="1.5" fill="#638374" opacity=".16"/></pattern>
   </defs>
   <rect width={size.width} height={size.height} fill="#10231f"/>
   {graphWidth>0&&<g clipPath={`url(#${keyPrefix}-graph)`}>
    <rect x={codeWidth} width={graphWidth} height={size.height} fill={`url(#${keyPrefix}-grid)`}/>
    <g transform={`translate(${codeWidth+camera.x} ${camera.y}) scale(${camera.zoom})`} data-flow-camera={`${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.zoom.toFixed(4)}`}>
     {graph.edges.map(edge=>{
      const route=layout.edges[edge.id],active=flow.activeEdges.includes(edge.id),past=frame!.completedEdges.has(edge.id);
      const color=active?paint.gold:past?paint.green:'#667d70';
      return <g key={edge.id} data-flow-edge={edge.id} opacity={active?1:past?.7:.37}>
       <path d={pathFor(route.points)} fill="none" stroke={color} strokeWidth={active?3:1.7} strokeDasharray={edge.relationship==='reference'?'7 6':undefined} markerEnd={`url(#${keyPrefix}-arrow)`}/>
       <rect x={route.label.x-88} y={route.label.y-17} width="176" height="24" fill="#10231f"/>
       <text x={route.label.x} y={route.label.y} textAnchor="middle" fontSize="13" fill={color}>{shorten(edge.label,23)}</text>
      </g>;
     })}
     {graph.nodes.map(node=>{
      const box=layout.nodes[node.id],color=paint[node.color],data=frame!.nodeData[node.id],header=52+wrap(node.label,box.width-44,18).length*22;
      const focused=frame!.focus.has(node.id)||selected?.id===node.id,chosen=selected?.id===node.id;
      return <g key={node.id} transform={`translate(${box.x} ${box.y})`} data-flow-node={node.id} data-role={node.id}
       role="button" tabIndex={interactive?0:-1} aria-label={`Inspect ${node.label}`} opacity={focused||snapshot.focus==='flow-overview'?1:.48}
       onClick={()=>select(node.id)} onKeyDown={e=>activate(e,()=>select(node.id))}>
       <rect x="4" y="5" width={box.width} height={box.height} fill="#061410"/>
       <rect width={box.width} height={box.height} fill={chosen?'#243f31':'#19332a'} stroke={chosen?paint.gold:focused?color:'#5a7564'} strokeWidth={chosen?3:1.5}/>
       <rect width="5" height={box.height} fill={color}/>
       <text x="22" y="22" fontSize="11" letterSpacing="1" fill={color}>{node.kind.toUpperCase()}</text>
       {wrap(node.label,box.width-44,18).map((line,i)=><text key={i} x="22" y={46+i*22} fontSize="18" fontWeight="600" fill="#edf1e7">{line}</text>)}
       <path d={`M18 ${header-10}H${box.width-18}`} stroke="#526d59"/>
       <NodeContents node={node} data={data} width={box.width} height={box.height}/>
       {data?.statusLabel&&<text x={box.width-15} y="22" textAnchor="end" fontSize="10" fill="#d3dfcf">{shorten(data.statusLabel,22)}</text>}
       {node.drillDownFunctionId&&<g className="flow-enter-function" role="button" tabIndex={interactive?0:-1} aria-label={`Enter ${node.label} function`}
        onClick={e=>{e.stopPropagation();if(interactive){pause();onDrill?.(node.drillDownFunctionId!);}}}
        onKeyDown={e=>activate(e,()=>{pause();onDrill?.(node.drillDownFunctionId!);})}>
        <rect x={box.width-114} y={box.height-29} width="101" height="21" fill="#314c38" stroke={color}/>
        <text x={box.width-63} y={box.height-14} textAnchor="middle" fontSize="12" fill="#eef1e4">Enter function ↗</text>
       </g>}
      </g>;
     })}
     {frame!.packets.map(packet=><g key={packet.id} transform={`translate(${packet.x} ${packet.y})`} data-flow-packet={packet.id} data-progress={packet.progress.toFixed(5)}>
      <rect x="-7" y="-7" width="14" height="14" fill={paint.gold} stroke="#fff3c6" strokeWidth="2"/>
      <rect x="12" y="-17" width={Math.min(300,packet.payload.length*8+18)} height="29" fill="#203b2b" stroke={paint.gold}/>
      <text x="20" y="3" fontSize="14" fill="#f5e4b7">{shorten(packet.payload,33)}</text>
     </g>)}
    </g>
    <text x={codeWidth+19} y="25" className="flow-canvas-label" fill="#bacebb" fontSize="12">{shorten(graph.title,compact?30:65)}</text>
    <text x={codeWidth+19} y="45" fill="#89ad96" fontSize="11">{lesson.architecture?.illustrative?'Illustrative trace · ':''}{frame!.completed?'Result':'Working state'}</text>
   </g>}
   {codeWidth>0&&<g data-flow-code="true" fontFamily="monospace">
    <rect width={codeWidth} height={size.height} fill="#12241f"/>
    <path d={`M${codeWidth-1} 0V${size.height}`} stroke="#6c8068"/>
    <text x="17" y="25" fontSize="14" fill={paint.gold}>{shorten(file.file,Math.max(14,columns))}</text>
    <text x="17" y="44" fontSize="11" fill="#9db2a4">Source excerpt · {file.language} · {flow.code.lines.map(n=>'L'+n).join(', ')}</text>
    <g clipPath={`url(#${keyPrefix}-code)`}>
     {rows.slice(boundedOffset,boundedOffset+visibleRows).map((row,i)=>{
      const y=66+i*21,active=reference.lines.includes(row.line.lineNumber);
      return <g key={boundedOffset+i} role="button" tabIndex={interactive?0:-1} aria-label={`Line ${row.line.lineNumber}: ${row.line.text}`} onClick={()=>codeClick(row.line)} onKeyDown={e=>activate(e,()=>codeClick(row.line))}>
       {active&&<rect y={y-15} width={codeWidth-1} height="21" fill="#34513b"/>}
       <text x="37" y={y} textAnchor="end" fontSize="12" fill={active?paint.gold:'#789783'}>{row.continuation?'↳':row.line.lineNumber}</text>
       <text x="49" y={y} xmlSpace="preserve" fontSize="14" fill={row.line.drillDownFunctionId?paint.gold:active?'#f0f2e7':'#bed0c3'}>{row.text}</text>
      </g>;
     })}
    </g>
    {rows.length*21+245<size.height&&<g className="flow-code-contract">
     <path d={`M16 ${79+rows.length*21}H${codeWidth-17}`} stroke="#617b5c"/>
     <text x="17" y={105+rows.length*21} fontSize="12" fill={paint.gold}>{activeCode?.atName?'@'+activeCode.atName.replace(/^@/,''):'STEP GOAL'}</text>
     {wrap(activeCode?.goalText||chapter.question,codeWidth-34,14).slice(0,3).map((line,i)=><text key={i} x="17" y={127+rows.length*21+i*20} fontSize="14" fill="#dce7d4">{line}</text>)}
     <text x="17" y={200+rows.length*21} fontSize="11" fill={paint.green}>{frame!.completed?'RESULT STATE':'INPUT STATE'}</text>
     {wrap(JSON.stringify(frame!.variables),codeWidth-34,13).slice(0,Math.max(1,Math.floor((size.height-(220+rows.length*21)-100)/18))).map((line,i)=><text key={i} x="17" y={220+rows.length*21+i*18} fontSize="13" fill="#c2d7c3">{line}</text>)}
    </g>}
    <text x="17" y={size.height-76} fontSize="11" fill="#a8bdac">{shorten(reference.lines.map(n=>file.lines.find(l=>l.lineNumber===n)?.explanation||'').filter(Boolean).join(' · '),columns+2)}</text>
    <text x="17" y={size.height-55} fontSize="11" fill={paint.gold}>{file.lines.some(line=>line.drillDownFunctionId)?'Gold function lines open their reasoning':'Select a mapped source line to follow its beat'}</text>
   </g>}
  </svg>
  {graphWidth>0&&interactive&&<div className="flow-tools" aria-label="Diagram controls">
   <button type="button" title="Show the whole architecture" aria-label="Architecture overview" onClick={()=>setMode('flow-overview')}><Compass size={16}/></button>
   <button type="button" title="Follow the explanation" aria-label="Follow architecture explanation" onClick={()=>setMode('')}><Focus size={16}/></button>
   <button type="button" aria-label="Zoom architecture in" onClick={()=>zoom(1.2)}><ZoomIn size={16}/></button>
   <button type="button" aria-label="Zoom architecture out" onClick={()=>zoom(1/1.2)}><ZoomOut size={16}/></button>
  </div>}
  {codeWidth>0&&interactive&&rows.length>visibleRows&&<div className="flow-code-scroll" style={{left:Math.max(8,codeWidth-78)}}>
   <button type="button" aria-label="Scroll source up" onClick={()=>scrollCode(-visibleRows+1)} disabled={boundedOffset===0}><ArrowUp size={15}/></button>
   <button type="button" aria-label="Scroll source down" onClick={()=>scrollCode(visibleRows-1)} disabled={boundedOffset+visibleRows>=rows.length}><ArrowDown size={15}/></button>
  </div>}
  {selected&&interactive&&<aside className="flow-inspector" aria-label={`${selected.label} details`} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();update(s=>({...s,selected:[]}));}}}>
   <header><span><Eye size={15}/>{selected.label}</span><button type="button" aria-label="Close component details" onClick={()=>update(s=>({...s,selected:[]}))}><X size={18}/></button></header>
   <div className="flow-inspector-body"><p>{selected.description}</p>
    <h4>{frame!.nodeData[selected.id]?.statusLabel||'Current data'}</h4>
    <pre>{(frame!.nodeData[selected.id]?.previewLines||[selected.defaultPreview]).join('\n')}</pre>
    {selected.visual&&<><h4>{selected.visual.title||'Inside the component'}</h4><pre>{[selected.visual.subtitle,...selected.visual.lines||[],...(selected.visual.floats?[JSON.stringify(selected.visual.floats)]:[]),selected.visual.footerNote,...(selected.visual.rows||[]).map(r=>r.leftChip+' → '+r.rightValue+(r.note?'\n'+r.note:'')),...(selected.visual.tiles||[]).map(t=>t.text+(t.subtext?' · '+t.subtext:''))].filter(Boolean).join('\n')}</pre></>}
    <h4>Trace state</h4><pre>{JSON.stringify(frame!.variables,null,2)}</pre><h4>Connections</h4>{graph.edges.filter(e=>e.source===selected.id||e.target===selected.id).map(e=><p className="flow-inspector-connection" key={e.id}>{graph.nodes.find(n=>n.id===e.source)?.label} → {graph.nodes.find(n=>n.id===e.target)?.label}<small>{e.description||e.label}</small></p>)}
    {selected.codeReference&&<><h4>{selected.codeReference.file}</h4><pre>{file.lines.filter(l=>selected.codeReference!.lines.includes(l.lineNumber)).map(l=>l.lineNumber+'  '+l.text).join('\n')}</pre></>}
   </div>
   <footer>{selected.drillDownFunctionId&&<button type="button" onClick={()=>onDrill?.(selected.drillDownFunctionId!)}><CornerDownRight size={15}/>Enter function</button>}
    <button type="button" onClick={()=>onAskNode?.(selected.id)}><MessageCircle size={15}/>Ask QWEEPS</button></footer>
  </aside>}
  </>}
 </div>;
}
