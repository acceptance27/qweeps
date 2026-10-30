import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, GitBranch, Mic, Pause, Play, Send, Volume2, VolumeX, X, RotateCcw, Download } from 'lucide-react';
import { ManimCanvas, ManimRenderConfig } from '../components/ManimCanvas';
import { MANIM_SCENES, SceneId } from '../scenes/sceneData';
import { GridCanvas } from './GridCanvas';
import { searchFrame, gridKey, walls } from './astar';
import { PlanCanvas } from './PlanCanvas';
import { ProductionControls } from './ProductionControls';
import { NativeLessonCanvas, NativeFrame } from './NativeLessonCanvas';
import {rizalLesson,rizalContext,rizalCaption} from './rizal';
import {aluLesson,aluContext,aluCaption} from './alu';
import { NarrationTransport } from './NarrationTransport';
import { productionContext, productionDefaults, productionNarration, ProductionReport } from './production';
import { advanceTime, animatedCamera, animatedElements } from './motion';
import { api, Camera, initialSnapshot, planBeat, Reply, Snapshot } from './types';
import './learning.css';

type Message = { role: 'user' | 'assistant'; text: string; sources?:{title:string;url:string}[] };
type Checkpoint = { title: string; snapshot: Snapshot };
const knownScene = (id: string): id is SceneId => Object.hasOwn(MANIM_SCENES, id);

export default function LearningPlayer() {
  const params = new URLSearchParams(location.search);
  const requested = params.get('scene') || 'astar_heuristic';
  const [snapshot, setSnapshot] = useState<Snapshot>(() => initialSnapshot(knownScene(requested) ? requested : requested === 'astar_search' ? requested : 'astar_heuristic'));
  const [productionReport, setProductionReport] = useState<ProductionReport | null>(null);
  const [playing, setPlaying] = useState(!params.has('topic') && params.get('paused') !== '1' && (knownScene(requested) || requested === 'astar_search'));
  const [chatOpen, setChatOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [voice, setVoice] = useState(params.get('muted') !== '1');
  const [speechBusy, setSpeechBusy] = useState(false);
  const [narrationReady, setNarrationReady] = useState(false);
  const speechLoading = useRef(false);
  const nativeReady = useRef(false);
  const nativeFrame = useRef<NativeFrame | null>(null);
  const narrationSeek = useRef<number | null>(null);
  const clipTransport = useRef<NarrationTransport | null>(null);
  if (!clipTransport.current) clipTransport.current = new NarrationTransport(async text => (await api<{url:string}>('narration', {text})).url, state => { speechLoading.current=state.loading; setSpeechBusy(state.playing); setNarrationReady(state.ready || !state.loading); });
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [video, setVideo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Connecting to QWEEPS…');
  const [health, setHealth] = useState<{ model: string; modelReady: boolean; manimReady: boolean } | null>(null);
  const [input, setInput] = useState('');
  const [sourceContext, setSourceContext] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [branches, setBranches] = useState<Checkpoint[]>([]);
  const [closed, setClosed] = useState(false);
  const [listening, setListening] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot;
  const sourceRef = useRef(sourceContext); sourceRef.current = sourceContext;
  const requestRef = useRef<AbortController | null>(null);
  const speechEpoch = useRef(0);
  const lastNarrated = useRef('');
  const telemetry = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const askRef = useRef<(q: string, mode?: 'question' | 'lesson' | 'branch') => void>(() => {});
  const recognitionRef = useRef<any>(null);
  const initialTopicStarted = useRef(false);

  const rizal=snapshot.sceneId==='jose_rizal'&&!snapshot.plan;
  const alu=snapshot.sceneId==='alu'&&!snapshot.plan;
  const nativeLesson=rizal||alu||(snapshot.sceneId==='manim_production'&&!snapshot.plan)||(snapshot.sceneId==='generated'&&!!snapshot.plan);
  const production = snapshot.sceneId === 'manim_production' && !snapshot.plan;
  useEffect(() => { if (requested === 'manim_production') fetch('/production/report.json').then(r => { if (!r.ok) throw new Error('Production measurement data unavailable'); return r.json(); }).then(setProductionReport).catch(e => setError(e.message)); }, [requested]);
  const legacy = MANIM_SCENES[knownScene(snapshot.sceneId) ? snapshot.sceneId : 'astar_heuristic'];
  const generated = snapshot.plan ? planBeat(snapshot.plan, snapshot.time) : null;
  const legacyIndex = Math.max(0, legacy.beats.findIndex(b => snapshot.time >= b.startTime && snapshot.time < b.endTime));
  const search = !snapshot.plan && snapshot.sceneId === 'astar_search' ? searchFrame(snapshot.nodes, snapshot.time) : null;
  const beatIndex = search?.index ?? generated?.index ?? (snapshot.time >= legacy.duration ? legacy.beats.length - 1 : legacyIndex);
  const beatTitle = search ? (search.index === 0 ? 'Start, goal and movement rules' : search.frame.done ? 'The shortest path' : `Expand (${search.frame.current}) · compare the frontier`) : generated?.beat.title || legacy.beats[beatIndex].title.replace(/^Beat \d+:\s*/, '');
  const beatStart = search ? (search.index === 0 ? 0 : 3 + search.index * 4) : generated?.start ?? legacy.beats[beatIndex].startTime;
  const beatEnd = search ? 3 + (search.index + 1) * 4 : generated?.end ?? legacy.beats[beatIndex].endTime;
  const duration = search ? search.duration : snapshot.plan ? snapshot.plan.beats.reduce((n, b) => n + b.duration, 0) : legacy.duration;
  const beatCount = search?.trace.length || snapshot.plan?.beats.length || legacy.beats.length;
  const title = search ? 'A* · How a heuristic guides the search' : snapshot.plan?.title || legacy.title.replace('Algorithm: ', '');
  const beatKey = `${snapshot.plan ? snapshot.plan.title : snapshot.sceneId}:${beatIndex}:${branches.length}:${production ? JSON.stringify(snapshot.production || productionDefaults) : rizal ? snapshot.nativeFocus||'' : ''}`;
  const boundsRef = useRef({ start: beatStart, end: beatEnd, duration }); boundsRef.current = { start: beatStart, end: Math.min(beatEnd, snapshot.nativeStopAt ?? beatEnd), duration: Math.min(duration, snapshot.nativeStopAt ?? duration) };
  const speechBusyRef = useRef(speechBusy); speechBusyRef.current = speechBusy;

  function context(s = snapshotRef.current) {
    const spec = MANIM_SCENES[knownScene(s.sceneId) ? s.sceneId : 'astar_heuristic'];
    const b = s.plan ? planBeat(s.plan, s.time) : null;
    const nodes = s.nodes;
    const scores = Object.fromEntries(['A', 'B'].map(id => {
      const p = nodes[id]; const g = Math.hypot(p.x - nodes.S.x, p.y - nodes.S.y);
      const h = Math.hypot(p.x - nodes.G.x, p.y - nodes.G.y);
      return [id, { g, h, f: g + h, manhattan: Math.abs(p.x - nodes.G.x) + Math.abs(p.y - nodes.G.y) }];
    }));
    return { focused: document.hasFocus(), title: s.plan?.title || spec.title, sceneId: s.sceneId, time: s.time,
      beat: s.sceneId === 'astar_search' && !s.plan ? searchFrame(s.nodes, s.time).frame : b?.beat || spec.beats.find(beat => s.time >= beat.startTime && s.time < beat.endTime) || spec.beats.at(-1),
      camera: s.camera || (b ? animatedCamera(b.beat, s.plan!.beats[b.index - 1], s.time - b.start) : telemetry.current), selection: s.selected, region: s.region,
      elements: s.sceneId === 'manim_production' && productionReport ? productionReport.jobs.map((job,i)=>({id:`job-${i}`,...job})) : b ? animatedElements(b.beat, s.plan!.beats[b.index - 1], s.time - b.start, s.positions).map(e => ({ ...e, visible: e.draw > .01 })) : nodes,
      scores: !s.plan && s.sceneId === 'astar_heuristic' ? scores : undefined,
      assumptions: !s.plan && s.sceneId === 'astar_heuristic' ? 'Toy continuous graph: direct edges S→A and S→B. g is direct edge length. This is not a running grid search. Euclidean edge costs, no obstacles.' : s.plan?.summary,
      gridSearch: s.sceneId === 'astar_search' && !s.plan ? { ...searchFrame(s.nodes, s.time), trace: undefined, start: s.nodes.S, goal: s.nodes.G, walls: [...walls], rules: 'four neighbours, unit edge costs, Manhattan h; pop smallest f then h then coordinate id; closed is expanded; open is discovered not yet expanded' } : undefined,
      teaching: s.plan?.teaching,
      nativeRenderer: ['manim_production','jose_rizal','alu','generated'].includes(s.sceneId) ? nativeFrame.current : undefined,
      historicalLesson:s.sceneId==='jose_rizal'?rizalContext(s.time,s.selected):s.sceneId==='alu'?aluContext(s.time,s.selected):undefined,
      productionMeasurement: s.sceneId === 'manim_production' && !s.plan && productionReport ? productionContext(productionReport, s.production || productionDefaults, Math.min(5, Math.floor(s.time/20)), s.selected) : undefined,
      sourceContext: sourceRef.current.slice(0, 30000), branchDepth: branches.length };
  }

  const stopSpeech = () => {
    speechEpoch.current++; clipTransport.current?.stop(); setSpeechBusy(false); window.speechSynthesis?.cancel();
    void api('stop', {}).catch(() => {});
  };
  const speak = async (text: string, offset = 0) => {
    if (!voice) return;
    try { const transport=clipTransport.current!; await Promise.all([transport.prepare(text), transport.playFrom(offset)]); }
    catch { setStatus('Voice unavailable · captions remain available'); setSpeechBusy(false); }
  };
  const pause = () => { setPlaying(false); clipTransport.current?.pause(); setSpeechBusy(false); };


  function applyReply(reply: Reply, origin: Snapshot, q: string, mode: string, shouldSpeak = true) {
    setMessages(old => [...old, { role: 'assistant', text: reply.answer, sources:reply.sources }]);
    if (reply.nativeBranch) {
      const branch=reply.nativeBranch;
      setBranches(old=>[...old,{title:q,snapshot:structuredClone(origin)}]);
      const history=branch.lessonId==='jose_rizal';
      const chapter=history?rizalLesson.chapters[branch.chapter]:null;
      setSnapshot({...origin,plan:null,sceneId:history?'jose_rizal':'manim_production',production:branch.experiment,
        nativeFocus:branch.focus||'',time:(chapter?.start??branch.chapter*20)+.01,nativeStopAt:(chapter?.end??(branch.chapter+1)*20)-.001,nativeAnswer:history?undefined:reply.answer});
      lastNarrated.current='';setPlaying(shouldSpeak);
    } else if (reply.scene) {
      if (mode !== 'lesson') setBranches(old => [...old, { title: q, snapshot: structuredClone(origin) }]);
      else setBranches([]);
      setSnapshot({ ...initialSnapshot('generated'), plan: reply.scene, time: 0 });
      lastNarrated.current = ''; setPlaying(shouldSpeak || mode === 'lesson');
    }
    setStatus(reply.researchAvailable===false ? 'Source lookup unavailable · answer may be unverified' : reply.nativeBranch ? 'Playing the focused experiment · your parent position is saved' : reply.scene ? shouldSpeak || mode === 'lesson' ? 'Playing your visual explanation' : 'Visual ready · press Play to explore' : 'Answered at your paused position');
    if (shouldSpeak && !reply.scene && !reply.nativeBranch) void speak(reply.answer);
  }

  async function ask(q: string, mode: 'question' | 'lesson' | 'branch' = 'question') {
    if (!q.trim() || !sessionId || busy) return;
    pause(); setChatOpen(true); setError(''); setBusy(true); setInput('');
    setMessages(old => [...old, { role: 'user', text: q }]);
    const origin = structuredClone(snapshotRef.current);
    const controller = new AbortController(); requestRef.current = controller;
    // Planning, direction and review are separate model calls and may outlast a
    // conversational reply. The user can still cancel with Stop.
    const timeout = setTimeout(() => controller.abort(), mode === 'question' ? 180000 : 1800000);
    setStatus(mode === 'question' ? 'QWEEPS is thinking about your selection…' : 'Planning your visual explanation…');
    try {
      const reply = await api<Reply>('ask', { sessionId, question: q, mode, context: context(origin) }, controller.signal);
      if (!controller.signal.aborted) applyReply(reply, origin, q, mode);
    } catch (err) {
      setError(controller.signal.aborted ? 'Request stopped. Your paused scene is preserved.' : String((err as Error).message));
      setInput(q);
    } finally { clearTimeout(timeout); requestRef.current = null; setBusy(false); }
  }
  askRef.current = ask;

  useEffect(() => {
    let live = true;
    Promise.all([api('health'), api('session', {})]).then(([h, session]) => {
      if (!live) return;
      setHealth(h); setSessionId(session.sessionId);
      setStatus(h.modelReady ? `Connected · ${h.model}${h.fallbackProvider ? ` · ${h.fallbackProvider} fallback` : ''}` : 'No AI model configured');
    }).catch(err => { if (live) { setError(err.message); setStatus('Disconnected'); } });
    return () => { live = false; requestRef.current?.abort(); speechEpoch.current++; clipTransport.current?.stop(); window.speechSynthesis?.cancel(); };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    document.title = `QWEEPS Visual ${sessionId}`;
    if (params.get('desktop') === '1') void api('window', { sessionId }).catch(() => {});
    const topic = params.get('topic') || (!knownScene(requested) && requested !== 'astar_search' ? requested : '');
    if (topic && !initialTopicStarted.current) { initialTopicStarted.current = true; askRef.current(topic, 'lesson'); }
  }, [sessionId]);

  useEffect(() => {
    if (!playing || busy || closed) return;
    let previous = performance.now(); let frame: number;
    const tick = (now: number) => {
      const dt = Math.min(.1, (now - previous) / 1000); previous = now;
      setSnapshot(old => {
        if ((voice && speechLoading.current) || ((['manim_production','jose_rizal','alu'].includes(old.sceneId) && !old.plan || old.sceneId==='generated' && !!old.plan) && !nativeReady.current)) return old;
        const b = boundsRef.current;
        const next = advanceTime(old.time, dt, b.end, b.duration, speechBusyRef.current);
        if (next >= b.duration) { setPlaying(false); return { ...old, time: b.duration }; }
        return { ...old, time: next };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, busy, closed, voice]);

  useEffect(() => { setCaption(''); }, [beatKey]);

  function narrationText() {
      let text = generated?.beat.narration || legacy.beats[Math.min(beatIndex, legacy.beats.length - 1)].description;
      if (search) {
        const n = search.frame.closed.at(-1); const next = search.frame.open[0];
        text = search.index === 0 ? 'Our green start and red goal are on a four connected grid. Gray cells are walls. Each move costs one. We estimate the remaining distance by adding the horizontal and vertical steps to the goal. Watch how the frontier changes.' : search.frame.done ? `The goal has been removed from the queue. Following the stored parent links gives this shortest path of ${search.frame.path.length - 1} steps. You can rewind to inspect any earlier decision.` : `We expanded cell ${n?.id}, with traveled cost ${n?.g} and estimate ${n?.h}. ${next ? `The next candidate is ${next.id}, with g ${next.g}, h ${next.h}, and total f ${next.f}. Equal f scores are resolved by smaller h, then coordinate order.` : 'There are no more reachable candidates.'}`;
      }
      if(rizal)text=rizalLesson.chapters[beatIndex].narration;
      if (production && productionReport) text = snapshot.nativeAnswer || productionNarration(productionReport, snapshot.production || productionDefaults, beatIndex);
      if (!generated && snapshot.sceneId === 'astar_heuristic') {
        const c = context(); const scores = c.scores!;
        text = [
          'The green S is our start, and the red G is the goal. This small sandbox compares two candidate edges; you can move the points and inspect the costs.',
          'Dijkstra orders the frontier by the cost already traveled. In a uniform open space this expands outward evenly. It remains useful when we have no helpful estimate toward the goal.',
          `The yellow vector points from A toward the goal. Its length is the Euclidean estimate: the square root of the horizontal difference squared plus the vertical difference squared. Here h of A is ${scores.A.h.toFixed(2)}.`,
          `A has a total estimated cost of ${scores.A.f.toFixed(2)}. B has ${scores.B.f.toFixed(2)}. ${Math.abs(scores.A.f - scores.B.f) < .001 ? 'These candidates tie; a tie breaking rule decides.' : `The smaller score belongs to ${scores.A.f < scores.B.f ? 'A' : 'B'}.`} Here, g is the length of the direct edge from S. In a real search, g accumulates the edges along the discovered route.`,
          'Manhattan distance counts horizontal and vertical grid steps. With four connected unit cost movement it is an admissible estimate. Euclidean distance is a lower bound when movement costs at least the geometric distance. The movement rules matter.'
        ][beatIndex];
      }
      return text;
  }
  useEffect(() => {
    let live=true;
    if (!voice) { setNarrationReady(true); return; }
    if (production && !productionReport) return;
    if(rizal){for(const chapter of rizalLesson.chapters)clipTransport.current!.seed(chapter.narration,chapter.audio);
      const next=rizalLesson.chapters[beatIndex+1];if(next)void fetch(next.audio,{cache:'force-cache'}).catch(()=>{});
    }else if(production&&productionReport&&beatIndex<5){void clipTransport.current!.prefetch(productionNarration(productionReport,snapshot.production||productionDefaults,beatIndex+1)).catch(()=>{});}
    else if(!generated&&legacy.beats[beatIndex+1])void clipTransport.current!.prefetch(legacy.beats[beatIndex+1].description).catch(()=>{});
    setNarrationReady(false);
    void clipTransport.current!.prepare(narrationText()).then(()=>{if(live)setNarrationReady(true);}).catch(()=>{if(live){setNarrationReady(true);setStatus('Voice unavailable · captions remain available');}});
    return()=>{live=false;};
  }, [beatKey, voice, productionReport]);
  const cueOffset=rizal?rizalLesson.chapters[beatIndex].narrationAt:generated?.beat.narrationAt??1.5;
  const narrationCueReached=snapshot.time>=beatStart+cueOffset;
  useEffect(() => {
    if (!playing || busy || (production && !productionReport) || (voice && !narrationReady)) return;
    if (lastNarrated.current === beatKey) {
      if (voice) { const transport=clipTransport.current!; void Promise.all([transport.prepare(narrationText()),transport.resume()]).catch(()=>setStatus('Voice unavailable · captions remain available')); }
      return;
    }
    if(!narrationCueReached)return;
    lastNarrated.current=beatKey;
    const text=narrationText();setCaption(text);setMessages(old=>old.at(-1)?.text===text?old:[...old,{role:'assistant',text}]);
    const offset=narrationSeek.current===null?0:Math.max(0,snapshotRef.current.time-beatStart-cueOffset);
    narrationSeek.current=null;void speak(text,offset);
  }, [beatKey, playing, voice, busy, productionReport, narrationReady, narrationCueReached]);


  function seek(time: number) {
    pause(); stopSpeech(); narrationSeek.current=time; setCaption(''); lastNarrated.current = '';
    setSnapshot(old => ({ ...old, time: Math.max(0, Math.min(duration, time)), camera: null, selected: [], region: null, nativeStopAt:undefined, nativeAnswer:undefined, nativeFocus:'' }));
  }
  function step(direction: number) {
    const next = Math.max(0, Math.min(beatCount - 1, beatIndex + direction));
    const time = search ? (next === 0 ? 0 : 3 + next * 4) : snapshot.plan ? snapshot.plan.beats.slice(0, next).reduce((sum, b) => sum + b.duration, 0) : legacy.beats[next].startTime;
    seek(time + .01);
  }
  function returnToParent() {
    const parent = branches.at(-1); if (!parent) return;
    pause(); setSnapshot(structuredClone(parent.snapshot)); setBranches(old => old.slice(0, -1)); lastNarrated.current = '';
    setStatus('Returned to the saved time, camera, selection and experiment');
  }
  function close() {
    pause(); stopSpeech(); requestRef.current?.abort(); recognitionRef.current?.stop(); setClosed(true);
    if (sessionId) void api('closed', { sessionId, desktop: params.get('desktop') === '1' }).catch(() => {});
    window.close();
  }

  useEffect(() => {
    if (!sessionId || closed) return;
    let pending = false;
    const poll = async () => {
      if (pending) return; pending = true;
      try {
        await api('state', { sessionId, context: context() });
        const events = await api<{ commands: any[] }>(`events?sessionId=${sessionId}`);
        for (const command of events.commands) {
          if (command.command === 'pause') pause();
          if (command.command === 'resume') setPlaying(true);
          if (command.command === 'next') step(1);
          if (command.command === 'previous') step(-1);
          if (command.command === 'branch') askRef.current(command.question || `Explain the selected elements (${snapshotRef.current.selected.join(', ') || 'current view'}) in more detail with a new visual.`, 'branch');
          if (command.command === 'reply') { pause(); applyReply(command.reply, snapshotRef.current, command.question, 'question', command.speak !== false); }
          if (command.command === 'close') close();
        }
      } catch (err) {
        if ((err as Error).message.includes('expired')) {
          try {
            const replacement = await api('session', {});
            setSessionId(replacement.sessionId);
            setStatus('Reconnected · your current view is preserved; server conversation restarted');
          } catch { /* Retried on the next poll. */ }
        }
      }
      finally { pending = false; }
    };
    void poll(); const timer = setInterval(poll, 800); return () => clearInterval(timer);
  }, [sessionId, closed, beatIndex, branches.length, voice, snapshot.plan]);

  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); if (playing) pause(); else setPlaying(true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === '/') { e.preventDefault(); setChatOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }
      if (e.key.toLowerCase() === 'b') askRef.current('Branch into a visual explanation of the selected elements in this view.', 'branch');
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  });

  async function exportManim(render = false) {
    if (!snapshot.plan && !production) return;
    pause(); setError(''); setRendering(true);
    try {
      // Include the experiment's edited coordinates in both export and render.
      const scene = snapshot.plan ? structuredClone(snapshot.plan) : null;
      scene?.beats.forEach(b => b.elements.forEach(e => Object.assign(e, snapshot.positions[`${b.id}:${e.id}`] || {})));
      const result = await api(production ? `production/${render ? 'render' : 'source'}` : render ? 'render' : 'source', production ? { experiment: snapshot.production || productionDefaults } : { scene });
      if (render) setVideo(result.url);
      else {
        const url = URL.createObjectURL(new Blob([result.source], { type: 'text/x-python' }));
        const a = document.createElement('a'); a.href = url; a.download = 'qweeps_lesson.py'; a.click(); URL.revokeObjectURL(url);
      }
    } catch (err) { setError((err as Error).message); } finally { setRendering(false); }
  }

  function dictate() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { setError('Browser dictation is unavailable here. Use your QWEEPS voice input or type a question.'); return; }
    if (listening) { recognitionRef.current?.stop(); return; }
    pause(); const recognition = new Recognition(); recognitionRef.current = recognition;
    recognition.lang = 'en-US'; recognition.interimResults = false;
    recognition.onresult = (e: any) => setInput(e.results[0][0].transcript);
    recognition.onerror = (e: any) => { setError(`Dictation: ${e.error}. You can still type your question.`); setListening(false); };
    recognition.onend = () => setListening(false);
    setListening(true); recognition.start();
  }

  const config: ManimRenderConfig = { showNumberPlane: false, showCameraFrameHud: false, showMobjectBounds: false, strokeScale: 1,
    cameraOverride: { active: !!snapshot.camera, ...(snapshot.camera || { x: 0, y: 0, zoom: 1 }) } };
  if (closed) return <main className="lesson-closed"><p>Visual session closed.</p><button onClick={() => location.reload()}>Open a new session</button><small>You can close this browser tab.</small></main>;
  return <main className={`learning-player ${nativeLesson ? "production-lesson" : ""}`}>
    <header className="lesson-header">
      <div><span className="qweeps-wordmark">QWEEPS <span>VISUAL LAB</span></span><h1>{title}</h1></div>
      <div className="header-actions"><a href="/?scene=alu&paused=1" style={{fontSize:11,alignSelf:"center"}}>ALU</a><a href="/?scene=jose_rizal&paused=1" style={{fontSize:11,alignSelf:"center"}}>José Rizal</a><a href="/?scene=manim_production&paused=1" style={{fontSize:11,alignSelf:"center"}}>Time & cost</a><a href="/?examples=1" style={{fontSize:11,alignSelf:"center"}}>5 method examples</a><button aria-label="Toggle conversation" onClick={() => setChatOpen(open => !open)}>Ask QWEEPS</button><button title={voice ? 'Mute voice' : 'Enable voice'} aria-label={voice ? 'Mute voice' : 'Enable voice'} onClick={() => { stopSpeech(); lastNarrated.current = ''; setVoice(v => !v); }}>{voice ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button title="Close (Esc)" aria-label="Close visual" onClick={close}><X size={18} /></button></div>
    </header>
    <div className={`lesson-workspace ${chatOpen ? 'conversation-open' : 'cinema-mode'}`}>
      <section className="visual-stage" aria-label="Interactive explanation">
        {branches.length > 0 && <button className="return-branch" onClick={returnToParent}><ArrowLeft size={14} /> Return to {branches.length === 1 ? 'lesson' : 'parent branch'} · {branches.at(-1)!.snapshot.time.toFixed(1)}s</button>}
        <div className="stage-canvas" onMouseDown={() => { if (!snapshot.plan) pause(); }}>
          {nativeLesson ? (rizal||productionReport||generated) ? <NativeLessonCanvas sessionId={sessionId} snapshot={snapshot} update={setSnapshot} pause={pause} onReady={value=>{nativeReady.current=value;}} onFrame={value=>{nativeFrame.current=value;}} /> : <div className="examples-loading">Loading recorded measurements…</div> : search ? <GridCanvas snapshot={snapshot} update={setSnapshot} pause={pause} /> : snapshot.plan && generated ? <PlanCanvas snapshot={snapshot} beat={generated.beat} previous={snapshot.plan.beats[generated.index - 1]} seconds={snapshot.time - generated.start} update={setSnapshot} onInteract={pause} /> :
            <ManimCanvas sceneId={snapshot.sceneId as SceneId} currentTime={snapshot.time} config={config} canvasRef={canvas}
              nodeS={snapshot.nodes.S} nodeG={snapshot.nodes.G} nodeA={snapshot.nodes.A} nodeB={snapshot.nodes.B}
              selectedNodeId={snapshot.selected[0] as any || null}
              onSelectNode={id => setSnapshot(s => ({ ...s, selected: id ? [id] : [], region: null }))}
              onRegionSelect={(ids, region) => setSnapshot(s => ({ ...s, selected: ids, region }))}
              onNodeChange={(id, p) => setSnapshot(s => ({ ...s, nodes: { ...s.nodes, [id]: p } }))}
              onCameraTelemetry={cam => { telemetry.current = cam; }}
              onCameraOverrideChange={cam => setSnapshot(s => ({ ...s, camera: cam.active ? { x: cam.x, y: cam.y, zoom: cam.zoom } : null }))} />}
        </div>
        <div className="stage-caption" aria-live="polite">{rizal?rizalCaption(snapshot.time):alu?aluCaption(snapshot.time):caption || (production && productionReport ? (snapshot.nativeAnswer || productionNarration(productionReport, snapshot.production || productionDefaults, beatIndex)) : generated?.beat.narration ?? (snapshot.sceneId === 'astar_heuristic' ? [
          'Begin with the start and goal. What information would help us choose a direction?',
          'First, watch a search that knows only how far it has travelled.',
          'Now draw an estimate of the distance still to go. The triangle makes the formula visible.',
          'Compare what we already spent with what remains: f = g + h.',
          'Change the movement rules. The estimate must remain a lower bound.'
        ][beatIndex] : beatTitle))}</div>
        {production && productionReport && <ProductionControls report={productionReport} snapshot={snapshot} update={setSnapshot} pause={pause} />}
        {rizal&&<div className="production-controls"><span>Historical focus · dates stay fixed</span><button disabled={!snapshot.selected.length} onClick={()=>{pause();setSnapshot(s=>({...s,nativeFocus:s.selected[0],camera:null}));}}>Focus selected detail</button><button onClick={()=>{pause();setSnapshot(s=>({...s,nativeFocus:'',camera:null}));}}>Full scene</button><button onClick={()=>{pause();clipTransport.current?.pause();setVideo('/lessons/rizal/comparison.mp4');}}>Compare baked playback</button><a href="/lessons/jose_rizal.json" download>Evidence & teaching design</a></div>}
        {!chatOpen && <form className="cinema-question" onSubmit={e => { e.preventDefault(); void ask(input); }}>
          <span>{snapshot.selected.length ? `About ${snapshot.selected.join(', ')} ·` : 'QWEEPS'}</span>
          <input aria-label="Ask about this animation" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask a question about what you see…" />
          <button type="submit" disabled={!sessionId || !input.trim() || busy}><Send size={15} /></button>
        </form>}
        <div className="transport">
          <div className="chapter-strip" aria-label="Teaching beats">{(snapshot.plan ? snapshot.plan.beats.map((b, i) => ({ title: b.title, time: snapshot.plan!.beats.slice(0, i).reduce((n, p) => n + p.duration, 0) })) : search ? [] : legacy.beats.map(b => ({ title: b.title.replace(/^Beat \d+:\s*/, ''), time: b.startTime }))).map((b, i) => <button key={i} className={beatIndex === i ? 'active' : ''} onClick={() => { seek(b.time + .01); setPlaying(true); }}><span>{i + 1}</span>{snapshot.sceneId === 'astar_heuristic' ? ['Start & goal', 'Search without h', 'Build the estimate', 'Compare candidates', 'Change the rules'][i] : b.title}</button>)}</div>
          <div className="beat-label"><span>{String(beatIndex + 1).padStart(2, '0')} / {String(beatCount).padStart(2, '0')}</span><strong>{beatTitle}</strong></div>
          <input aria-label="Explanation progress" type="range" min="0" max={duration} step=".01" value={snapshot.time} onChange={e => seek(Number(e.target.value))} />
          <div className="transport-row"><div className="transport-buttons"><button aria-label="Previous beat" onClick={() => step(-1)}><ChevronLeft size={20} /></button><button className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (playing) pause(); else { if (snapshot.time >= duration) seek(0); setPlaying(true); } }}>{playing ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="Next beat" onClick={() => step(1)}><ChevronRight size={20} /></button><span className="time-readout">{snapshot.time.toFixed(1)} / {duration.toFixed(0)}s{speechBusy ? ' · speaking' : ''}</span></div>
            <div className="transport-buttons">{snapshot.sceneId === 'astar_heuristic' && !snapshot.plan && <button onClick={() => { pause(); setBranches(old => [...old, { title: 'Try the actual grid search', snapshot: structuredClone(snapshot) }]); setSnapshot(initialSnapshot('astar_search')); setCaption(''); lastNarrated.current = ''; setPlaying(true); }}>Try grid search</button>}<button title="Reset experiment" aria-label="Reset experiment" onClick={() => { pause(); setSnapshot(s => ({ ...initialSnapshot(s.sceneId), plan: s.plan })); lastNarrated.current = ''; }}><RotateCcw size={15} /></button><button disabled={busy || !sessionId} onClick={() => ask(input.trim() || 'Explain the selected elements in a more detailed visual.', 'branch')}><GitBranch size={14} /> Branch</button></div></div>
        </div>
        <div className="stage-hints">{rizal?'Select a person, book, place or date · drag a region · right-drag to pan · wheel to zoom · ask why · Esc close':production ? 'Select a bar, category or point · drag to select a region · change a control to experiment · ← → step · Esc close' : nativeLesson ? 'Select an object · drag a region · right-drag to pan · wheel to zoom · ask why · Esc close' : 'Drag an object to experiment · drag empty space to select a region · right-drag to pan · ← → step · Esc close'}</div>
      </section>
      <aside className="conversation-panel">
        <div className="conversation-heading"><span>Explore with QWEEPS</span><button aria-label="Hide conversation" onClick={() => setChatOpen(false)}><X size={14} /></button><span className={`connection-dot ${sessionId ? 'connected' : ''}`} /></div>
        <div className="connection-status" role="status">{status}</div>
        {snapshot.selected.length > 0 || snapshot.region ? <div className="selection-context">Asking about <strong>{snapshot.selected.join(', ') || 'this region'}</strong> at {snapshot.time.toFixed(1)}s <button aria-label="Clear selection" onClick={() => setSnapshot(s => ({ ...s, selected: [], region: null }))}>×</button></div> : <div className="selection-context">Select an object or region to ask about it.</div>}
        <div className="conversation-messages" ref={transcript} aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && <div className="conversation-welcome"><p>A question can change the view.</p><span>Ask why, try another example, or explore a new topic. Your current position is saved when an answer opens a branch.</span><button onClick={() => ask(rizal?'Did Rizal’s execution start the revolution? Explain using the dates.':production ? 'Explain the recorded evidence behind this selected phase. What is measured, bounded or hypothetical here?' : 'How do the movement rules change which heuristic I should use?')}>{rizal?'Did his execution start the revolution?':production ? 'What is measured in this view?' : 'How do movement rules affect the heuristic?'}</button></div>}
          {messages.map((m, i) => <div className={`chat-message ${m.role}`} key={i}><span>{m.role === 'user' ? 'YOU' : 'QWEEPS'}</span><p>{m.text}</p>{m.sources?.length ? <div className="lesson-sources">Sources consulted: {m.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div> : null}</div>)}
          {busy && <div className="thinking-message">Building an explanation from your question and current view…</div>}
        </div>
        {error && <div className="lesson-error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
        <div className="source-context"><button onClick={() => setShowSources(v => !v)}>{showSources ? '−' : '+'} Source context {sourceContext ? '· attached' : '· code, notes, or excerpts'}</button>{showSources && <textarea aria-label="Source context" value={sourceContext} maxLength={30000} onChange={e => setSourceContext(e.target.value)} placeholder="Paste the relevant game code or document excerpt. QWEEPS only knows source content supplied here." />}</div>
        <form className="question-composer" onSubmit={e => { e.preventDefault(); void ask(input); }}>
          <textarea ref={inputRef} aria-label="Ask QWEEPS" value={input} disabled={busy} onChange={e => setInput(e.target.value)} placeholder="Ask about this view, or explore an idea…" rows={3} maxLength={4000} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }} />
          <div className="composer-actions"><button type="button" title="Dictate a question" aria-label="Dictate a question" className={listening ? 'listening' : ''} onClick={dictate}><Mic size={16} /></button><button type="button" disabled={busy || !input.trim() || !sessionId} onClick={() => ask(input, 'lesson')}>New lesson</button>{busy ? <button type="button" onClick={() => requestRef.current?.abort()}>Stop</button> : <button type="submit" className="send-question" disabled={!sessionId || !input.trim()} aria-label="Send question"><Send size={15} /></button>}</div>
        </form>
        {(snapshot.plan || production) && <div className="manim-actions"><button disabled={rendering} onClick={() => exportManim()}><Download size={12} /> Manim source</button><button disabled={rendering || !health?.manimReady} title={health?.manimReady ? 'Render with Manim Community Edition' : 'Manim CE environment is not installed'} onClick={() => exportManim(true)}>{rendering ? 'Working…' : 'Render Manim video'}</button></div>}
        {production && <div className="lesson-sources"><a href="https://developers.openai.com/api/docs/models/gpt-6.1-sol" target="_blank" rel="noreferrer">GPT-6.1 Sol rates</a> · <a href="https://opencode.ai/v2/docs/console/go/" target="_blank" rel="noreferrer">Go allowance metric</a><p>Hypothetical token-value cost. TTS, electricity and hardware charges are not recorded.</p></div>}
        {rizal&&<div className="lesson-sources">{rizalLesson.sources.map(source=><a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}<p>Selected history. People, buildings and routes are original schematic illustrations.</p></div>}
        {alu&&<div className="lesson-sources">{aluLesson.sources.map((source: { id: string; url: string; title: string })=><a key={source.id} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}<p>Schematic ALU datapath. Operands remain fixed while opcode steers the multiplexer.</p></div>}
        {snapshot.plan?.sources.length ? <div className="lesson-sources">Sources: {snapshot.plan.sources.join(' · ')}</div> : null}
      </aside>
    </div>
    {video && <div className="video-preview" role="dialog" aria-label="Rendered Manim video"><button aria-label="Close video preview" onClick={() => setVideo(null)}><X /></button><video controls src={video} /><a href={video} download="qweeps-lesson.mp4">Download Manim video</a><small>{rizal?'Same ManimGL scene and narration, baked at 30 fps. Selection and question branches work in the interactive view.':'Rendered geometry; narration remains in the interactive session.'}</small></div>}
  </main>;
}
