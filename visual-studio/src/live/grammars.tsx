import {memo,useMemo} from 'react';
import type {Font} from 'opentype.js';
import {fitCopy} from './layout';
import type {NodeBox} from './layout';
import type {LiveVisual,LiveNode} from './lessonTypes';
import {LiveAsset,palette} from './LiveAssets';

/** The teaching method decides the shape of the explanation, not just a label. */
export type Grammar='cards'|'comparison'|'procedure'|'trace'|'chronology'|'route';

export function chapterGrammar(c:{teaching?:string;visual?:LiveVisual}):Grammar{
 const t=c.teaching,layout=c.visual?.layout;
 if(t==='comparison'&&layout==='comparison')return 'comparison';
 if(t==='algorithm'&&layout==='timeline')return 'trace';
 if(t==='narrative'&&layout==='timeline')return 'chronology';
 if(t==='recall'&&layout==='loci')return 'route';
 return 'cards';
}

export function chronologySpots(n:number){
 return Array.from({length:n},(_,i)=>240+(i*(1200-240))/Math.max(1,n-1));
}
export function routeSpots(n:number){
 if(n===4)return [[195,250],[540,250],[885,250],[1230,250]];
 const fixed=[[230,290],[720,210],[1210,290],[720,390]];
 if(n<=fixed.length)return fixed.slice(0,n);
 return Array.from({length:n},(_,i)=>[160+(i*(1120))/Math.max(1,n-1),i%2?230:330]);
}

export function grammarBoxes(v:LiveVisual,g:Grammar):NodeBox[]{
 const n=v.nodes.length;
 if(g==='comparison'){
  const width=1200/Math.max(1,n);
  return v.nodes.map((node,i)=>({node,x:195+i*width,y:150,width,height:300}));
 }
 if(g==='trace'){
  const top=150,bottom=460,row=(bottom-top)/Math.max(1,n);
  return v.nodes.map((node,i)=>({node,x:45,y:top+i*row,width:1350,height:row-4}));
 }
 if(g==='chronology'){
  const spots=chronologySpots(n);
  // Four dated stations must not overlap: cap each station to the gap between
  // adjacent spots, leaving a readable gutter for the description below.
  const spacing=n>1?(1200-240)/(n-1):1200;
  const width=Math.min(380,Math.max(180,spacing-24));
  return v.nodes.map((node,i)=>({node,x:spots[i]-width/2,y:180,width,height:280}));
 }
 if(g==='route'){
  const spots=routeSpots(n), width=n===4?320:360;
  return v.nodes.map((node,i)=>({node,x:spots[i][0]-width/2,y:spots[i][1]-110,width,height:300}));
 }
 if(g==='procedure'){
  const gap=100,width=(1350-gap*(n-1))/n;
  return v.nodes.map((node,i)=>({node,x:45+i*(width+gap),y:205,width,height:255}));
 }
 return [];
}

const Copy=memo(function Copy({font,text,x,y,width,height,size,minSize=14,color='#c9d9dd',center=false}:{font:Font|null;text:string;x:number;y:number;width:number;height:number;size:number;minSize?:number;color?:string;center?:boolean}){
 const raw=typeof text==='string'?text:(typeof text==='object'&&text?((text as any).title||(text as any).label||(text as any).text||(text as any).name||JSON.stringify(text)):String(text??''));
 const fit=useMemo(()=>fitCopy(font,raw,width,height,size,minSize),[font,raw,width,height,size,minSize]);
 return <g data-layout-issue={fit.overflow?`Text needs more space: ${raw.slice(0,80)}`:undefined}>{fit.lines.map((line,i)=><text key={i} x={center?x+width/2:x} y={y+i*fit.size*1.36} textAnchor={center?'middle':undefined} fontSize={fit.size} fill={color} style={{fontFamily:'QweepsTeachingSerif,serif'}}>{line}</text>)}</g>;
});

export function GrammarDecor({v,g}:{v:LiveVisual;g:Grammar;font:Font|null}){
 const n=v.nodes.length;
 if(g==='comparison'){
  return <g className="comparison-table">
   <path d="M45 140H1395M45 455H1395" fill="none" stroke="#6e94a3" strokeWidth="1.3"/>
   <path d="M45 228H1395M45 300H1395" fill="none" stroke="#35515d" strokeWidth="1"/>
   {Array.from({length:Math.max(0,n-1)},(_,i)=><path key={i} d={`M${195+(i+1)*(1200/n)} 140V455`} fill="none" stroke="#35515d" strokeWidth="1"/>)}
   <text x="50" y="198" fill="#7eabb9" fontSize="17" fontFamily="Arial,sans-serif">OPTION</text>
   <text x="50" y="270" fill="#7eabb9" fontSize="16" fontFamily="Arial,sans-serif">RULE / RANGE</text>
   <text x="50" y="380" fill="#7eabb9" fontSize="17" fontFamily="Arial,sans-serif">TRADE-OFF</text>
  </g>;
 }
 if(g==='trace'){
  const top=150,row=(460-top)/Math.max(1,n);
  return <g className="trace-table">
   <path d="M45 140H1395" fill="none" stroke="#6e94a3" strokeWidth="1.3"/>
   {Array.from({length:n},(_,i)=><path key={i} d={`M45 ${top+i*row}H1395`} fill="none" stroke="#35515d" strokeWidth="1"/>)}
   <text x="55" y="122" fill="#7eabb9" fontSize="17" fontFamily="Arial,sans-serif">STEP</text>
   <text x="112" y="122" fill="#7eabb9" fontSize="17" fontFamily="Arial,sans-serif">OPERATION</text>
   <text x="760" y="122" fill="#7eabb9" fontSize="17" fontFamily="Arial,sans-serif">STATE / VALUE</text>
  </g>;
 }
 if(g==='chronology'){
  return <g className="timeline-axis">
   <path d="M80 330H1360" fill="none" stroke="#648795" strokeWidth="1.4"/>
   {chronologySpots(n).map((x,i)=><path key={i} d={`M${x} 322V338`} fill="none" stroke="#648795" strokeWidth="1.2"/>)}
   <text x="1360" y="150" textAnchor="end" fill="#91a9b5" fontSize="18">Chronology · spacing is schematic</text>
  </g>;
 }
 if(g==='route'){
  const spots=routeSpots(n);
  return <g className="route-path">
   {spots.length>1&&<path data-no-trace="true" d={`M${spots[0][0]} ${spots[0][1]}C${spots[0][0]+160} ${spots[0][1]-120} ${spots[1][0]-160} ${spots[1][1]-120} ${spots[1][0]} ${spots[1][1]}${spots.slice(2).map(p=>`S${p[0]-160} ${p[1]-120} ${p[0]} ${p[1]}`).join('')}`} fill="none" stroke="#5f7f8c" strokeWidth="1.6" strokeDasharray="6 8"/>}
   <text x="1360" y="150" textAnchor="end" fill="#91a9b5" fontSize="18">Memory route · follow the stations</text>
  </g>;
 }
 if(g==='procedure'){
  const centers=grammarBoxes(v,'procedure').map(b=>b.x+b.width/2);
  return <g className="procedure-rail">
   <path d={`M${centers[0]} 170H${centers[centers.length-1]}`} fill="none" stroke="#4d6d7a" strokeWidth="1.2"/>
   {centers.map((x,i)=><g key={i}><circle cx={x} cy="170" r="24" fill="#10222c" stroke={palette[v.nodes[i]?.color]||palette.blue} strokeWidth="2"/><text x={x} y="178" textAnchor="middle" fill={palette[v.nodes[i]?.color]||palette.blue} fontSize="21" style={{fontFamily:'QweepsTeachingSerif,serif'}}>{i+1}</text></g>)}
  </g>;
 }
 return null;
}

export function GrammarNode({g,node,box,index,font,chosen}:{v:LiveVisual;g:Grammar;node:LiveNode;box:NodeBox;index:number;font:Font|null;chosen:boolean}){
 const color=palette[node.color]||palette.blue,w=box.width,h=box.height;
 if(g==='comparison'){
  return <g>
   <rect className="object-frame" width={w} height={h} rx="5" fill={chosen?'#2c3a2a':'transparent'} fillOpacity={.5} stroke={color} strokeOpacity={.22}/>
   <g className="object-art"><LiveAsset name={node.icon} context={`${node.id} ${node.title}`} x={18} y={18} size={44} color={color}/></g>
   <Copy font={font} text={node.title} x={76} y={40} width={w-92} height={40} size={27} color="#e6eef0"/>
   <text x="18" y="118" fill={color} fontSize="30" style={{fontFamily:'QweepsTeachingSerif,serif'}}>{node.tag||''}</text>
   <Copy font={font} text={node.body} x={18} y={208} width={w-36} height={104} size={21}/>
  </g>;
 }
 if(g==='trace'){
  return <g>
   <rect className="object-frame" width={w} height={h} rx="4" fill={chosen?'#2c3a2a':'transparent'} fillOpacity={.45} stroke={color} strokeOpacity={.2}/>
   <g className="object-art"><circle cx="62" cy={h/2} r="23" fill="none" stroke={color} strokeWidth="2"/></g>
   <text x="62" y={h/2+8} textAnchor="middle" fill={color} fontSize="21" style={{fontFamily:'QweepsTeachingSerif,serif'}}>{index+1}</text>
   <Copy font={font} text={node.title} x={104} y={34} width={600} height={30} size={24} color="#e6eef0"/>
   <Copy font={font} text={node.body} x={104} y={64} width={600} height={26} size={18}/>
   <text x="760" y={h/2+10} fill={color} fontSize="28" style={{fontFamily:'QweepsTeachingSerif,serif'}}>{node.tag||''}</text>
   <g className="object-art"><LiveAsset name={node.icon} context={`${node.id} ${node.title}`} x={1290} y={h/2-18} size={36} color={color}/></g>
  </g>;
 }
 if(g==='chronology'){
  return <g>
   <rect className="object-frame" width={w} height={h} fill="transparent" stroke="none"/>
   <text x={w/2} y="82" textAnchor="middle" fill={color} fontSize="17" fontFamily="Arial,sans-serif">{(node.tag||'').toUpperCase()}</text>
   <Copy font={font} text={node.title} x={10} y={112} width={w-20} height={52} size={27} color="#e6eef0" center/>
   <g className="object-art"><circle cx={w/2} cy="150" r="11" fill={color}/><path d={`M${w/2} 128V139M${w/2} 161V176`} fill="none" stroke={color} strokeWidth="1.4"/></g>
   <Copy font={font} text={node.body} x={14} y={196} width={w-28} height={80} size={20} center/>
  </g>;
 }
 if(g==='route'){
  return <g>
   <rect className="object-frame" width={w} height={h} fill="transparent" stroke="none"/>
   <g className="object-art"><circle cx={w/2} cy="100" r="64" fill="#0e2028" stroke={color} strokeWidth="2.4"/><circle cx={w/2} cy="100" r="51" fill="none" stroke={color} strokeOpacity=".45" strokeWidth="1"/></g>
   {node.tag&&<text x={w/2} y="20" textAnchor="middle" fill={color} fontSize="16" fontFamily="Arial,sans-serif">{(node.tag||'').toUpperCase()}</text>}
   <g className="object-art"><circle cx={w/2+47} cy="53" r="16" fill={color}/></g>
   <text x={w/2+47} y="59" textAnchor="middle" fill="#071117" fontSize="16" fontWeight="bold">{index+1}</text>
   <g className="object-art"><LiveAsset name={node.icon} context={`${node.id} ${node.title}`} x={w/2-28} y={72} size={56} color={color}/></g>
   <Copy font={font} text={node.title} x={14} y={192} width={w-28} height={32} size={25} color="#e6eef0" center/>
   <Copy font={font} text={node.body} x={22} y={222} width={w-44} height={62} size={19} center/>
  </g>;
 }
 return null;
}
