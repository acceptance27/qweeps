import React,{useEffect,useState} from 'react';
import LiveLessonPlayer from './LiveLessonPlayer';
import type {LiveLesson} from './lessonTypes';

export default function MotifModel(){
 const[lesson,setLesson]=useState<LiveLesson|null>(null),[error,setError]=useState('');
 useEffect(()=>{void fetch('/lessons/motif-model.json').then(r=>r.json()).then(setLesson).catch(e=>setError(String(e)));},[]);
 if(error)return <div style={{background:'#071117',color:'#eda994',height:'100dvh',display:'grid',placeItems:'center'}}>{error}</div>;
 if(!lesson)return <div style={{background:'#071117',color:'#a5b8bf',height:'100dvh',display:'grid',placeItems:'center'}}>Opening the motif model test…</div>;
 const time=Number(new URLSearchParams(location.search).get('t')||0);
 return <LiveLessonPlayer initialLesson={lesson} initialTime={Number.isFinite(time)?time:0}/>;
}
