import LiveLessonPlayer from './LiveLessonPlayer';
import {METHODS_VISUAL_LESSON} from './methodsVisualLesson';

export default function MethodsVisualDemo(){
 const value=Number(new URLSearchParams(location.search).get('t')||0);
 return <LiveLessonPlayer initialLesson={METHODS_VISUAL_LESSON} initialTime={Number.isFinite(value)?value:0}/>;
}
