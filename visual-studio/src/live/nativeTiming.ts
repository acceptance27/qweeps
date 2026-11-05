import type {LiveChapter} from './lessonTypes';

export function nativeSceneTime(c: LiveChapter, t: number, sceneCues: {id:string;time:number}[] = []) {
   if(c.renderer!=='manimgl')return t;
   if(c.nativeMap?.length){
     const p=Math.max(0,Math.min(c.end-c.start,t-c.start));
     const map=c.nativeMap;
     let lo=map[0],hi=map[map.length-1];
     if(p<=lo.at)return lo.scene;
     if(p>=hi.at)return hi.scene;
     for(let i=0;i<map.length-1;i++)if(p>=map[i].at&&p<=map[i+1].at){lo=map[i];hi=map[i+1];break;}
     const f=hi.at===lo.at?0:(p-lo.at)/(hi.at-lo.at);
     return lo.scene+f*(hi.scene-lo.scene);
   }
   const offset=c.nativeOffset??c.start;
   const duration=c.nativeDuration??(c.end-c.start);
   const span=Math.max(.01,c.end-c.start);
   const points=[{x:0,y:offset}];
   const cues=sceneCues;
   const anchors=new Map<string,{x:number;y:number}>();
   for(const q of c.narrationCues||[]){
     const hit=cues.find(x=>x.id===q.target);
     if(!hit)continue;
     const x=Math.max(0,Math.min(span,q.start));
     const y=Math.max(offset,Math.min(offset+duration,hit.time));
     const previous=anchors.get(hit.id);
     if(!previous||x<previous.x)anchors.set(hit.id,{x,y});
   }
   for(const point of anchors.values())points.push(point);
   points.push({x:span,y:offset+duration});
   points.sort((a,b)=>a.x-b.x||a.y-b.y);
   for(let i=1;i<points.length;i++)if(points[i].y<points[i-1].y)points[i].y=points[i-1].y;
   const unique:typeof points=[];
   for(const point of points){
     const last=unique[unique.length-1];
     if(last&&point.x===last.x)continue;
     if(!last||point.y>last.y||point.x===0)unique.push(point);
   }
   points.length=0;points.push(...unique);
   const p=Math.max(0,Math.min(span,t-c.start));
   let lo=points[0],hi=points[points.length-1];
   for(let i=0;i<points.length-1;i++)if(p>=points[i].x&&p<=points[i+1].x){lo=points[i];hi=points[i+1];break;}
   const f=hi.x===lo.x?0:(p-lo.x)/(hi.x-lo.x);
   return lo.y+f*(hi.y-lo.y);
}
