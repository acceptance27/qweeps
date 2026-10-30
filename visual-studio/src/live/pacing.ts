import type {LiveChapter} from './lessonTypes';

/** Live visuals always advance, even when speech is slow, loading or unavailable. */
export function advanceLiveTime(time:number,dt:number,duration:number){
 return Math.min(duration,time+Math.max(0,dt));
}
export function synchronizedTime(time:number,dt:number,duration:number,audioTime?:number){
 return audioTime!==undefined&&Number.isFinite(audioTime)?Math.max(0,Math.min(duration,audioTime)):advanceLiveTime(time,dt,duration);
}

/** Measured speech cues govern construction; legacy scenes use paced fallback
 * timing. A navigation checkpoint is complete before the outgoing fade, without
 * requiring a fixed pause between passages of a lesson-wide recording.
 */
export function generatedPacing(c:LiveChapter){
 const v=c.visual!;
 const cues=c.narrationCues;
 if(cues?.length){
  const cue=(id:string)=>cues.find(q=>q.target===id)!;
  const revealFloor=(c.visualStart??c.start)-c.start;
  const nodeAt=(id:string)=>Math.max(revealFloor,cue(id).start);
  const speechEnd=Math.max(...cues.map(q=>q.end));
  const nodeDuration=(id:string)=>Math.max(.15,Math.min(3,Math.max(.8,(cue(id).end-cue(id).start)*.72),(speechEnd-cue(id).start-.08)/1.2));
  return{at:(original:number)=>nodeAt(v.nodes.find(n=>n.at===original)?.id||v.nodes[0].id),nodeAt,nodeDuration,
   linkAt:(from:string|undefined,to:string|undefined,_original:number)=>Math.max(from?nodeAt(from):0,to?nodeAt(to):0)+.15,
   linkDuration:(from:string|undefined,to:string|undefined)=>Math.min(2.8,...[from,to].filter(Boolean).map(id=>(cue(id!).end-cue(id!).start)*.65)),
   conclusionAt:Math.max(revealFloor,cue('takeaway').start),conclusionDuration:Math.min(1.4,(cue('takeaway').end-cue('takeaway').start)*.7),
   completedAt:c.finishedAt-c.start,holdBeforeFade:c.end-c.finishedAt-.4};
 }
 const first=Math.min(...v.nodes.map(n=>n.at));
 const last=Math.max(...v.nodes.map(n=>n.at+2),...v.connections.map(l=>l.at));
 const completedAt=c.finishedAt-c.start-.05;
 const conclusionAt=completedAt-1.4;
 const firstAt=.2,lastAt=Math.max(firstAt,conclusionAt-4);
 const at=(original:number)=>firstAt+(original-first)/Math.max(.001,last-first)*(lastAt-firstAt);
 return{at,nodeAt:(id:string)=>at(v.nodes.find(n=>n.id===id)!.at),nodeDuration:(_id:string)=>3,
  linkAt:(_from:string|undefined,_to:string|undefined,original:number)=>at(original),linkDuration:(_from:string|undefined,_to:string|undefined)=>2.8,
  conclusionAt,conclusionDuration:1.4,completedAt,holdBeforeFade:c.end-c.start-.4-completedAt};
}

export function speechTargets(c:LiveChapter,time:number){return [...new Set(c.narrationCues?.filter(q=>q.attention!==false&&time-c.start>=q.start&&time-c.start<q.end).map(q=>q.target)||[])];}
export function speechTarget(c:LiveChapter,time:number){const targets=speechTargets(c,time);return targets.find(id=>id!=='context'&&id!=='takeaway')||targets[0]||'';}
