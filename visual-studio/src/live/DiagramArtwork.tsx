import React from 'react';
import type {LiveNode} from './lessonTypes';
import {LiveAsset,palette} from './LiveAssets';

const paints:Record<string,string>={...palette,white:'#e6eef0',muted:'#7899a5',ink:'#071117',none:'none'};
/** Explicit primitive props only: no SVG markup, external URLs or generated code. */
export function DiagramArtwork({node,width,height}:{node:LiveNode;width:number;height:number}){
 const size=Math.min(width,height),x=(width-size)/2,y=(height-size)/2;
 return <g className="diagram-motion">
  {node.artwork?.length?<svg x={x} y={y} width={size} height={size} viewBox="0 0 100 100" overflow="visible"><g className="object-art">
   {node.artwork.map((p,i)=>{const common={key:i,stroke:paints[p.stroke],fill:paints[p.fill],strokeWidth:p.strokeWidth,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};switch(p.type){
    case 'path':return <path {...common} d={p.d}/>;
    case 'circle':return <circle {...common} cx={p.cx} cy={p.cy} r={p.r}/>;
    case 'ellipse':return <ellipse {...common} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry}/>;
    case 'rect':return <rect {...common} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx}/>;
    case 'line':return <line {...common} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}/>;
    case 'text':return <text key={i} x={p.x} y={p.y} fontSize={Math.max(Number(p.size),18*100/Math.max(1,size))} textAnchor="middle" fill={paints[p.fill==='none'?p.stroke:p.fill]} fontFamily="QweepsTeachingSerif,serif">{p.text}</text>;
   }})}
  </g></svg>:<g className="object-art"><LiveAsset name={node.icon} x={(width-size*.7)/2} y={(height-size*.7)/2} size={size*.7} color={palette[node.color]}/></g>}
 </g>;
}
