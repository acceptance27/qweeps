import type {Point} from './types';
export function wrap(text:string,width:number,size=15){
 const max=Math.max(8,Math.floor(width/(size*.62))),lines:string[]=[];
 for(const paragraph of String(text).split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/)){
   if(line.length+word.length+1>max&&line){lines.push(line);line='';}
   if(word.length>max){if(line){lines.push(line);line='';}for(let i=0;i<word.length;i+=max)lines.push(word.slice(i,i+max));}
   else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
 }
 return lines.length?lines:[''];
}
export function polylinePoint(points:Point[],t:number):Point{
 if(!points.length)return{x:0,y:0};
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
 let distance=lengths.reduce((s,n)=>s+n,0)*Math.max(0,Math.min(1,t));
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const k=lengths[i]?distance/lengths[i]:0;return{x:points[i].x+(points[i+1].x-points[i].x)*k,y:points[i].y+(points[i+1].y-points[i].y)*k};}distance-=lengths[i];}
 return points[0];
}
export const pathFor=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
