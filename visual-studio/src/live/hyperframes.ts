import {createGSAPFrameAdapter,type GSAPTimelineLike} from '@qweeps/hyperframes-adapter';
import type {FrameAdapter} from '@hyperframes/core';

/** Hyperframes consumes the same absolute clock as the interactive lesson UI. */
export function createLessonAdapter(timeline:GSAPTimelineLike,fps=60,compositionId='qweeps-rizal-live'){
 const adapter:FrameAdapter=createGSAPFrameAdapter({id:compositionId,timeline,fps});
 void adapter.init?.({compositionId,fps,width:1440,height:800});
 return{adapter,seekTime(seconds:number){
  const last=Math.max(0,adapter.getDurationFrames());
  const frame=Number.isFinite(seconds)?Math.max(0,Math.min(last,Math.round(seconds*fps))):0;
  void adapter.seekFrame(frame);
  return frame/fps;
 }};
}
