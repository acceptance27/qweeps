import React,{useEffect,useState} from 'react';
import LiveLessonPlayer from './LiveLessonPlayer';
import type {LiveLesson} from './lessonTypes';

export default function MotifModel(){
 const[lesson,setLesson]=useState<LiveLesson|null>(null),[error,setError]=useState('');
 const params=new URLSearchParams(location.search);
 const variant=params.get('model')||'deepseek';
 useEffect(()=>{const file=variant==='haiku'?'motif-haiku':variant==='luna'?'motif-luna':'motif-model';void fetch(`/lessons/${file}.json`).then(r=>{if(!r.ok)throw new Error(`Motif lesson ${file} is unavailable`);return r.json();}).then(setLesson).catch(e=>setError(String(e)));},[variant]);
 if(error)return <div style={{background:'#071117',color:'#eda994',height:'100dvh',display:'grid',placeItems:'center'}}>{error}</div>;
 if(!lesson)return <div style={{background:'#071117',color:'#a5b8bf',height:'100dvh',display:'grid',placeItems:'center'}}>Opening the motif model test…</div>;
 const time=Number(params.get('t')||0);
 return <LiveLessonPlayer initialLesson={lesson} initialTime={Number.isFinite(time)?time:0}/>;
}
