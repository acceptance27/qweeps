/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import LearningPlayer from './learning/LearningPlayer';
import ExampleGallery from './learning/ExampleGallery';
import { api } from './learning/types';

import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { ManimCanvas, ManimRenderConfig } from './components/ManimCanvas';
import { AntiNeonGuide } from './components/AntiNeonGuide';
import { MANIM_SCENES, SceneId } from './scenes/sceneData';

type InspectorTab = 'beats_camera' | 'python_code' | 'ai_prompt';

function StudioApp() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const sceneParam = urlParams?.get('scene') || 'astar_heuristic';
  const initialScene = (Object.hasOwn(MANIM_SCENES, sceneParam) ? sceneParam : 'astar_heuristic') as SceneId;
  const requestedTime = Number(urlParams?.get('time') || '0');
  const initialTime = Number.isFinite(requestedTime) ? Math.max(0, Math.min(MANIM_SCENES[initialScene].duration, requestedTime)) : 0;

  const [activeSceneId, setActiveSceneId] = useState<SceneId>(initialScene);
  const [currentTime, setCurrentTime] = useState<number>(initialTime);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('beats_camera');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  // Interactive Node State for A* Explainer (All 4 Nodes S, G, A, B)
  const [nodeS, setNodeS] = useState<{ x: number; y: number }>({ x: -4.5, y: -1.2 });
  const [nodeG, setNodeG] = useState<{ x: number; y: number }>({ x: 3.8, y: 1.8 });
  const [nodeA, setNodeA] = useState<{ x: number; y: number }>({ x: -1.0, y: 0.2 });
  const [nodeB, setNodeB] = useState<{ x: number; y: number }>({ x: -2.8, y: 1.5 });
  const [selectedNodeId, setSelectedNodeId] = useState<'S' | 'G' | 'A' | 'B' | null>('A');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [chatInput, setChatInput] = useState<string>('');
  const [subtitleText, setSubtitleText] = useState<string | null>(null);

  const speechTimeoutRef = useRef<any>(null);
  const inspectTimeoutRef = useRef<any>(null);
  const lastSpokenBeatRef = useRef<string | null>(null);
  const isAnsweringQuestionRef = useRef<boolean>(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [cameraTelemetry, setCameraTelemetry] = useState<{ x: number; y: number; zoom: number }>({
    x: 0,
    y: 0,
    zoom: 1,
  });

  const [renderConfig, setRenderConfig] = useState<ManimRenderConfig>({
    showNumberPlane: false,
    showCameraFrameHud: false,
    showMobjectBounds: false,
    strokeScale: 1.0,
    cameraOverride: {
      active: false,
      x: 0,
      y: 0,
      zoom: 1.0,
    },
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeScene = MANIM_SCENES[activeSceneId];

  // 60fps requestAnimationFrame playback loop
  useEffect(() => {
    if (!isPlaying) return;

    let lastFrameTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      setCurrentTime((prev) => {
        const next = prev + dt * playbackSpeed;
        if (next >= activeScene.duration) {
          return 0; // Seamless loop
        }
        return next;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackSpeed, activeScene.duration]);

  // Switch scene handler
  const handleSelectScene = (id: SceneId) => {
    setActiveSceneId(id);
    setCurrentTime(0);
    setIsPlaying(true);
    setRenderConfig((prev) => ({
      ...prev,
      cameraOverride: { active: false, x: 0, y: 0, zoom: 1.0 },
    }));
  };

  // Find current active beat
  const currentBeat =
    activeScene.beats.find((b) => currentTime >= b.startTime && currentTime <= b.endTime) ||
    activeScene.beats[activeScene.beats.length - 1];

  const currentBeatIndex = activeScene.beats.findIndex((b) => b.id === currentBeat.id);

  const handleStepBeat = (dir: -1 | 1) => {
    const nextIdx = Math.max(0, Math.min(activeScene.beats.length - 1, currentBeatIndex + dir));
    setCurrentTime(activeScene.beats[nextIdx].startTime + 0.05);
  };

  // QWEEPS Calm Speech Narration on Beat Transition (with 1.5s visual absorption pause)
  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isAnsweringQuestionRef.current) return;

    if (currentBeat && currentBeat.id !== lastSpokenBeatRef.current) {
      lastSpokenBeatRef.current = currentBeat.id;
      window.speechSynthesis.cancel();
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);

      // Paced 1.5s visual pause before speaking
      speechTimeoutRef.current = setTimeout(() => {
        const text = currentBeat.description;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const calmVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Calm') ||
              v.name.includes('Male') ||
              v.name.includes('Female'))
        );
        if (calmVoice) utterance.voice = calmVoice;
        window.speechSynthesis.speak(utterance);
      }, 1500);
    }
  }, [currentBeat?.id, voiceEnabled]);

  // Speech when user drags or selects any of the 4 nodes (S, G, A, B)
  const handleNodeChange = (nodeId: 'S' | 'G' | 'A' | 'B', pos: { x: number; y: number }) => {
    if (nodeId === 'S') setNodeS(pos);
    else if (nodeId === 'G') setNodeG(pos);
    else if (nodeId === 'A') setNodeA(pos);
    else if (nodeId === 'B') setNodeB(pos);

    if (inspectTimeoutRef.current) clearTimeout(inspectTimeoutRef.current);

    inspectTimeoutRef.current = setTimeout(() => {
      let text = '';
      if (nodeId === 'S') {
        text = `Start node S moved to (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}). Path costs g(n) are recalculated.`;
      } else if (nodeId === 'G') {
        text = `Goal node G moved to (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}). Heuristic vectors h(n) and evaluations f(n) updated.`;
      } else {
        const curG = nodeG;
        const curS = nodeS;
        const dx = curG.x - pos.x;
        const dy = curG.y - pos.y;
        const h = Math.hypot(dx, dy).toFixed(1);
        const g = Math.hypot(pos.x - curS.x, pos.y - curS.y).toFixed(1);
        const f = (parseFloat(g) + parseFloat(h)).toFixed(1);
        text = `Node ${nodeId} at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}): g=${g}, h=${h}, total f=${f}.`;
      }
      setSubtitleText(`QWEEPS: ${text}`);

      if (voiceEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }, 600);
  };

  // Studio inspection mode also uses the live model bridge.
  const handleAskQuestion = async (queryText: string) => {
    if (!queryText.trim()) return;
    setIsPlaying(false);
    setChatInput('');
    try {
      const reply = await api('ask', { question: queryText, context: {
        title: activeScene.title, beat: currentBeat, time: currentTime,
        nodes: { S: nodeS, G: nodeG, A: nodeA, B: nodeB },
        selection: selectedNodeId, camera: cameraTelemetry,
      } });
      setSubtitleText(`QWEEPS: ${reply.answer}`);
    } catch (error) { setSubtitleText((error as Error).message); }
  };

  // Keyboard navigation & controls: Esc, Space, Left/Right, B (branch), R (reset), / (chat)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in the chat box or another input, only handle Escape to blur
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement)?.blur();
        }
        return;
      }

      // Quick focus to chat input with '/'
      if (e.key === '/') {
        e.preventDefault();
        chatInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (renderConfig.cameraOverride.active || selectedNodeId) {
          setRenderConfig((prev) => ({
            ...prev,
            cameraOverride: { active: false, x: 0, y: 0, zoom: 1.0 },
          }));
          setSelectedNodeId(null);
        } else {
          window.close();
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepBeat(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepBeat(-1);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (activeScene.beats.length >= 5) {
          setCurrentTime(activeScene.beats[4].startTime + 0.05);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRenderConfig((prev) => ({
          ...prev,
          cameraOverride: { active: false, x: 0, y: 0, zoom: 1.0 },
        }));
        setNodeS({ x: -4.5, y: -1.2 });
        setNodeG({ x: 3.8, y: 1.8 });
        setNodeA({ x: -1.0, y: 0.2 });
        setNodeB({ x: -2.8, y: 1.5 });
        setSelectedNodeId('A');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [renderConfig.cameraOverride.active, selectedNodeId, activeScene]);

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Export high-resolution PNG snapshot or WebM recording of the Manim canvas
  const handleExportSnapshotOrVideo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (typeof MediaRecorder !== 'undefined' && !isRecording) {
      try {
        const stream = canvas.captureStream(60);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `manim_${activeSceneId}_scene.webm`;
          a.click();
          URL.revokeObjectURL(url);
          setIsRecording(false);
        };
        setIsRecording(true);
        setIsPlaying(true);
        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, 5000);
        return;
      } catch {
        // Fallback to crisp PNG frame download
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `manim_${activeSceneId}_frame.png`;
    a.click();
  };

  const isStudioMode = urlParams?.get('mode') === 'studio';

  // Default: Pure 3Blue1Brown Full-Window Explainer (Zero website clutter)
  if (!isStudioMode) {
    return (
      <div className="w-screen h-screen bg-black text-[#ECECEC] flex flex-col items-center justify-center relative overflow-hidden select-none">
        {/* Full-bleed Canvas Container */}
        <div className="w-full h-full flex items-center justify-center relative">
          <ManimCanvas
            sceneId={activeSceneId}
            currentTime={currentTime}
            config={renderConfig}
            canvasRef={canvasRef}
            onCameraTelemetry={setCameraTelemetry}
            nodeS={nodeS}
            nodeG={nodeG}
            nodeA={nodeA}
            nodeB={nodeB}
            onNodeChange={handleNodeChange}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onCameraOverrideChange={(override) =>
              setRenderConfig((prev) => ({ ...prev, cameraOverride: override }))
            }
          />
        </div>

        {/* Unified Bottom Floating Control & Chat Dock (Zero Overlap Guaranteed) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50 flex flex-col items-center gap-2 pointer-events-none">
          {/* Calm 3B1B Subtitle Card */}
          {subtitleText && (
            <div className="w-full pointer-events-auto bg-[#0D1118]/95 backdrop-blur-md border border-[#222B3D] px-4 py-2.5 rounded-xl shadow-2xl text-xs text-[#ECECEC] font-serif italic flex items-center justify-between gap-3 animate-fadeIn">
              <span className="text-left leading-relaxed">{subtitleText}</span>
              <button
                onClick={() => setSubtitleText(null)}
                className="text-[#888888] hover:text-[#ECECEC] text-[11px] font-sans px-1.5 py-0.5 rounded cursor-pointer shrink-0"
                title="Dismiss Subtitle"
              >
                ✕
              </button>
            </div>
          )}

          {/* Sleek Floating Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion(chatInput);
            }}
            className="w-full pointer-events-auto flex items-center bg-[#0D1118]/95 backdrop-blur-md border border-[#1E2638] focus-within:border-[#58C4DD]/70 rounded-full px-3.5 py-1.5 shadow-2xl transition-all"
          >
            <span className="text-[#58C4DD] text-sm mr-2 select-none">💬</span>
            <input
              ref={chatInputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask QWEEPS a question (e.g. 'Why is Node A prioritized?', 'What is admissibility?')..."
              className="w-full bg-transparent text-xs text-[#ECECEC] placeholder-[#667287] outline-none font-sans"
            />
            {chatInput.trim() && (
              <button
                type="submit"
                className="ml-2 px-3 py-1 bg-[#58C4DD] hover:bg-[#76D1E6] text-black font-semibold text-[11px] rounded-full transition-colors cursor-pointer shrink-0"
              >
                Ask
              </button>
            )}
          </form>

          {/* Quick Concept Prompt Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10.5px] pointer-events-auto">
            {[
              { label: 'Why is A prioritized?', q: 'Why is Node A prioritized over Node B in the frontier?' },
              { label: 'Admissibility Rule', q: 'What makes the heuristic admissible and why does Euclidean guarantee optimality?' },
              { label: "Dijkstra's Flaw", q: "Why did Dijkstra expand radially and waste compute without goal direction?" },
              { label: 'How h(n) calculates', q: 'How does the Euclidean heuristic calculate straight-line distance via Pythagorean theorem?' },
              { label: 'Reset nodes', q: 'Reset nodes to default positions' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => handleAskQuestion(chip.q)}
                className="px-2.5 py-0.5 bg-[#121622]/85 hover:bg-[#1C2336] text-[#9BA3B4] hover:text-[#ECECEC] border border-[#1E2638] rounded-full transition-colors cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Sleek Floating Bottom Transport Bar */}
          <div className="pointer-events-auto bg-[#0D1118]/90 backdrop-blur-md border border-[#1E2638] px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-3 text-xs select-none whitespace-nowrap">
            {/* Play/Pause & Beat Stepping */}
            <button
              onClick={() => handleStepBeat(-1)}
              title="Previous Beat (Key: ←)"
              className="p-1 text-[#9BA3B4] hover:text-[#ECECEC] transition-colors cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              title="Play/Pause (Key: Space)"
              className="p-1.5 bg-[#ECECEC] text-black hover:bg-white rounded-full transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>

            <button
              onClick={() => handleStepBeat(1)}
              title="Next Beat (Key: →)"
              className="p-1 text-[#9BA3B4] hover:text-[#ECECEC] transition-colors cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <div className="h-3.5 w-px bg-[#222B3D]" />

            {/* Current Beat Information */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10.5px] text-[#58C4DD] font-semibold">
                Beat {currentBeatIndex + 1}/{activeScene.beats.length}:
              </span>
              <span className="text-[#ECECEC] font-serif italic text-xs max-w-[200px] sm:max-w-xs truncate">
                {currentBeat.title.replace(/^Beat \d+:\s*/, '')}
              </span>
            </div>

            <div className="h-3.5 w-px bg-[#222B3D]" />

            {/* Branch Button */}
            {activeSceneId === 'astar_heuristic' && (
              <button
                onClick={() => {
                  if (activeScene.beats.length >= 5) {
                    setCurrentTime(activeScene.beats[4].startTime + 0.05);
                  }
                }}
                title="Branch into Manhattan vs Euclidean (Key: B)"
                className="px-2 py-0.5 text-[10.5px] font-mono rounded-full border border-[#FF862F]/40 bg-[#FF862F]/15 text-[#FF862F] hover:bg-[#FF862F]/25 transition-colors cursor-pointer"
              >
                Branch (B)
              </button>
            )}

            {/* Voice Toggle */}
            <button
              onClick={() => {
                if (voiceEnabled && typeof window !== 'undefined') window.speechSynthesis?.cancel();
                setVoiceEnabled(!voiceEnabled);
              }}
              title="Toggle QWEEPS Voice Narration"
              className={`px-2 py-0.5 text-[10.5px] font-mono rounded-full border transition-colors cursor-pointer flex items-center gap-1.5 ${
                voiceEnabled
                  ? 'bg-[#83C167]/15 border-[#83C167]/50 text-[#83C167]'
                  : 'bg-[#141A26] border-[#222B3D] text-[#888888]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${voiceEnabled ? 'bg-[#83C167] animate-pulse' : 'bg-gray-500'}`} />
              {voiceEnabled ? 'Voice ON' : 'Muted'}
            </button>
          </div>
        </div>

        {/* Subtle Canvas Interaction Hints Badge */}
        <div className="absolute bottom-3 right-4 text-[10.5px] font-mono text-[#667287] select-none pointer-events-none bg-[#0D1118]/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-[#1E2638]/60 flex items-center gap-2">
          <span>Right-drag: Pan</span>
          <span>•</span>
          <span>Left-drag: Move Node (S, G, A, B)</span>
          <span>•</span>
          <kbd className="px-1 py-0.2 bg-[#1B2333] rounded text-[#ECECEC] text-[9.5px]">Esc</kbd>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080A0F] text-[#ECECEC] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-[#1A2130] bg-[#0B0E16]">
        <a
          href="#stage"
          className="text-base font-semibold tracking-tight text-[#ECECEC] whitespace-nowrap shrink-0"
        >
          Manim MovingCameraScene
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9BA3B4]">
          <a
            href="#stage"
            className="hover:text-[#ECECEC] transition-colors whitespace-nowrap shrink-0"
          >
            Explainer Stage
          </a>
          <a
            href="#timeline"
            onClick={(e) => {
              e.preventDefault();
              setInspectorTab('beats_camera');
            }}
            className="hover:text-[#ECECEC] transition-colors whitespace-nowrap shrink-0"
          >
            Camera Keyframes
          </a>
          <a
            href="#python-code"
            onClick={(e) => {
              e.preventDefault();
              setInspectorTab('python_code');
            }}
            className="hover:text-[#ECECEC] transition-colors whitespace-nowrap shrink-0"
          >
            Manim Python
          </a>
          <a
            href="#style-rules"
            className="hover:text-[#ECECEC] transition-colors whitespace-nowrap shrink-0"
          >
            Zero-Neon Rules
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExportSnapshotOrVideo}
            className="px-4 py-2 text-xs font-medium text-black bg-[#58C4DD] hover:bg-[#76D1E6] rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isRecording ? 'Recording 5s WebM...' : 'Record 5s WebM'}
          </button>
        </div>
      </header>

      {/* Main Workspace Container (1440px max-w baseline) */}
      <main id="stage" className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* Scene Selector Bar & LaTeX Equation Strip */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
          {/* Interactive Scene Selector Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#111622] border border-[#1E2638] rounded-lg">
            {(Object.keys(MANIM_SCENES) as SceneId[]).map((id) => {
              const sc = MANIM_SCENES[id];
              const active = id === activeSceneId;
              return (
                <button
                  key={id}
                  onClick={() => handleSelectScene(id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#58C4DD] text-black font-semibold'
                      : 'text-[#9BA3B4] hover:text-[#ECECEC] hover:bg-[#192030]'
                  }`}
                >
                  {sc.title}
                </button>
              );
            })}
          </div>

          {/* Quiet Unboxed Metadata Readout */}
          <div className="flex items-center gap-2 text-xs text-[#9BA3B4] font-mono-tabular">
            <span className="text-[#58C4DD]">{activeScene.manimClass}</span>
            <span aria-hidden="true">·</span>
            <span>rate_func=smooth</span>
            <span aria-hidden="true">·</span>
            <span>#000000 Pure Vector</span>
          </div>
        </div>

        {/* Two-Zone Educational Sandbox Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT ZONE (8 cols): Interactive Manim Canvas + Timeline Scrubber */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <ManimCanvas
              sceneId={activeSceneId}
              currentTime={currentTime}
              config={renderConfig}
              canvasRef={canvasRef}
              onCameraTelemetry={setCameraTelemetry}
              nodeS={nodeS}
              nodeG={nodeG}
              nodeA={nodeA}
              nodeB={nodeB}
              onNodeChange={handleNodeChange}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onCameraOverrideChange={(override) =>
                setRenderConfig((prev) => ({ ...prev, cameraOverride: override }))
              }
            />

            {/* Transport & Timeline Controls Bar */}
            <div
              id="timeline"
              className="p-4 bg-[#0D1118] border border-[#1E2638] rounded-lg space-y-3.5"
            >
              {/* Scrubber Slider with Beat Markers */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#ECECEC]">
                    Beat {currentBeatIndex + 1} of {activeScene.beats.length}:{' '}
                    <span className="text-[#58C4DD]">{currentBeat.title}</span>
                  </span>
                  <span className="font-mono-tabular text-[#9BA3B4]">
                    {currentTime.toFixed(2)}s / {activeScene.duration.toFixed(2)}s
                  </span>
                </div>

                <input
                  type="range"
                  min={0}
                  max={activeScene.duration}
                  step={0.02}
                  value={currentTime}
                  onChange={(e) => {
                    setIsPlaying(false);
                    setCurrentTime(parseFloat(e.target.value));
                  }}
                  aria-label="Animation Timeline Scrubber"
                  className="w-full h-2 bg-[#1A2232] rounded-lg appearance-none cursor-pointer accent-[#58C4DD]"
                />

                {/* Segmented Beat Jump Buttons */}
                <div
                  className="grid gap-1 pt-1"
                  style={{
                    gridTemplateColumns: `repeat(${activeScene.beats.length}, minmax(0, 1fr))`,
                  }}
                >
                  {activeScene.beats.map((beat, idx) => {
                    const isCurrent = beat.id === currentBeat.id;
                    return (
                      <button
                        key={beat.id}
                        onClick={() => {
                          setCurrentTime(beat.startTime + 0.05);
                        }}
                        title={`${beat.title} (${beat.startTime.toFixed(1)}s – ${beat.endTime.toFixed(1)}s)`}
                        className={`px-2 py-1 text-[11px] font-mono-tabular rounded transition-colors truncate cursor-pointer ${
                          isCurrent
                            ? 'bg-[#58C4DD]/20 text-[#58C4DD] border border-[#58C4DD]/50'
                            : 'bg-[#131924] text-[#888888] hover:text-[#ECECEC] border border-transparent'
                        }`}
                      >
                        {idx + 1}. {beat.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Playback Controls & Speed / Overlay Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#181F2E]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-black bg-[#ECECEC] hover:bg-white rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>

                  <button
                    onClick={() => handleStepBeat(-1)}
                    title="Previous Manim Beat"
                    className="p-1.5 text-[#9BA3B4] hover:text-[#ECECEC] bg-[#141A26] hover:bg-[#1B2333] rounded-md transition-colors cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleStepBeat(1)}
                    title="Next Manim Beat"
                    className="p-1.5 text-[#9BA3B4] hover:text-[#ECECEC] bg-[#141A26] hover:bg-[#1B2333] rounded-md transition-colors cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setCurrentTime(0);
                      setIsPlaying(true);
                    }}
                    title="Restart Scene"
                    className="p-1.5 text-[#9BA3B4] hover:text-[#ECECEC] bg-[#141A26] hover:bg-[#1B2333] rounded-md transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* Playback Speed Selector */}
                  <div className="flex items-center gap-1 ml-2 bg-[#141A26] p-0.5 rounded-md">
                    {[0.5, 1.0, 1.5].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => setPlaybackSpeed(spd)}
                        className={`px-2 py-1 text-[11px] font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          playbackSpeed === spd
                            ? 'bg-[#263147] text-[#58C4DD] font-medium'
                            : 'text-[#888888] hover:text-[#ECECEC]'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Manim Canvas Overlays & Interaction Toggles */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      if (voiceEnabled && typeof window !== 'undefined') window.speechSynthesis?.cancel();
                      setVoiceEnabled(!voiceEnabled);
                    }}
                    title="Toggle QWEEPS Voice Narration"
                    className={`px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      voiceEnabled
                        ? 'bg-[#83C167]/15 border-[#83C167] text-[#83C167]'
                        : 'bg-[#141A26] border-[#222B3D] text-[#888888] hover:text-[#ECECEC]'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${voiceEnabled ? 'bg-[#83C167] animate-pulse' : 'bg-gray-500'}`} />
                    {voiceEnabled ? 'QWEEPS Voice: ON' : 'Voice: Muted'}
                  </button>

                  {activeSceneId === 'astar_heuristic' && (
                    <button
                      onClick={() => {
                        if (activeScene.beats.length >= 5) {
                          setCurrentTime(activeScene.beats[4].startTime + 0.05);
                        }
                      }}
                      title="Branch into Manhattan vs Euclidean Admissibility (Key: B)"
                      className="px-2.5 py-1 text-xs rounded border border-[#FF862F]/40 bg-[#FF862F]/10 text-[#FF862F] hover:bg-[#FF862F]/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Branch: Manhattan (B)
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setRenderConfig((prev) => ({
                        ...prev,
                        cameraOverride: { active: false, x: 0, y: 0, zoom: 1.0 },
                      }));
                      setNodeA({ x: -1.0, y: 0.0 });
                      setNodeB({ x: -3.0, y: 1.0 });
                      setSelectedNodeId('A');
                    }}
                    title="Reset camera zoom and node positions (Key: R)"
                    className="px-2.5 py-1 text-xs rounded border border-[#222B3D] bg-[#141A26] text-[#9BA3B4] hover:text-[#ECECEC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Reset View (R)
                  </button>

                  <button
                    onClick={() =>
                      setRenderConfig((p) => ({ ...p, showNumberPlane: !p.showNumberPlane }))
                    }
                    className={`px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      renderConfig.showNumberPlane
                        ? 'bg-[#58C4DD]/15 border-[#58C4DD] text-[#58C4DD]'
                        : 'bg-[#141A26] border-[#222B3D] text-[#9BA3B4] hover:text-[#ECECEC]'
                    }`}
                  >
                    NumberPlane Grid
                  </button>
                  <button
                    onClick={() =>
                      setRenderConfig((p) => ({ ...p, showCameraFrameHud: !p.showCameraFrameHud }))
                    }
                    className={`px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      renderConfig.showCameraFrameHud
                        ? 'bg-[#FFFF00]/15 border-[#FFFF00] text-[#FFFF00]'
                        : 'bg-[#141A26] border-[#222B3D] text-[#9BA3B4] hover:text-[#ECECEC]'
                    }`}
                  >
                    Camera HUD
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT ZONE (4 cols): Control & Concept Deck */}
          <div className="lg:col-span-4 bg-[#0D1118] border border-[#1E2638] rounded-lg flex flex-col overflow-hidden">
            {/* Inspector Mode Tabs */}
            <div className="grid grid-cols-3 p-1 bg-[#111722] border-b border-[#1E2638]">
              <button
                onClick={() => setInspectorTab('beats_camera')}
                className={`py-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  inspectorTab === 'beats_camera'
                    ? 'bg-[#1D2638] text-[#ECECEC]'
                    : 'text-[#888888] hover:text-[#ECECEC]'
                }`}
              >
                Camera &amp; Beats
              </button>
              <button
                onClick={() => setInspectorTab('python_code')}
                className={`py-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  inspectorTab === 'python_code'
                    ? 'bg-[#1D2638] text-[#ECECEC]'
                    : 'text-[#888888] hover:text-[#ECECEC]'
                }`}
              >
                Manim Python
              </button>
              <button
                onClick={() => setInspectorTab('ai_prompt')}
                className={`py-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  inspectorTab === 'ai_prompt'
                    ? 'bg-[#1D2638] text-[#ECECEC]'
                    : 'text-[#888888] hover:text-[#ECECEC]'
                }`}
              >
                Prompt Recipe
              </button>
            </div>

            {/* Tab 1: MovingCameraScene Telemetry & Sequence Beats */}
            {inspectorTab === 'beats_camera' && (
              <div className="p-4 space-y-5">
                {/* Active Mobject Call Card */}
                <div className="p-3.5 bg-[#121824] border border-[#222B3D] rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#9BA3B4]">
                    <span>ACTIVE MOBJECT CALL</span>
                    <span className="text-[#5CD0B3]">
                      {currentBeat.startTime.toFixed(1)}s – {currentBeat.endTime.toFixed(1)}s
                    </span>
                  </div>
                  <div className="text-xs font-mono-tabular text-[#FFFF00] break-words">
                    {currentBeat.mobjectCall}
                  </div>
                  <p className="text-xs text-[#BBBBBB] leading-relaxed">{currentBeat.description}</p>
                  <div className="pt-2 border-t border-[#1C2536] flex flex-col gap-1 text-[11px] font-mono-tabular">
                    <div className="flex items-center justify-between text-[#9BA3B4]">
                      <span>ValueTracker:</span>
                      <span className="text-[#58C4DD]">{currentBeat.valueTrackerState}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#9BA3B4]">
                      <span>MovingCamera:</span>
                      <span className="text-[#83C167]">{currentBeat.cameraState}</span>
                    </div>
                  </div>
                </div>

                {/* A* Interactive Node Inspector */}
                {activeSceneId === 'astar_heuristic' && (
                  <div className="p-3.5 bg-[#121824] border border-[#222B3D] rounded-lg space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#ECECEC]">
                      <span>Interactive Nodes Inspector</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedNodeId('S')}
                          className={`px-2 py-0.5 text-xs rounded font-mono-tabular transition-colors cursor-pointer ${
                            selectedNodeId === 'S'
                              ? 'bg-[#83C167]/20 text-[#83C167] border border-[#83C167]/50'
                              : 'bg-[#182030] text-[#888888] hover:text-[#ECECEC]'
                          }`}
                        >
                          Node S
                        </button>
                        <button
                          onClick={() => setSelectedNodeId('G')}
                          className={`px-2 py-0.5 text-xs rounded font-mono-tabular transition-colors cursor-pointer ${
                            selectedNodeId === 'G'
                              ? 'bg-[#FC6255]/20 text-[#FC6255] border border-[#FC6255]/50'
                              : 'bg-[#182030] text-[#888888] hover:text-[#ECECEC]'
                          }`}
                        >
                          Goal G
                        </button>
                        <button
                          onClick={() => setSelectedNodeId('A')}
                          className={`px-2 py-0.5 text-xs rounded font-mono-tabular transition-colors cursor-pointer ${
                            selectedNodeId === 'A'
                              ? 'bg-[#58C4DD]/20 text-[#58C4DD] border border-[#58C4DD]/50'
                              : 'bg-[#182030] text-[#888888] hover:text-[#ECECEC]'
                          }`}
                        >
                          Node A
                        </button>
                        <button
                          onClick={() => setSelectedNodeId('B')}
                          className={`px-2 py-0.5 text-xs rounded font-mono-tabular transition-colors cursor-pointer ${
                            selectedNodeId === 'B'
                              ? 'bg-[#FFFF00]/20 text-[#FFFF00] border border-[#FFFF00]/50'
                              : 'bg-[#182030] text-[#888888] hover:text-[#ECECEC]'
                          }`}
                        >
                          Node B
                        </button>
                      </div>
                    </div>

                    {selectedNodeId && (
                      <div className="space-y-2 text-xs font-mono-tabular">
                        {(() => {
                          const curNode =
                            selectedNodeId === 'S'
                              ? nodeS
                              : selectedNodeId === 'G'
                                ? nodeG
                                : selectedNodeId === 'A'
                                  ? nodeA
                                  : nodeB;
                          const dx = nodeG.x - curNode.x;
                          const dy = nodeG.y - curNode.y;
                          const h = Math.hypot(dx, dy);
                          const g = Math.hypot(curNode.x - nodeS.x, curNode.y - nodeS.y);
                          const f = g + h;
                          return (
                            <>
                              <div className="flex justify-between text-[#9BA3B4]">
                                <span>Position (x, y):</span>
                                <span className="text-[#ECECEC]">({curNode.x.toFixed(2)}, {curNode.y.toFixed(2)})</span>
                              </div>
                              <div className="flex justify-between text-[#9BA3B4]">
                                <span>Accumulated Cost g(n):</span>
                                <span className="text-[#83C167]">{g.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[#9BA3B4]">
                                <span>Heuristic Distance h(n):</span>
                                <span className="text-[#FFFF00]">{h.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[#ECECEC] font-bold border-t border-[#1C2536] pt-1.5">
                                <span>Total Evaluation f(n) = g + h:</span>
                                <span className="text-[#58C4DD]">{f.toFixed(2)}</span>
                              </div>
                              <div className="p-2 rounded bg-[#0A0D14] border border-[#1E2638] text-[11px] text-[#9BA3B4] leading-relaxed">
                                • Left-click &amp; drag any node (S, G, A, B) to dynamically explore Euclidean vs Manhattan metrics.<br />
                                • Right-click &amp; drag anywhere to pan the 3B1B camera.<br />
                                • Press <kbd className="px-1 py-0.5 bg-[#1B2333] rounded text-[#ECECEC]">B</kbd> to branch into Manhattan metric.
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* Live MovingCameraScene Frame Telemetry & Manual Override */}
                <div className="space-y-3 pt-1 border-t border-[#1A2130]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#ECECEC]">
                      MovingCameraScene Frame
                    </span>
                    <div className="flex items-center gap-1.5">
                      {activeSceneId === 'chapter2_pdf' && (
                        <button
                          onClick={() => {
                            setCurrentTime(29.5);
                            setIsPlaying(false);
                            setRenderConfig((prev) => ({
                              ...prev,
                              cameraOverride: {
                                active: true,
                                x: 0.0,
                                y: -9.0,
                                zoom: 0.28,
                              },
                            }));
                          }}
                          className="px-2 py-0.5 text-[11px] font-mono-tabular rounded bg-[#161D2B] text-[#FFFF00] hover:bg-[#1E2738] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Full 6-Zone Map
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setRenderConfig((prev) => ({
                            ...prev,
                            cameraOverride: {
                              active: !prev.cameraOverride.active,
                              x: cameraTelemetry.x,
                              y: cameraTelemetry.y,
                              zoom: cameraTelemetry.zoom,
                            },
                          }))
                        }
                        className={`px-2 py-0.5 text-[11px] font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          renderConfig.cameraOverride.active
                            ? 'bg-[#FC6255]/20 text-[#FC6255] border border-[#FC6255]/40'
                            : 'bg-[#161D2B] text-[#58C4DD] hover:bg-[#1E2738]'
                        }`}
                      >
                        {renderConfig.cameraOverride.active
                          ? 'Resume Auto Camera'
                          : 'Manual Pan'}
                      </button>
                    </div>
                  </div>

                  {/* Camera X Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono-tabular">
                      <span className="text-[#9BA3B4]">camera.frame.x</span>
                      <span className="text-[#ECECEC]">
                        {(renderConfig.cameraOverride.active
                          ? renderConfig.cameraOverride.x
                          : cameraTelemetry.x
                        ).toFixed(2)}{' '}
                        u
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-9.0}
                      max={9.0}
                      step={0.1}
                      value={
                        renderConfig.cameraOverride.active
                          ? renderConfig.cameraOverride.x
                          : cameraTelemetry.x
                      }
                      onChange={(e) =>
                        setRenderConfig((prev) => ({
                          ...prev,
                          cameraOverride: {
                            active: true,
                            x: parseFloat(e.target.value),
                            y: prev.cameraOverride.active
                              ? prev.cameraOverride.y
                              : cameraTelemetry.y,
                            zoom: prev.cameraOverride.active
                              ? prev.cameraOverride.zoom
                              : cameraTelemetry.zoom,
                          },
                        }))
                      }
                      className="w-full h-1.5 bg-[#1A2232] rounded appearance-none cursor-pointer accent-[#58C4DD]"
                    />
                  </div>

                  {/* Camera Y Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono-tabular">
                      <span className="text-[#9BA3B4]">camera.frame.y</span>
                      <span className="text-[#ECECEC]">
                        {(renderConfig.cameraOverride.active
                          ? renderConfig.cameraOverride.y
                          : cameraTelemetry.y
                        ).toFixed(2)}{' '}
                        u
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-19.5}
                      max={2.0}
                      step={0.1}
                      value={
                        renderConfig.cameraOverride.active
                          ? renderConfig.cameraOverride.y
                          : cameraTelemetry.y
                      }
                      onChange={(e) =>
                        setRenderConfig((prev) => ({
                          ...prev,
                          cameraOverride: {
                            active: true,
                            x: prev.cameraOverride.active
                              ? prev.cameraOverride.x
                              : cameraTelemetry.x,
                            y: parseFloat(e.target.value),
                            zoom: prev.cameraOverride.active
                              ? prev.cameraOverride.zoom
                              : cameraTelemetry.zoom,
                          },
                        }))
                      }
                      className="w-full h-1.5 bg-[#1A2232] rounded appearance-none cursor-pointer accent-[#58C4DD]"
                    />
                  </div>

                  {/* Camera Zoom Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono-tabular">
                      <span className="text-[#9BA3B4]">camera.frame.zoom</span>
                      <span className="text-[#ECECEC]">
                        {(renderConfig.cameraOverride.active
                          ? renderConfig.cameraOverride.zoom
                          : cameraTelemetry.zoom
                        ).toFixed(2)}
                        x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={2.0}
                      step={0.02}
                      value={
                        renderConfig.cameraOverride.active
                          ? renderConfig.cameraOverride.zoom
                          : cameraTelemetry.zoom
                      }
                      onChange={(e) =>
                        setRenderConfig((prev) => ({
                          ...prev,
                          cameraOverride: {
                            active: true,
                            x: prev.cameraOverride.active
                              ? prev.cameraOverride.x
                              : cameraTelemetry.x,
                            y: prev.cameraOverride.active
                              ? prev.cameraOverride.y
                              : cameraTelemetry.y,
                            zoom: parseFloat(e.target.value),
                          },
                        }))
                      }
                      className="w-full h-1.5 bg-[#1A2232] rounded appearance-none cursor-pointer accent-[#58C4DD]"
                    />
                  </div>

                  {/* Vector Stroke Weight Multiplier */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono-tabular">
                      <span className="text-[#9BA3B4]">stroke_width scale</span>
                      <span className="text-[#ECECEC]">{renderConfig.strokeScale.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={1.8}
                      step={0.05}
                      value={renderConfig.strokeScale}
                      onChange={(e) =>
                        setRenderConfig((prev) => ({
                          ...prev,
                          strokeScale: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full h-1.5 bg-[#1A2232] rounded appearance-none cursor-pointer accent-[#58C4DD]"
                    />
                  </div>
                </div>

                {/* Full Beat Sequence List */}
                <div className="space-y-2 pt-2 border-t border-[#1A2130]">
                  <div className="text-xs font-semibold text-[#ECECEC]">
                    Scene Sequence ({activeScene.beats.length} Mobject Stages)
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {activeScene.beats.map((b, idx) => {
                      const active = b.id === currentBeat.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            setCurrentTime(b.startTime + 0.05);
                          }}
                          className={`w-full text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#162030] border-[#58C4DD]/60'
                              : 'bg-[#10151F] border-[#1A2232] hover:border-[#2B3750]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-medium">
                            <span className={active ? 'text-[#58C4DD]' : 'text-[#ECECEC]'}>
                              0{idx + 1}. {b.title}
                            </span>
                            <span className="text-[11px] font-mono-tabular text-[#888888]">
                              {b.startTime.toFixed(1)}s
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-tabular text-[#9BA3B4] truncate mt-0.5">
                            {b.mobjectCall}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Authentic Manim Community Python Script */}
            {inspectorTab === 'python_code' && (
              <div id="python-code" className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#9BA3B4] font-mono-tabular">
                    manim -pqh scene.py {activeScene.manimClass.split('(')[0].replace('class ', '')}
                  </span>
                  <button
                    onClick={() => handleCopyText(activeScene.pythonCode)}
                    className="px-3 py-1 text-xs font-medium text-black bg-[#58C4DD] hover:bg-[#76D1E6] rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied' : 'Copy Python'}
                  </button>
                </div>
                <pre className="p-3.5 bg-[#080B10] border border-[#1B2333] rounded-lg text-[11.5px] font-mono-tabular text-[#D4DCE8] overflow-x-auto max-h-[420px] leading-relaxed">
                  <code>{activeScene.pythonCode}</code>
                </pre>
              </div>
            )}

            {/* Tab 3: AI Studio Prompt Recipe */}
            {inspectorTab === 'ai_prompt' && (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#ECECEC]">
                    Copyable Prompt for AI Studio Build
                  </span>
                  <button
                    onClick={() => handleCopyText(activeScene.aiStudioPrompt)}
                    className="px-3 py-1 text-xs font-medium text-black bg-[#58C4DD] hover:bg-[#76D1E6] rounded transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied' : 'Copy Prompt'}
                  </button>
                </div>
                <p className="text-xs text-[#9BA3B4] leading-relaxed">
                  Paste this prompt whenever requesting mathematical animations in Google AI Studio to
                  enforce flat vector strokes, LaTeX serif typography, and smooth{' '}
                  <code className="text-[#58C4DD] font-mono-tabular">MovingCameraScene</code> easing
                  without neon glow:
                </p>
                <pre className="p-3.5 bg-[#080B10] border border-[#1B2333] rounded-lg text-xs font-mono-tabular text-[#5CD0B3] whitespace-pre-wrap leading-relaxed max-h-[360px] overflow-y-auto">
                  {activeScene.aiStudioPrompt}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Anti-Neon vs True Manim Visual Architecture & Uploaded Spec Verification */}
        <AntiNeonGuide />
      </main>
    </div>
  );
}

const LiveLessonPlayer = React.lazy(() => import('./live/LiveLessonPlayer'));
const LiveLessonLoader = React.lazy(() => import('./live/LiveLessonLoader'));
const ChapterStream = React.lazy(() => import('./live/ChapterStream'));
const MorphPilot = React.lazy(() => import('./live/MorphPilot'));
export default function App() {
  const params = new URLSearchParams(location.search);
  if (params.get('scene') === 'rizal_live') return <React.Suspense fallback={<div style={{background:'#071117',color:'#a5b8bf',height:'100dvh',display:'grid',placeItems:'center'}}>Opening the live lesson…</div>}><LiveLessonPlayer /></React.Suspense>;
  if (params.get('pilot') === '1') return <React.Suspense fallback={<div style={{background:'#071117',color:'#a5b8bf',height:'100dvh',display:'grid',placeItems:'center'}}>Opening the morph pilot…</div>}><MorphPilot/></React.Suspense>;
  if (params.get('stream') === '1') return <React.Suspense fallback={<div style={{background:'#071117',color:'#a5b8bf',height:'100dvh',display:'grid',placeItems:'center'}}>Opening the chapter stream…</div>}><ChapterStream topic={params.get('topic')||''} replay={params.get('streamLesson')||''} methods={params.get('methods')==='1'}/></React.Suspense>;
  if (params.get('examples') === '1') return <ExampleGallery />;
  if (params.get('mode') === 'studio') return <StudioApp />;
  if (params.get('mode') === 'manim' || (params.has('scene') && params.get('scene') !== 'rizal_live')) return <LearningPlayer />;
  return <React.Suspense fallback={<div style={{background:'#071117',color:'#a5b8bf',height:'100dvh',display:'grid',placeItems:'center'}}>Opening QWEEPS visual learning…</div>}><LiveLessonLoader /></React.Suspense>;
}
