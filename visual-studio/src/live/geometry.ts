export type XY = {x:number;y:number};
export const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export function progress(t:number,start:number,duration:number){return clamp((t-start)/duration);}
export function resample(points:XY[],count=128):XY[]{
  if(points.length<2)throw new Error('A contour needs at least two points');
  const closed=[...points,points[0]],lengths=closed.slice(1).map((p,i)=>Math.hypot(p.x-closed[i].x,p.y-closed[i].y));
  const total=lengths.reduce((a,b)=>a+b,0);
  if(total===0)return Array.from({length:count},()=>({...points[0]}));
  return Array.from({length:count},(_,i)=>{let distance=i/count*total;let j=0;
    while(j<lengths.length-1&&distance>lengths[j]){distance-=lengths[j];j++;}
    const p=closed[j],q=closed[j+1],v=lengths[j]?distance/lengths[j]:0;
    return{x:p.x+(q.x-p.x)*v,y:p.y+(q.y-p.y)*v};});
}
export function morph(from:XY[],to:XY[],value:number,arc=.12):string{
  const a=resample(from),b=resample(to),t=ease(value);
  return a.map((p,i)=>{const dx=b[i].x-p.x,dy=b[i].y-p.y,curve=Math.sin(t*Math.PI)*arc;
    return`${i?'L':'M'}${(p.x+dx*t-dy*curve).toFixed(2)},${(p.y+dy*t+dx*curve).toFixed(2)}`;}).join(' ')+'Z';
}
export type Camera={x:number;y:number;zoom:number};
export type LiveSnapshot={time:number;selected:string[];camera:Camera;region:null|{x1:number;y1:number;x2:number;y2:number};focus:string;chapter:number|null;experiments?:Record<string,number>};
export function initialLiveSnapshot():LiveSnapshot{return{time:0,selected:[],camera:{x:0,y:0,zoom:1},region:null,focus:'',chapter:null};}
export function checkpoint(snapshot:LiveSnapshot):LiveSnapshot{return structuredClone(snapshot);}
export function contains(region:{x1:number;y1:number;x2:number;y2:number},box:{x:number;y:number;width:number;height:number}){
  return box.x+box.width>=region.x1&&box.x<=region.x2&&box.y+box.height>=region.y1&&box.y<=region.y2;
}
