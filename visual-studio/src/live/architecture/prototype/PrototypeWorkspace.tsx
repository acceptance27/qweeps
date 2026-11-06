import {usePrototypeNarration} from './usePrototypeNarration';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Network } from 'lucide-react';
import { MINI_EXPLANATION_STEPS } from './data/askQweepsData';
import { graphForFrame,workspaceForLesson } from './workspace';
import type {LiveLesson} from '../../lessonTypes';
import './prototype.css';
import {
  validateLessonData,
} from './data/ragSteps';
import {
  buildDeterministicInitialLayout,
  computeElkGraphLayout,
} from './layout/elkLayout';
import {
  computeFocusCameraForNodes,
  computeOverviewCamera,
  evaluateTimeline,
} from './timeline/evaluateTimeline';
import {
  CameraState,
  ComputedGraphLayout,
  FunctionLessonId,
  NodeId,
  SavedParentState,
} from './types/lesson';
import { ArchitectureCanvas } from './components/ArchitectureCanvas';
import { AskQweepsDrawer } from './components/AskQweepsDrawer';
import { CodePane } from './components/CodePane';
import { EvidenceModal } from './components/EvidenceModal';
import { Header } from './components/Header';
import { PlaybackBar } from './components/PlaybackBar';

export default function PrototypeWorkspace({lesson,initialTime=0,onQuiz,onClose,voice=false,onToggleVoice,reviewTime,onRenderReady}:{lesson:LiveLesson;initialTime?:number;onQuiz:()=>void;onClose:()=>void;voice?:boolean;onToggleVoice:()=>void;reviewTime?:number;onRenderReady?:(ready:boolean)=>void}) {
  const renderReady=useRef(onRenderReady);renderReady.current=onRenderReady;
  const workspace=useMemo(()=>workspaceForLesson(lesson),[lesson]);
  const {graph:RAG_GRAPH,steps:RAG_STEPS,title:LESSON_TITLE,resolveFunction:resolveSubFunctionLesson}=workspace;
  // Validate graph & step references once on startup
  const validation = useMemo(() => validateLessonData(RAG_GRAPH, RAG_STEPS), [RAG_GRAPH,RAG_STEPS]);

  // Hierarchical Level-1 / Level-2 Function Sub-Lesson state + navigation history stack
  const [activeSubFunctionId, setActiveSubFunctionId] = useState<FunctionLessonId | null>(
    null
  );
  const [savedMacroState, setSavedMacroState] = useState<SavedParentState | null>(null);
  const [navigationStack, setNavigationStack] = useState<SavedParentState[]>([]);

  const activeSubFunction = useMemo(
    () => resolveSubFunctionLesson(activeSubFunctionId),
    [activeSubFunctionId,resolveSubFunctionLesson]
  );

  const activeGraph = activeSubFunction ? activeSubFunction.graph : RAG_GRAPH;
  const activeSteps = activeSubFunction ? activeSubFunction.steps : RAG_STEPS;
  const activeTotalDuration = useMemo(
    () => activeSteps.reduce((acc, s) => acc + s.duration, 0),
    [activeSteps]
  );

  // Graph layout state: starts with deterministic compact 2-row layout and caches ELK layout per graph
  const [layout, setLayout] = useState<ComputedGraphLayout>(() =>
    buildDeterministicInitialLayout(RAG_GRAPH, 'elk')
  );

  useEffect(() => {
    let cancelled = false;
    renderReady.current?.(false);
    setLayout(buildDeterministicInitialLayout(activeGraph, 'elk'));
    computeElkGraphLayout(activeGraph).then((elkResult) => {
      if (!cancelled) {
        setLayout(elkResult);
        renderReady.current?.(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeGraph]);

  // Respect system prefers-reduced-motion with manual toggle override
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Single authoritative playhead (in seconds, 0..activeTotalDuration)
  const [playhead, setPlayhead] = useState<number>(initialTime);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  useEffect(()=>{if(reviewTime!==undefined)setPlayhead(reviewTime);},[reviewTime]);

  // Canvas viewport dimensions for deterministic camera calculation
  const [canvasViewport, setCanvasViewport] = useState<{ width: number; height: number }>({
    width: 920,
    height: 560,
  });

  // Start in 'overview' by default so the learner immediately sees the full Ptolemy/ELK compound block diagram
  const [cameraMode, setCameraMode] = useState<'follow' | 'manual' | 'overview'>('overview');
  const [manualCamera, setManualCamera] = useState<CameraState>({
    x: 36,
    y: 36,
    zoom: 0.78,
  });

  // Selected node for on-demand NodeInspector
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);

  // Contextual Ask QWEEPS drawer state
  const [isAskOpen, setIsAskOpen] = useState<boolean>(false);

  // 3-step Mini-Explanation state + saved parent state for breadcrumb return
  const [miniModeActive, setMiniModeActive] = useState<boolean>(false);
  const [miniStepIndex, setMiniStepIndex] = useState<number>(0);
  const [savedParentState, setSavedParentState] = useState<SavedParentState | null>(null);

  // Supporting evidence highlight state (for [refund-policy])
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState<string | null>(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState<boolean>(false);

  // Mobile portrait view tab ('diagram' | 'code') — synchronized with the same playhead
  const [mobileTab, setMobileTab] = useState<'diagram' | 'code'>('diagram');

  // Desktop left code pane width percentage (resizable between 26% and 46%)
  const [codePaneWidthPct, setCodePaneWidthPct] = useState<number>(34);
  const isResizingPaneRef = useRef<boolean>(false);

  // Evaluate entire frame purely from playhead
  const frame = useMemo(
    () =>
      evaluateTimeline(
        playhead,
        activeSteps,
        activeGraph,
        layout,
        canvasViewport.width,
        canvasViewport.height,
        reducedMotion
      ),
    [
      playhead,
      activeSteps,
      activeGraph,
      layout,
      canvasViewport.width,
      canvasViewport.height,
      reducedMotion,
    ]
  );

  const visibleGraph=useMemo(()=>graphForFrame(activeGraph,frame.nodeFrames,workspace.isReference),[activeGraph,frame.nodeFrames,workspace.isReference]);
  const narration=usePrototypeNarration(lesson,activeSteps,frame.stepIndex,playhead,isPlaying,voice,activeSubFunctionId,workspace.isReference,()=>setIsPlaying(false));

  // Compute active camera based on mode (or Mini-Explanation focus)
  const activeCamera: CameraState = useMemo(() => {
    if (miniModeActive && !activeSubFunction) {
      const ms = MINI_EXPLANATION_STEPS[miniStepIndex];
      return computeFocusCameraForNodes(
        ms.focusNodes,
        layout,
        canvasViewport.width,
        canvasViewport.height
      );
    }
    if (cameraMode === 'overview') {
      return computeOverviewCamera(layout, canvasViewport.width, canvasViewport.height);
    }
    if (cameraMode === 'manual') {
      return manualCamera;
    }
    return frame.targetCamera;
  }, [
    miniModeActive,
    activeSubFunction,
    miniStepIndex,
    cameraMode,
    manualCamera,
    frame.targetCamera,
    layout,
    canvasViewport.width,
    canvasViewport.height,
  ]);

  // Playhead requestAnimationFrame loop: progresses automatically through all beats of active level
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      setPlayhead((prev) => {
        const next = narration.clock() ?? prev + dt;
        if (next >= activeTotalDuration) {
          setIsPlaying(false);
          return activeTotalDuration;
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, activeTotalDuration,narration.clock]);

  // Desktop divider drag resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPaneRef.current) return;
      const pct = (e.clientX / Math.max(1, window.innerWidth)) * 100;
      setCodePaneWidthPct(Math.max(26, Math.min(46, pct)));
    };
    const handleMouseUp = () => {
      isResizingPaneRef.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Handlers
  const handleTogglePlay = useCallback(() => {
    if (miniModeActive) {
      setMiniModeActive(false);
    }
    setSelectedNodeId(null);
    setPlayhead((prev) => (prev >= activeTotalDuration - 0.05 ? 0 : prev));
    setIsPlaying((prev) => !prev);
  }, [miniModeActive, activeTotalDuration]);

  const handleRestart = useCallback(() => {
    setIsPlaying(false);
    setMiniModeActive(false);
    setSelectedNodeId(null);
    setActiveSubFunctionId(null);
    setNavigationStack([]);
    setCameraMode('follow');
    setPlayhead(0);
  }, []);

  const handleSeek = useCallback(
    (nextTime: number) => {
      setIsPlaying(false);
      const clamped = Math.max(0, Math.min(activeTotalDuration, nextTime));
      setPlayhead(clamped);
    },
    [activeTotalDuration]
  );

  const handleJumpToStep = useCallback(
    (stepIndex: number) => {
      setIsPlaying(false);
      const clampedIdx = Math.max(0, Math.min(activeSteps.length - 1, stepIndex));
      let startSec = 0;
      for (let i = 0; i < clampedIdx; i++) {
        startSec += activeSteps[i].duration;
      }
      const offset = clampedIdx === 0 ? 0.8 : 1.4;
      setPlayhead(startSec + offset);
    },
    [activeSteps]
  );

  // Drill into a Function / @Step Sub-Lesson, saving the exact current location onto navigationStack
  const handleDrillIntoFunction = useCallback(
    (fnId: FunctionLessonId) => {
      setIsPlaying(false);
      setMiniModeActive(false);
      const snapshot: SavedParentState = {
        subFunctionId: activeSubFunctionId,
        playhead,
        wasPlaying: false,
        selectedNodeId,
        camera: activeCamera,
        cameraMode,
      };
      setNavigationStack((prev) => [...prev, snapshot]);
      if (!activeSubFunctionId) {
        setSavedMacroState(snapshot);
      }
      setSelectedNodeId(null);
      setActiveSubFunctionId(fnId);
      setPlayhead(1.2); // Start slightly into Beat 1 of the inspected function so packet & state are visible
      setCameraMode('overview'); // Show the entire sub-illustration immediately
    },
    [activeSubFunctionId, playhead, selectedNodeId, activeCamera, cameraMode]
  );

  // Return to the exact location & state where the learner was right before they clicked to inspect
  const handleReturnToParentFunction = useCallback(() => {
    setIsPlaying(false);
    if (navigationStack.length > 0) {
      const prev = navigationStack[navigationStack.length - 1];
      setNavigationStack((stack) => stack.slice(0, -1));
      setActiveSubFunctionId(prev.subFunctionId ?? null);
      setPlayhead(prev.playhead);
      setSelectedNodeId(prev.selectedNodeId);
      setCameraMode(prev.cameraMode);
      if (prev.cameraMode === 'manual') {
        setManualCamera(prev.camera);
      }
      return;
    }
    setSelectedNodeId(null);
    if (activeSubFunction?.parentFunctionId) {
      setActiveSubFunctionId(activeSubFunction.parentFunctionId);
      setPlayhead(1.2);
      setCameraMode('overview');
      return;
    }
    setActiveSubFunctionId(null);
    if (savedMacroState) {
      setPlayhead(savedMacroState.playhead);
      setCameraMode(savedMacroState.cameraMode);
      if (savedMacroState.cameraMode === 'manual') {
        setManualCamera(savedMacroState.camera);
      }
    } else {
      setPlayhead(0);
      setCameraMode('overview');
    }
  }, [navigationStack, activeSubFunction, savedMacroState]);

  // Return all the way to Level-0 Macro Pipeline
  const handleReturnToMacroPipeline = useCallback(() => {
    setIsPlaying(false);
    setActiveSubFunctionId(null);
    setNavigationStack([]);
    setSelectedNodeId(null);
    if (savedMacroState) {
      setPlayhead(savedMacroState.playhead);
      setCameraMode(savedMacroState.cameraMode);
      if (savedMacroState.cameraMode === 'manual') {
        setManualCamera(savedMacroState.camera);
      }
    } else {
      setPlayhead(0);
      setCameraMode('overview');
    }
  }, [savedMacroState]);

  const backTargetLabel = useMemo(() => {
    if (navigationStack.length > 0) {
      const prev = navigationStack[navigationStack.length - 1];
      if (!prev.subFunctionId) return 'answer.py';
      const prevLesson = resolveSubFunctionLesson(prev.subFunctionId);
      return prevLesson ? prevLesson.functionName.split('(')[0] : prev.subFunctionId;
    }
    if (activeSubFunction?.parentFunctionId) {
      return activeSubFunction.parentFunctionId.replace('fn-', '');
    }
    return 'answer.py';
  }, [navigationStack, activeSubFunction]);

  const handleSelectNode = useCallback((nodeId: NodeId | null) => {
    setIsPlaying(false);
    setSelectedNodeId(nodeId);
  }, []);

  // Keyboard ArrowLeft / ArrowRight navigation to move backward / forward of the beat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'TEXTAREA' ||
          target.isContentEditable ||
          (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range')
        ) {
          return;
        }
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (miniModeActive) {
          setMiniStepIndex((prev) => Math.min(MINI_EXPLANATION_STEPS.length - 1, prev + 1));
        } else {
          handleJumpToStep(Math.min(activeSteps.length - 1, frame.stepIndex + 1));
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (miniModeActive) {
          setMiniStepIndex((prev) => Math.max(0, prev - 1));
        } else {
          handleJumpToStep(Math.max(0, frame.stepIndex - 1));
        }
      } else if (e.key === 'Escape' && selectedNodeId) {
        setSelectedNodeId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [miniModeActive, activeSteps.length, frame.stepIndex, handleJumpToStep, selectedNodeId]);

  // Compute which beat indices involve the currently selected node
  const involvedStepIndices = useMemo(() => {
    if (!selectedNodeId) return [];
    const indices: number[] = [];
    activeSteps.forEach((step, idx) => {
      const inFocus = step.focusNodes.includes(selectedNodeId);
      const inActive = step.activeNodes.includes(selectedNodeId);
      const inEdge = step.activeEdges.some((edgeId) => {
        const edge = activeGraph.edges.find((e) => e.id === edgeId);
        return edge && (edge.source === selectedNodeId || edge.target === selectedNodeId);
      });
      if (inFocus || inActive || inEdge) {
        indices.push(idx);
      }
    });
    return indices;
  }, [selectedNodeId, activeSteps, activeGraph]);

  const selectedNodeLabel = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = activeGraph.nodes.find((n) => n.id === selectedNodeId);
    return node ? node.label : null;
  }, [selectedNodeId, activeGraph]);

  const handleManualCameraChange = useCallback((nextCam: CameraState) => {
    setCameraMode('manual');
    setManualCamera(nextCam);
  }, []);

  const handleFitOverview = useCallback(() => {
    setCameraMode('overview');
  }, []);

  const handleResumeFollow = useCallback(() => {
    setCameraMode('follow');
  }, []);

  const handleViewportResize = useCallback((width: number, height: number) => {
    setCanvasViewport((prev) => {
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const handleCitationClick = useCallback(() => {
    setIsPlaying(false);
    setHighlightedEvidenceId('refund-policy');
    setEvidenceModalOpen(true);
  }, []);

  // Mini-Explanation launch & breadcrumb restore
  const handleStartMiniExplanation = useCallback(() => {
    setIsPlaying(false);
    if (activeSubFunctionId) {
      setActiveSubFunctionId(null);
    }
    setSavedParentState({
      subFunctionId:activeSubFunctionId,
      playhead,
      wasPlaying: isPlaying,
      selectedNodeId,
      camera: activeCamera,
      cameraMode,
    });
    setMiniStepIndex(0);
    setMiniModeActive(true);
  }, [activeSubFunctionId, playhead, isPlaying, selectedNodeId, activeCamera, cameraMode]);

  const handleExitMiniExplanation = useCallback(() => {
    setMiniModeActive(false);
    if (savedParentState) {
      setActiveSubFunctionId(savedParentState.subFunctionId??null);
      setPlayhead(savedParentState.playhead);
      setSelectedNodeId(savedParentState.selectedNodeId);
      setCameraMode(savedParentState.cameraMode);
      if (savedParentState.cameraMode === 'manual') {
        setManualCamera(savedParentState.camera);
      }
    }
  }, [savedParentState]);

  // Override nodeFrames & activeEdgeIds when in 3-step Mini-Explanation mode
  const effectiveNodeFrames = useMemo(() => {
    if (!miniModeActive || activeSubFunction) return frame.nodeFrames;
    const ms = MINI_EXPLANATION_STEPS[miniStepIndex];
    const focusSet = new Set<NodeId>(ms.focusNodes);
    const updated = { ...frame.nodeFrames };
    for (const id of Object.keys(updated) as NodeId[]) {
      const isFoc = focusSet.has(id);
      updated[id] = {
        ...updated[id],
        isFocused: isFoc,
        isActive: isFoc,
        isDimmed: !isFoc,
      };
    }
    return updated;
  }, [miniModeActive, activeSubFunction, miniStepIndex, frame.nodeFrames]);

  const effectiveActiveEdgeIds = useMemo(() => {
    if (!miniModeActive || activeSubFunction) return frame.activeEdgeIds;
    return new Set<string>(MINI_EXPLANATION_STEPS[miniStepIndex].activeEdges);
  }, [miniModeActive, activeSubFunction, miniStepIndex, frame.activeEdgeIds]);

  const effectiveHighlightedCodeLines = useMemo(() => {
    if (!miniModeActive || activeSubFunction) return frame.highlightedCodeLines;
    return MINI_EXPLANATION_STEPS[miniStepIndex].codeLines;
  }, [miniModeActive, activeSubFunction, miniStepIndex, frame.highlightedCodeLines]);

  return (
    <div data-prototype-playhead={playhead.toFixed(3)} style={reviewTime!==undefined?{height:'100%',width:'100%'}:undefined} className={`qweeps-architecture-prototype ${reviewTime!==undefined?'prototype-review':''} h-[100dvh] w-screen bg-[#0B1717] text-[#EEF3E9] flex flex-col overflow-hidden select-none`}>
      {/* 1. Compact Top Header */}
      <Header
        lessonTitle={LESSON_TITLE}
        currentBeatNumber={frame.step.beatNumber}
        currentBeatTitle={frame.step.title}
        learnerQuestion={frame.step.question}
        isAskOpen={isAskOpen}
        onToggleAsk={() => setIsAskOpen((prev) => !prev)}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={() => setReducedMotion((prev) => !prev)}
        onResetLesson={handleRestart}
        onFitOverview={handleFitOverview}
        onOpenEvidenceModal={() => {
          setIsPlaying(false);
          setHighlightedEvidenceId('refund-policy');
          setEvidenceModalOpen(true);
        }}
        totalSteps={activeSteps.length}
        onCloseLesson={onClose}
        onOpenQuiz={()=>{setIsPlaying(false);onQuiz();}}
        voice={voice}
        onToggleVoice={()=>{setIsPlaying(false);onToggleVoice();}}
        isReference={workspace.isReference}
        validationPassed={validation.valid}
        validationIssueCount={validation.issues.length}
      />

      {narration.status&&<div role="status" className="bg-[#142B25] px-3 py-1 text-xs text-[#E0BE72]">{narration.status}</div>}
      {/* Mobile Portrait View Switcher (<768px): Diagram / Code tabs keeping step & playhead synced */}
      <div data-workspace-mobile-tabs className="md:hidden shrink-0 bg-[#142B25] border-b border-[#486356] px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-[#0B1717] p-0.5 rounded border border-[#486356]">
          <button
            type="button"
            onClick={() => setMobileTab('diagram')}
            className={`min-h-[34px] px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mobileTab === 'diagram'
                ? 'bg-[#E0BE72] text-[#0B1717] font-semibold'
                : 'text-[#B5C5BD] hover:text-[#EEF3E9]'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Diagram</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('code')}
            className={`min-h-[34px] px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mobileTab === 'code'
                ? 'bg-[#E0BE72] text-[#0B1717] font-semibold'
                : 'text-[#B5C5BD] hover:text-[#EEF3E9]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code (L{effectiveHighlightedCodeLines.join(',')})</span>
          </button>
        </div>

        <div className="text-xs font-mono text-[#7BD3B0] truncate">
          {activeSubFunction
            ? `${activeSubFunction.functionName.split('(')[0]}() · B${frame.step.beatNumber}`
            : `Beat ${frame.step.beatNumber}/7 · ${frame.step.title}`}
        </div>
      </div>

      {/* 2 & 3. Main Split Workspace: Code Pane (Left) + Architecture Canvas (Right) */}
      <main className="relative flex-1 min-h-0 w-full flex overflow-hidden">
        {/* Left Code Pane: visible on md+ (including 844x390 landscape) or when mobileTab === 'code' */}
        <div data-workspace-pane="code"
          className={`${
            mobileTab === 'code' ? 'flex w-full' : 'hidden'
          } md:flex h-full shrink-0 border-r border-[#486356] overflow-hidden`}
          style={{
            width:
              typeof window !== 'undefined' && window.innerWidth >= 768
                ? `${codePaneWidthPct}%`
                : undefined,
          }}
        >
          <CodePane
            rootCodeLines={workspace.codeLines}
            resolveFunction={resolveSubFunctionLesson}
            rootStepCount={RAG_STEPS.length}
            showPreparedEvidence={workspace.isReference}
            currentStep={frame.step}
            highlightedLines={effectiveHighlightedCodeLines}
            onSelectBeatByLine={handleJumpToStep}
            highlightedEvidenceId={highlightedEvidenceId}
            onHighlightEvidence={(docId) => {setHighlightedEvidenceId(docId);setIsPlaying(false);setEvidenceModalOpen(!!docId);}}
            miniModeActive={miniModeActive}
            miniStepCaption={
              miniModeActive ? MINI_EXPLANATION_STEPS[miniStepIndex].caption : undefined
            }
            activeSubFunction={activeSubFunction}
            onDrillIntoFunction={handleDrillIntoFunction}
            onReturnToParentFunction={handleReturnToParentFunction}
            onReturnToMacroPipeline={handleReturnToMacroPipeline}
            backTargetLabel={backTargetLabel}
            activeGraph={activeGraph}
            activeSteps={activeSteps}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        </div>

        {/* Desktop Resizable Splitter Handle */}
        <div
          onMouseDown={() => {
            isResizingPaneRef.current = true;
          }}
          title="Drag to resize code pane"
          className="hidden md:flex w-1.5 h-full bg-[#0B1717] hover:bg-[#E0BE72]/60 cursor-col-resize items-center justify-center shrink-0 transition-colors"
        >
          <div className="w-[1px] h-8 bg-[#486356]" />
        </div>

        {/* Right Architecture Canvas: visible on md+ or when mobileTab === 'diagram' */}
        <div data-workspace-pane="diagram"
          className={`${
            mobileTab === 'diagram' ? 'flex w-full' : 'hidden'
          } md:flex flex-1 h-full min-w-0 relative overflow-hidden`}
        >
          <ArchitectureCanvas
            graph={visibleGraph}
            layout={layout}
            currentStep={frame.step}
            steps={activeSteps}
            totalStepsCount={activeSteps.length}
            nodeFrames={effectiveNodeFrames}
            activeEdgeIds={effectiveActiveEdgeIds}
            completedEdgeIds={frame.completedEdgeIds}
            activePackets={miniModeActive ? [] : frame.activePackets}
            camera={activeCamera}
            cameraMode={cameraMode}
            onManualCameraChange={handleManualCameraChange}
            onFitOverview={handleFitOverview}
            onResumeFollow={handleResumeFollow}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onJumpToStep={handleJumpToStep}
            onCitationClick={handleCitationClick}
            onViewportResize={handleViewportResize}
            reducedMotion={reducedMotion}
            activeSubFunction={activeSubFunction}
            savedMacroPlayhead={savedMacroState?.playhead ?? null}
            onDrillIntoFunction={handleDrillIntoFunction}
            onReturnToParentFunction={handleReturnToParentFunction}
            onReturnToMacroPipeline={handleReturnToMacroPipeline}
            miniModeActive={miniModeActive}
            miniStep={miniModeActive ? MINI_EXPLANATION_STEPS[miniStepIndex] : undefined}
            miniStepIndex={miniStepIndex}
            miniTotalSteps={MINI_EXPLANATION_STEPS.length}
            onChangeMiniStep={(idx) => setMiniStepIndex(idx)}
            onExitMiniMode={handleExitMiniExplanation}
          />
        </div>

        {/* Contextual Ask QWEEPS Overlay Drawer */}
        <AskQweepsDrawer
          lesson={lesson}
          activeSubFunctionId={activeSubFunctionId}
          activeGraph={activeGraph}
          variables={frame.currentVariables}
          showPreparedQuestions={workspace.isReference}
          onAsk={()=>setIsPlaying(false)}
          isOpen={isAskOpen}
          onClose={() => setIsAskOpen(false)}
          selectedNodeId={selectedNodeId}
          currentStep={frame.step}
          playhead={playhead}
          highlightedCodeLines={effectiveHighlightedCodeLines}
          miniModeActive={miniModeActive}
          miniStepIndex={miniStepIndex}
          savedParentState={savedParentState}
          onStartMiniExplanation={handleStartMiniExplanation}
          onSelectMiniStep={(idx) => setMiniStepIndex(idx)}
          onExitMiniExplanation={handleExitMiniExplanation}
        />
      </main>

      {/* 5. Compact Bottom Playback Area */}
      <PlaybackBar
        isPlaying={isPlaying}
        playhead={playhead}
        totalDuration={activeTotalDuration}
        steps={activeSteps}
        currentStepIndex={frame.stepIndex}
        onTogglePlay={handleTogglePlay}
        onRestart={handleRestart}
        onSeek={handleSeek}
        onJumpToStep={handleJumpToStep}
        involvedStepIndices={involvedStepIndices}
        selectedNodeLabel={selectedNodeLabel}
      />

      {/* Supporting Evidence & Candidate Store Modal */}
      <EvidenceModal
        isOpen={evidenceModalOpen && workspace.isReference}
        onClose={() => setEvidenceModalOpen(false)}
        highlightedDocId={highlightedEvidenceId}
        onSelectDoc={(docId) => setHighlightedEvidenceId(docId)}
      />
    </div>
  );
}
