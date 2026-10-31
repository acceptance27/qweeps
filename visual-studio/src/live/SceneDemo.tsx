import LiveLessonPlayer from './LiveLessonPlayer';
import {SCENE_DEMO_LESSON} from './sceneDemoLesson';

export default function SceneDemo(){
 const value=Number(new URLSearchParams(location.search).get('t')||0);
 return <LiveLessonPlayer initialLesson={SCENE_DEMO_LESSON} initialTime={Number.isFinite(value)?value:0}/>;
}
