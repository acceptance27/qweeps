import type {LiveChapter,LiveNode} from './lessonTypes';
import {generatedPacing} from './pacing';

/** Speech drives shared event cues; all motion lands before the finished checkpoint. */
export function diagramMotions(chapter:LiveChapter,node:LiveNode){
 const pacing=generatedPacing(chapter),finish=chapter.finishedAt-.03;
 return (node.motion||[]).map(move=>{
  const start=Math.min(finish-.2,Math.max(chapter.visualStart??chapter.start,chapter.start+pacing.nodeAt(move.cue))+move.delay);
  return {...move,start,duration:Math.max(.01,Math.min(move.duration,finish-start))};
 }).sort((a,b)=>a.start-b.start);
}
