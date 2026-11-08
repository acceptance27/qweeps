import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Network } from 'lucide-react';
import { MINI_EXPLANATION_STEPS, PREPARED_QUESTIONS } from './data/askQweepsData';
import { LESSON_TITLE, RAG_GRAPH } from './data/ragGraph';
import {
  RAG_STEPS,
  validateLessonData,
} from './data/ragSteps';
import {
  registerProceduralSubFunctions,
  resolveSubFunctionLesson,
} from './data/subFunctionLessons';
import {
  buildDeterministicInitialLayout,
  computeElkGraphLayout,
} from './layout/elkLayout';
import {
  AiExplanatoryGapPayload,
  applyAiExplanatoryGaps,
  CompiledWalkthroughBundle,
  compileSourceCodeToWalkthrough,
  PROCEDURAL_PIPELINE_PRESETS,
} from './procedural/proceduralCompiler';
import {
  compileRepoScanToWalkthrough,
  getInitialQweepsRepoWalkthrough,
  loadAndCompileQweepsRepoWalkthrough,
  RawRepoArchitecturePayload,
} from './procedural/qweepsRepoCompiler';
import {
  computeFocusCameraForNodes,
  computeOverviewCamera,
  evaluateTimeline,
} from './timeline/evaluateTimeline';
import {
  ArchitectureGraph,
  CameraState,
  ComputedGraphLayout,
  ContextualQuestion,
  FunctionLessonId,
  NodeId,
  SavedParentState,
  Step,
} from './types/lesson';
import { ArchitectureCanvas } from './components/ArchitectureCanvas';
import { AskQweepsDrawer } from './components/AskQweepsDrawer';
import { CodePane } from './components/CodePane';
import { EvidenceModal } from './components/EvidenceModal';
import { Header } from './components/Header';
import { PlaybackBar } from './components/PlaybackBar';
import { useArchitectureNarration } from './narration/useArchitectureNarration';
import { ProceduralCompilerModal } from './components/ProceduralCompilerModal';

export interface RemixAppProps {
  initialBundle?:CompiledWalkthroughBundle;
  initialCompilerOpen?:boolean;
  onBundleChange?:(bundle:CompiledWalkthroughBundle)=>void;
  onExit?:()=>void;
}
export default function App({initialBundle,initialCompilerOpen=false,onBundleChange,onExit}:RemixAppProps={}) {
  const initialRepoBundle = useMemo(() => {
    const bundle = initialBundle||getInitialQweepsRepoWalkthrough();
    registerProceduralSubFunctions(bundle.subFunctions);
    return bundle;
  }, []);

  // Active procedural walkthrough state (opens immediately into https://github.com/acceptance27/qweeps visual architecture)
  const [lessonTitle, setLessonTitle] = useState<string>(initialRepoBundle.title);
  const [macroGraph, setMacroGraph] = useState<ArchitectureGraph>(
    initialRepoBundle.macroGraph
  );
  const [macroSteps, setMacroSteps] = useState<Step[]>(initialRepoBundle.macroSteps);
  const [contextualQuestions, setContextualQuestions] = useState<ContextualQuestion[]>(
    initialRepoBundle.contextualQuestions
  );
  const [activeSourceCode, setActiveSourceCode] = useState<string>(
    initialRepoBundle.sourceCode
  );
  const [activeSampleInput, setActiveSampleInput] = useState<string>(
    initialRepoBundle.sampleInput
  );

  // Track procedural compile speed (<3ms) & OpenCode Go explanatory gap-fill status
  const [lastCompileTimeMs, setLastCompileTimeMs] = useState<number | null>(
    initialRepoBundle.compileTimeMs
  );
  const [aiFillStatus, setAiFillStatus] = useState<
    'curated' | 'procedural-only' | 'filling' | 'filled' | 'error'
  >(initialRepoBundle.aiFillStatus);
  const [aiFillTimeMs, setAiFillTimeMs] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [proceduralModalOpen, setProceduralModalOpen] = useState<boolean>(initialCompilerOpen);

  // Keep latest procedural bundle ref so background AI gap-filling can patch even if user is scrubbing
  const activeBundleRef = useRef<CompiledWalkthroughBundle | null>(initialRepoBundle);
  const [subFunctionVersion, setSubFunctionVersion] = useState<number>(0);
  useEffect(()=>{if(activeBundleRef.current)onBundleChange?.(activeBundleRef.current);},[subFunctionVersion,onBundleChange]);

  // Validate graph & step references
  const validation = useMemo(
    () => validateLessonData(macroGraph, macroSteps),
    [macroGraph, macroSteps]
  );

  // Hierarchical Level-1 / Level-2 Function Sub-Lesson state + navigation history stack
  const [activeSubFunctionId, setActiveSubFunctionId] = useState<FunctionLessonId | null>(
    null
  );
  const [savedMacroState, setSavedMacroState] = useState<SavedParentState | null>(null);
  const [navigationStack, setNavigationStack] = useState<SavedParentState[]>([]);

  const activeSubFunction = useMemo(
    () => resolveSubFunctionLesson(activeSubFunctionId),
    [activeSubFunctionId, subFunctionVersion]
  );

  const activeGraph = activeSubFunction ? activeSubFunction.graph : macroGraph;
  const activeSteps = activeSubFunction ? activeSubFunction.steps : macroSteps;
  const activeTotalDuration = useMemo(
    () => activeSteps.reduce((acc, s) => acc + s.duration, 0),
    [activeSteps]
  );

  // Graph layout state: starts with deterministic layout of initialRepoBundle.macroGraph and caches ELK layout per graph
  const [layout, setLayout] = useState<ComputedGraphLayout>(() =>
    buildDeterministicInitialLayout(initialRepoBundle.macroGraph, 'elk')
  );

  useEffect(() => {
    let cancelled = false;
    setLayout(buildDeterministicInitialLayout(activeGraph, 'elk'));
    computeElkGraphLayout(activeGraph).then((elkResult) => {
      if (!cancelled) {
        setLayout(elkResult);
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
  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const narrationScope = useMemo(() => ({
    title: activeSubFunction ? `${lessonTitle} / ${activeSubFunction.functionName}` : lessonTitle,
    scope: activeSubFunctionId || 'system',
    sourceCode: activeSubFunction ? activeSubFunction.codeLines.map(line => line.text).join('\n') : activeSourceCode,
    sampleInput: activeSampleInput, graph: activeGraph, steps: activeSteps,
  }), [lessonTitle, activeSubFunction, activeSubFunctionId, activeSourceCode, activeSampleInput, activeGraph, activeSteps]);
  const narration = useArchitectureNarration(narrationScope, playhead, isPlaying, () => setIsPlaying(false));
  const narrationRef = useRef(narration); narrationRef.current = narration;


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

  // Apply a compiled walkthrough bundle to the active UI state
  const applyCompiledBundleToView = useCallback((bundle: CompiledWalkthroughBundle) => {
    setIsPlaying(false);
    setMiniModeActive(false);
    setSelectedNodeId(null);
    setActiveSubFunctionId(null);
    setNavigationStack([]);

    activeBundleRef.current = bundle;
    registerProceduralSubFunctions(bundle.subFunctions);
    setSubFunctionVersion((v) => v + 1);

    setLessonTitle(bundle.title);
    setMacroGraph(bundle.macroGraph);
    setMacroSteps(bundle.macroSteps);
    setContextualQuestions(bundle.contextualQuestions);
    setActiveSourceCode(bundle.sourceCode);
    setActiveSampleInput(bundle.sampleInput);
    setLastCompileTimeMs(bundle.compileTimeMs);
    setPlayhead(0);
    setCameraMode('overview');
  }, []);

  // Load and procedurally compile the https://github.com/acceptance27/qweeps visual architecture on startup
  const handleLoadQweepsRepoWalkthrough = useCallback(async () => {
    try {
      const bundle = await loadAndCompileQweepsRepoWalkthrough();
      applyCompiledBundleToView(bundle);
      setAiFillStatus('curated');
      setAiError(null);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Failed to load acceptance27/qweeps architecture'
      );
    }
  }, [applyCompiledBundleToView]);

  useEffect(() => {
    if(!initialBundle)void handleLoadQweepsRepoWalkthrough();
  }, [handleLoadQweepsRepoWalkthrough]);

  // Trigger OpenCode Go explanatory gap-filling on a compiled bundle without mutating geometry
  const runAiGapFillOnBundle = useCallback(
    async (
      bundle: CompiledWalkthroughBundle,
      sourceCode: string,
      sampleInput: string
    ) => {
      setAiFillStatus('filling');
      setAiError(null);
      const t0 = performance.now();

      try {
        const fileName =
          Object.keys(bundle.macroGraph.codeFiles ?? {})[0] ?? 'pipeline.py';
        const codeLines = bundle.macroGraph.codeFiles?.[fileName] ?? [];

        const beatsPayload = bundle.macroSteps.map((s, idx) => {
          const codeLine = codeLines[idx];
          return {
            beatNumber: s.beatNumber,
            title: s.title,
            codeSnippet: codeLine?.text ?? s.title,
            inputLabel: codeLine?.inputLabel ?? '@input',
            inputValue: codeLine?.inputValue ?? sampleInput,
            outputLabel: codeLine?.outputLabel ?? '@output',
            outputValue: codeLine?.resultText ?? '',
          };
        });

        const nodesPayload = bundle.macroGraph.nodes.map((n) => ({
          nodeId: n.id,
          label: n.label,
          kind: n.kind,
          defaultPreview: n.defaultPreview,
        }));

        const subStepsPayload = Object.values(bundle.subFunctions)
          .slice(0, 12)
          .map((subFn) => ({
            stepId: subFn.id,
            functionName: subFn.functionName,
            summary: subFn.summary,
          }));

        const res = await fetch('/api/ai/fill-gaps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: bundle.title,
            sourceCode,
            sampleInput,
            nodes: nodesPayload,
            beats: beatsPayload,
            subSteps: subStepsPayload,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'OpenCode Go explanatory gap-fill failed');
        }

        const elapsed = Math.round(performance.now() - t0);
        const aiPayload: AiExplanatoryGapPayload = data.gaps;
        const enriched = applyAiExplanatoryGaps(bundle, aiPayload, elapsed);

        activeBundleRef.current = enriched;
        registerProceduralSubFunctions(enriched.subFunctions);
        setSubFunctionVersion((v) => v + 1);
        setLessonTitle(enriched.title);
        setMacroGraph(enriched.macroGraph);
        setMacroSteps(enriched.macroSteps);
        setContextualQuestions(enriched.contextualQuestions);
        setAiFillTimeMs(elapsed);
        setAiFillStatus('filled');
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : 'Failed to fill explanatory gaps'
        );
        setAiFillStatus('error');
      }
    },
    []
  );

  // Live GitHub Repository Scan + Procedural Compilation + Optional OpenCode Go Gap-Fill
  const handleScanGitHubRepo = useCallback(
    async (repoUrl: string, runAiGapFill: boolean) => {
      setAiError(null);
      try {
        const res = await fetch('/api/repo/scan-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl, runAiStoryboard: runAiGapFill }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to scan GitHub repository');
        }
        const rawArch = data.architecture as RawRepoArchitecturePayload;
        const bundle = compileRepoScanToWalkthrough(rawArch, repoUrl);
        applyCompiledBundleToView(bundle);

        if (runAiGapFill) {
          await runAiGapFillOnBundle(bundle, bundle.sourceCode, repoUrl);
        } else {
          setAiFillStatus('procedural-only');
          setAiFillTimeMs(null);
        }
      } catch (err) {
        setAiError(
          err instanceof Error ? err.message : 'GitHub repository scan failed'
        );
        setAiFillStatus('error');
      }
    },
    [applyCompiledBundleToView, runAiGapFillOnBundle]
  );

  // Stage 1: Instant (<3ms) procedural compilation + optional Stage 2 OpenCode Go explanatory gap-fill
  const handleCompileWalkthrough = useCallback(
    (options: {
      title: string;
      fileName: string;
      sourceCode: string;
      sampleInput: string;
      sampleStoreLabel: string;
      sampleStorePreview: string;
      runAiGapFill: boolean;
    }) => {
      const bundle = compileSourceCodeToWalkthrough({
        title: options.title,
        fileName: options.fileName,
        sourceCode: options.sourceCode,
        sampleInput: options.sampleInput,
        sampleStoreLabel: options.sampleStoreLabel,
        sampleStorePreview: options.sampleStorePreview,
      });
      applyCompiledBundleToView(bundle);

      if (options.runAiGapFill) {
        void runAiGapFillOnBundle(bundle, options.sourceCode, options.sampleInput);
      } else {
        setAiFillStatus('procedural-only');
        setAiFillTimeMs(null);
        setAiError(null);
      }
    },
    [applyCompiledBundleToView, runAiGapFillOnBundle]
  );

  // Trigger OpenCode Go explanatory gap-fill on the currently active walkthrough at any time
  const handleFillCurrentWalkthroughGaps = useCallback(() => {
    let bundle = activeBundleRef.current;
    if (!bundle) {
      bundle = compileSourceCodeToWalkthrough({
        title: lessonTitle,
        fileName: 'answer.py',
        sourceCode: activeSourceCode,
        sampleInput: activeSampleInput,
      });
      activeBundleRef.current = bundle;
      registerProceduralSubFunctions(bundle.subFunctions);
      setSubFunctionVersion((v) => v + 1);
    }
    void runAiGapFillOnBundle(bundle, activeSourceCode, activeSampleInput);
  }, [lessonTitle, activeSourceCode, activeSampleInput, runAiGapFillOnBundle]);

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

  const singleBeatStopTimeRef = useRef<number | null>(null);

  // Playhead requestAnimationFrame loop: progresses automatically through all beats of active level
  useEffect(() => {
    if (!isPlaying) return;

    let rafId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const spokenTime = narrationRef.current.clock(dt);
      setPlayhead((prev) => {
        const next = spokenTime ?? prev + dt;
        const stopAt = singleBeatStopTimeRef.current;
        if (stopAt !== null && next >= stopAt) {
          singleBeatStopTimeRef.current = null;
          setIsPlaying(false);
          return Math.min(activeTotalDuration, stopAt);
        }
        if (next >= activeTotalDuration) {
          singleBeatStopTimeRef.current = null;
          setIsPlaying(false);
          return activeTotalDuration;
        }
        return next;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, activeTotalDuration]);

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
    singleBeatStopTimeRef.current = null;
    setSelectedNodeId(null);
    setPlayhead((prev) => (prev >= activeTotalDuration - 0.05 ? 0 : prev));
    setIsPlaying((prev) => !prev);
  }, [miniModeActive, activeTotalDuration]);

  const handleRestart = useCallback(() => {
    singleBeatStopTimeRef.current = null;
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
      singleBeatStopTimeRef.current = null;
      setIsPlaying(false);
      const clamped = Math.max(0, Math.min(activeTotalDuration, nextTime));
      setPlayhead(clamped);
    },
    [activeTotalDuration]
  );

  const handleJumpToStep = useCallback(
    (stepIndex: number) => {
      const clampedIdx = Math.max(0, Math.min(activeSteps.length - 1, stepIndex));
      let startSec = 0;
      for (let i = 0; i < clampedIdx; i++) {
        startSec += activeSteps[i].duration;
      }
      const stepDur = activeSteps[clampedIdx]?.duration ?? 6;
      narrationRef.current.seekScene(startSec);
      setPlayhead(startSec);
      singleBeatStopTimeRef.current = startSec + stepDur;
      setIsPlaying(true);
    },
    [activeSteps]
  );

  // Drill into a Function / @Step Sub-Lesson, saving the exact current location onto navigationStack
  const handleDrillIntoFunction = useCallback(
    (fnId: FunctionLessonId) => {
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
      const targetLesson = resolveSubFunctionLesson(fnId);
      const firstBeatDur = targetLesson?.steps?.[0]?.duration ?? 6;
      setPlayhead(0);
      singleBeatStopTimeRef.current = firstBeatDur;
      setIsPlaying(true);
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
    const macroFile = Object.keys(macroGraph.codeFiles ?? {})[0] ?? 'browser_lessons.py';
    if (navigationStack.length > 0) {
      const prev = navigationStack[navigationStack.length - 1];
      if (!prev.subFunctionId) return macroFile;
      const prevLesson = resolveSubFunctionLesson(prev.subFunctionId);
      return prevLesson ? prevLesson.functionName.split('(')[0] : prev.subFunctionId;
    }
    if (activeSubFunction?.parentFunctionId) {
      return activeSubFunction.parentFunctionId.replace('fn-', '');
    }
    return macroFile;
  }, [navigationStack, activeSubFunction, macroGraph.codeFiles]);

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
    <div className="h-[100dvh] w-screen bg-[#1E1F22] text-[#BCBEC4] flex flex-col overflow-hidden select-none">
      {/* 1. Compact Top Header */}
      <Header
        onExit={onExit}
        lessonTitle={lessonTitle}
        currentBeatNumber={frame.step.beatNumber}
        totalBeatsCount={activeSteps.length}
        currentBeatTitle={frame.step.title}
        learnerQuestion={frame.step.question}
        isAskOpen={isAskOpen}
        onToggleAsk={() => { setIsPlaying(false); setIsAskOpen((prev) => !prev); }}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={() => setReducedMotion((prev) => !prev)}
        onResetLesson={handleRestart}
        onFitOverview={handleFitOverview}
        onOpenEvidenceModal={() => {
          setIsPlaying(false);
          setHighlightedEvidenceId('refund-policy');
          setEvidenceModalOpen(true);
        }}
        onOpenProceduralModal={() => {
          setIsPlaying(false);
          setProceduralModalOpen(true);
        }}
        onFillGapsNow={handleFillCurrentWalkthroughGaps}
        compileTimeMs={lastCompileTimeMs}
        aiFillStatus={aiFillStatus}
        aiFillTimeMs={aiFillTimeMs}
        validationPassed={validation.valid}
        validationIssueCount={validation.issues.length}
      />

      {/* Mobile Portrait View Switcher (<768px): Diagram / Code tabs keeping step & playhead synced */}
      <div className="md:hidden shrink-0 bg-[#2B2D30] border-b border-[#393B40] px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-[#1E1F22] p-0.5 rounded border border-[#393B40]">
          <button
            type="button"
            onClick={() => setMobileTab('diagram')}
            className={`min-h-[32px] px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mobileTab === 'diagram'
                ? 'bg-[#3574F0] text-[#FFFFFF] font-semibold'
                : 'text-[#868A91] hover:text-[#DFE1E5]'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Diagram</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('code')}
            className={`min-h-[32px] px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
              mobileTab === 'code'
                ? 'bg-[#3574F0] text-[#FFFFFF] font-semibold'
                : 'text-[#868A91] hover:text-[#DFE1E5]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code (L{effectiveHighlightedCodeLines.join(',')})</span>
          </button>
        </div>

        <div className="text-xs font-mono text-[#56A8F5] truncate">
          {activeSubFunction
            ? `${activeSubFunction.functionName.split('(')[0]}() · B${frame.step.beatNumber}`
            : `Beat ${frame.step.beatNumber}/${activeSteps.length} · ${frame.step.title}`}
        </div>
      </div>

      {/* 2 & 3. Main Split Workspace: Code Pane (Left) + Architecture Canvas (Right) */}
      <main className="relative flex-1 min-h-0 w-full flex overflow-hidden">
        {/* Left Code Pane: visible on md+ (including 844x390 landscape) or when mobileTab === 'code' */}
        <div
          className={`${
            mobileTab === 'code' ? 'flex w-full' : 'hidden'
          } md:flex h-full shrink-0 border-r border-[#393B40] overflow-hidden`}
          style={{
            width:
              typeof window !== 'undefined' && window.innerWidth >= 768
                ? `${codePaneWidthPct}%`
                : undefined,
          }}
        >
          <CodePane
            currentStep={frame.step}
            highlightedLines={effectiveHighlightedCodeLines}
            onSelectBeatByLine={handleJumpToStep}
            highlightedEvidenceId={highlightedEvidenceId}
            onHighlightEvidence={(docId) => setHighlightedEvidenceId(docId)}
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
          title="Drag to resize tool window"
          className="hidden md:flex w-1.5 h-full bg-[#2B2D30] hover:bg-[#3574F0] cursor-col-resize items-center justify-center shrink-0 transition-colors"
        >
          <div className="w-[1px] h-8 bg-[#4E5157]" />
        </div>

        {/* Right Architecture Canvas: visible on md+ or when mobileTab === 'diagram' */}
        <div
          className={`${
            mobileTab === 'diagram' ? 'flex w-full' : 'hidden'
          } md:flex flex-1 h-full min-w-0 relative overflow-hidden`}
        >
          <ArchitectureCanvas
            graph={activeGraph}
            narrationText={narration.caption}
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
          isOpen={isAskOpen}
          onClose={() => setIsAskOpen(false)}
          selectedNodeId={selectedNodeId}
          currentStep={frame.step}
          totalBeatsCount={activeSteps.length}
          playhead={playhead}
          highlightedCodeLines={effectiveHighlightedCodeLines}
          activeGraph={activeGraph}
          sourceCode={activeSourceCode}
          lessonTitle={lessonTitle}
          questions={contextualQuestions}
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
        playhead={narration.displayTime}
        totalDuration={narration.duration}
        steps={narration.steps}
        voiceEnabled={narration.enabled}
        voiceBusy={narration.busy}
        voiceStatus={narration.status}
        voiceError={narration.error}
        onToggleVoice={narration.toggle}
        onCancelVoice={narration.cancel}
        currentStepIndex={frame.stepIndex}
        onTogglePlay={handleTogglePlay}
        onRestart={handleRestart}
        onSeek={(time) => handleSeek(narration.toScene(time))}
        onJumpToStep={handleJumpToStep}
        involvedStepIndices={involvedStepIndices}
        selectedNodeLabel={selectedNodeLabel}
      />

      {/* Supporting Evidence & Candidate Store Modal */}
      <EvidenceModal
        isOpen={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        highlightedDocId={highlightedEvidenceId}
        onSelectDoc={(docId) => setHighlightedEvidenceId(docId)}
      />

      {/* Procedural Compiler (<3ms) + OpenCode Go Explanatory Gap-Filler Modal */}
      <ProceduralCompilerModal
        isOpen={proceduralModalOpen}
        onClose={() => setProceduralModalOpen(false)}
        activeTitle={lessonTitle}
        activeSourceCode={activeSourceCode}
        activeSampleInput={activeSampleInput}
        lastCompileTimeMs={lastCompileTimeMs}
        aiFillStatus={aiFillStatus}
        aiFillTimeMs={aiFillTimeMs}
        aiError={aiError}
        onCompileWalkthrough={handleCompileWalkthrough}
        onLoadQweepsRepoWalkthrough={() => void handleLoadQweepsRepoWalkthrough()}
        onScanGitHubRepo={handleScanGitHubRepo}
        onFillCurrentWalkthroughGaps={handleFillCurrentWalkthroughGaps}
      />
    </div>
  );
}

