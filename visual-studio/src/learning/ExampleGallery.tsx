import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Play, CheckCircle2 } from 'lucide-react';
import './examples.css';

type Beat = { id: string; title: string; question: string; narration: string; visual_change: string; insight: string; start?: number };
type Example = { id: string; title: string; method: string; adaptation: string; question: string; goal: string; assumptions: string; video: string; poster: string; duration?: number; beats: Beat[]; sources: { title: string; url: string }[]; quiz: { prompt: string; choices: string[]; answer: number; explanation: string; revealBeat: number } };

export default function ExampleGallery() {
  const [examples, setExamples] = useState<Example[]>([]);
  const [activeId, setActiveId] = useState(location.hash.slice(1));
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<number | null>(null);
  const [design, setDesign] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    fetch('/examples/manifest.json').then(r => { if (!r.ok) throw new Error('Examples could not be loaded.'); return r.json(); }).then(setExamples).catch(e => setError(e.message));
    const handler = () => setActiveId(location.hash.slice(1));
    window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler);
  }, []);
  const active = examples.find(e => e.id === activeId) || examples[0];
  const index = active ? examples.indexOf(active) : 0;
  const beatIndex = active ? Math.max(0, active.beats.reduce((found, b, i) => (b.start ?? 0) <= time + .05 ? i : found, 0)) : 0;
  const beat = active?.beats[beatIndex];
  useEffect(() => { setTime(0); setPlaying(false); setAnswer(null); setDesign(false); setError(''); }, [active?.id]);
  const choose = (id: string) => { video.current?.pause(); location.hash = id; setActiveId(id); };
  const seek = (i: number, play = false) => {
    if (!video.current || !active) return;
    const next = Math.max(0, Math.min(active.beats.length - 1, i));
    video.current.currentTime = active.beats[next].start ?? 0;
    setTime(video.current.currentTime);
    if (play) void video.current.play(); else video.current.pause();
  };
  if (!active) return <main className="examples-loading">{error || 'Loading the five examples…'}</main>;
  return <main className="method-gallery">
    <header className="examples-header"><a href="/?muted=1"><ArrowLeft size={15} /> QWEEPS</a><span>FIVE WAYS TO BUILD UNDERSTANDING</span><a href="/examples/teaching-examples.zip" download><Download size={14} /> Download all</a></header>
    <div className="examples-intro"><div><p className="example-eyebrow">A METHOD SHOULD CHANGE WITH THE SUBJECT</p><h1>Watch the idea become visible.</h1><p>Five narrated Manim lessons. Five different visual arguments. Choose a topic, make a prediction, then inspect how the lesson teaches it.</p></div><div className="production-note">Authored here using the QWEEPS teaching skill.<br />These are method demonstrations, not a live model-generation benchmark.</div></div>
    <nav className="examples-nav" aria-label="Choose an example">{examples.map((e, i) => <button key={e.id} className={e.id === active.id ? 'selected' : ''} aria-current={e.id === active.id ? 'true' : undefined} onClick={() => choose(e.id)}><span>0{i + 1}</span><strong>{e.title.split(':')[0]}</strong><small>{['Predict & reveal', 'Follow the signal', 'Change one variable', 'See the relationships', 'Test a misconception'][i]}</small></button>)}</nav>
    <div className="example-layout">
      <section className="example-player" aria-label={active.title}>
        <div className="example-video"><video ref={video} key={active.id} controls playsInline preload="metadata" poster={active.poster} src={active.video} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setError('This video is unavailable. Rebuild the example assets or select another lesson.')} /></div>
        <div className="example-transport"><button aria-label="Previous teaching beat" onClick={() => seek(beatIndex - 1)}><ChevronLeft size={17} /></button><button onClick={() => { if (playing) video.current?.pause(); else void video.current?.play(); }}>{playing ? 'Pause' : <><Play size={13} /> Play lesson</>}</button><button aria-label="Next teaching beat" onClick={() => seek(beatIndex + 1)}><ChevronRight size={17} /></button><span>{time.toFixed(0)} / {active.duration?.toFixed(0) || '—'} s</span><a href={active.video} download>MP4</a></div>
        <div className="example-chapters" aria-label="Teaching chapters">{active.beats.map((b, i) => <button key={b.id} className={beatIndex === i ? 'active' : ''} onClick={() => seek(i, true)}><span>{i + 1}</span>{b.title}</button>)}</div>
        {error && <p className="example-error" role="alert">{error}</p>}
        <div className="example-current"><p className="example-eyebrow">THE QUESTION IN THIS BEAT</p><h3>{beat.question}</h3><p>{beat.narration}</p></div>
      </section>
      <aside className="example-method">
        <span className="example-counter">EXAMPLE 0{index + 1} / 05</span><h2>{active.title}</h2><p className="example-method-name">{active.method}</p><p>{active.adaptation}</p>
        <div className="prediction-card"><p className="example-eyebrow">TRY A PREDICTION</p><h3>{active.quiz.prompt}</h3>{active.quiz.choices.map((choice, i) => <button key={choice} className={answer === i ? i === active.quiz.answer ? 'correct' : 'retry' : ''} onClick={() => setAnswer(i)}>{answer === i && i === active.quiz.answer && <CheckCircle2 size={14} />}{choice}</button>)}{answer !== null && <div className="prediction-answer"><p>{answer === active.quiz.answer ? 'That prediction matches the model. ' : 'Watch the visual evidence, then reconsider. '}{active.quiz.explanation}</p><button onClick={() => seek(active.quiz.revealBeat, true)}>Watch why →</button></div>}</div>
        <button className="design-toggle" onClick={() => setDesign(v => !v)} aria-expanded={design}>{design ? '−' : '+'} Inspect the teaching design</button>
        {design && <div className="design-notes"><p><b>Learning goal</b>{active.goal}</p><p><b>What changes on screen</b>{beat.visual_change}</p><p><b>New understanding</b>{beat.insight}</p><p><b>Scope and assumptions</b>{active.assumptions}</p><a href={`/examples/${active.id}.json`} download>Download this storyboard</a></div>}
        <div className="example-sources"><span>Sources checked</span>{active.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}</div>
      </aside>
    </div>
    <footer className="examples-footer"><a href="/examples/lessons.py" download>Manim source</a><a href="/examples/storyboards.json" download>All storyboards</a><span>Native Manim geometry · QWEEPS narration · captions included</span></footer>
  </main>;
}
