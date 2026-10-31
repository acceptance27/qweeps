import LiveLessonPlayer from './LiveLessonPlayer';
import {METHODS_DEMO_LESSON} from './methodsDemoLesson';

export default function MethodsDemo(){
 const value=Number(new URLSearchParams(location.search).get('t')||0);
 return <LiveLessonPlayer initialLesson={METHODS_DEMO_LESSON} initialTime={Number.isFinite(value)?value:0}/>;
}
