import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Compass,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  MessageSquareQuote,
  Binary,
  Database,
  SearchCheck,
  Layers,
  FileCode2,
  Sparkles,
  ShieldCheck,
  Scissors,
  Hash,
  Sliders,
  Gauge,
  ArrowUpDown,
  Filter,
  Tag,
  CheckCircle2,
  Files,
  FileText,
  XCircle,
} from 'lucide-react';
import { resolveSubFunctionLesson } from '../data/subFunctionLessons';
import { computeProceduralCompoundContainerSpec } from '../layout/elkLayout';
import {
  ActivePacketFrame,
  EvaluatedNodeFrame,
} from '../timeline/evaluateTimeline';
import {
  InspectPreviewCard,
  InspectPreviewDocsModal,
} from './InspectPreviewArchetypes';
import {
  ArchitectureGraph,
  CameraState,
  CompoundChildBlockSpec,
  CompoundContainerSpec,
  ComputedGraphLayout,
  FunctionLessonId,
  GraphNode,
  MiniExplanationStep,
  NodeAccentColor,
  NodeId,
  Step,
  SubFunctionLesson,
} from '../types/lesson';

interface ArchitectureCanvasProps {
  narrationText?: string;
  graph: ArchitectureGraph;
  layout: ComputedGraphLayout;
  steps: Step[];
  currentStep: Step;
  totalStepsCount: number;
  nodeFrames: Record<NodeId, EvaluatedNodeFrame>;
  activeEdgeIds: Set<string>;
  completedEdgeIds: Set<string>;
  activePackets: ActivePacketFrame[];
  camera: CameraState;
  cameraMode: 'follow' | 'manual' | 'overview';
  onManualCameraChange: (next: CameraState) => void;
  onFitOverview: () => void;
  onResumeFollow: () => void;
  selectedNodeId: NodeId | null;
  onSelectNode: (nodeId: NodeId | null) => void;
  onJumpToStep: (stepIndex: number) => void;
  onCitationClick: () => void;
  onViewportResize: (width: number, height: number) => void;
  reducedMotion: boolean;
  // Hierarchical Function-per-Beat -> Logic-per-Beat -> Inner Function props
  activeSubFunction: SubFunctionLesson | null;
  savedMacroPlayhead: number | null;
  onDrillIntoFunction: (fnId: FunctionLessonId) => void;
  onReturnToParentFunction: () => void;
  onReturnToMacroPipeline: () => void;
  // Mini-explanation overlay props
  miniModeActive: boolean;
  miniStep?: MiniExplanationStep;
  miniStepIndex: number;
  miniTotalSteps: number;
  onChangeMiniStep: (index: number) => void;
  onExitMiniMode: () => void;
}

const MACRO_ACCENT_HEX: Record<NodeAccentColor, string> = {
  sky: '#38BDF8',
  amber: '#F59E0B',
  emerald: '#34D399',
  teal: '#2DD4BF',
  rose: '#FB7185',
  violet: '#A882FF',
  mint: '#4ADE80',
};

const INSPECT_ACCENT_HEX: Record<NodeAccentColor, string> = {
  sky: '#56A8F5',
  amber: '#D9A354',
  emerald: '#6AAB73',
  teal: '#4FA3A5',
  rose: '#D46A6E',
  violet: '#9876AA',
  mint: '#6AAB73',
};

function renderLucideIcon(iconName: string, colorHex: string, size = 22) {
  const props = { width: size, height: size, color: colorHex, strokeWidth: 2 };
  switch (iconName) {
    case 'MessageSquareQuote':
      return <MessageSquareQuote {...props} />;
    case 'Binary':
      return <Binary {...props} />;
    case 'Database':
      return <Database {...props} />;
    case 'SearchCheck':
      return <SearchCheck {...props} />;
    case 'Layers':
      return <Layers {...props} />;
    case 'FileCode2':
      return <FileCode2 {...props} />;
    case 'Sparkles':
      return <Sparkles {...props} />;
    case 'ShieldCheck':
      return <ShieldCheck {...props} />;
    case 'Scissors':
      return <Scissors {...props} />;
    case 'Hash':
      return <Hash {...props} />;
    case 'Sliders':
      return <Sliders {...props} />;
    case 'Gauge':
      return <Gauge {...props} />;
    case 'ArrowUpDown':
      return <ArrowUpDown {...props} />;
    case 'Filter':
      return <Filter {...props} />;
    case 'Tag':
      return <Tag {...props} />;
    case 'CheckCircle2':
      return <CheckCircle2 {...props} />;
    case 'Files':
      return <Files {...props} />;
    case 'FileText':
      return <FileText {...props} />;
    case 'XCircle':
      return <XCircle {...props} />;
    default:
      return <Layers {...props} />;
  }
}

/**
 * Procedurally resolves or synthesizes a port-aligned CompoundContainerSpec for any container node.
 * No hand-placed child coordinates or wire tables are needed: if a container node only specifies
 * `drillDownFunctionId`, its nested child blocks and internal wires are generated directly from the
 * sub-function's main `@` steps.
 */
function resolveProceduralCompoundSpec(
  node: GraphNode,
  graph: ArchitectureGraph,
  isMacroBlueprint: boolean
): CompoundContainerSpec | undefined {
  const incomingEdgeCount = graph.edges.filter((e) => e.target === node.id).length;

  if (node.compoundContainer && node.compoundContainer.children.length > 0) {
    return computeProceduralCompoundContainerSpec(
      node.compoundContainer,
      Math.max(1, incomingEdgeCount)
    ).spec;
  }

  if (
    isMacroBlueprint &&
    node.drillDownFunctionId &&
    node.kind !== 'input' &&
    node.kind !== 'store' &&
    node.kind !== 'output'
  ) {
    const subLesson = resolveSubFunctionLesson(node.drillDownFunctionId);
    if (subLesson) {
      const mainStepNodes = subLesson.graph.nodes.filter(
        (sn) =>
          Boolean(sn.nonSummary) ||
          (sn.kind !== 'input' && sn.kind !== 'store' && sn.kind !== 'output')
      );
      if (mainStepNodes.length > 0) {
        const combinerIdx =
          incomingEdgeCount >= 2 && node.id === 'prompt' ? 1 : 0;
        const rawChildren: CompoundChildBlockSpec[] = mainStepNodes.map((sn, idx) => ({
          id: sn.id,
          label: sn.label,
          sublabel: sn.subtitle,
          x: 0,
          y: 0,
          w: 0,
          h: 0,
          iconName: sn.iconName,
          color: sn.accentColor,
          hasLeftCombinerBar: incomingEdgeCount >= 2 && idx === combinerIdx,
          drillDownFunctionId: sn.drillDownFunctionId ?? sn.id,
        }));

        if (node.kind === 'search') {
          rawChildren.push({
            id: `${node.id}-drop`,
            label: 'Dropped',
            sublabel: '✕ excluded',
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            iconName: 'XCircle',
            color: 'rose',
            isDropBranch: true,
          });
        }

        return computeProceduralCompoundContainerSpec(
          {
            leftPortsY: [],
            rightPortsY: [],
            children: rawChildren,
            internalWires: [],
          },
          Math.max(1, incomingEdgeCount)
        ).spec;
      }
    }
  }

  return undefined;
}

function buildOrthogonalPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function splitEdgeAtBoundaryPort(
  points: { x: number; y: number }[],
  boundaryPort?: { x: number; y: number }
): { firstSegment: { x: number; y: number }[]; secondSegment?: { x: number; y: number }[] } {
  if (!boundaryPort || points.length < 3) {
    return { firstSegment: points };
  }

  const idx = points.findIndex(
    (p) => Math.abs(p.x - boundaryPort.x) < 2 && Math.abs(p.y - boundaryPort.y) < 2
  );

  if (idx <= 0 || idx >= points.length - 1) {
    return { firstSegment: points };
  }

  const beforePt = points[idx - 1];
  const dxIn = Math.sign(boundaryPort.x - beforePt.x);
  const dyIn = Math.sign(boundaryPort.y - beforePt.y);
  const firstEnd = {
    x: boundaryPort.x - dxIn * 5,
    y: boundaryPort.y - dyIn * 5,
  };

  const afterPt = points[idx + 1];
  const dxOut = Math.sign(afterPt.x - boundaryPort.x);
  const dyOut = Math.sign(afterPt.y - boundaryPort.y);
  const secondStart = {
    x: boundaryPort.x + dxOut * 5,
    y: boundaryPort.y + dyOut * 5,
  };

  return {
    firstSegment: [...points.slice(0, idx), firstEnd],
    secondSegment: [secondStart, ...points.slice(idx + 1)],
  };
}

export const ArchitectureCanvas: React.FC<ArchitectureCanvasProps> = ({
  graph,
  narrationText,
  layout,
  steps,
  currentStep,
  totalStepsCount,
  nodeFrames,
  activeEdgeIds,
  completedEdgeIds,
  activePackets,
  camera,
  cameraMode,
  onManualCameraChange,
  onFitOverview,
  onResumeFollow,
  selectedNodeId,
  onSelectNode,
  onJumpToStep,
  onCitationClick,
  onViewportResize,
  reducedMotion,
  activeSubFunction,
  savedMacroPlayhead,
  onDrillIntoFunction,
  onReturnToParentFunction,
  onReturnToMacroPipeline,
  miniModeActive,
  miniStep,
  miniStepIndex,
  miniTotalSteps,
  onChangeMiniStep,
  onExitMiniMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 920, height: 560 });
  const [isDragging, setIsDragging] = useState(false);
  const didMoveDuringDragRef = useRef(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
        onViewportResize(rect.width, rect.height);
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onViewportResize]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-node-interactive="true"]')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    didMoveDuringDragRef.current = false;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      camX: camera.x,
      camY: camera.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (Math.hypot(dx, dy) > 4) {
      didMoveDuringDragRef.current = true;
    }
    onManualCameraChange({
      x: dragStartRef.current.camX + dx,
      y: dragStartRef.current.camY + dy,
      zoom: camera.zoom,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (!didMoveDuringDragRef.current && selectedNodeId) {
        onSelectNode(null);
      }
      setIsDragging(false);
      dragStartRef.current = null;
    }
  };

  const handleZoomBy = useCallback(
    (factor: number) => {
      const nextZoom = Math.max(0.35, Math.min(1.5, camera.zoom * factor));
      const cx = viewportSize.width / 2;
      const cy = viewportSize.height / 2;
      const worldX = (cx - camera.x) / camera.zoom;
      const worldY = (cy - camera.y) / camera.zoom;
      onManualCameraChange({
        x: cx - worldX * nextZoom,
        y: cy - worldY * nextZoom,
        zoom: nextZoom,
      });
    },
    [camera, viewportSize, onManualCameraChange]
  );

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.09 : 0.92;
    const nextZoom = Math.max(0.35, Math.min(1.5, camera.zoom * factor));
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - camera.x) / camera.zoom;
    const worldY = (mouseY - camera.y) / camera.zoom;
    onManualCameraChange({
      x: mouseX - worldX * nextZoom,
      y: mouseY - worldY * nextZoom,
      zoom: nextZoom,
    });
  };

  // Compute Input / Output connections for the clicked node (`selectedNodeId`)
  const selectedIncomingEdges = selectedNodeId
    ? graph.edges.filter((e) => e.target === selectedNodeId)
    : [];
  const selectedOutgoingEdges = selectedNodeId
    ? graph.edges.filter((e) => e.source === selectedNodeId)
    : [];
  const selectedIncomingEdgeIds = new Set(selectedIncomingEdges.map((e) => e.id));
  const selectedOutgoingEdgeIds = new Set(selectedOutgoingEdges.map((e) => e.id));
  const selectedInputNodeIds = new Set(selectedIncomingEdges.map((e) => e.source));
  const selectedOutputNodeIds = new Set(selectedOutgoingEdges.map((e) => e.target));

  // Minimap coordinate math
  const minimapW = 152;
  const minimapH = 62;
  const scaleMinimap = Math.min(
    (minimapW - 12) / Math.max(1, layout.width),
    (minimapH - 12) / Math.max(1, layout.height)
  );
  const viewRectWorldX = -camera.x / camera.zoom;
  const viewRectWorldY = -camera.y / camera.zoom;
  const viewRectWorldW = viewportSize.width / camera.zoom;
  const viewRectWorldH = viewportSize.height / camera.zoom;

  const [reactiveDisplay, setReactiveDisplay] = useState<boolean>(true);
  const [archetypeDocsOpen, setArchetypeDocsOpen] = useState<boolean>(false);

  const isMacroBlueprint = !activeSubFunction;
  const normalizedGraphId = (graph.id || '').replace(/^(generated-)+/, '');
  const isLevel2Flowchart =
    normalizedGraphId.startsWith('sub-graph-l2-') ||
    Boolean(activeSubFunction?.parentFunctionId);

  const activePalette = isMacroBlueprint ? MACRO_ACCENT_HEX : INSPECT_ACCENT_HEX;

  // Calm JetBrains New UI Editor Dark (#1E1F22) across all levels
  const canvasBgClass = 'bg-[#1E1F22]';
  const dotGridColor = '#2E3035';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${canvasBgClass} overflow-hidden select-none flex flex-col`}
    >
      {/* If Mini-Explanation is active, render top Breadcrumb Banner */}
      {miniModeActive && miniStep && (
        <div className="relative z-20 mx-3 mt-2 px-3 py-2 rounded border border-[#D9A354]/60 bg-[#2B2D30]/95 flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onExitMiniMode}
              className="px-2.5 py-1 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4045] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Main Lesson</span>
            </button>
            <span className="text-xs text-[#6F737A] hidden sm:inline">/</span>
            <span className="text-xs font-semibold text-[#DFE1E5] truncate">
              {miniStep.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={miniStepIndex === 0}
              onClick={() => onChangeMiniStep(Math.max(0, miniStepIndex - 1))}
              className="px-2 py-1 rounded border border-[#4E5157] bg-[#35373B] text-xs text-[#DFE1E5] disabled:opacity-40 hover:bg-[#3E4045] cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="font-mono text-xs text-[#D9A354] px-1.5">
              {miniStepIndex + 1}/{miniTotalSteps}
            </span>
            <button
              type="button"
              disabled={miniStepIndex >= miniTotalSteps - 1}
              onClick={() => onChangeMiniStep(Math.min(miniTotalSteps - 1, miniStepIndex + 1))}
              className="px-2 py-1 rounded border border-[#4E5157] bg-[#35373B] text-xs text-[#DFE1E5] disabled:opacity-40 hover:bg-[#3E4045] cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top JetBrains Diagram Toolbar & Minimap Overlay */}
      <div
        className={`absolute ${
          miniModeActive ? 'top-14' : 'top-2.5'
        } left-3 right-3 z-10 flex items-start justify-between gap-2 pointer-events-none`}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-[#2B2D30]/95 border border-[#393B40] rounded-md p-1 shadow-lg">
          {activeSubFunction && (
            <>
              <button
                type="button"
                onClick={onReturnToParentFunction}
                className="min-h-[30px] px-2.5 py-1 rounded text-xs font-medium bg-[#3574F0] text-[#FFFFFF] hover:bg-[#3065D5] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Return to parent view"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              {activeSubFunction.parentFunctionId && (
                <button
                  type="button"
                  onClick={onReturnToMacroPipeline}
                  className="min-h-[30px] px-2 py-1 rounded text-xs font-mono text-[#BCBEC4] hover:bg-[#35373B] hover:text-[#DFE1E5] transition-colors cursor-pointer"
                  title="Jump back to L0 Pipeline"
                >
                  L0
                </button>
              )}
              <div className="h-4 w-[1px] bg-[#393B40] mx-0.5" />
            </>
          )}

          <button
            type="button"
            onClick={onFitOverview}
            className={`min-h-[30px] px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3574F0] ${
              cameraMode === 'overview'
                ? 'bg-[#2E436E] text-[#DFE1E5] border border-[#3574F0]'
                : 'text-[#BCBEC4] hover:bg-[#35373B] hover:text-[#DFE1E5]'
            }`}
            title="Fit entire diagram in viewport"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit View</span>
          </button>

          {cameraMode !== 'follow' && (
            <button
              type="button"
              onClick={onResumeFollow}
              className="min-h-[30px] px-2.5 py-1 rounded text-xs font-medium bg-[#35373B] text-[#56A8F5] border border-[#4E5157] hover:bg-[#3E4045] hover:text-[#DFE1E5] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Follow active beat camera"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Follow Beat</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setReactiveDisplay((prev) => !prev)}
            className={`min-h-[30px] px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border ${
              reactiveDisplay
                ? 'bg-[#2E436E] text-[#DFE1E5] border-[#3574F0]'
                : 'bg-transparent text-[#868A91] border-transparent hover:bg-[#35373B] hover:text-[#DFE1E5]'
            }`}
            title="Reactive Display: function data starts as none and updates with an animation only after incoming flow packets enter the input port"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#56A8F5]" />
            <span>Reactive Display: {reactiveDisplay ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setArchetypeDocsOpen(true)}
            className="min-h-[30px] px-2.5 py-1 rounded text-xs font-medium text-[#BCBEC4] hover:bg-[#35373B] hover:text-[#DFE1E5] border border-[#393B40] flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Open Inspect Preview Function Archetypes Reference & Reactive Lifecycle Documentation"
          >
            <FileCode2 className="w-3.5 h-3.5 text-[#D9A354]" />
            <span className="hidden md:inline">Archetype Docs</span>
          </button>

          <div className="h-4 w-[1px] bg-[#393B40] mx-0.5" />

          <button
            type="button"
            onClick={() => handleZoomBy(1.18)}
            className="min-h-[30px] min-w-[30px] px-2 py-1 rounded text-xs text-[#BCBEC4] hover:bg-[#35373B] hover:text-[#DFE1E5] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleZoomBy(0.84)}
            className="min-h-[30px] min-w-[30px] px-2 py-1 rounded text-xs text-[#BCBEC4] hover:bg-[#35373B] hover:text-[#DFE1E5] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-[11px] text-[#868A91] px-1.5 hidden sm:inline tabular-nums">
            {Math.round(camera.zoom * 100)}%
          </span>
        </div>

        {/* Interactive JetBrains Minimap */}
        <div
          className="pointer-events-auto bg-[#2B2D30]/95 border border-[#393B40] rounded-md p-1 shadow-lg hidden sm:block"
          title="Click to toggle Fit View / Follow Beat"
        >
          <svg
            width={minimapW}
            height={minimapH}
            onClick={() => (cameraMode === 'overview' ? onResumeFollow() : onFitOverview())}
            className="bg-[#1E1F22] rounded border border-[#393B40] cursor-pointer block"
          >
            <g transform="translate(6, 6)">
              {graph.edges.map((e) => {
                const route = layout.edges[e.id];
                if (!route || route.points.length < 2) return null;
                const isAct = activeEdgeIds.has(e.id);
                const pts = route.points
                  .map(
                    (p) =>
                      `${(p.x * scaleMinimap).toFixed(1)},${(p.y * scaleMinimap).toFixed(1)}`
                  )
                  .join(' ');
                return (
                  <polyline
                    key={e.id}
                    points={pts}
                    fill="none"
                    stroke={isAct ? '#56A8F5' : '#4E5157'}
                    strokeWidth={isAct ? 1.5 : 0.8}
                  />
                );
              })}

              {graph.nodes.map((n) => {
                const pos = layout.nodes[n.id];
                if (!pos) return null;
                const nf = nodeFrames[n.id];
                const hex = activePalette[n.accentColor] ?? '#56A8F5';
                return (
                  <rect
                    key={n.id}
                    x={pos.x * scaleMinimap}
                    y={pos.y * scaleMinimap}
                    width={Math.max(8, pos.width * scaleMinimap)}
                    height={Math.max(5, pos.height * scaleMinimap)}
                    rx={1.5}
                    fill={nf?.isFocused ? hex : '#2B2D30'}
                    stroke={hex}
                    strokeWidth={0.8}
                  />
                );
              })}

              <rect
                x={Math.max(0, viewRectWorldX * scaleMinimap)}
                y={Math.max(0, viewRectWorldY * scaleMinimap)}
                width={Math.min(minimapW - 12, Math.max(14, viewRectWorldW * scaleMinimap))}
                height={Math.min(minimapH - 12, Math.max(10, viewRectWorldH * scaleMinimap))}
                fill="rgba(53, 116, 240, 0.14)"
                stroke="#3574F0"
                strokeWidth={1}
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Main Interactive 2D SVG Compound Block & Port Diagram */}
      <svg
        className={`w-full h-full flex-1 block ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        role="region"
        aria-label="Interactive RAG compound block diagram"
      >
        <defs>
          {/* JetBrains Editor Dot-Matrix Background Pattern */}
          <pattern
            id="obsidian-dot-grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1.1" fill={dotGridColor} />
          </pattern>

          <marker
            id="port-arrow-inactive"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#5A5D63" />
          </marker>
          <marker
            id="port-arrow-completed"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1.5 L 8.5 5 L 0 8.5 z"
              fill={isMacroBlueprint ? '#A882FF' : '#6AAB73'}
            />
          </marker>
          <marker
            id="port-arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1 L 9 5 L 0 9 z"
              fill={isMacroBlueprint ? '#38BDF8' : '#56A8F5'}
            />
          </marker>
          <marker
            id="port-arrow-output-hl"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7.5"
            markerHeight="7.5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1 L 9 5 L 0 9 z"
              fill={isMacroBlueprint ? '#34D399' : '#6AAB73'}
            />
          </marker>
          <marker
            id="port-arrow-evidence"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1 L 9 5 L 0 9 z"
              fill={isMacroBlueprint ? '#F59E0B' : '#D9A354'}
            />
          </marker>
          {(Object.entries(activePalette) as [NodeAccentColor, string][]).map(
            ([colorKey, colorHex]) => (
              <marker
                key={`port-arrow-color-${colorKey}`}
                id={`port-arrow-color-${colorKey}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6.8"
                markerHeight="6.8"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.2 L 8.8 5 L 0 8.8 z" fill={colorHex} />
              </marker>
            )
          )}
        </defs>

        {/* Infinite Editor Dot-Matrix Backdrop */}
        <rect width="100%" height="100%" fill="url(#obsidian-dot-grid)" />

        <g
          transform={`translate(${camera.x.toFixed(1)}, ${camera.y.toFixed(
            1
          )}) scale(${camera.zoom.toFixed(4)})`}
          style={{
            transition:
              isDragging || reducedMotion
                ? 'none'
                : 'transform 130ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Outer System Enclosure Frame */}
          {(() => {
            const enclosedPositions = graph.nodes
              .filter((n) => {
                const p = layout.nodes[n.id];
                if (!p) return false;
                if (isLevel2Flowchart) return true;
                if (isMacroBlueprint) {
                  return (
                    Boolean(n.compoundContainer) ||
                    (n.kind !== 'input' && n.kind !== 'store' && n.kind !== 'output')
                  );
                }
                const leftWall = layout.systemFrame?.x ?? 240;
                return p.x >= leftWall && n.kind !== 'output' && n.stepBadge !== 'OUT';
              })
              .map((n) => layout.nodes[n.id])
              .filter(Boolean);

            const defaultLeft = isLevel2Flowchart ? 40 : isMacroBlueprint ? 236 : 240;
            const defaultTop = isMacroBlueprint ? 38 : 44;
            const defaultWidth = isLevel2Flowchart ? 1800 : isMacroBlueprint ? 1360 : 1680;
            const defaultHeight = isMacroBlueprint ? 578 : 620;

            const minEnclosedX =
              enclosedPositions.length > 0
                ? Math.min(...enclosedPositions.map((p) => p.x))
                : defaultLeft + 44;
            const maxEnclosedRight =
              enclosedPositions.length > 0
                ? Math.max(...enclosedPositions.map((p) => p.x + p.width))
                : defaultLeft + defaultWidth - 48;
            const minEnclosedY =
              enclosedPositions.length > 0
                ? Math.min(...enclosedPositions.map((p) => p.y))
                : defaultTop + 64;
            const maxEnclosedBottom =
              enclosedPositions.length > 0
                ? Math.max(...enclosedPositions.map((p) => p.y + p.height))
                : defaultTop + defaultHeight - 40;

            const frameX = layout.systemFrame
              ? Math.min(layout.systemFrame.x, minEnclosedX - 40)
              : Math.min(defaultLeft, minEnclosedX - 40);
            const frameY = layout.systemFrame
              ? Math.min(layout.systemFrame.y, minEnclosedY - 48)
              : Math.min(defaultTop, minEnclosedY - 48);
            const frameRight = layout.systemFrame
              ? Math.max(
                  layout.systemFrame.x + layout.systemFrame.width,
                  maxEnclosedRight + 48
                )
              : Math.max(defaultLeft + defaultWidth, maxEnclosedRight + 48);
            const frameBottom = layout.systemFrame
              ? Math.max(
                  layout.systemFrame.y + layout.systemFrame.height,
                  maxEnclosedBottom + 40
                )
              : Math.max(defaultTop + defaultHeight, maxEnclosedBottom + 40);

            const frameStroke = isMacroBlueprint ? '#43454A' : '#3E4045';
            const frameFill = isMacroBlueprint
              ? 'rgba(35, 37, 40, 0.52)'
              : 'rgba(37, 39, 43, 0.45)';
            const frameLabelColor = isMacroBlueprint ? '#D9A354' : '#868A91';

            return (
              <g>
                <text
                  x={frameX}
                  y={frameY - 12}
                  fill={frameLabelColor}
                  fontSize={13}
                  fontWeight="600"
                  className="font-mono"
                >
                  {isMacroBlueprint
                    ? (() => {
                        const firstFile = Object.keys(graph.codeFiles ?? {})[0];
                        const firstLine = firstFile
                          ? graph.codeFiles?.[firstFile]?.[0]?.text ?? ''
                          : '';
                        const match = firstLine.match(/def\s+([a-zA-Z0-9_]+\s*\([^)]*\))/);
                        const fnSig = match ? match[1] : graph.title;
                        return `L0 · ${fnSig} — Pipeline Logic System (Click any @function container or child step to inspect)`;
                      })()
                    : isLevel2Flowchart
                    ? `L2 · ${activeSubFunction?.functionName} — Atomic Flowchart (${activeSubFunction?.summary})`
                    : `L1 · ${activeSubFunction?.functionName} — Function Scope (${activeSubFunction?.fileName})`}
                </text>
                <rect
                  x={frameX}
                  y={frameY}
                  width={frameRight - frameX}
                  height={frameBottom - frameY}
                  rx={6}
                  fill={frameFill}
                  stroke={frameStroke}
                  strokeWidth={1.4}
                />
              </g>
            );
          })()}

          {/* 1. Render Nodes FIRST so Edge Ports & Arrowheads Sit Cleanly On Top of Walls */}
          {graph.nodes.map((node) => {
            const pos = layout.nodes[node.id];
            if (!pos) return null;

            const frame = nodeFrames[node.id];
            const isSelected = selectedNodeId === node.id;
            const isInputSourceForSelected = selectedInputNodeIds.has(node.id);
            const isOutputTargetForSelected = selectedOutputNodeIds.has(node.id);
            const isRelatedToSelected =
              isSelected || isInputSourceForSelected || isOutputTargetForSelected;

            const isFocused = frame?.isFocused ?? false;
            const isActive = frame?.isActive ?? false;
            const isDimmed = frame?.isDimmed ?? false;
            const hex = activePalette[node.accentColor] ?? '#56A8F5';

            const compoundSpec = resolveProceduralCompoundSpec(
              node,
              graph,
              isMacroBlueprint
            );
            const liveBeatState =
              currentStep.nodeDataAfter?.[node.id] ??
              currentStep.nodeDataBefore?.[node.id];
            const ledgerValue = node.valueRef
              ? graph.workedExampleLedger?.[node.valueRef]
              : undefined;
            const resolvedOutputPreview =
              node.nonSummary?.outputValue ||
              liveBeatState?.previewLines?.[0] ||
              ledgerValue ||
              node.defaultPreview;
            const resolvedCardPreview =
              node.defaultPreview ||
              liveBeatState?.previewLines?.[0] ||
              ledgerValue ||
              '';

            // On Level-1 function views, ensure raw generated nodes never render as small white paper-cards:
            // auto-synthesize dark nonSummary / staticData if missing on a generated function node.
            const isLevel1FunctionView = !isMacroBlueprint && !isLevel2Flowchart;
            const isBoundaryOrStaticKind =
              node.kind === 'input' || node.kind === 'output' || node.kind === 'store';

            const effectiveNonSummary =
              node.nonSummary ??
              (isLevel1FunctionView && !isBoundaryOrStaticKind && !node.staticData
                ? {
                    blockTitle: node.label.startsWith('@')
                      ? node.label.replace(/\(\)$/, '')
                      : `@${node.label.replace(/\(\)$/, '')}`,
                    inputs: graph.edges
                      .filter((e) => e.target === node.id)
                      .map((e) => {
                        const srcN = graph.nodes.find((n) => n.id === e.source);
                        return {
                          name: srcN?.label?.startsWith('@')
                            ? srcN.label
                            : `@${srcN?.label ?? e.source}`,
                          value: e.label || srcN?.defaultPreview || 'input',
                          color: srcN?.accentColor ?? node.accentColor,
                        };
                      }),
                    goalTitle: `${node.label.replace(/\(\)$/, '')}'s goal:`,
                    goalText: node.roleSummary || node.description || node.subtitle,
                    outputLabel: `@${node.label.replace(/\(\)$/, '')} output`,
                    outputValue:
                      resolvedOutputPreview ||
                      node.customVisual?.highlightText ||
                      node.customVisual?.lines?.join(' ') ||
                      node.subtitle,
                  }
                : undefined);

            const effectiveStaticData =
              node.staticData ??
              (isLevel1FunctionView && isBoundaryOrStaticKind && !effectiveNonSummary
                ? {
                    header: `${
                      node.label.startsWith('@') ? node.label : `@${node.label}`
                    } [`,
                    entries:
                      node.customVisual?.lines && node.customVisual.lines.length > 0
                        ? node.customVisual.lines.map((ln, idx) => ({
                            key: `item_${idx + 1}`,
                            value: ln,
                            color: node.accentColor,
                          }))
                        : [
                            {
                              key: node.kind === 'output' ? 'return' : 'value',
                              value: resolvedCardPreview || node.subtitle,
                              color: node.accentColor,
                            },
                          ],
                  }
                : undefined);

            const reactiveStage = reactiveDisplay ? (frame?.reactiveStage ?? 'ready') : 'ready';
            const inputRevealProgress = reactiveDisplay ? (frame?.inputRevealProgress ?? 1) : 1;
            const inspectRevealProgress = reactiveDisplay
              ? (frame?.inspectRevealProgress ?? 1)
              : 1;
            const outputRevealProgress = reactiveDisplay ? (frame?.outputRevealProgress ?? 1) : 1;
            const arrivedInputCount = reactiveDisplay ? (frame?.arrivedInputCount ?? 99) : 99;

            const nodeOpacity = selectedNodeId
              ? isRelatedToSelected
                ? 1
                : 0.28
              : isDimmed && cameraMode !== 'overview' && !reactiveDisplay
              ? 0.42
              : 1;

            // Keep vibrant selection/focus borders on L0, but calm JetBrains Darcula borders during Inspect
            const borderColor = isMacroBlueprint
              ? isSelected
                ? '#A882FF'
                : isInputSourceForSelected
                ? '#38BDF8'
                : isOutputTargetForSelected
                ? '#34D399'
                : isActive || isFocused
                ? hex
                : '#3E4045'
              : isSelected
              ? '#3574F0'
              : isInputSourceForSelected
              ? '#56A8F5'
              : isOutputTargetForSelected
              ? '#6AAB73'
              : isActive || isFocused
              ? '#3574F0'
              : '#3E4045';

            const borderWidth = isMacroBlueprint
              ? isSelected
                ? 3.0
                : isInputSourceForSelected || isOutputTargetForSelected
                ? 2.6
                : isActive || isFocused
                ? 2.4
                : 1.4
              : isSelected || isActive || isFocused
              ? 1.8
              : 1.2;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                opacity={nodeOpacity}
                data-node-interactive="true"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(selectedNodeId === node.id ? null : node.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectNode(selectedNodeId === node.id ? null : node.id);
                  }
                }}
                className="cursor-pointer focus:outline-none"
              >
                {/* LABEL OUTSIDE & ABOVE THE BLOCK */}
                <text
                  x={0}
                  y={-10}
                  fill={
                    isSelected
                      ? '#56A8F5'
                      : isInputSourceForSelected
                      ? '#56A8F5'
                      : isOutputTargetForSelected
                      ? '#6AAB73'
                      : isActive || isFocused
                      ? hex
                      : '#DFE1E5'
                  }
                  fontSize={12.5}
                  fontWeight="600"
                  className="font-mono"
                >
                  {node.stepBadge && !(node.stepBadge === '@' && node.label.startsWith('@'))
                    ? `${node.stepBadge} `
                    : ''}
                  {node.label}
                  {!node.drillDownFunctionId && node.subtitle && (
                    <tspan
                      fill="#868A91"
                      fontSize={11}
                      fontWeight="400"
                      dx={6}
                    >
                      — {node.subtitle}
                    </tspan>
                  )}
                </text>

                {/* Role Badge Below Block When Clicked Selection is Active */}
                {(isSelected || isInputSourceForSelected || isOutputTargetForSelected) && (
                  <g transform={`translate(0, ${pos.height + 6})`}>
                    <rect
                      width={Math.min(pos.width, 196)}
                      height={19}
                      rx={4}
                      fill={
                        isSelected
                          ? '#2E436E'
                          : isInputSourceForSelected
                          ? '#263B54'
                          : '#233B2B'
                      }
                      stroke={
                        isSelected
                          ? '#3574F0'
                          : isInputSourceForSelected
                          ? '#56A8F5'
                          : '#6AAB73'
                      }
                      strokeWidth={1}
                    />
                    <text
                      x={Math.min(pos.width, 196) / 2}
                      y={13}
                      textAnchor="middle"
                      fill="#DFE1E5"
                      fontSize={10}
                      fontWeight="600"
                      className="font-mono"
                    >
                      {isSelected
                        ? 'Selected Block'
                        : isInputSourceForSelected
                        ? 'Incoming Source'
                        : 'Outgoing Target'}
                    </text>
                  </g>
                )}

                {/* JetBrains Inspect Action on Nodes with Drill-Down */}
                {node.drillDownFunctionId && (
                  <g
                    transform={`translate(${pos.width - 118}, -26)`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (node.drillDownFunctionId) {
                        onDrillIntoFunction(node.drillDownFunctionId);
                      }
                    }}
                  >
                    <rect
                      width={118}
                      height={20}
                      rx={4}
                      fill="#2B2D30"
                      stroke="#4E5157"
                      strokeWidth={1}
                    />
                    <text
                      x={59}
                      y={13.5}
                      textAnchor="middle"
                      fill="#56A8F5"
                      fontSize={10}
                      fontWeight="600"
                      className="font-mono"
                    >
                      Inspect ↘
                    </text>
                  </g>
                )}

                {/* Main Card Body + L0 Top Color Strip */}
                {(() => {
                  const containerW =
                    compoundSpec && compoundSpec.children.length > 0
                      ? Math.max(
                          pos.width,
                          ...compoundSpec.children.map((c) => c.x + c.w + 26)
                        )
                      : pos.width;
                  const containerH =
                    compoundSpec && compoundSpec.children.length > 0
                      ? Math.max(
                          pos.height,
                          ...compoundSpec.children.map((c) => c.y + c.h + 14)
                        )
                      : pos.height;

                  const cardFill = isMacroBlueprint
                    ? node.kind === 'input'
                      ? '#1C2430'
                      : node.kind === 'store'
                      ? '#1B2825'
                      : node.kind === 'output'
                      ? '#1D2923'
                      : '#25272B'
                    : '#2B2D30';
                  const rxVal = isLevel2Flowchart && node.customVisual ? 8 : 6;

                  return (
                    <g>
                      <rect
                        width={containerW}
                        height={containerH}
                        rx={rxVal}
                        fill={cardFill}
                        stroke={borderColor}
                        strokeWidth={borderWidth}
                      />
                      {/* Keep colored header strip on L0 architecture overview only */}
                      {isMacroBlueprint && (
                        <rect
                          x={1}
                          y={1}
                          width={Math.max(0, containerW - 2)}
                          height={4}
                          rx={2}
                          fill={hex}
                          opacity={isActive || isFocused || isSelected ? 0.95 : 0.6}
                        />
                      )}
                    </g>
                  );
                })()}

                {compoundSpec ? (
                  /* COMPOUND CONTAINER: Render Wall Port Squares (■), Internal Orthogonal Wires (▸), & Nested Child Logic Blocks! */
                  <g>
                    {/* Compound Container Left Boundary Port Squares (■) on Wall x=0 */}
                    {compoundSpec.leftPortsY.map((py, idx) => {
                      const incomingEdgesForNode = graph.edges.filter(
                        (e) => e.target === node.id && e.relationship !== 'reference'
                      );
                      const incomingSrcNode = incomingEdgesForNode[idx]
                        ? graph.nodes.find((n) => n.id === incomingEdgesForNode[idx].source)
                        : undefined;
                      const leftPortHex = incomingSrcNode
                        ? activePalette[incomingSrcNode.accentColor] ?? hex
                        : hex;
                      return (
                        <rect
                          key={`lp-${idx}`}
                          x={-5}
                          y={py - 5}
                          width={10}
                          height={10}
                          rx={1.5}
                          fill={leftPortHex}
                          opacity={isActive || isFocused || isSelected ? 1 : 0.72}
                          stroke="#1E1F22"
                          strokeWidth={1}
                        />
                      );
                    })}

                    {/* Compound Container Right Boundary Port Squares (■) on Wall x=pos.width */}
                    {compoundSpec.rightPortsY.map((py, idx) => {
                      const containerW =
                        compoundSpec.children.length > 0
                          ? Math.max(
                              pos.width,
                              ...compoundSpec.children.map((c) => c.x + c.w + 26)
                            )
                          : pos.width;
                      const mainChildren = compoundSpec.children.filter((c) => !c.isDropBranch);
                      const lastChildColor =
                        mainChildren.length > 0
                          ? mainChildren[mainChildren.length - 1].color
                          : node.accentColor;
                      const rightPortHex = activePalette[lastChildColor] ?? hex;
                      return (
                        <rect
                          key={`rp-${idx}`}
                          x={containerW - 5}
                          y={py - 5}
                          width={10}
                          height={10}
                          rx={1.5}
                          fill={rightPortHex}
                          opacity={isActive || isFocused || isSelected ? 1 : 0.72}
                          stroke="#0D0D12"
                          strokeWidth={1}
                        />
                      );
                    })}

                    {/* Internal Orthogonal Wires connecting Wall Ports (■) -> Child Block Ports (▸■) -> Exit Wall Port (▸■) */}
                    {compoundSpec.internalWires.map((w, wi) => {
                      const wireColorKey = w.sourceColor ?? node.accentColor;
                      const wireHex = activePalette[wireColorKey] ?? hex;
                      return (
                        <path
                          key={wi}
                          d={buildOrthogonalPath(w.points)}
                          fill="none"
                          stroke={wireHex}
                          strokeOpacity={isActive || isFocused || isSelected ? 0.95 : 0.62}
                          strokeWidth={isActive ? 1.9 : 1.55}
                          markerEnd={`url(#port-arrow-color-${wireColorKey})`}
                        />
                      );
                    })}

                    {/* Nested Child Logic Blocks (with Embedded Inspect Preview Function Archetypes) */}
                    {compoundSpec.children.map((child, childIdx) => {
                      const cHex = activePalette[child.color] ?? hex;
                      const isBypassFirstChild =
                        (child.id === 'c-rules' || child.id === 'c-assemble-rules') &&
                        compoundSpec.leftPortsY.length >= 2;
                      const inPorts = child.combinerPortsY ?? [
                        isBypassFirstChild
                          ? compoundSpec.leftPortsY[1]
                          : child.y + child.h / 2,
                      ];
                      const outPortY = isBypassFirstChild
                        ? compoundSpec.leftPortsY[1] - child.y
                        : child.id === 'c-score' ||
                          child.id === 'c-merge' ||
                          child.id === 'rs-1' ||
                          child.id === 'pm-2' ||
                          child.id === 'pf-2'
                        ? (compoundSpec.rightPortsY[0] ?? child.y + child.h / 2) -
                          child.y
                        : child.h / 2;

                      const nonDropCount = Math.max(
                        1,
                        compoundSpec.children.filter((c) => !c.isDropBranch).length
                      );
                      const childStartFrac = (childIdx / nonDropCount) * 0.52;
                      const childSpanFrac = Math.max(0.38, 1 - childStartFrac);
                      const parentProg = frame?.reactiveProgress ?? 1;
                      const childLocalProg = Math.max(
                        0,
                        Math.min(1, (parentProg - childStartFrac) / childSpanFrac)
                      );

                      const childReactiveStage:
                        | 'waiting'
                        | 'in-flight'
                        | 'updating'
                        | 'ready' = !reactiveDisplay
                        ? 'ready'
                        : reactiveStage === 'waiting'
                        ? 'waiting'
                        : reactiveStage === 'in-flight'
                        ? childIdx === 0
                          ? 'in-flight'
                          : 'waiting'
                        : reactiveStage === 'updating'
                        ? parentProg < childStartFrac
                          ? childIdx === 0
                            ? 'in-flight'
                            : 'waiting'
                          : childLocalProg >= 0.98
                          ? 'ready'
                          : 'updating'
                        : 'ready';

                      const isChildReactiveWaiting =
                        reactiveDisplay &&
                        (childReactiveStage === 'waiting' ||
                          childReactiveStage === 'in-flight');
                      const isChildReactiveUpdating =
                        reactiveDisplay && childReactiveStage === 'updating';

                      const childL2Lesson =
                        !child.isDropBranch && child.drillDownFunctionId
                          ? resolveSubFunctionLesson(child.drillDownFunctionId)
                          : null;

                      return (
                        <g
                          key={child.id}
                          transform={`translate(${child.x}, ${child.y})`}
                          className={
                            child.drillDownFunctionId ? 'cursor-pointer' : undefined
                          }
                          onClick={
                            child.drillDownFunctionId
                              ? (e) => {
                                  e.stopPropagation();
                                  onDrillIntoFunction?.(child.drillDownFunctionId!);
                                }
                              : undefined
                          }
                        >
                          <text
                            x={0}
                            y={-7}
                            fill="#DFE1E5"
                            fontSize={11.5}
                            fontWeight="600"
                            className="font-sans"
                          >
                            {child.label}
                          </text>

                          {child.hasLeftCombinerBar && (
                            <g>
                              <rect
                                x={-8}
                                y={4}
                                width={6}
                                height={child.h - 8}
                                rx={1}
                                fill="#2B2D30"
                                stroke={cHex}
                                strokeWidth={1.2}
                              />
                              {inPorts.map((absY, pi) => (
                                <rect
                                  key={pi}
                                  x={-12}
                                  y={absY - child.y - 4}
                                  width={8}
                                  height={8}
                                  rx={1}
                                  fill={isActive ? cHex : '#5A5D63'}
                                  stroke="#1E1F22"
                                  strokeWidth={0.8}
                                />
                              ))}
                            </g>
                          )}

                          {!child.hasLeftCombinerBar && (
                            <rect
                              x={-4}
                              y={inPorts[0] - child.y - 4}
                              width={8}
                              height={8}
                              rx={1}
                              fill={isActive ? cHex : '#5A5D63'}
                              stroke="#1E1F22"
                              strokeWidth={0.8}
                            />
                          )}

                          {!child.isDropBranch &&
                            child.id !== 'c-drop' &&
                            child.id !== 'rsl-3' && (
                              <rect
                                x={child.w - 4}
                                y={outPortY - 4}
                                width={8}
                                height={8}
                                rx={1}
                                fill={isActive ? cHex : '#5A5D63'}
                                stroke="#1E1F22"
                                strokeWidth={0.8}
                              />
                            )}

                          <rect
                            width={child.w}
                            height={child.h}
                            rx={4}
                            fill={child.isDropBranch ? '#291E20' : '#1E1F22'}
                            stroke={
                              isChildReactiveUpdating
                                ? cHex
                                : isActive || isFocused
                                ? cHex
                                : '#43454A'
                            }
                            strokeWidth={isChildReactiveUpdating ? 1.8 : 1.3}
                          />

                          {child.isDropBranch ? (
                            <foreignObject
                              x={4}
                              y={4}
                              width={Math.max(60, child.w - 8)}
                              height={Math.max(24, child.h - 8)}
                            >
                              <div className="w-full h-full px-2 flex items-center justify-between gap-1.5 font-mono text-[9.5px] select-none">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <svg
                                    width={14}
                                    height={14}
                                    viewBox="0 0 24 24"
                                    className="shrink-0"
                                    style={{
                                      opacity: isChildReactiveWaiting ? 0.45 : 1,
                                    }}
                                  >
                                    {renderLucideIcon(child.iconName, '#D46A6E', 14)}
                                  </svg>
                                  <span
                                    className={`truncate ${
                                      isChildReactiveWaiting
                                        ? 'text-[#6F737A] italic'
                                        : 'text-[#E08B8E] font-semibold'
                                    }`}
                                  >
                                    {isChildReactiveWaiting
                                      ? 'none'
                                      : child.sublabel}
                                  </span>
                                </div>
                                <span className="px-1.5 py-0.2 rounded bg-[#362225] border border-[#D46A6E]/40 text-[8px] font-semibold text-[#D46A6E] shrink-0">
                                  DROP
                                </span>
                              </div>
                            </foreignObject>
                          ) : (
                            <>
                              {/* Prominent Centered Context Icon */}
                              <g
                                transform={`translate(${child.w / 2 - 12}, 8)`}
                                opacity={isChildReactiveWaiting ? 0.42 : 1}
                              >
                                {renderLucideIcon(child.iconName, cHex, 24)}
                              </g>

                              {/* Clean Data Input -> Output Preview below Icon */}
                              <foreignObject
                                x={5}
                                y={37}
                                width={Math.max(60, child.w - 10)}
                                height={Math.max(36, child.h - 41)}
                              >
                                {(() => {
                                  const rawIn =
                                    childIdx > 0 &&
                                    !compoundSpec.children[childIdx - 1]?.isDropBranch
                                      ? compoundSpec.children[childIdx - 1].sublabel
                                      : childL2Lesson?.sidebarInputs?.[0]?.value ||
                                        childL2Lesson?.codeLines?.[0]?.inputValue ||
                                        node.defaultPreview ||
                                        '@input';
                                  const rawOut =
                                    child.sublabel ||
                                    childL2Lesson?.codeLines?.[
                                      (childL2Lesson?.codeLines?.length ?? 1) - 1
                                    ]?.resultText ||
                                    '@output';

                                  const inReady =
                                    !reactiveDisplay ||
                                    childReactiveStage === 'ready' ||
                                    (childReactiveStage === 'updating' &&
                                      childLocalProg >= 0.08);
                                  const outReady =
                                    !reactiveDisplay ||
                                    childReactiveStage === 'ready' ||
                                    (childReactiveStage === 'updating' &&
                                      childLocalProg >= 0.46);

                                  return (
                                    <div className="w-full h-full flex flex-col justify-end gap-1 font-mono text-[9.5px] select-none overflow-hidden">
                                      {/* INPUT ROW */}
                                      <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#25272B] border border-[#34363B] min-w-0">
                                        <span className="text-[8.5px] font-semibold text-[#868A91] shrink-0">
                                          IN
                                        </span>
                                        <span
                                          className={`truncate flex-1 text-left ${
                                            inReady
                                              ? 'text-[#BCBEC4]'
                                              : 'text-[#6F737A] italic'
                                          }`}
                                          title={inReady ? rawIn : undefined}
                                        >
                                          {inReady
                                            ? rawIn
                                            : childReactiveStage === 'in-flight'
                                            ? 'in-flight...'
                                            : 'none'}
                                        </span>
                                      </div>

                                      {/* OUTPUT ROW */}
                                      <div
                                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#25272B] border min-w-0 transition-colors duration-150"
                                        style={{
                                          borderColor: outReady
                                            ? `${cHex}66`
                                            : '#34363B',
                                        }}
                                      >
                                        <span
                                          className="text-[8.5px] font-semibold shrink-0"
                                          style={{
                                            color: outReady ? cHex : '#6F737A',
                                          }}
                                        >
                                          OUT
                                        </span>
                                        <span
                                          className={`truncate flex-1 text-left ${
                                            outReady
                                              ? 'text-[#DFE1E5] font-semibold'
                                              : 'text-[#6F737A] italic'
                                          }`}
                                          title={outReady ? rawOut : undefined}
                                        >
                                          {outReady
                                            ? rawOut
                                            : inReady &&
                                              childReactiveStage === 'updating'
                                            ? 'computing...'
                                            : 'none'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </foreignObject>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </g>
                ) : isLevel2Flowchart && node.customVisual ? (
                  /* DYNAMIC FUNCTION-SPECIFIC VISUAL FLOWCHART CARDS (Level 2 — Calm JetBrains Darcula Style) */
                  <foreignObject
                    x={10}
                    y={10}
                    width={pos.width - 20}
                    height={pos.height - 20}
                  >
                    {reactiveDisplay &&
                    (reactiveStage === 'waiting' ||
                      reactiveStage === 'in-flight' ||
                      inspectRevealProgress <= 0.05) ? (
                      <div className="w-full h-full rounded-md bg-[#232529] border border-dashed border-[#3E4045] p-3 flex flex-col justify-between select-none font-mono">
                        <div className="flex items-center justify-between border-b border-[#393B40] pb-1.5">
                          <span className="text-[11px] font-semibold text-[#868A91] truncate">
                            {node.customVisual.title || node.label}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border ${
                              reactiveStage === 'in-flight'
                                ? 'bg-[#1E293B] border-[#3574F0]/50 text-[#56A8F5] animate-pulse'
                                : 'bg-[#1E1F22] border-[#34363B] text-[#6F737A]'
                            }`}
                          >
                            {reactiveStage === 'in-flight' ? 'WIRE IN-FLIGHT' : 'IDLE · NONE'}
                          </span>
                        </div>
                        <div className="my-auto py-3 px-2 rounded bg-[#1E1F22] border border-[#34363B] text-center space-y-1">
                          <div className="text-[11px] font-semibold text-[#6F737A]">
                            data: <span className="italic">none</span>
                          </div>
                          <div className="text-[9.5px] text-[#868A91] font-sans leading-snug">
                            {reactiveStage === 'in-flight'
                              ? 'Packet traveling along wire — awaiting port entry...'
                              : 'Waiting for incoming wire packet to enter port'}
                          </div>
                        </div>
                        <div className="text-[9.5px] text-center text-[#6F737A]">
                          {node.roleSummary || node.subtitle}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="relative w-full h-full flex flex-col justify-center items-center select-none overflow-hidden font-sans transition-all duration-150"
                        style={{
                          opacity:
                            reactiveDisplay && reactiveStage === 'updating'
                              ? Math.max(0.38, inspectRevealProgress)
                              : 1,
                          transform:
                            reactiveDisplay && reactiveStage === 'updating'
                              ? `scale(${0.97 + 0.03 * inspectRevealProgress})`
                              : undefined,
                        }}
                      >
                        {reactiveDisplay &&
                          reactiveStage === 'updating' &&
                          inspectRevealProgress < 1 && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-[#1E1F22] z-10 overflow-hidden rounded-t">
                              <div
                                className="h-full transition-all duration-75"
                                style={{
                                  width: `${Math.round(inspectRevealProgress * 100)}%`,
                                  backgroundColor: hex,
                                }}
                              />
                            </div>
                          )}
                        {node.customVisual.variant === 'paper-card' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#3E4045] flex flex-col justify-between p-3 text-[#DFE1E5]">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#56A8F5] bg-[#1E1F22] border border-[#393B40] px-2 py-0.5 rounded">
                              {node.customVisual.headerBadge ?? 'Input'}
                            </span>
                            <span className="font-mono text-[10.5px] font-semibold text-[#868A91]">
                              {node.customVisual.title}
                            </span>
                          </div>
                          <div className="my-auto py-1.5 space-y-1 text-center border-y border-dashed border-[#393B40]">
                            {(node.customVisual.lines ?? []).map((ln, idx) => (
                              <div
                                key={idx}
                                className="font-mono text-[12.5px] font-semibold text-[#DFE1E5] leading-snug"
                              >
                                {ln}
                              </div>
                            ))}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center font-medium text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'token-tiles' && (
                        <div className="w-full h-full flex flex-col justify-between p-2.5 bg-[#232529] rounded-md border border-[#393B40]">
                          <div className="text-[11px] font-mono text-[#BCBEC4] text-center font-semibold">
                            {node.customVisual.title}
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2 my-auto py-1">
                            {(node.customVisual.tiles ?? []).map((tile, tidx) => {
                              const tileAccent = INSPECT_ACCENT_HEX[tile.color] ?? '#56A8F5';
                              return (
                                <div
                                  key={tidx}
                                  className="px-2.5 py-1.5 rounded bg-[#1E1F22] flex flex-col items-center justify-center min-w-[58px] border"
                                  style={{ borderColor: tileAccent }}
                                >
                                  <span
                                    className="font-mono text-[12px] font-semibold leading-none"
                                    style={{ color: tileAccent }}
                                  >
                                    {tile.text}
                                  </span>
                                  {tile.subtext && (
                                    <span className="font-mono text-[9.5px] text-[#868A91] mt-1">
                                      {tile.subtext}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91] bg-[#1E1F22] border border-[#393B40] rounded px-2 py-1">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'lookup-table' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#3E4045] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#393B40] pb-1">
                            <div className="text-[12.5px] font-semibold text-[#DFE1E5]">
                              {node.customVisual.title}
                            </div>
                            {node.customVisual.subtitle && (
                              <div className="text-[10px] font-mono text-[#D9A354]">
                                {node.customVisual.subtitle}
                              </div>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((row, ridx) => {
                              const arrowHex = INSPECT_ACCENT_HEX[row.color] ?? '#56A8F5';
                              return (
                                <div
                                  key={ridx}
                                  className="flex items-center justify-between gap-2 bg-[#1E1F22] border border-[#393B40] rounded px-2 py-1"
                                >
                                  <span
                                    className="px-2 py-0.5 rounded font-mono text-[10.5px] font-semibold bg-[#2B2D30] shrink-0 border"
                                    style={{
                                      color: arrowHex,
                                      borderColor: arrowHex,
                                    }}
                                  >
                                    {row.leftChip}
                                  </span>
                                  <span
                                    className="font-mono text-[11px] shrink-0"
                                    style={{ color: arrowHex }}
                                  >
                                    ──▸
                                  </span>
                                  <div className="flex-1 text-left min-w-0">
                                    <span className="font-mono text-[10.5px] font-medium text-[#DFE1E5] break-words">
                                      {row.rightValue}
                                    </span>
                                    {row.note && (
                                      <span className="block font-sans text-[9.5px] text-[#868A91]">
                                        {row.note}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] font-mono text-center text-[#6AAB73]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'output-pill' && (
                        <div className="w-full h-full flex flex-col justify-between p-2.5 bg-[#232529] rounded-md border border-[#393B40]">
                          <div className="text-[10px] font-mono text-[#6AAB73] text-center uppercase tracking-wider font-semibold">
                            {node.customVisual.headerBadge ?? node.customVisual.title}
                          </div>
                          <div className="my-auto rounded-md bg-[#1E1F22] border border-[#425C48] px-3 py-2.5 text-center">
                            <div className="font-mono text-[11.5px] font-semibold text-[#6AAB73] break-words leading-snug">
                              {node.customVisual.highlightText ?? node.customVisual.title}
                            </div>
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91] leading-snug">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'vector-bars' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="text-[11.5px] font-semibold text-[#DFE1E5]">
                              {node.customVisual.title}
                            </span>
                            {(node.customVisual.normLabel ?? node.customVisual.headerBadge) && (
                              <span className="font-mono text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-[#1E1F22] text-[#D9A354] border border-[#393B40]">
                                {node.customVisual.normLabel ?? node.customVisual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.floats ?? []).map((val, bidx) => {
                              const isNeg = val < 0;
                              const barHex = isNeg ? '#D46A6E' : hex;
                              const pct = Math.min(100, Math.round(Math.abs(val) * 62));
                              return (
                                <div key={bidx} className="flex items-center gap-2">
                                  <span className="font-mono text-[9.5px] text-[#868A91] w-8 shrink-0">
                                    d[{bidx}]
                                  </span>
                                  <div className="flex-1 h-2 bg-[#1E1F22] rounded overflow-hidden border border-[#393B40]">
                                    <div
                                      className="h-full rounded"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: barHex,
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="font-mono text-[10px] font-semibold w-11 text-right shrink-0"
                                    style={{ color: barHex }}
                                  >
                                    {val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91] font-mono">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'funnel-pool' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="text-[11.5px] font-semibold text-[#DFE1E5]">
                              {node.customVisual.title}
                            </span>
                            {node.customVisual.headerBadge && (
                              <span className="font-mono text-[9.5px] uppercase font-semibold px-1.5 py-0.5 rounded bg-[#1E1F22] text-[#D9A354] border border-[#393B40]">
                                {node.customVisual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((row, ridx) => {
                              const rHex = INSPECT_ACCENT_HEX[row.color] ?? '#6AAB73';
                              return (
                                <div
                                  key={ridx}
                                  className="flex items-center justify-between bg-[#1E1F22] border border-[#393B40] rounded px-2 py-1"
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-semibold"
                                    style={{ color: rHex }}
                                  >
                                    {row.leftChip}
                                  </span>
                                  <span className="font-mono text-[10.5px] text-[#DFE1E5]">
                                    {row.rightValue}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-[#868A91] text-center leading-snug">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'score-meter' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="font-mono text-[11px] font-semibold text-[#DFE1E5]">
                              {node.customVisual.title}
                            </span>
                            {node.customVisual.headerBadge && (
                              <span
                                className="font-mono text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-[#1E1F22]"
                                style={{ color: hex }}
                              >
                                {node.customVisual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((r, ridx) => {
                              const rHex = INSPECT_ACCENT_HEX[r.color] ?? hex;
                              const pct = r.barPercent ?? 50;
                              return (
                                <div key={ridx} className="space-y-1">
                                  <div className="flex items-center justify-between font-mono text-[10.5px]">
                                    <span className="text-[#BCBEC4]">{r.leftChip}</span>
                                    <span className="font-semibold" style={{ color: rHex }}>
                                      {r.rightValue}
                                    </span>
                                  </div>
                                  <div className="w-full h-2.5 bg-[#1E1F22] rounded overflow-hidden border border-[#393B40]">
                                    <div
                                      className="h-full rounded"
                                      style={{ width: `${pct}%`, backgroundColor: rHex }}
                                    />
                                  </div>
                                  {r.note && (
                                    <div className="text-[9.5px] text-[#868A91] font-sans">
                                      {r.note}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-[#D9A354] font-mono text-center">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'podium-rank' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#393B40] pb-1">
                            <div className="text-[12px] font-semibold text-[#DFE1E5]">
                              {node.customVisual.title}
                            </div>
                            {node.customVisual.subtitle && (
                              <div className="text-[10px] font-mono text-[#D9A354]">
                                {node.customVisual.subtitle}
                              </div>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((p, pidx) => {
                              const pHex = INSPECT_ACCENT_HEX[p.color] ?? '#6AAB73';
                              return (
                                <div
                                  key={pidx}
                                  className="flex items-center justify-between bg-[#1E1F22] border border-[#393B40] rounded px-2.5 py-1.5"
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#2B2D30] border"
                                    style={{ color: pHex, borderColor: pHex }}
                                  >
                                    {p.leftChip}
                                  </span>
                                  <span className="font-mono text-[10.5px] text-[#DFE1E5]">
                                    {p.rightValue}
                                  </span>
                                  {p.note && (
                                    <span
                                      className="font-mono text-[10px] font-medium"
                                      style={{ color: pHex }}
                                    >
                                      {p.note}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'gate-keep-drop' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#393B40] pb-1">
                            <div className="text-[12px] font-semibold text-[#D9A354]">
                              {node.customVisual.title}
                            </div>
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((r, ridx) => {
                              const rHex = INSPECT_ACCENT_HEX[r.color] ?? '#6AAB73';
                              return (
                                <div
                                  key={ridx}
                                  className="bg-[#1E1F22] border border-[#393B40] rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-semibold shrink-0"
                                    style={{ color: rHex }}
                                  >
                                    {r.leftChip}
                                  </span>
                                  <div className="flex-1 text-left min-w-0">
                                    <div className="font-mono text-[10.5px] text-[#DFE1E5] truncate">
                                      {r.rightValue}
                                    </div>
                                    {r.note && (
                                      <div className="text-[9.5px] text-[#868A91]">
                                        {r.note}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'dropped-bin' && (
                        <div className="w-full h-full rounded-md bg-[#282022] border border-dashed border-[#D46A6E]/60 p-2.5 flex flex-col justify-between text-center">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[#1E1F22] text-[#D46A6E] border border-[#D46A6E]/40">
                              {node.customVisual.headerBadge ?? 'DISCARDED'}
                            </span>
                            <span className="font-mono text-[10.5px] font-semibold text-[#D46A6E]">
                              {node.customVisual.title}
                            </span>
                          </div>
                          <div className="my-auto space-y-1">
                            {(node.customVisual.lines ?? []).map((ln, idx) => (
                              <div
                                key={idx}
                                className="font-mono text-[11px] text-[#BCBEC4] line-through decoration-[#D46A6E]"
                              >
                                {ln}
                              </div>
                            ))}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'doc-scroll' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="font-mono text-[11px] font-semibold text-[#6AAB73]">
                              {node.customVisual.title}
                            </span>
                            {node.customVisual.headerBadge && (
                              <span className="font-mono text-[9.5px] text-[#D9A354]">
                                {node.customVisual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.lines ?? []).map((ln, idx) => (
                              <div
                                key={idx}
                                className="font-mono text-[10.5px] text-[#DFE1E5] bg-[#1E1F22] border border-[#393B40] px-2 py-1 rounded"
                              >
                                {ln}
                              </div>
                            ))}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'blueprint-slots' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#393B40] pb-1">
                            <span className="text-[12px] font-semibold text-[#DFE1E5]">
                              {node.customVisual.title}
                            </span>
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((slot, sidx) => {
                              const sHex = INSPECT_ACCENT_HEX[slot.color] ?? '#6AAB73';
                              return (
                                <div
                                  key={sidx}
                                  className="bg-[#1E1F22] border border-[#393B40] rounded px-2 py-1"
                                >
                                  <div
                                    className="font-mono text-[9.5px] font-semibold uppercase"
                                    style={{ color: sHex }}
                                  >
                                    {slot.leftChip}
                                  </div>
                                  <div className="font-mono text-[10.5px] text-[#DFE1E5] truncate">
                                    {slot.rightValue}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#6AAB73] font-mono">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'heatmap-spotlight' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#393B40] pb-1">
                            <span className="text-[12px] font-semibold text-[#D9A354]">
                              {node.customVisual.title}
                            </span>
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((w, widx) => {
                              const wHex = INSPECT_ACCENT_HEX[w.color] ?? '#D9A354';
                              const pct = w.barPercent ?? 50;
                              return (
                                <div key={widx} className="space-y-0.5">
                                  <div className="flex justify-between font-mono text-[10.5px]">
                                    <span className="text-[#DFE1E5] font-medium">
                                      {w.leftChip}
                                    </span>
                                    <span
                                      className="font-semibold"
                                      style={{ color: wHex }}
                                    >
                                      {w.rightValue}
                                    </span>
                                  </div>
                                  <div className="w-full h-2 bg-[#1E1F22] rounded overflow-hidden border border-[#393B40]">
                                    <div
                                      className="h-full rounded"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: wHex,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {node.customVisual.variant === 'citation-verifier' && (
                        <div className="w-full h-full rounded-md bg-[#232529] border border-[#393B40] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <span className="text-[11.5px] font-semibold text-[#6AAB73]">
                              {node.customVisual.title}
                            </span>
                            {node.customVisual.headerBadge && (
                              <span className="font-mono text-[9.5px] font-semibold text-[#6AAB73]">
                                {node.customVisual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(node.customVisual.rows ?? []).map((r, ridx) => {
                              const rHex = INSPECT_ACCENT_HEX[r.color] ?? '#6AAB73';
                              return (
                                <div
                                  key={ridx}
                                  className="flex items-center justify-between bg-[#1E1F22] border border-[#393B40] rounded px-2 py-1"
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-semibold"
                                    style={{ color: rHex }}
                                  >
                                    {r.leftChip}
                                  </span>
                                  <span className="font-mono text-[10px] text-[#6AAB73]">
                                    ✓
                                  </span>
                                  <span className="font-mono text-[10.5px] text-[#DFE1E5]">
                                    {r.rightValue}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {node.customVisual.footerNote && (
                            <div className="text-[10px] text-center text-[#868A91]">
                              {node.customVisual.footerNote}
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    )}
                  </foreignObject>
                ) : effectiveNonSummary ? (
                  /* NON-SUMMARY VIEW (@BlockName [ @Inputs, Goal, @Output ]) — JetBrains Debugger Frame Style */
                  <g>
                    {effectiveNonSummary.inputs.length > 1 && (
                      <rect
                        x={-9}
                        y={24}
                        width={7}
                        height={pos.height - 48}
                        rx={1.5}
                        fill="#2B2D30"
                        stroke={hex}
                        strokeWidth={1.3}
                      />
                    )}

                    <foreignObject
                      x={12}
                      y={10}
                      width={pos.width - 24}
                      height={pos.height - 18}
                    >
                      <div className="w-full h-full flex flex-col justify-start gap-1.5 text-left font-sans select-none overflow-hidden">
                        {/* 1. Opening Header + @Inputs List */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              {renderLucideIcon(node.iconName, hex, 16)}
                              <span
                                className="font-mono font-semibold text-[12px] truncate"
                                style={{ color: hex }}
                              >
                                {effectiveNonSummary.blockTitle} [
                              </span>
                            </div>
                            {reactiveDisplay && reactiveStage === 'waiting' ? (
                              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#1E1F22] border border-[#34363B] text-[#6F737A] shrink-0">
                                IDLE · data: none
                              </span>
                            ) : reactiveDisplay && reactiveStage === 'in-flight' ? (
                              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#1E293B] border border-[#3574F0]/50 text-[#56A8F5] animate-pulse shrink-0">
                                WIRE IN-FLIGHT
                              </span>
                            ) : reactiveDisplay && reactiveStage === 'updating' ? (
                              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#2B2520] border border-[#D9A354]/60 text-[#D9A354] shrink-0">
                                UPDATING{' '}
                                {Math.round(
                                  ((inputRevealProgress +
                                    inspectRevealProgress +
                                    outputRevealProgress) /
                                    3) *
                                    100
                                )}
                                %
                              </span>
                            ) : (
                              <span className="font-mono text-[9.5px] text-[#868A91] shrink-0">
                                {effectiveNonSummary.inputs.length}{' '}
                                {effectiveNonSummary.inputs.length === 1 ? 'input' : 'inputs'}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 pl-1">
                            {effectiveNonSummary.inputs.map((inp, idx) => {
                              const inpHex = inp.color ? activePalette[inp.color] : hex;
                              const hasInputArrived =
                                !reactiveDisplay ||
                                (reactiveStage !== 'waiting' &&
                                  reactiveStage !== 'in-flight' &&
                                  idx < arrivedInputCount &&
                                  inputRevealProgress > 0.05);
                              const isInputAnimating =
                                reactiveDisplay && hasInputArrived && inputRevealProgress < 1;

                              return (
                                <div
                                  key={idx}
                                  className="text-[11px] leading-snug bg-[#1E1F22] rounded px-2 py-0.5 line-clamp-2 break-words transition-all duration-150 border"
                                  style={{
                                    borderColor: isInputAnimating
                                      ? inpHex
                                      : hasInputArrived
                                      ? '#34363B'
                                      : '#2B2D30',
                                    opacity: hasInputArrived
                                      ? 0.4 + 0.6 * inputRevealProgress
                                      : 0.75,
                                    transform: isInputAnimating
                                      ? `translateX(${((1 - inputRevealProgress) * -6).toFixed(1)}px)`
                                      : undefined,
                                  }}
                                >
                                  <span
                                    className="font-mono font-semibold"
                                    style={{ color: hasInputArrived ? inpHex : '#6F737A' }}
                                  >
                                    {inp.name}
                                  </span>
                                  <span className="text-[#6F737A] font-mono"> = </span>
                                  {hasInputArrived ? (
                                    <span className="text-[#BCBEC4] break-words">{inp.value}</span>
                                  ) : (
                                    <span className="font-mono italic text-[#6F737A]">
                                      none
                                      {reactiveStage === 'in-flight' && (
                                        <span className="not-italic text-[9.5px] text-[#56A8F5] ml-1.5">
                                          (packet on wire...)
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Block's Goal Section (Calm JetBrains Panel, zero neon purple) */}
                        <div className="px-2.5 py-1.5 rounded bg-[#232529] border border-[#393B40]">
                          <div className="text-[11px] font-semibold text-[#D9A354] truncate">
                            {effectiveNonSummary.goalTitle}
                          </div>
                          <div className="text-[11.5px] text-[#DFE1E5] leading-snug mt-0.5 line-clamp-2 break-words">
                            {effectiveNonSummary.goalText}
                          </div>
                        </div>

                        {/* 2.5 Embedded Inspect Preview Section (Right Below Goal — Reusable Archetype Module) */}
                        {(() => {
                          const l2Preview = node.drillDownFunctionId
                            ? resolveSubFunctionLesson(node.drillDownFunctionId)
                            : null;
                          if (!l2Preview) return null;

                          return (
                            <InspectPreviewCard
                              l2Lesson={l2Preview}
                              accentHex={hex}
                              activePalette={activePalette}
                              reactiveEnabled={reactiveDisplay}
                              reactiveStage={reactiveStage}
                              inspectRevealProgress={inspectRevealProgress}
                              onInspect={() => {
                                if (node.drillDownFunctionId) {
                                  onDrillIntoFunction(node.drillDownFunctionId);
                                }
                              }}
                            />
                          );
                        })()}

                        {/* 3. @Output Section + Closing Bracket ] */}
                        {(() => {
                          const isOutputReady =
                            !reactiveDisplay ||
                            (reactiveStage !== 'waiting' &&
                              reactiveStage !== 'in-flight' &&
                              outputRevealProgress > 0.08);
                          const isOutputAnimating =
                            reactiveDisplay && isOutputReady && outputRevealProgress < 1;

                          return (
                            <div className="space-y-0.5 mt-auto">
                              {isOutputReady ? (
                                <div
                                  className="px-2.5 py-1 rounded bg-[#1E2620] border line-clamp-2 break-words transition-all duration-150"
                                  style={{
                                    borderColor: isOutputAnimating ? '#6AAB73' : '#3B523F',
                                    opacity: 0.35 + 0.65 * outputRevealProgress,
                                    transform: isOutputAnimating
                                      ? `translateY(${((1 - outputRevealProgress) * 4).toFixed(1)}px)`
                                      : undefined,
                                  }}
                                >
                                  <span className="font-mono font-semibold text-[11px] text-[#6AAB73]">
                                    {effectiveNonSummary.outputLabel} ={' '}
                                  </span>
                                  <span className="text-[11px] text-[#DFE1E5] leading-snug break-words">
                                    {resolvedOutputPreview || effectiveNonSummary.outputValue}
                                  </span>
                                </div>
                              ) : (
                                <div className="px-2.5 py-1 rounded bg-[#1E1F22] border border-dashed border-[#34363B] line-clamp-2 break-words">
                                  <span className="font-mono font-semibold text-[11px] text-[#6F737A]">
                                    {effectiveNonSummary.outputLabel} ={' '}
                                  </span>
                                  <span className="font-mono italic text-[11px] text-[#6F737A]">
                                    none
                                  </span>
                                  {reactiveStage === 'updating' && (
                                    <span className="font-mono text-[9.5px] text-[#D9A354] ml-1.5">
                                      (computing output...)
                                    </span>
                                  )}
                                </div>
                              )}
                              <div
                                className="font-mono font-semibold text-[12px] leading-none"
                                style={{ color: hex }}
                              >
                                ]
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </foreignObject>
                  </g>
                ) : effectiveStaticData ? (
                  /* UNPACKED STATIC @DATA BLOCK — JetBrains Darcula Watch Card */
                  <g>
                    <foreignObject
                      x={10}
                      y={10}
                      width={pos.width - 20}
                      height={pos.height - 18}
                    >
                      <div className="w-full h-full flex flex-col justify-between text-left font-mono select-none overflow-hidden">
                        <div className="flex items-center justify-between border-b border-[#393B40] pb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {renderLucideIcon(node.iconName, hex, 15)}
                            <span
                              className="font-semibold text-[11.5px] truncate"
                              style={{ color: hex }}
                            >
                              {effectiveStaticData.header}
                            </span>
                          </div>
                          <span className="text-[9.5px] text-[#868A91] shrink-0">
                            {reactiveDisplay &&
                            (reactiveStage === 'waiting' || reactiveStage === 'in-flight')
                              ? 'awaiting input'
                              : `static · ${effectiveStaticData.entries.length}`}
                          </span>
                        </div>

                        <div className="space-y-1 pl-1 my-1">
                          {effectiveStaticData.entries.map((entry, eidx) => {
                            const entryHex = entry.color ? activePalette[entry.color] : hex;
                            const isStaticEntryReady =
                              !reactiveDisplay ||
                              (reactiveStage !== 'waiting' &&
                                reactiveStage !== 'in-flight' &&
                                outputRevealProgress > 0.08);
                            return (
                              <div
                                key={eidx}
                                className="text-[10.5px] leading-snug bg-[#1E1F22] border border-[#34363B] rounded px-2 py-0.5 flex items-baseline justify-start gap-2"
                                style={{
                                  opacity: isStaticEntryReady
                                    ? Math.max(0.45, outputRevealProgress)
                                    : 0.75,
                                }}
                              >
                                <span
                                  className="font-semibold shrink-0"
                                  style={{
                                    color: isStaticEntryReady ? entryHex : '#6F737A',
                                  }}
                                >
                                  {entry.key}:
                                </span>
                                {isStaticEntryReady ? (
                                  <span className="text-[#DFE1E5] flex-1 min-w-0 text-left truncate">
                                    {entry.value}
                                  </span>
                                ) : (
                                  <span className="italic text-[#6F737A] flex-1 min-w-0 text-left truncate">
                                    none{' '}
                                    {reactiveStage === 'in-flight'
                                      ? '(packet on wire...)'
                                      : '(awaiting input)'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div
                          className="font-semibold text-[11.5px] leading-none"
                          style={{ color: hex }}
                        >
                          ]
                        </div>
                      </div>
                    </foreignObject>

                    {node.id === 'gen-out' && (
                      <g
                        transform={`translate(${pos.width / 2 - 54}, ${
                          pos.height + 8
                        })`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCitationClick();
                        }}
                      >
                        <rect
                          width={108}
                          height={20}
                          rx={4}
                          fill="#2E436E"
                          stroke="#3574F0"
                          strokeWidth={1}
                        />
                        <text
                          x={54}
                          y={14}
                          textAnchor="middle"
                          fill="#DFE1E5"
                          fontSize={10}
                          fontWeight="600"
                          className="font-mono"
                        >
                          [source-span] ↗
                        </text>
                      </g>
                    )}
                  </g>
                ) : (
                  /* COMPACT LEVEL-0 INPUT / STORE / OUTPUT CARD (Icon + Input/Output Data Preview) */
                  <g>
                    <g
                      transform={`translate(${pos.width / 2 - 13}, 12)`}
                      opacity={
                        reactiveDisplay &&
                        (reactiveStage === 'waiting' || reactiveStage === 'in-flight')
                          ? 0.42
                          : 1
                      }
                    >
                      {renderLucideIcon(node.iconName, hex, 26)}
                    </g>

                    <foreignObject
                      x={6}
                      y={44}
                      width={Math.max(60, pos.width - 12)}
                      height={Math.max(48, pos.height - 50)}
                    >
                      {(() => {
                        const isWaiting =
                          reactiveDisplay &&
                          (reactiveStage === 'waiting' ||
                            reactiveStage === 'in-flight' ||
                            outputRevealProgress <= 0.08);
                        const ioTag =
                          node.kind === 'output'
                            ? 'OUT'
                            : node.kind === 'store'
                            ? 'STORE'
                            : 'IN';

                        return (
                          <div className="w-full h-full flex flex-col justify-end gap-1 font-mono text-[9.5px] select-none overflow-hidden">
                            <div className="text-[9px] text-[#868A91] text-center truncate px-1">
                              {node.subtitle || node.moduleBadge || node.label}
                            </div>
                            <div
                              className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#25272B] border min-w-0"
                              style={{
                                borderColor: isWaiting ? '#34363B' : `${hex}66`,
                                opacity:
                                  reactiveDisplay && reactiveStage === 'updating'
                                    ? Math.max(0.4, outputRevealProgress)
                                    : 1,
                              }}
                              title={isWaiting ? undefined : resolvedCardPreview}
                            >
                              <span
                                className="text-[8.5px] font-semibold shrink-0"
                                style={{ color: isWaiting ? '#6F737A' : hex }}
                              >
                                {ioTag}
                              </span>
                              <span
                                className={`truncate flex-1 text-left ${
                                  isWaiting
                                    ? 'text-[#6F737A] italic'
                                    : 'text-[#DFE1E5] font-semibold'
                                }`}
                              >
                                {isWaiting
                                  ? reactiveStage === 'in-flight'
                                    ? 'in-flight...'
                                    : 'none'
                                  : resolvedCardPreview}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </foreignObject>

                    {(node.id === 'answer' || node.id === 'gen-out') && (
                      <g
                        transform={`translate(${pos.width / 2 - 56}, ${
                          pos.height + 8
                        })`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCitationClick();
                        }}
                      >
                        <rect
                          width={112}
                          height={20}
                          rx={4}
                          fill="#2E436E"
                          stroke="#3574F0"
                          strokeWidth={1}
                        />
                        <text
                          x={56}
                          y={14}
                          textAnchor="middle"
                          fill="#DFE1E5"
                          fontSize={10}
                          fontWeight="600"
                          className="font-mono"
                        >
                          [verify-source] ↗
                        </text>
                      </g>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. Render Outer Orthogonal Wires, Giant Box Boundary Port Squares (■), and Port-to-Port Arrowheads (▸) */}
          {graph.edges.map((edge) => {
            const route = layout.edges[edge.id];
            if (!route || route.points.length < 2) return null;

            const isSelectedIncoming = selectedIncomingEdgeIds.has(edge.id);
            const isSelectedOutgoing = selectedOutgoingEdgeIds.has(edge.id);
            const isSelectedEdge = isSelectedIncoming || isSelectedOutgoing;

            const isActive = activeEdgeIds.has(edge.id);
            const isCompleted = completedEdgeIds.has(edge.id);
            const isEvidenceEdge =
              edge.id === 'e-context-answer' || edge.relationship === 'reference';

            if (
              edge.id === 'e-context-answer' &&
              !isActive &&
              !isCompleted &&
              !isSelectedEdge &&
              cameraMode !== 'overview'
            ) {
              return null;
            }

            const { firstSegment, secondSegment } = splitEdgeAtBoundaryPort(
              route.points,
              route.boundaryPort
            );

            // Color every flow line according to the color of the node that is outputting it
            const sourceNode = graph.nodes.find((n) => n.id === edge.source);
            const sourceColorKey: NodeAccentColor = isEvidenceEdge
              ? 'amber'
              : sourceNode?.accentColor ?? 'sky';
            const sourceHex = activePalette[sourceColorKey] ?? '#56A8F5';
            const sourceArrowMarker = `url(#port-arrow-color-${sourceColorKey})`;

            let strokeColor = sourceHex;
            let strokeWidth = 1.65;
            let markerEnd = sourceArrowMarker;
            let opacity = selectedNodeId ? 0.2 : 0.46;

            if (isSelectedIncoming) {
              strokeColor = sourceHex;
              strokeWidth = isMacroBlueprint ? 3.0 : 2.3;
              markerEnd = sourceArrowMarker;
              opacity = 1;
            } else if (isSelectedOutgoing) {
              strokeColor = sourceHex;
              strokeWidth = isMacroBlueprint ? 3.0 : 2.3;
              markerEnd = sourceArrowMarker;
              opacity = 1;
            } else if (isActive) {
              strokeColor = sourceHex;
              strokeWidth = isMacroBlueprint ? 2.8 : 2.2;
              markerEnd = sourceArrowMarker;
              opacity = selectedNodeId ? 0.45 : 1;
            } else if (isCompleted) {
              strokeColor = sourceHex;
              strokeWidth = isMacroBlueprint ? 2.1 : 1.75;
              markerEnd = sourceArrowMarker;
              opacity = selectedNodeId ? 0.35 : 0.85;
            }

            const ioBadgeText = isSelectedIncoming
              ? `Input: ${edge.label}`
              : isSelectedOutgoing
              ? `Output: ${edge.label}`
              : '';
            const ioBadgeWidth = Math.max(108, ioBadgeText.length * 6.5 + 18);

            return (
              <g key={edge.id} opacity={opacity}>
                <path
                  d={buildOrthogonalPath(firstSegment)}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={edge.relationship === 'reference' ? '6 4' : undefined}
                  markerEnd={markerEnd}
                />

                {secondSegment && (
                  <path
                    d={buildOrthogonalPath(secondSegment)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={edge.relationship === 'reference' ? '6 4' : undefined}
                    markerEnd={markerEnd}
                  />
                )}

                {route.boundaryPort && (
                  <rect
                    x={route.boundaryPort.x - 5}
                    y={route.boundaryPort.y - 5}
                    width={10}
                    height={10}
                    rx={2}
                    fill={strokeColor}
                    stroke="#1E1F22"
                    strokeWidth={1.2}
                  />
                )}

                {!(
                  route.junctionPoint &&
                  Math.abs(route.sourcePort.x - route.junctionPoint.x) < 2 &&
                  Math.abs(route.sourcePort.y - route.junctionPoint.y) < 2
                ) && (
                  <rect
                    x={route.sourcePort.x - 4.5}
                    y={route.sourcePort.y - 4.5}
                    width={9}
                    height={9}
                    rx={1.5}
                    fill={strokeColor}
                    stroke="#1E1F22"
                    strokeWidth={1}
                  />
                )}

                <rect
                  x={route.targetPort.x - 4.5}
                  y={route.targetPort.y - 4.5}
                  width={9}
                  height={9}
                  rx={1.5}
                  fill={strokeColor}
                  stroke="#1E1F22"
                  strokeWidth={1}
                />

                {route.junctionPoint && (
                  <circle
                    cx={route.junctionPoint.x}
                    cy={route.junctionPoint.y}
                    r={4.5}
                    fill={strokeColor}
                    stroke="#1E1F22"
                    strokeWidth={1.2}
                  />
                )}

                {isSelectedEdge && (
                  <g
                    transform={`translate(${
                      route.labelPosition.x - ioBadgeWidth / 2
                    }, ${route.labelPosition.y - 12})`}
                    className="pointer-events-none"
                  >
                    <rect
                      width={ioBadgeWidth}
                      height={22}
                      rx={4}
                      fill="#2B2D30"
                      stroke={strokeColor}
                      strokeWidth={1.5}
                    />
                    <text
                      x={ioBadgeWidth / 2}
                      y={14.5}
                      textAnchor="middle"
                      fill={strokeColor}
                      fontSize={10}
                      fontWeight="600"
                      className="font-mono"
                    >
                      {ioBadgeText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 3. Render Moving Data Packets Along Active Wires */}
          {activePackets.map((pkt) => {
            const boxW = Math.max(116, pkt.payload.length * 6.8 + 20);
            const boxH = 24;
            const pktEdge = graph.edges.find((e) => e.id === pkt.edgeId);
            const pktSourceNode = pktEdge
              ? graph.nodes.find((n) => n.id === pktEdge.source)
              : undefined;
            const pktColor = pktSourceNode
              ? activePalette[pktSourceNode.accentColor] ?? '#56A8F5'
              : isMacroBlueprint
              ? '#38BDF8'
              : '#56A8F5';
            return (
              <g
                key={pkt.id}
                transform={`translate(${pkt.x.toFixed(1)}, ${pkt.y.toFixed(1)})`}
                className="pointer-events-none"
              >
                <circle r={5.5} fill={pktColor} stroke="#1E1F22" strokeWidth={2} />
                <g transform={`translate(${-boxW / 2}, -30)`}>
                  <rect
                    width={boxW}
                    height={boxH}
                    rx={4}
                    fill="#2B2D30"
                    stroke={pktColor}
                    strokeWidth={1.4}
                  />
                  <text
                    x={boxW / 2}
                    y={15.5}
                    textAnchor="middle"
                    fill="#DFE1E5"
                    fontSize={10.5}
                    fontWeight="600"
                    className="font-mono"
                  >
                    {pkt.payload}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Bottom Floating JetBrains Narration Dock */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 z-10 flex justify-center">
        <div className="pointer-events-auto max-w-4xl w-full bg-[#2B2D30]/95 border border-[#393B40] rounded-md px-3.5 py-2 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-xs mb-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <span
                className="font-mono font-semibold text-[#56A8F5] truncate min-w-0 max-w-full"
                title={
                  miniModeActive && miniStep
                    ? miniStep.title
                    : activeSubFunction
                    ? `${activeSubFunction.functionName.split('(')[0]}() · Beat ${currentStep.beatNumber}/${totalStepsCount}: ${currentStep.title}`
                    : `Beat ${currentStep.beatNumber}/${totalStepsCount} · ${currentStep.title}`
                }
              >
                {miniModeActive && miniStep
                  ? miniStep.title
                  : activeSubFunction
                  ? `${activeSubFunction.functionName.split('(')[0]}() · Beat ${currentStep.beatNumber}/${totalStepsCount}: ${currentStep.title}`
                  : `Beat ${currentStep.beatNumber}/${totalStepsCount} · ${currentStep.title}`}
              </span>
              <span className="text-[#4E5157] hidden md:inline shrink-0">·</span>
              <span className="text-[#868A91] truncate hidden md:inline min-w-0 flex-1">
                {miniModeActive ? 'Tracing context to answer' : currentStep.question}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentStep.drillDownFunctionId && (
                <button
                  type="button"
                  onClick={() =>
                    currentStep.drillDownFunctionId &&
                    onDrillIntoFunction(currentStep.drillDownFunctionId)
                  }
                  className="inline-flex items-center gap-1 font-mono text-[11px] px-2.5 py-0.5 rounded border border-[#4E5157] bg-[#35373B] text-[#DFE1E5] hover:bg-[#3E4045] hover:border-[#3574F0] transition-colors cursor-pointer"
                >
                  <CornerDownRight className="w-3 h-3 text-[#56A8F5]" />
                  <span>Inspect Function ↘</span>
                </button>
              )}

              {(currentStep.beatNumber >= 6 || activeSubFunction?.id === 'fn-generate') && (
                <button
                  type="button"
                  onClick={onCitationClick}
                  className="inline-flex items-center gap-1 font-mono text-[11px] px-2.5 py-0.5 rounded border border-[#425C48] bg-[#202922] text-[#6AAB73] hover:bg-[#2A382D] transition-colors cursor-pointer"
                >
                  <span>[verify-source]</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs sm:text-[13px] text-[#BCBEC4] leading-snug line-clamp-3 sm:line-clamp-2 break-words">
            {miniModeActive && miniStep ? miniStep.caption : narrationText || currentStep.narration}
          </p>
        </div>
      </div>

      {/* Inspect Preview Function Archetypes Reference & Reactive Lifecycle Modal */}
      <InspectPreviewDocsModal
        isOpen={archetypeDocsOpen}
        onClose={() => setArchetypeDocsOpen(false)}
      />
    </div>
  );
};
