type Beat={start:number;end:number;finishedAt?:number;visualStart?:number;visualEnd?:number};

export function visualBeatIndex(beats:readonly Beat[],time:number){
 const found=beats.findIndex(beat=>time<(beat.visualEnd??beat.end));
 return found<0?Math.max(0,beats.length-1):found;
}

/** Review a completed beat without landing in its outgoing transition. */
export function adjacentBeatTime(beats:readonly Beat[],time:number,direction:number,atStart=false){
 if(!beats.length)throw new RangeError('A lesson needs at least one beat');
 const current=visualBeatIndex(beats,time);
 const index=Math.max(0,Math.min(beats.length-1,current+direction)),beat=beats[index];
 return atStart?(beat.visualStart??beat.start):Math.max(beat.visualStart??beat.start,Math.min(beat.end-.01,beat.finishedAt??beat.end-.5));
}
