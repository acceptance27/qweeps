import {useState} from 'react';
import type {LiveLesson} from '../../lessonTypes';
import {ReinforcementQuizModal} from '../../ReinforcementQuizModal';
import PrototypeWorkspace from './PrototypeWorkspace';

export default function PrototypePlayer({initialLesson,initialTime=0,initialOpenQuiz=false}:{initialLesson:LiveLesson;initialTime?:number;initialOpenQuiz?:boolean}){
 const [quiz,setQuiz]=useState(initialOpenQuiz||new URLSearchParams(location.search).get('beat')==='quiz'),[voice,setVoice]=useState(initialLesson.id!=='a7c4e71f90d3426b84c719ea064bd230'&&new URLSearchParams(location.search).get('muted')!=='1');
 return <>
  <PrototypeWorkspace lesson={initialLesson} initialTime={initialTime} onQuiz={()=>setQuiz(true)} onClose={()=>{location.href='/?home=1';}} voice={voice} onToggleVoice={()=>setVoice(v=>!v)}/>
  {quiz&&<ReinforcementQuizModal lesson={initialLesson} onClose={()=>setQuiz(false)}/>}
 </>;
}
