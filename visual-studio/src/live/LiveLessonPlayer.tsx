import {architectureModule,flowContext,functionLesson} from './architecture/timeline';
import {nativeSceneTime} from './nativeTiming';
import PixelQ from '../components/PixelQ';
import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,Brain,ChevronLeft,ChevronRight,MessageCircle,Menu,Pause,Play,Sparkles,Volume2,VolumeX,X,RotateCcw,GitBranch} from 'lucide-react';
import rizalManifest from '../../public/lessons/rizal_live.json';
import {api} from '../learning/types';
import {NarrationTransport,StreamingNarrationTransport,type VoiceState} from '../learning/NarrationTransport';
import {synchronizedTime,generatedPacing} from './pacing';
import {checkpoint,clamp,initialLiveSnapshot,type LiveSnapshot} from './geometry';
import {RizalStage,roleTime} from './RizalStage';
import {adjacentBeatTime,visualBeatIndex} from './navigation';
import GeneratedStage from './GeneratedStage';
import {NativeLessonCanvas} from '../learning/NativeLessonCanvas';
import SceneChapterStage from './SceneChapterStage';
import LivePreparation from './LivePreparation';
import {ReinforcementQuizModal,ReinforcementQuizNavbar,createInitialQuizState,playQuizStartSound,type QuizProgressState} from './ReinforcementQuizModal';
import {type LiveLesson,type LiveChapter,type QuizQuestion} from './lessonTypes';
import './live.css';

type Source={title:string;url:string};
type Response={answer:string;liveBranch?:{jobId:string;lessonId:string};sources?:Source[];researchAvailable?:boolean;browserBranch?:{lessonId:string;chapter:number|string;focus:string;visualReason:string}};
type Message={role:'user'|'assistant';text:string;sources?:Source[]};
type Parent={snapshot:LiveSnapshot;label:string;audioPosition:number;lesson:LiveLesson};
type PendingBranch=Parent&{jobId:string};
function EnhancedLiveLessonPlayer({initialLesson,initialTime=0,initialOpenQuiz=false}:{initialLesson?:LiveLesson;initialTime?:number;initialOpenQuiz?:boolean}={}){
 const[manifest,setManifest]=useState<LiveLesson>(initialLesson||rizalManifest),[pendingBranch,setPendingBranch]=useState<PendingBranch|null>(null);
 const manifestRef=useRef(manifest);manifestRef.current=manifest;const generic=manifest.kind==='live_generated',last=manifest.chapters.length-1;
 const params=new URLSearchParams(location.search);
 const androidApp = navigator.userAgent.includes('QWEEPS-Android');
 const[menuOpen,setMenuOpen]=useState(false);
 const[quizUnlocked,setQuizUnlocked]=useState(()=>Boolean((initialOpenQuiz||params.get('quiz')==='1')&&
  ((initialLesson||rizalManifest) as LiveLesson).quiz?.length&&((initialLesson||rizalManifest) as LiveLesson).quiz?.every(q=>q.formatVersion===2)));
 const[quizBeatActive,setQuizBeatActive]=useState(()=>params.get('beat')==='quiz');
 const[generatingQuiz,setGeneratingQuiz]=useState(false);
 const[quizState,setQuizState]=useState<QuizProgressState>(()=>createInitialQuizState(initialLesson||rizalManifest));
 const[quizInspectReturn,setQuizInspectReturn]=useState(false);
 const[state,setState]=useState(()=>({...initialLiveSnapshot(),time:clamp(initialTime,0,manifest.duration)})),[playing,setPlaying]=useState(false),[ready,setReady]=useState(false);
 const[voice,setVoice]=useState(params.get('muted')!=='1'),[audioState,setAudioState]=useState<VoiceState>({loading:false,playing:false,ready:false}),[panel,setPanel]=useState(false);
 const[session,setSession]=useState<string|null>(null),[status,setStatus]=useState('Connecting to QWEEPS…'),[error,setError]=useState('');
 const[question,setQuestion]=useState(''),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false),[parents,setParents]=useState<Parent[]>([]);
 const[seekVersion,setSeekVersion]=useState(0),[focusRequest,setFocusRequest]=useState(0),[branchReason,setBranchReason]=useState('');
 const[stageFading,setStageFading]=useState(false);
 const stageKey=useRef('');
 const current=useRef(state);current.current=state;
 const voices=useRef(voice);voices.current=voice;
 const audioStateRef=useRef(audioState);audioStateRef.current=audioState;
 const playingRef=useRef(playing);playingRef.current=playing;
 const sourceInput=useRef<HTMLTextAreaElement>(null),transcript=useRef<HTMLDivElement>(null);
 const request=useRef<AbortController|null>(null),parentRef=useRef(parents);parentRef.current=parents;
 const lessonAudio=useRef<NarrationTransport|null>(null),answerAudio=useRef<StreamingNarrationTransport|null>(null),resumeOffset=useRef<number|null>(null),clipVideo=useRef<HTMLVideoElement|null>(null);
 if(!lessonAudio.current){lessonAudio.current=new NarrationTransport(async text=>(await api<{url:string}>('narration',{text})).url,setAudioState);for(const c of manifest.chapters)if(c.audio)lessonAudio.current.seed(c.narration,c.audio);if(manifest.audioTrack)lessonAudio.current.seed(manifest.audioTrack.key,manifest.audioTrack.url);}
 if(!answerAudio.current)answerAudio.current=new StreamingNarrationTransport((text,signal)=>fetch('/api/visual/narration/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal}),()=>{});
 useEffect(()=>{setQuizState(prev=>prev.lessonId===manifest.id?prev:createInitialQuizState(manifest,prev.soundEnabled));},[manifest]);
 const foundIndex=manifest.chapters.findIndex(c=>state.time>=c.start&&state.time<c.end);
 const narrationIndex=foundIndex<0?last:foundIndex,narratingChapter=manifest.chapters[narrationIndex];
 const index=visualBeatIndex(manifest.chapters,state.time);
 const chapter=manifest.chapters[state.time>=manifest.duration?last:index];
 useLayoutEffect(()=>{const activeKey=quizBeatActive?'__quiz_beat__':chapter.id;if(!quizBeatActive&&chapter.transition?.type==='none'){stageKey.current=activeKey;setStageFading(false);return;}if(stageKey.current===activeKey)return;stageKey.current=activeKey;setStageFading(true);const timer=setTimeout(()=>setStageFading(false),70);return()=>clearTimeout(timer);},[chapter.id,chapter.transition?.type,quizBeatActive]);
 const nativeTime=(c:LiveChapter,t:number)=>nativeSceneTime(c,t,manifest.nativeScenes?.[c.nativeScene||'']?.cues||[]);
 const selectedDetails=state.selected.map(id=>{const flowNode=architectureModule(manifest)?.graph.nodes.find(n=>n.id===id);if(flowNode)return{id,title:flowNode.label,body:flowNode.description};const node=chapter.visual?.nodes.find(n=>n.id===id);if(node)return node;const desc=chapter.roles?.[id];return{id,title:desc?desc.split(':')[0]:id.replaceAll('-',' '),body:desc?(desc.split(':').slice(1).join(':').trim()||desc):`${chapter.title} — ${chapter.insight}`};});
 const choice=chapter.visual?.experiment?.choices[state.experiments?.[chapter.id]??-1];
 const caption=(narrationIndex===index?choice?.explanation:undefined)||((narratingChapter.cues?.length||!generic)?[...narratingChapter.cues].reverse().find(c=>state.time-narratingChapter.start>=c.at)?.text:(state.time-narratingChapter.start>=generatedPacing(narratingChapter).conclusionAt?narratingChapter.visual!.takeaway:narratingChapter.question))||narratingChapter.question;
 const bridge=narratingChapter.continuity?.bridge;
 const showBridge=!!bridge&&(narrationIndex!==index||state.time<(narratingChapter.continuity?.spokenEnd??(narratingChapter.visualStart??narratingChapter.start+5)));
 const audioKey=manifest.audioTrack?.key||narratingChapter.narration,canStart=!voice||!manifest.audioTrack||audioState.ready;
 const cueReached=!!manifest.audioTrack||state.time>=narratingChapter.start+narratingChapter.narrationAt;
 const pause=()=>{if(playingRef.current&&voices.current&&lessonAudio.current?.isReady)resumeOffset.current=lessonAudio.current.position;setPlaying(false);lessonAudio.current?.pause();answerAudio.current?.pause();};
 const seek=(time:number)=>{pause();setQuizBeatActive(false);resumeOffset.current=null;if(manifest.audioTrack)lessonAudio.current?.seek(clamp(time,0,manifest.duration));setState(s=>({...s,time:clamp(time,0,manifest.duration),focus:''}));setSeekVersion(v=>v+1);};
 const openQuizBeat=()=>{pause();setQuizInspectReturn(false);setQuizBeatActive(true);playQuizStartSound(quizState.soundEnabled);};
 const[quizError,setQuizError]=useState('');
 const generateQuizNow=async()=>{
  if(generatingQuiz)return;
  setGeneratingQuiz(true);setQuizError('');
  playQuizStartSound(quizState.soundEnabled);
  try{
   const res=await api<{quiz:QuizQuestion[]}>('live/quiz',manifest.architectureScope?{lesson:manifest,regenerate:true}:{lessonId:manifest.id,regenerate:true});
   if(res?.quiz?.length){
    const updated={...manifest,quiz:res.quiz};
    setManifest(updated);
    setQuizState(prev=>createInitialQuizState(updated,prev.soundEnabled));
    setQuizUnlocked(true);
   }else throw new Error('The model returned no quiz cards. Try generating again.');
  }catch(e){
   setQuizError((e as Error).message || 'Could not generate a fresh quiz. Please try again.');
  }finally{
   setGeneratingQuiz(false);
  }
 };
 const step=(direction:number,atStart=true)=>{
  if(quizBeatActive){
   if(direction<0){
    const lastChap=manifest.chapters[last];
    const finishTarget=lastChap.finishedAt??Math.max((lastChap.visualStart??lastChap.start)+.01,lastChap.end-.25);
    seek(atStart?lastChap.start:finishTarget);
    setState(s=>({...s,chapter:null,camera:{x:0,y:0,zoom:1},selected:[],region:null}));
   }
   return;
  }
  const curIdx=visualBeatIndex(manifest.chapters,current.current.time);
  if(direction>0&&(narrationIndex===last||curIdx===last)){
   openQuizBeat();
   return;
  }
  const targetIndex=Math.max(0,Math.min(manifest.chapters.length-1,narrationIndex+direction));
  seek(atStart?manifest.chapters[targetIndex].start:adjacentBeatTime(manifest.chapters,current.current.time,direction,false));
  setState(s=>({...s,chapter:null,camera:{x:0,y:0,zoom:1},selected:[],region:null}));
  setBranchReason('');
 };
 const close=()=>{pause();request.current?.abort();if(session)void api('closed',{sessionId:session,desktop:params.get('desktop')==='1'}).catch(()=>{});window.location.href='/';};
 const viewContext=(s=current.current)=>{const m=manifestRef.current;return{sceneId:m.kind==='live_generated'?'live_generated':'rizal_live',lessonId:m.rootLessonId||m.id,architectureScope:m.architectureScope,architectureContext:flowContext(m,m.chapters[visualBeatIndex(m.chapters,s.time)],s.time,s.selected),documentId:m.documentId,title:m.title,focused:document.hasFocus(),time:s.time,camera:s.camera,selection:s.selected,region:s.region,experiments:s.experiments,
   lessonContext:{chapter:visualBeatIndex(m.chapters,s.time),narrationChapter:m.chapters.findIndex(c=>s.time<c.end),sources:m.sources,representation:m.representation},browserRenderer:{backend:m.architecture?'SVG/ELK':'SVG/GSAP',live:true,focus:s.focus},sourceContext:'',branchDepth:parentRef.current.length};};
 async function speakAnswer(text:string){if(!voices.current)return;try{await answerAudio.current!.prepare(text);await answerAudio.current!.playFrom(0);}catch{setStatus('Answer shown · voice unavailable');}}
 function applyResponse(reply:Response,origin:LiveSnapshot,label:string,audioPosition=lessonAudio.current?.position||0,originLesson=manifestRef.current,mode:'question'|'branch'='question'){
  if(mode==='question'||(!reply.liveBranch&&!reply.browserBranch)){
   setMessages(m=>[...m,{role:'assistant',text:reply.answer,sources:reply.sources}]);
   void speakAnswer(reply.answer);
  }
  if(reply.liveBranch){
   setPanel(false);
   setPendingBranch({jobId:reply.liveBranch.jobId,snapshot:checkpoint(origin),lesson:originLesson,label,audioPosition});
  }
  else if(reply.browserBranch){const b=reply.browserBranch,m=manifestRef.current;
   const ci=typeof b.chapter==='number'?b.chapter:m.chapters.findIndex(c=>c.id===b.chapter),c=m.chapters[ci];
   if(!c||(b.lessonId&&b.lessonId!==m.id)){setError('The requested visual branch is unavailable.');return;}
   setParents(p=>[...p,{snapshot:checkpoint(origin),label,audioPosition,lesson:originLesson}]);
   resumeOffset.current=null;
   const time=b.focus&&roleTime[b.focus]!==undefined?roleTime[b.focus]:Math.min(c.end-1,c.start+Math.max(2,c.cues[1]?.at||5));
   setState({...initialLiveSnapshot(),time,chapter:ci,selected:b.focus?[b.focus]:[],focus:b.focus});
   setSeekVersion(v=>v+1);setFocusRequest(v=>v+1);setBranchReason(b.visualReason);setStatus('Focused exploration · your previous place is saved');
   setPanel(false);
  }else setStatus(reply.researchAvailable===false?'Answered · source lookup unavailable':'Answered at your paused position');
 }
 async function ask(mode:'question'|'branch'='question',text=question){
  if(!text.trim()||!session||busy)return;pause();
  if(mode==='question')setPanel(true);
  setBusy(true);setError('');setQuestion('');
  const origin=checkpoint(current.current),originLesson=manifestRef.current,originAudioPosition=lessonAudio.current?.position||0,q=text.trim(),controller=new AbortController();request.current=controller;
  if(mode==='question')setMessages(m=>[...m,{role:'user',text:q}]);
  setStatus(mode==='branch'?'QWEEPS is building a visual branch…':'QWEEPS is considering your question…');
  const timeout=setTimeout(()=>controller.abort(),180000);
  try{const reply=await api<Response>('ask',{sessionId:session,question:q,mode,context:viewContext(origin)},controller.signal);if(!controller.signal.aborted)applyResponse(reply,origin,q,originAudioPosition,originLesson,mode);}
  catch(e){setError(controller.signal.aborted?'Request stopped. Your paused view is preserved.':(e as Error).message);if(mode==='question')setQuestion(q);}
  finally{clearTimeout(timeout);request.current=null;setBusy(false);}
 }
 function drillArchitecture(functionId:string){
  const origin=manifestRef.current,child=functionLesson(origin,functionId);if(!child)return;
  pause();setParents(p=>[...p,{snapshot:checkpoint(current.current),lesson:origin,label:origin.title,audioPosition:lessonAudio.current?.position||0}]);
  setManifest(child);setState(initialLiveSnapshot());resumeOffset.current=null;setSeekVersion(v=>v+1);
  setQuizBeatActive(false);setQuizUnlocked(false);setBranchReason('');setStatus('Inside '+child.title);
 }
 function askArchitectureNode(nodeId:string){pause();setPanel(true);setQuestion('Explain what '+(architectureModule(manifest)?.graph.nodes.find(n=>n.id===nodeId)?.label||nodeId)+' does at this step.');}
 function returnToParent(){const p=parentRef.current.at(-1);if(!p)return;pause();setManifest(p.lesson);setState(checkpoint(p.snapshot));setParents(old=>old.slice(0,-1));resumeOffset.current=p.audioPosition;setSeekVersion(v=>v+1);setBranchReason('');setStatus('Returned to your saved time, camera, selection and narration position');}
 useEffect(()=>{let active=true;Promise.all([api('session',{}),api('health')]).then(([s,h])=>{if(active){setSession(s.sessionId);setStatus(h.modelReady?`QWEEPS connected · ${h.askModel||h.model}`:'No AI model configured');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;request.current?.abort();lessonAudio.current?.dispose();answerAudio.current?.dispose();};},[]);
 useEffect(()=>{if(!session)return;const close=()=>{void fetch('/api/visual/native/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:session}),keepalive:true}).catch(()=>{});};window.addEventListener('pagehide',close);return()=>window.removeEventListener('pagehide',close);},[session]);
 useEffect(()=>{if(!session||chapter.renderer==='manimgl')return;const native=manifest.chapters.find(c=>c.renderer==='manimgl'&&c.nativeScene);if(!native)return;const t=(native.nativeOffset??native.start)+.1;void api('native/state',{sessionId:session,state:{lessonId:native.nativeScene,time:t,experiment:{},selected:[],camera:{x:0,y:0,zoom:1}}}).catch(()=>{});},[session,manifest.id,chapter.renderer]);
 useEffect(()=>{if(!session)return;let pending=false;const poll=async()=>{if(pending)return;pending=true;try{
   await api('state',{sessionId:session,context:viewContext()});const result=await api<{commands:any[]}>(`events?sessionId=${session}`);
   for(const event of result.commands){if(event.command==='pause')pause();if(event.command==='resume'&&canStart)setPlaying(true);if(event.command==='next')step(1);if(event.command==='previous')step(-1);if(event.command==='close')close();if(event.command==='branch')void ask('branch',event.question||'Explain the selected detail visually.');if(event.command==='reply'){pause();applyResponse(event.reply,checkpoint(current.current),event.question);}}
  }catch(e){if((e as Error).message.includes('expired')){const replacement=await api('session',{});setSession(replacement.sessionId);}}finally{pending=false;}};
  void poll();const timer=setInterval(poll,900);return()=>clearInterval(timer);
 },[session,voice,busy,manifest.id,canStart]);
 useEffect(()=>{for(const c of manifest.chapters)if(c.audio)lessonAudio.current!.seed(c.narration,c.audio);if(manifest.audioTrack)lessonAudio.current!.seed(manifest.audioTrack.key,manifest.audioTrack.url);},[manifest]);
 useEffect(()=>{if(!voice){lessonAudio.current?.pause();answerAudio.current?.pause();return;}let active=true;lessonAudio.current!.prepare(audioKey).catch(()=>{if(active){setStatus('Narration unavailable · captions remain available');setVoice(false);}});return()=>{active=false;};},[voice,manifest.id,audioKey]);
 useEffect(()=>{
  if(!manifest.speechPending)return;
  let active=true;
  const timer=setInterval(async()=>{
   try{
    const fresh=await api<LiveLesson>(`live/lessons/${manifest.id}`);
    if(!active||!fresh||fresh.speechPending)return;
    if(fresh.audioTrack)lessonAudio.current?.seed(fresh.audioTrack.key,fresh.audioTrack.url);
    setManifest(fresh);
    setSeekVersion(v=>v+1);
   }catch{}
  },2000);
  return()=>{active=false;clearInterval(timer);};
 },[manifest.id,manifest.speechPending]);
 useEffect(()=>{if(!voice||manifest.audioTrack)return;for(const next of manifest.chapters.slice(narrationIndex+1,narrationIndex+3))void lessonAudio.current!.prefetch(next.narration).catch(()=>{});},[voice,manifest.id,narratingChapter.id]);
 useEffect(()=>{let active=true;if(!playing||!voice||!cueReached){lessonAudio.current?.pause();return;}
  answerAudio.current?.pause();const restoredOffset=resumeOffset.current;resumeOffset.current=null;
  void lessonAudio.current!.prepare(audioKey).then(()=>{if(active&&playingRef.current)return lessonAudio.current!.playFrom(restoredOffset??(manifest.audioTrack?current.current.time:Math.max(0,current.current.time-narratingChapter.start-narratingChapter.narrationAt)));}).catch(()=>{if(active){setStatus('Narration unavailable · captions remain available');setVoice(false);}});return()=>{active=false;};
 },[playing,voice,manifest.id,audioKey,cueReached,seekVersion]);
 useEffect(()=>{if(!playing||!ready||busy)return;let previous=performance.now(),id:number;
  const tick=(now:number)=>{const dt=Math.min(.08,(now-previous)/1000);previous=now;setState(s=>{
    const finalEnd=Math.min(manifest.duration,manifest.chapters[last]?.end??manifest.duration);
    const limit=s.chapter===null?finalEnd:manifest.chapters[s.chapter].end;
    const master=voices.current&&lessonAudio.current?.isReady?(manifest.audioTrack?lessonAudio.current.position:narratingChapter.start+narratingChapter.narrationAt+lessonAudio.current.position):undefined;
    const next=synchronizedTime(s.time,dt,limit,master);
    if(next>=limit-.02){
     setPlaying(false);
     lessonAudio.current?.pause();
     const atFinalBeat=s.chapter===null||s.chapter===last||visualBeatIndex(manifest.chapters,next)===last||next>=finalEnd-.05;
     if(atFinalBeat){
      setQuizInspectReturn(false);
      setQuizBeatActive(true);
      playQuizStartSound(quizState.soundEnabled);
     }
     return{...s,time:limit,chapter:null};
    }
    return{...s,time:next};});id=requestAnimationFrame(tick);};
  id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);
 },[playing,ready,busy,manifest.id,last,quizState.soundEnabled]);
 useEffect(()=>{if(chapter.clip||chapter.renderer==='manimgl')setReady(true);},[chapter.id,chapter.clip?.video,chapter.renderer]);
 useEffect(()=>{const v=clipVideo.current;if(!v||!chapter.clip)return;const start=chapter.clip.offset||0,end=start+(chapter.clip.duration??chapter.end-chapter.start);const target=Math.max(start,Math.min(end-.05,start+(state.time-chapter.start)));if(Math.abs(v.currentTime-target)>.25)v.currentTime=target;if(playing&&!busy){void v.play().catch(()=>{});}else{v.pause();}},[state.time,playing,busy,chapter.id,chapter.clip?.video]);
 useEffect(()=>{transcript.current?.scrollTo({top:transcript.current.scrollHeight,behavior:'smooth'});},[messages,busy]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(menuOpen){e.preventDefault();setMenuOpen(false);return;}if(quizBeatActive){e.preventDefault();setQuizBeatActive(false);return;}e.preventDefault();close();return;}const target=e.target instanceof Element?e.target:null;if(target?.closest('textarea,select,[contenteditable="true"],input:not([type="range"])')||e.altKey||e.ctrlKey||e.metaKey)return;if(quizBeatActive&&['1','2','3','4','Enter',' '].includes(e.key))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();step(e.key==='ArrowLeft'?-1:1,!e.shiftKey);return;}if(e.code==='Space'&&!target?.closest('button')){e.preventDefault();if(playing)pause();else if(canStart){if(quizBeatActive)setQuizBeatActive(false);if(state.time>=manifest.duration-.05)seek(0);setPlaying(true);}}if(e.key==='/'){e.preventDefault();setPanel(true);setTimeout(()=>sourceInput.current?.focus(),0);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 return <main className={`qweeps-live ${quizBeatActive?'quiz-active':'lesson-active'} ${panel?'chat-visible':''}`} data-playhead={state.time.toFixed(3)} data-scene={generic?'live_generated':'rizal_live'}>
  <button type="button" className="live-menu-toggle" aria-label={menuOpen?"Close lesson menu":"Open lesson menu"} aria-expanded={menuOpen} aria-controls="lesson-menu" onClick={()=>setMenuOpen(open=>!open)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>
  <header id="lesson-menu" className="live-header" hidden={!menuOpen}><a href="/?home=1" className="live-brand" title="Return to main menu"><PixelQ/><span>QWEEPS <small>VISUAL LEARNING</small></span></a><div className="live-lesson-name"><span>{generic?(manifest.documentTitle?'PDF / LIVE LESSON':'QWEEPS / LIVE LESSON'):'History / Philippines'}</span><h1 title={manifest.title}>{generic?manifest.title:<>José Rizal<span> · beyond the monument</span></>}</h1></div><nav><span className="live-mode"><i/>Live</span><button type="button" className="live-quiz-trigger" aria-label="Go to Quiz Beat" title="Jump to the final Quiz Beat" onClick={()=>{setMenuOpen(false);openQuizBeat();}}><Brain size={15}/><span>Quiz / Tests</span></button><button aria-label={voice?'Mute narration':'Enable narration'} onClick={()=>{pause();setVoice(v=>!v);setMenuOpen(false);}}>{voice?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><button aria-label="Open QWEEPS conversation" onClick={()=>{setPanel(p=>!p);setMenuOpen(false);}}><MessageCircle size={18}/></button><button aria-label="Close lesson" onClick={close}><X size={19}/></button></nav></header>
  <div className="live-layout"><section className="live-canvas-column">
   {quizBeatActive?(
    <div className="live-quiz-header-row">
    <div className="live-question live-quiz-question"><span>{`${String(manifest.chapters.length+1).padStart(2,'0')} / ${String(manifest.chapters.length+1).padStart(2,'0')}`}</span><div><p>REINFORCEMENT QUIZ</p><h2>{manifest.title}</h2></div></div>
    <ReinforcementQuizNavbar
     lesson={manifest}
     quizState={quizState}
     setQuizState={setQuizState}
     hideTitle
     className="live-replaced-quiz-navbar"
    />
    </div>
   ):(
    <div className="live-question"><span>{`${String(narrationIndex+1).padStart(2,'0')} / ${String(manifest.chapters.length).padStart(2,'0')}`}</span><div><h2>{narratingChapter.question}</h2>{showBridge&&<p className="live-continuity">{bridge}</p>}</div>{quizInspectReturn&&<button type="button" className="live-return" onClick={openQuizBeat}><Brain size={15}/>Return to Quiz</button>}{parents.length>0&&<button className="live-return" onClick={returnToParent}><ArrowLeft size={15}/>Return to {parentRef.current.at(-1)?.snapshot.time.toFixed(1)}s</button>}</div>
   )}
   {branchReason&&<div className="live-branch-reason"><GitBranch size={13}/>{branchReason}</div>}
   <div className="live-stage-wrap">{quizBeatActive?(quizUnlocked?<ReinforcementQuizModal embedded hideHeader lesson={manifest} quizState={quizState} setQuizState={setQuizState} onClose={()=>setQuizBeatActive(false)} onJumpToChapter={chIdx=>{const target=manifest.chapters[chIdx];if(target){setQuizInspectReturn(true);setQuizBeatActive(false);seek((target.visualStart??target.start)+.01);setState(s=>({...s,chapter:null,camera:{x:0,y:0,zoom:1}}));}}}/>:<div className="quiz-beat-prompt-stage"><div className="quiz-beat-prompt-card"><div className="quiz-beat-prompt-icon"><Brain size={34}/></div><span className="quiz-beat-prompt-kicker">BEAT {manifest.chapters.length+1} · END OF LESSON</span><h3>Ready to test your understanding?</h3><p>Practice the {manifest.chapters.length} chapters in <strong>{manifest.title}</strong>. Missed questions return for spaced recall.</p>{quizError&&<p className="live-error" role="alert">{quizError}</p>}<div className="quiz-beat-prompt-actions"><button type="button" className="quiz-beat-generate-btn" disabled={generatingQuiz} onClick={()=>void generateQuizNow()}><Sparkles size={17}/><span>{generatingQuiz?'Generating Quiz…':'Generate Quiz'}</span></button><button type="button" className="quiz-beat-replay-btn" onClick={()=>{setQuizBeatActive(false);seek(0);setPlaying(true);}}><RotateCcw size={15}/><span>Replay Lesson</span></button></div></div></div>):chapter.renderer==='manimgl'&&androidApp?<div className="live-native-unavailable"><h3>This scene uses the desktop renderer</h3><p>Choose another chapter, or use the quiz to review this lesson on your phone.</p><button type="button" onClick={openQuizBeat}><Brain size={16}/>Open quiz</button></div>:chapter.renderer==='manimgl'?<div className="live-stage-surface"><NativeLessonCanvas sessionId={session} snapshot={{sceneId:chapter.nativeScene||'manim_production',plan:null,time:nativeTime(chapter,state.time),nodes:{},positions:{},camera:state.camera,selected:state.selected,region:null}} update={fn=>setState(s=>{const n=fn({sceneId:chapter.nativeScene||'manim_production',plan:null,time:nativeTime(chapter,s.time),nodes:{},positions:{},camera:s.camera,selected:s.selected,region:null});return{...s,selected:n.selected,camera:n.camera??s.camera,region:n.region};})} pause={pause} onReady={v=>{if(v)setReady(true);}} onFrame={()=>{}}/></div>:chapter.clip?<div className="live-stage-surface"><video ref={clipVideo} className="live-beat-clip" src={chapter.clip.video} muted playsInline preload="auto"/>{chapter.hotspots?.map(h=><button key={h.id} className="live-clip-hotspot" aria-label={`Inspect ${h.label}`} title={h.label} style={{left:`${h.x}%`,top:`${h.y}%`,width:`${h.w}%`,height:`${h.h}%`}} onClick={()=>{pause();setState(s=>({...s,selected:[h.id],focus:h.id}));setStatus(`Selected ${h.label} · ask about it`);}}/>)}</div>:chapter.scene?<SceneChapterStage chapter={chapter} time={state.time} selected={state.selected} update={setState} pause={pause} onReady={v=>{if(v)setReady(true);}}/>:generic?<GeneratedStage lesson={manifest} snapshot={state} focusRequest={focusRequest} update={setState} pause={pause} onReady={v=>{if(v)setReady(true);}} onDrill={drillArchitecture} onAskNode={askArchitectureNode} onSeek={seek}/>:<RizalStage snapshot={state} focusRequest={focusRequest} update={setState} pause={pause} onReady={v=>{if(v)setReady(true);}}/>}<div className={`live-stage-fade ${stageFading?'on':''}`}/>{!quizBeatActive&&<div className="live-caption" aria-live="off">{caption}</div>}</div>

   <footer className="live-transport"><label className="live-chapter-picker"><span>Chapter</span><select aria-label="Choose lesson chapter" value={quizBeatActive?'quiz':narrationIndex} onChange={e=>{if(e.target.value==='quiz'){openQuizBeat();return;}const target=manifest.chapters[Number(e.target.value)];seek(target.start);setState(s=>({...s,chapter:null,camera:{x:0,y:0,zoom:1}}));}}>{manifest.chapters.map((c,i)=><option key={c.id} value={i}>{i+1}. {c.title}</option>)}<option value="quiz">Quiz</option></select></label><div className="live-chapters">{manifest.chapters.map((c,i)=><button key={c.id} className={!quizBeatActive&&(narrationIndex===i||chapter.id===c.id)?'active':''} onClick={()=>{setQuizBeatActive(false);seek(c.start);setState(s=>({...s,chapter:null,camera:{x:0,y:0,zoom:1}}));}}><span>{i+1}</span>{generic?c.title:['Origins & medicine','The European journey','Two novels','The Dapitan years','Trial & farewell','Public memory'][i]}</button>)}<button key="__quiz_beat__" className={`quiz-beat-tab ${quizBeatActive?'active':''}`} onClick={openQuizBeat}><span>{manifest.chapters.length+1}</span>{quizUnlocked?'Quiz':'Generate Quiz'}</button></div>
   <input type="range" aria-label="Lesson progress" min="0" max={manifest.duration} step=".01" value={state.time} onChange={e=>seek(Number(e.target.value))}/><div className="live-playback"><div><button aria-label="Previous chapter" title="Previous chapter (←); Shift+← for finished beat" aria-keyshortcuts="ArrowLeft Shift+ArrowLeft" onClick={e=>step(-1,!e.shiftKey)}><ChevronLeft size={18}/></button><button className="live-play" aria-label={playing?'Pause lesson':canStart?'Play lesson':'Preparing narration'} disabled={!ready||!canStart} onClick={()=>{if(playing)pause();else{setQuizBeatActive(false);if(state.time>=manifest.duration-.05)seek(0);setPlaying(true);}}}>{playing?<Pause size={18}/>:<Play size={18}/>}</button><button aria-label="Next chapter" title="Next chapter (→); Shift+→ for finished beat" aria-keyshortcuts="ArrowRight Shift+ArrowRight" onClick={e=>step(1,!e.shiftKey)}><ChevronRight size={18}/></button><span>{state.time.toFixed(1)}<small> / {Math.round(manifest.duration)} s</small></span></div><p>← / → chapter narration · Shift + ← / → finished beat</p><div style={{display:'flex',alignItems:'center',gap:'14px'}}><button onClick={openQuizBeat} style={{color:'#edca82'}}><Brain size={14}/>{quizUnlocked?'Take Quiz':'Generate Quiz'}</button><button onClick={()=>{setPanel(true);sourceInput.current?.focus();}}>Ask QWEEPS <ArrowUpRight size={15}/></button></div></div></footer>
  </section>
  <aside className="live-chat"><div className="live-chat-heading"><span>FOLLOW YOUR CURIOSITY</span><button aria-label="Hide QWEEPS conversation" onClick={()=>setPanel(false)}><X size={17}/></button></div><h2>Ask about what you see.</h2><p className="live-ai-status" role="status">{status}</p>
   {selectedDetails.length>0&&<section className="live-selection-details" aria-label="Selected object explanations">{selectedDetails.map(n=><article key={n.id}><h3>{n.title}</h3><p>{n.body}</p></article>)}</section>}
   {chapter.visual?.experiment&&<div className="live-experiment"><strong>Explore a case</strong><p>{chapter.visual.experiment.prompt}</p>{chapter.visual.experiment.choices.map((c,i)=><button key={i} className={state.experiments?.[chapter.id]===i?'active':''} onClick={()=>{pause();setState(s=>({...s,experiments:{...s.experiments,[chapter.id]:i},selected:[c.target],focus:'',camera:{x:0,y:0,zoom:1}}));}}>{c.label}</button>)}</div>}<div className="live-messages" ref={transcript}>{!messages.length&&<div className="live-chat-welcome"><p>Your question keeps its place in the lesson.</p><button onClick={openQuizBeat}>{quizUnlocked?'Take Reinforcement Quiz':'Generate Quiz'} <Brain size={14}/></button><button onClick={()=>void ask('question',generic?`Explain ${chapter.title}, using the source and this view.`:'Why was José Rizal executed?')}>{generic?'Explain this part':'Why was Rizal executed?'} <ArrowUpRight size={14}/></button><button onClick={()=>void ask('branch',generic?`Make a focused visual explanation of ${chapter.title}, resolving the selected detail.`:'Did Rizal’s execution start the revolution? Show the dates.')}>{generic?'Explore visually':'Explore the chronology'} <ArrowUpRight size={14}/></button></div>}{messages.map((m,i)=><article key={i} className={`live-message ${m.role}`}><span>{m.role==='user'?'YOU':'QWEEPS'}</span><p>{m.text}</p>{m.sources?.length?<div className="live-source-links">{m.sources.map(x=><a key={x.url} href={x.url} target="_blank" rel="noreferrer">{x.title}<ArrowUpRight size={11}/></a>)}</div>:null}</article>)}{busy&&<div className="live-thinking"><i/>Consulting the lesson and its sources…</div>}</div>
   {error&&<div className="live-error" role="alert">{error}</div>}
   <form className="live-composer" onSubmit={e=>{e.preventDefault();void ask(generic?'branch':'question');}}><label htmlFor="live-question-input">{state.selected.length?`About ${state.selected.join(', ')}`:`At ${state.time.toFixed(1)}s · ${chapter.title}`}</label><textarea ref={sourceInput} id="live-question-input" aria-label="Ask QWEEPS about this lesson" value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask why, compare, or follow a detail…" rows={3} disabled={busy} maxLength={4000}/><div>{busy?<button type="button" onClick={()=>request.current?.abort()}>Stop request</button>:<><button type="button" disabled={!session||!question.trim()} onClick={()=>void ask('question')}><MessageCircle size={14}/>Text reply</button><button type="submit" aria-label="Send live lesson question" disabled={!session||!question.trim()}><GitBranch size={14}/>Branch mini-lesson</button></>}</div></form>
   <details className="live-evidence"><summary>Lesson sources &amp; visual conventions</summary><p>{generic?`AI-generated from ${manifest.documentTitle||'general knowledge'}. Source page references and the chosen presentation are retained with this lesson. SVG assets come from the bundled catalog; the scene passed browser-frame review.`:<>Modern coastlines: Natural Earth. Eye anatomy: adapted from MesserWoland’s Wikimedia SVG. Quill and ink: Lorc / Game-icons. Other symbols use Lucide; the clinic is schematic. Branches focus authored views; answers come from the configured AI.</>}</p>{manifest.sources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}</details>
  </aside></div>
 {pendingBranch&&<LivePreparation jobId={pendingBranch.jobId} onCancel={()=>setPendingBranch(null)} onReady={lesson=>{pause();setParents(p=>[...p,{snapshot:pendingBranch.snapshot,label:pendingBranch.label,audioPosition:pendingBranch.audioPosition,lesson:pendingBranch.lesson}]);setManifest(lesson);setState(initialLiveSnapshot());resumeOffset.current=null;setSeekVersion(v=>v+1);setPendingBranch(null);setBranchReason('A focused explanation of your question · return to your saved place at any time.');setStatus('Focused live lesson ready');}}/>}
 </main>;
}
const RemixWorkspace=lazy(()=>import('./architecture/remix/RemixWorkspace'));
export default function LiveLessonPlayer(props: {initialLesson?:LiveLesson;initialTime?:number;initialOpenQuiz?:boolean}={}) {
 if(props.initialLesson?.architecture&&props.initialLesson.chapters.every(c=>c.visual?.layout==='architecture_flow'))return <Suspense fallback={<div className="live-loading">Opening architecture workspace…</div>}><RemixWorkspace legacyLesson={props.initialLesson}/></Suspense>;
 return <EnhancedLiveLessonPlayer {...props}/>;
}
