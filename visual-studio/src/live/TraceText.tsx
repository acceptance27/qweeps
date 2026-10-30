import React,{useEffect,useMemo,useState} from 'react';
import {parse,type Font} from 'opentype.js';
import {clamp} from './geometry';
let fontPromise:Promise<Font>|null=null;
function loadFont(){return fontPromise??=fetch('/live/teaching-serif.ttf').then(r=>{if(!r.ok)throw Error('Could not load lesson typeface');return r.arrayBuffer();}).then(b=>parse(b));}
export function useLessonFont(){const[font,setFont]=useState<Font|null>(null);const[error,setError]=useState('');
 useEffect(()=>{let active=true;loadFont().then(f=>{if(active)setFont(f);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);return{font,error};}
export function TraceText({font,text,x,y,size=32,value=1,color='currentColor',anchor='start'}:{font:Font|null;text:string;x:number;y:number;size?:number;value?:number;color?:string;anchor?:'start'|'middle'|'end'}){
 const glyphs=useMemo(()=>{if(!font)return[];let advance=0;const gs=font.stringToGlyphs(text);
   return gs.map((glyph,i)=>{const result={d:glyph.getPath(advance,0,size).toPathData(2),advance};
     advance+=(glyph.advanceWidth||0)*size/font.unitsPerEm;
     if(i<gs.length-1)advance+=font.getKerningValue(glyph,gs[i+1])*size/font.unitsPerEm;
     return{...result,end:advance};});},[font,text,size]);
 const width=glyphs.at(-1)?.end||0,offset=anchor==='middle'?-width/2:anchor==='end'?-width:0;
 if(!font)return <text x={x} y={y} fontSize={size} fill={color} textAnchor={anchor}>{text}</text>;
 return <g transform={`translate(${x+offset} ${y})`} aria-label={text} role="img" className="live-trace-text">
  {glyphs.map((g,i)=>{const p=clamp((value-i/Math.max(1,glyphs.length)*.4)/.6),draw=clamp(p/.65),fill=clamp((p-.55)/.45);
   return <path key={i} d={g.d} pathLength={1} fill={color} fillOpacity={fill} stroke={color} strokeWidth={.7} strokeOpacity={(1-fill)*.95} strokeDasharray="1 1" strokeDashoffset={1-draw}/>;})}
 </g>;
}
