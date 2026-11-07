import {normalizeVisual} from '../visualData';
import {normalizeGraphId,interpolatePointOnPolyline} from '../layout/elkLayout';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Network, AudioLines, Play, Terminal, Workflow,
  Palette, Hammer, Package, Eye, Cog, Mic, Activity, Globe, List, Search, MonitorPlay,
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
import {
  ActivePacketFrame,
  EvaluatedNodeFrame,
} from '../timeline/evaluateTimeline';
import {
  ArchitectureGraph,
  CameraState,
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
  graph: ArchitectureGraph;
  layout: ComputedGraphLayout;
  steps: Step[];
  currentStep: Step;
  flowTime?:number;
  captionText?: string;
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

const ACCENT_HEX: Record<NodeAccentColor, string> = {
  sky: '#38BDF8',
  amber: '#E0BE72',
  emerald: '#34D399',
  teal: '#2DD4BF',
  rose: '#FB7185',
  violet: '#A78BFA',
  mint: '#7BD3B0',
};

function renderLucideIcon(iconName: string, colorHex: string, size = 22) {
  const props = { width: size, height: size, color: colorHex, strokeWidth: 2 };
  switch (iconName) {
    case 'Palette': return <Palette {...props} />;
    case 'Hammer': return <Hammer {...props} />;
    case 'Package': return <Package {...props} />;
    case 'Eye': return <Eye {...props} />;
    case 'Cog': return <Cog {...props} />;
    case 'Mic': return <Mic {...props} />;
    case 'Activity': return <Activity {...props} />;
    case 'Globe': return <Globe {...props} />;
    case 'List': return <List {...props} />;
    case 'Search': return <Search {...props} />;
    case 'MonitorPlay': return <MonitorPlay {...props} />;
    case 'CornerDownRight': return <CornerDownRight {...props} />;
    case 'Network': return <Network {...props} />;
    case 'AudioLines': return <AudioLines {...props} />;
    case 'Play': return <Play {...props} />;
    case 'Terminal': return <Terminal {...props} />;
    case 'Workflow': return <Workflow {...props} />;
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

interface InternalChildBlock {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  iconName: string;
  color: NodeAccentColor;
  hasLeftCombinerBar?: boolean;
  combinerPortsY?: number[];
  drillDownFunctionId?: FunctionLessonId;
  isDropBranch?: boolean;
  showInputPort?: boolean;
  showOutputPort?: boolean;
  highlight?: boolean;
}

interface CompoundContainerSpec {
  leftPortsY: number[];
  rightPortsY: number[];
  children: InternalChildBlock[];
  internalWires: { points: { x: number; y: number }[]; id?: string; active?: boolean }[];
}

/**
 * Strict 100% Port-Aligned Compound Container Definitions for BOTH Level-0 and Level-1.
 */
function genericCompoundSpec(
  node: GraphNode,
  width: number,
  height: number,
  childLayout?: Record<string, { x: number; y: number; width: number; height: number }>,
  focusOperations?: Set<string>,
  activeEdges?: Set<string>
): CompoundContainerSpec {
  const operations = node.children || [];
  const cols = Math.min(3, Math.max(1, operations.length));
  const rows = Math.max(1, Math.ceil(operations.length / cols));
  const pad = 14;
  const gap = 10;
  const childW = Math.max(60, (width - pad * 2 - gap * (cols - 1)) / cols);
  const childH = Math.max(44, (height - pad * 2 - gap * (rows - 1)) / rows);
  const useChildLayout = childLayout;
  const children: InternalChildBlock[] = operations.map((operation, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const box = useChildLayout ? childLayout?.[operation.id] : undefined;
    return {
      id: operation.id,
      label: operation.label,
      sublabel: operation.value || operation.description || '',
      x: box?.x ?? pad + col * (childW + gap),
      y: box?.y ?? pad + row * (childH + gap),
      w: box?.width ?? childW,
      h: box?.height ?? childH,
      iconName: operation.icon || 'Layers',
      color: operation.color,
      highlight: focusOperations?.has(operation.id) || false,
    };
  });
  const childById = Object.fromEntries(children.map(child => [child.id, child]));
  const wire = (child: InternalChildBlock, next: InternalChildBlock) => {
    const start = { x: child.x + child.w, y: child.y + child.h / 2 };
    const end = { x: next.x, y: next.y + next.h / 2 };
    if (Math.abs(start.y - end.y) < 1) return { points: [start, end] };
    return {
      points: [
        start,
        { x: start.x + gap / 2, y: start.y },
        { x: start.x + gap / 2, y: end.y },
        end,
      ],
    };
  };
  const declaredWires = (node.connections || []).flatMap(connection => {
    const from = childById[connection.from.child];
    const to = childById[connection.to.child];
    return from && to ? [{ ...wire(from, to), id: connection.id, active: activeEdges?.has(connection.id) || false }] : [];
  });
  const internalWires = declaredWires;
  const portYs = (ports?: { id: string }[]) => {
    const count = ports?.length || 0;
    if (!count) return [height / 2];
    return Array.from({ length: count }, (_, index) => pad + ((height - pad * 2) * (index + 1)) / (count + 1));
  };
  return {
    leftPortsY: portYs(node.ports?.inputs),
    rightPortsY: portYs(node.ports?.outputs),
    children,
    internalWires,
  };
}

const COMPOUND_CHILDREN: Record<string, CompoundContainerSpec> = {
  embed: {
    leftPortsY: [86],
    rightPortsY: [86],
    children: [
      {
        id: 'c-tok',
        label: 'tokenize()',
        sublabel: 'split words',
        x: 36,
        y: 52,
        w: 88,
        h: 68,
        iconName: 'Scissors',
        color: 'sky',
      },
      {
        id: 'c-pool',
        label: 'encode_pool()',
        sublabel: 'IDs → mean vec',
        x: 166,
        y: 52,
        w: 88,
        h: 68,
        iconName: 'Layers',
        color: 'violet',
      },
      {
        id: 'c-norm',
        label: 'l2_normalize()',
        sublabel: '[0.127, -0.466…]',
        x: 296,
        y: 52,
        w: 88,
        h: 68,
        iconName: 'Binary',
        color: 'amber',
      },
    ],
    internalWires: [
      { points: [{ x: 5, y: 86 }, { x: 32, y: 86 }] },
      { points: [{ x: 128, y: 86 }, { x: 162, y: 86 }] },
      { points: [{ x: 258, y: 86 }, { x: 292, y: 86 }] },
      { points: [{ x: 388, y: 86 }, { x: 411, y: 86 }] },
    ],
  },

  retrieve: {
    leftPortsY: [66, 120],
    rightPortsY: [86],
    children: [
      {
        id: 'c-score',
        label: 'score_dot()',
        sublabel: '0.89 · 0.64 · 0.18',
        x: 46,
        y: 46,
        w: 94,
        h: 92,
        iconName: 'Gauge',
        color: 'teal',
        hasLeftCombinerBar: true,
        combinerPortsY: [66, 120],
      },
      {
        id: 'c-sort',
        label: 'sorted()',
        sublabel: 'reverse=True',
        x: 184,
        y: 52,
        w: 92,
        h: 68,
        iconName: 'ArrowUpDown',
        color: 'violet',
      },
      {
        id: 'c-top2',
        label: 'ranked[:2]',
        sublabel: 'keep 2 docs',
        x: 320,
        y: 52,
        w: 96,
        h: 68,
        iconName: 'Filter',
        color: 'emerald',
      },
      {
        id: 'c-drop',
        label: 'Dropped',
        sublabel: '✕ shipping',
        x: 436,
        y: 124,
        w: 68,
        h: 52,
        iconName: 'XCircle',
        color: 'rose',
      },
    ],
    internalWires: [
      { points: [{ x: 5, y: 66 }, { x: 34, y: 66 }] },
      { points: [{ x: 5, y: 120 }, { x: 34, y: 120 }] },
      { points: [{ x: 144, y: 86 }, { x: 180, y: 86 }] },
      { points: [{ x: 280, y: 86 }, { x: 316, y: 86 }] },
      { points: [{ x: 420, y: 86 }, { x: 515, y: 86 }] },
      {
        points: [
          { x: 368, y: 120 },
          { x: 368, y: 150 },
          { x: 432, y: 150 },
        ],
      },
    ],
  },

  context: {
    leftPortsY: [86],
    rightPortsY: [86],
    children: [
      {
        id: 'c-tag',
        label: 'TagSourceID',
        sublabel: 'f"[{m.id}]"',
        x: 38,
        y: 52,
        w: 112,
        h: 68,
        iconName: 'Tag',
        color: 'amber',
      },
      {
        id: 'c-join',
        label: 'JoinChunks',
        sublabel: '"\\n\\n".join()',
        x: 200,
        y: 52,
        w: 114,
        h: 68,
        iconName: 'Layers',
        color: 'rose',
      },
    ],
    internalWires: [
      { points: [{ x: 5, y: 86 }, { x: 34, y: 86 }] },
      { points: [{ x: 154, y: 86 }, { x: 196, y: 86 }] },
      { points: [{ x: 318, y: 86 }, { x: 351, y: 86 }] },
    ],
  },

  prompt: {
    leftPortsY: [56, 112],
    rightPortsY: [86],
    children: [
      {
        id: 'c-rules',
        label: 'SystemRules',
        sublabel: 'cite [ID]',
        x: 38,
        y: 78,
        w: 100,
        h: 68,
        iconName: 'ShieldCheck',
        color: 'emerald',
      },
      {
        id: 'c-merge',
        label: 'PromptAssembler',
        sublabel: 'Rules+Ctx+Q',
        x: 196,
        y: 42,
        w: 118,
        h: 88,
        iconName: 'FileCode2',
        color: 'amber',
        hasLeftCombinerBar: true,
        combinerPortsY: [56, 112],
      },
    ],
    internalWires: [
      { points: [{ x: 5, y: 56 }, { x: 184, y: 56 }] },
      { points: [{ x: 5, y: 112 }, { x: 34, y: 112 }] },
      { points: [{ x: 142, y: 112 }, { x: 184, y: 112 }] },
      { points: [{ x: 318, y: 86 }, { x: 351, y: 86 }] },
    ],
  },

  model: {
    leftPortsY: [86],
    rightPortsY: [86],
    children: [
      {
        id: 'c-attend',
        label: 'attend_context()',
        sublabel: '"30 days"',
        x: 26,
        y: 52,
        w: 80,
        h: 68,
        iconName: 'SearchCheck',
        color: 'teal',
      },
      {
        id: 'c-decode',
        label: 'decode_and_cite()',
        sublabel: 'reply + [id]',
        x: 132,
        y: 52,
        w: 78,
        h: 68,
        iconName: 'Sparkles',
        color: 'violet',
      },
    ],
    internalWires: [
      { points: [{ x: 5, y: 86 }, { x: 22, y: 86 }] },
      { points: [{ x: 110, y: 86 }, { x: 128, y: 86 }] },
      { points: [{ x: 214, y: 86 }, { x: 231, y: 86 }] },
    ],
  },
};

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
  layout,
  steps: _steps,
  currentStep,
  flowTime=0,
  captionText,
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
  onJumpToStep: _onJumpToStep,
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 920, height: 560 });
  const [isDragging, setIsDragging] = useState(false);
  const didMoveDuringDragRef = useRef(false);
  const bannerRef=useRef<HTMLDivElement>(null);
  const [bannerHeight,setBannerHeight]=useState(0);
  useEffect(()=>{const el=bannerRef.current;if(!el){setBannerHeight(0);return;}const measure=()=>setBannerHeight(el.getBoundingClientRect().height);measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[activeSubFunction?.id,miniModeActive]);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
  } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
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

  const isMacroBlueprint = normalizeGraphId(graph.id)==='qweeps-rag-4col-architecture';
  const isGenerated=graph.id.startsWith('generated-');
  const isCompoundMacro = isMacroBlueprint || (isGenerated && graph.nodes.some((node)=>Boolean(node.compoundContainer||node.children?.length)));
  const normalizedGraphId = (graph.id || '').replace(/^(generated-)+/, '');
  const isLevel2Flowchart =
    activeSubFunction?.view ? activeSubFunction.view==='visual' :
    normalizedGraphId.startsWith('sub-graph-l2-') || Boolean(activeSubFunction?.parentFunctionId);

  const enclosure=layout.systemBounds;
  const compactOverview=isGenerated&&graph.systemContract&&camera.zoom<.55;
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#0B1717] overflow-hidden select-none flex flex-col"
    >
      {/* Hierarchy Level 1 / Level 2 Call-Stack Breadcrumb Banner */}
      {activeSubFunction && !miniModeActive && (
        <div ref={bannerRef} className="relative z-20 mx-3 mt-2 px-3 py-2 rounded border border-[#7BD3B0] bg-[#142B25]/95 flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onReturnToParentFunction}
              className="px-2.5 py-1 rounded border border-[#E0BE72] bg-[#E0BE72] text-[#0B1717] hover:bg-[#E0BE72]/90 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>
                {activeSubFunction.parentFunctionId
                  ? `Back to ${activeSubFunction.parentFunctionName||activeSubFunction.parentFunctionId.replace('fn-', '')}`
                  : `Back to Full System Blueprint (${
                      savedMacroPlayhead !== null ? `${savedMacroPlayhead.toFixed(1)}s` : 'L0'
                    })`}
              </span>
            </button>

            {activeSubFunction.parentFunctionId && (
              <button
                type="button"
                onClick={onReturnToMacroPipeline}
                className="px-2 py-1 rounded border border-[#486356] bg-[#0B1717] text-[#B5C5BD] hover:text-[#EEF3E9] text-xs font-mono transition-colors cursor-pointer shrink-0"
              >
                {isGenerated?'Full system':'L0: answer.py'}
              </button>
            )}

            <span className="text-xs text-[#B5C5BD] hidden sm:inline">›</span>
            <span className="text-xs font-mono text-[#7BD3B0] font-semibold truncate">
              {activeSubFunction.view==='source'?'Source: ':activeSubFunction.parentFunctionId ? 'Inner Function: ' : 'Function: '}
              {activeSubFunction.functionName}
            </span>
            <span className="text-[11px] font-mono text-[#B5C5BD] hidden lg:inline">
              ({activeSubFunction.fileName} · {activeSubFunction.codebaseRange})
            </span>
          </div>

          <div className="text-[11px] font-mono text-[#E0BE72] shrink-0">
            {activeSubFunction.view==='source'?`Source inspection · ${activeSubFunction.steps.length} steps · declarations and possible paths`:activeSubFunction.parentFunctionId
              ? `Level 2 Inner Logic (${activeSubFunction.steps.length} beats · ←/→ Arrow keys)`
              : `Level 1 Logic-per-Beat (${activeSubFunction.steps.length} beats · click node for I/O or Inspect Function ↘)`}
          </div>
        </div>
      )}

      {/* If Mini-Explanation is active, render top Breadcrumb Banner */}
      {miniModeActive && miniStep && (
        <div ref={bannerRef} className="relative z-20 mx-3 mt-2 px-3 py-2 rounded border border-[#E0BE72] bg-[#142B25]/95 flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onExitMiniMode}
              className="px-2.5 py-1 rounded border border-[#E0BE72] bg-[#0B1717] text-[#E0BE72] hover:bg-[#E0BE72] hover:text-[#0B1717] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Main Lesson (saved state)</span>
            </button>
            <span className="text-xs text-[#B5C5BD] hidden sm:inline">/</span>
            <span className="text-xs font-semibold text-[#EEF3E9] truncate">
              {miniStep.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={miniStepIndex === 0}
              onClick={() => onChangeMiniStep(Math.max(0, miniStepIndex - 1))}
              className="px-2 py-1 rounded border border-[#486356] bg-[#0B1717] text-xs text-[#EEF3E9] disabled:opacity-40 hover:border-[#7BD3B0] cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="font-mono text-xs text-[#E0BE72] px-1.5">
              {miniStepIndex + 1}/{miniTotalSteps}
            </span>
            <button
              type="button"
              disabled={miniStepIndex >= miniTotalSteps - 1}
              onClick={() => onChangeMiniStep(Math.min(miniTotalSteps - 1, miniStepIndex + 1))}
              className="px-2 py-1 rounded border border-[#486356] bg-[#0B1717] text-xs text-[#EEF3E9] disabled:opacity-40 hover:border-[#7BD3B0] cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Canvas Controls & Minimap Overlay */}
      <div
        className="absolute left-3 right-3 z-10 flex items-start justify-between gap-2 pointer-events-none"
        style={{top:bannerHeight?bannerHeight+16:10}}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-[#142B25]/95 border border-[#486356] rounded p-1 shadow-md">
          <button
            type="button"
            onClick={onFitOverview}
            className={`min-h-[34px] px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E0BE72] ${
              cameraMode === 'overview'
                ? 'bg-[#E0BE72] text-[#0B1717] font-semibold'
                : 'text-[#EEF3E9] hover:bg-[#0B1717] hover:text-[#7BD3B0]'
            }`}
            title="Show full compound architecture blueprint"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Overview / Fit All</span>
          </button>

          {cameraMode !== 'follow' && (
            <button
              type="button"
              onClick={onResumeFollow}
              className="min-h-[34px] px-2.5 py-1 rounded text-xs font-medium bg-[#7BD3B0] text-[#0B1717] hover:bg-[#7BD3B0]/90 flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#E0BE72]"
              title="Follow active beat camera"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Follow Beat</span>
            </button>
          )}

          <div className="h-4 w-[1px] bg-[#486356]/70 mx-0.5" />

          <button
            type="button"
            onClick={() => handleZoomBy(1.18)}
            className="min-h-[34px] min-w-[34px] px-2 py-1 rounded text-xs text-[#EEF3E9] hover:bg-[#0B1717] hover:text-[#E0BE72] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleZoomBy(0.84)}
            className="min-h-[34px] min-w-[34px] px-2 py-1 rounded text-xs text-[#EEF3E9] hover:bg-[#0B1717] hover:text-[#E0BE72] flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-[11px] text-[#B5C5BD] px-1.5 hidden sm:inline">
            {Math.round(camera.zoom * 100)}%
          </span>
        </div>

        {/* Interactive Minimap */}
        <div
          className="pointer-events-auto bg-[#142B25]/95 border border-[#486356] rounded p-1.5 shadow-md hidden sm:block"
          title="Click to toggle Overview / Fit All"
        >
          <svg
            width={minimapW}
            height={minimapH}
            onClick={() => (cameraMode === 'overview' ? onResumeFollow() : onFitOverview())}
            className="bg-[#0B1717] rounded border border-[#486356]/60 cursor-pointer block"
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
                    stroke={isAct ? '#38BDF8' : '#486356'}
                    strokeWidth={isAct ? 1.5 : 0.8}
                  />
                );
              })}

              {graph.nodes.map((n) => {
                const pos = layout.nodes[n.id];
                if (!pos) return null;
                const nf = nodeFrames[n.id];
                const hex = ACCENT_HEX[n.accentColor] ?? '#7BD3B0';
                return (
                  <rect
                    key={n.id}
                    x={pos.x * scaleMinimap}
                    y={pos.y * scaleMinimap}
                    width={Math.max(8, pos.width * scaleMinimap)}
                    height={Math.max(5, pos.height * scaleMinimap)}
                    rx={1}
                    fill={nf?.isFocused ? hex : '#142B25'}
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
                fill="rgba(123, 211, 176, 0.08)"
                stroke="#E0BE72"
                strokeWidth={1}
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Main Interactive 2D SVG Compound Block & Port Diagram */}
      <svg
        ref={svgRef}
        className={`live-stage-svg prototype-diagram w-full h-full flex-1 block ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        role="region"
        aria-label={isGenerated?"Interactive architecture compound block diagram":"Interactive RAG compound block diagram"}
      >
        <defs>
          <marker
            id="port-arrow-inactive"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#7A9488" />
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
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#7BD3B0" />
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
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#38BDF8" />
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
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#34D399" />
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
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#E0BE72" />
          </marker>
        </defs>

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
          <g>
            <text
              x={enclosure?.x ?? (isCompoundMacro ? 236 : isLevel2Flowchart ? 40 : 240)}
              y={enclosure ? enclosure.y - 10 : 28}
              fill={isCompoundMacro ? '#B5C5BD' : '#7BD3B0'}
              fontSize={13.5}
              fontWeight="700"
              className="font-sans"
            >
              {isMacroBlueprint
                ? 'answer(question) — RAG Pipeline System (Click any block to trace its Input/Output & Beats, or click Inspect Function ↘)'
                : isCompoundMacro
                ? `${graph.nodes.find(n=>n.id===graph.systemNodeId)?.label||graph.title} — System`
                : isLevel2Flowchart
                ? `${activeSubFunction?.functionName} — Dynamic Visual Architecture (${activeSubFunction?.summary})`
                : isGenerated?graph.title:`${activeSubFunction?.functionName} — Function Logic System (${activeSubFunction?.fileName})`}
            </text>
            <rect
              x={enclosure?.x ?? (isCompoundMacro ? 236 : isLevel2Flowchart ? 40 : 240)}
              y={enclosure?.y ?? (isCompoundMacro ? 38 : 44)}
              width={enclosure?.width ?? (isCompoundMacro ? 1228 : isLevel2Flowchart ? 1800 : 1600)}
              height={enclosure?.height ?? (isCompoundMacro ? 568 : 620)}
              fill="rgba(16, 33, 29, 0.38)"
              stroke={graph.systemNodeId&&nodeFrames[graph.systemNodeId]?.isActive?'#E0BE72':isCompoundMacro ? '#5E7A6D' : '#7BD3B0'}
              strokeWidth={1.6}
            />
          </g>

          {/* 1. Render Nodes FIRST so Edge Ports & Arrowheads Sit Cleanly On Top of Walls */}
          {graph.nodes.map((node) => {
            if(node.id===graph.systemNodeId)return null;
            const pos = layout.nodes[node.id];
            if (!pos) return null;
            const overviewTitleChars=Math.max(5,Math.floor((pos.width*camera.zoom-(node.drillDownFunctionId?20:0))/5.5));

            const visual=isLevel2Flowchart && node.customVisual
              ? (isGenerated?normalizeVisual(node.customVisual,node.defaultPreview,node.accentColor):node.customVisual)
              : undefined;
            const frame = nodeFrames[node.id];
            const isSelected = selectedNodeId === node.id || Boolean(node.children?.some(child=>child.id===selectedNodeId));
            const isInputSourceForSelected = selectedInputNodeIds.has(node.id);
            const isOutputTargetForSelected = selectedOutputNodeIds.has(node.id);
            const isRelatedToSelected =
              isSelected || isInputSourceForSelected || isOutputTargetForSelected;

            const isFocused = frame?.isFocused ?? false;
            const isActive = frame?.isActive ?? false;
            const isDimmed = frame?.isDimmed ?? false;
            const hex = ACCENT_HEX[node.accentColor] ?? '#7BD3B0';

            const focusOperations = new Set(currentStep.focusOperations || []);
            const computedCompound = layout.compounds?.[node.id] ?? node.compoundContainer;
            const compoundSpec = computedCompound
              ? {
                  leftPortsY: computedCompound.leftPortsY,
                  rightPortsY: computedCompound.rightPortsY,
                  children: computedCompound.children.map((child) => ({
                    ...child,
                    highlight: focusOperations.has(child.id),
                  })),
                  internalWires: computedCompound.internalWires.map((wire) => ({
                    ...wire,
                    active: Boolean(wire.id && activeEdgeIds.has(wire.id)),
                  })),
                }
              : node.children?.length
              ? genericCompoundSpec(node, pos.width, pos.height, layout.children?.[node.id], focusOperations, activeEdgeIds)
              : graph.id==='qweeps-rag-4col-architecture'?COMPOUND_CHILDREN[node.id]:undefined;
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
            const isLevel1FunctionView = Boolean(activeSubFunction) && !isLevel2Flowchart;
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
            const liveValue = (node.defaultPreview || visual?.lines?.join(' · ') || '').replace(/\s+/g, ' ').trim();
            const valueText = liveValue.length > 58 ? `${liveValue.slice(0, 56)}…` : liveValue;
            const nodeOpacity = selectedNodeId
              ? isRelatedToSelected
                ? 1
                : 0.35
              : isDimmed && cameraMode !== 'overview'
              ? 0.55
              : 1;

            const borderColor = isSelected
              ? '#E0BE72'
              : isInputSourceForSelected
              ? '#38BDF8'
              : isOutputTargetForSelected
              ? '#34D399'
              : isActive || isFocused
              ? hex
              : '#486356';
            const borderWidth = isSelected
              ? 3.2
              : isInputSourceForSelected || isOutputTargetForSelected
              ? 2.8
              : isActive || isFocused
              ? 2.4
              : 1.4;

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
                {/* LABEL OUTSIDE & ABOVE THE BLOCK (No subtitle suffix when Inspect Function button is present, avoiding any overlap) */}
                <text
                  x={0}
                  y={compactOverview?-7/camera.zoom:-10}
                  fill={
                    isSelected
                      ? '#E0BE72'
                      : isInputSourceForSelected
                      ? '#38BDF8'
                      : isOutputTargetForSelected
                      ? '#34D399'
                      : isActive || isFocused
                      ? hex
                      : '#B5C5BD'
                  }
                  fontSize={compactOverview?10/camera.zoom:13}
                  fontWeight="700"
                  className="font-sans"
                >
                  {node.stepBadge ? `${node.stepBadge} ` : ''}
                  {compactOverview&&node.label.length>overviewTitleChars?node.label.slice(0,overviewTitleChars-1)+'…':node.label}
                  {!compactOverview&&!node.drillDownFunctionId && node.subtitle && (
                    <tspan
                      fill="#8AA399"
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
                      rx={3}
                      fill={
                        isSelected
                          ? '#E0BE72'
                          : isInputSourceForSelected
                          ? '#38BDF8'
                          : '#34D399'
                      }
                    />
                    <text
                      x={Math.min(pos.width, 196) / 2}
                      y={13}
                      textAnchor="middle"
                      fill="#0B1717"
                      fontSize={10}
                      fontWeight="800"
                      className="font-mono"
                    >
                      {isSelected
                        ? 'SELECTED BLOCK'
                        : isInputSourceForSelected
                        ? '⬅ INPUT SOURCE'
                        : '➔ OUTPUT TARGET'}
                    </text>
                  </g>
                )}

                {/* Show "Inspect Function ↘" pill on ANY node with drillDownFunctionId */}
                {node.drillDownFunctionId && (
                  <g
                    transform={`translate(${pos.width - (compactOverview?16/camera.zoom:122)}, ${compactOverview?-21/camera.zoom:-25})`}
                    role="button" tabIndex={0}
                    aria-label={`${node.sourceKind==='function'||node.structure!=='source'?'Inspect Function':'Inspect Source'} ${node.label}`}
                    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onDrillIntoFunction(node.drillDownFunctionId!);}}}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (node.drillDownFunctionId) {
                        onDrillIntoFunction(node.drillDownFunctionId);
                      }
                    }}
                  >
                    <rect
                      width={compactOverview?14/camera.zoom:122}
                      height={compactOverview?14/camera.zoom:19}
                      rx={3}
                      fill="#142B25"
                      stroke={hex}
                      strokeWidth={1.2}
                    />
                    <text
                      x={compactOverview?7/camera.zoom:61}
                      y={compactOverview?10/camera.zoom:13}
                      textAnchor="middle"
                      fill={hex}
                      fontSize={compactOverview?10/camera.zoom:10}
                      fontWeight="700"
                      className="font-mono"
                    >
                      {compactOverview?'↘':node.structure==='source'&&node.sourceKind!=='function'?'Inspect Source ↘':'Inspect Function ↘'}
                    </text>
                  </g>
                )}

                {/* Main Solid Dark Block / Compound Container Enclosure */}
                <rect
                  width={pos.width}
                  height={pos.height}
                  rx={visual ? 12 : 3}
                  fill="#0E1D1A"
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                />

                {compoundSpec ? (
                  /* COMPOUND CONTAINER: Render Wall Port Squares (■), Internal Orthogonal Wires (▸), & Nested Child Logic Blocks! */
                  <g>
                    {/* Compound Container Left Boundary Port Squares (■) on Wall x=0 */}
                    {compoundSpec.leftPortsY.map((py, idx) => (
                      <rect
                        key={`lp-${idx}`}
                        aria-label={node.structure==='source'?'Referenced by':'Input port'}
                        x={-5}
                        y={py - 5}
                        width={10}
                        height={10}
                        fill={isActive ? hex : '#6C877A'}
                        stroke="#0B1717"
                        strokeWidth={1}
                      />
                    ))}

                    {/* Compound Container Right Boundary Port Squares (■) on Wall x=pos.width */}
                    {compoundSpec.rightPortsY.map((py, idx) => (
                      <rect
                        key={`rp-${idx}`}
                        aria-label={node.structure==='source'?'References':'Output port'}
                        x={pos.width - 5}
                        y={py - 5}
                        width={10}
                        height={10}
                        fill={isActive ? hex : '#6C877A'}
                        stroke="#0B1717"
                        strokeWidth={1}
                      />
                    ))}

                    {/* Internal Orthogonal Wires connecting Wall Ports (■) -> Child Block Ports (▸■) -> Exit Wall Port (▸■) */}
                    {compoundSpec.internalWires.map((w, wi) => (
                      <path
                        key={wi}
                        d={buildOrthogonalPath(w.points)}
                        fill="none"
                        stroke={w.active || isActive ? '#38BDF8' : '#6C877A'}
                        strokeWidth={w.active ? 2.3 : 1.7}
                        markerEnd={
                          w.active || isActive
                            ? 'url(#port-arrow-completed)'
                            : 'url(#port-arrow-inactive)'
                        }
                      />
                    ))}

                    {/* Nested Child Logic Blocks */}
                    {compoundSpec.children.map((child) => {
                      const cHex = ACCENT_HEX[child.color] ?? hex;
                      const inPorts = child.combinerPortsY ?? [child.y + child.h / 2];
                      const outPortY = child.hasLeftCombinerBar ? 86 - child.y : child.h / 2;

                      return (
                        <g
                          key={child.id}
                          transform={`translate(${child.x}, ${child.y})`}
                          role={isGenerated ? "button" : undefined}
                          tabIndex={isGenerated ? 0 : undefined}
                          aria-label={isGenerated ? `Inspect ${child.label}` : undefined}
                          onClick={isGenerated ? e=>{e.stopPropagation();if(child.drillDownFunctionId)onDrillIntoFunction(child.drillDownFunctionId);else onSelectNode(child.id);} : undefined}
                          onKeyDown={isGenerated ? e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();if(child.drillDownFunctionId)onDrillIntoFunction(child.drillDownFunctionId);else onSelectNode(child.id);}} : undefined}
                        >
                          <title>{child.label}</title>
                          <text visibility={compactOverview?'hidden':undefined}
                            x={0}
                            y={-7}
                            fill="#EEF3E9"
                            fontSize={11.5}
                            fontWeight="600"
                            className="font-sans"
                          >
                            {child.label}{child.drillDownFunctionId?' ↘':''}
                          </text>

                          {child.hasLeftCombinerBar && (
                            <g>
                              <rect
                                x={-8}
                                y={4}
                                width={6}
                                height={child.h - 8}
                                fill="#142B25"
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
                                  fill={isActive ? cHex : '#6C877A'}
                                  stroke="#0B1717"
                                  strokeWidth={0.8}
                                />
                              ))}
                            </g>
                          )}

                          {!child.hasLeftCombinerBar && child.showInputPort!==false && (
                            <rect
                              x={-4}
                              y={child.h / 2 - 4}
                              width={8}
                              height={8}
                              fill={isActive ? cHex : '#6C877A'}
                              stroke="#0B1717"
                              strokeWidth={0.8}
                            />
                          )}

                          {!child.isDropBranch && child.showOutputPort!==false && (
                            <rect
                              x={child.w - 4}
                              y={outPortY - 4}
                              width={8}
                              height={8}
                              fill={isActive ? cHex : '#6C877A'}
                              stroke="#0B1717"
                              strokeWidth={0.8}
                            />
                          )}

                          <rect
                            width={child.w}
                            height={child.h}
                            rx={2}
                            fill="#142B25"
                            stroke={child.highlight ? '#E0BE72' : isActive || isFocused ? cHex : '#8AA399'}
                            strokeWidth={child.highlight ? 2.6 : 1.3}
                          />

                          <g
                            transform={`translate(${child.w / 2 - 11}, ${
                              child.h / 2 - 18
                            })`}
                          >
                            {renderLucideIcon(child.iconName, cHex, 22)}
                          </g>
                          <text visibility={compactOverview?'hidden':undefined}
                            x={child.w / 2}
                            y={child.h - 10}
                            textAnchor="middle"
                            fill="#B5C5BD"
                            fontSize={10}
                            className="font-mono"
                          >
                            {isGenerated && child.sublabel.length > Math.floor(child.w/6) ? child.sublabel.slice(0,Math.floor(child.w/6)-1)+'…' : child.sublabel}
                          </text>
                        </g>
                      );
                    })}
                    {isGenerated && node.structure!=='source' && cameraMode !== 'overview' && (isActive || isFocused) && valueText && (
                      <g transform={`translate(8, ${pos.height + 6})`}>
                        <rect width={Math.min(pos.width - 16, 300)} height={18} rx={9} fill="#0B1717" stroke="#38BDF8" strokeOpacity={0.75} strokeWidth={1} />
                        <text x={8} y={12.5} fill="#38BDF8" fontSize={9.5} className="font-mono">
                          {valueText}
                        </text>
                      </g>
                    )}
                  </g>
                ) : visual ? (
                  /* DYNAMIC FUNCTION-SPECIFIC VISUAL FLOWCHART CARDS */
                  <foreignObject
                    x={10}
                    y={10}
                    width={pos.width - 20}
                    height={pos.height - 20}
                  >
                    <div className="w-full h-full flex flex-col justify-center items-center select-none overflow-hidden font-sans">
                      {visual.variant === 'paper-card' && (
                        <div className="w-full h-full rounded-lg bg-[#F5F7F2] border-2 border-[#91B9CC] shadow-md flex flex-col justify-between p-3 text-[#0B1717]">
                          <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-1">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#0F172A] bg-[#BAE6FD] px-2 py-0.5 rounded">
                              {visual.headerBadge ?? 'Input'}
                            </span>
                            <span className="font-mono text-[10.5px] font-bold text-[#334155]">
                              {visual.title}
                            </span>
                          </div>
                          <div className="my-auto py-1.5 space-y-1 text-center border-y border-dashed border-[#CBD5E1]">
                            {(visual.lines ?? []).map((ln, idx) => (
                              <div
                                key={idx}
                                className="font-mono text-[13.5px] font-extrabold text-[#0B1717] leading-snug"
                              >
                                {ln}
                              </div>
                            ))}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center font-medium text-[#475569]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'token-tiles' && (
                        <div className="w-full h-full flex flex-col justify-between p-2.5">
                          <div className="text-[11px] font-mono text-[#B5C5BD] text-center font-bold">
                            {visual.title}
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2 my-auto py-1">
                            {(visual.tiles ?? []).map((tile, tidx) => {
                              const tileBg =
                                tile.color === 'sky'
                                  ? '#BAE6FD'
                                  : tile.color === 'amber'
                                  ? '#FDE68A'
                                  : tile.color === 'rose'
                                  ? '#FECDD3'
                                  : tile.color === 'mint' ||
                                    tile.color === 'emerald' ||
                                    tile.color === 'teal'
                                  ? '#A7F3D0'
                                  : '#DDD6FE';
                              const tileBorder = ACCENT_HEX[tile.color] ?? '#38BDF8';
                              return (
                                <div
                                  key={tidx}
                                  className="px-2.5 py-2 rounded-md shadow-md flex flex-col items-center justify-center min-w-[58px] border-2"
                                  style={{
                                    backgroundColor: tileBg,
                                    borderColor: tileBorder,
                                  }}
                                >
                                  <span className="font-mono text-[13px] font-extrabold text-[#0B1717] leading-none">
                                    {tile.text}
                                  </span>
                                  {tile.subtext && (
                                    <span className="font-mono text-[9.5px] font-semibold text-[#1E293B] mt-1">
                                      {tile.subtext}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10.5px] text-center text-[#EEF3E9] bg-[#142B25] border border-[#486356] rounded px-2 py-1">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'lookup-table' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#E0BE72] p-2.5 flex flex-col justify-between shadow-lg">
                          <div className="text-center border-b border-[#486356] pb-1">
                            <div className="text-[13.5px] font-extrabold text-[#EEF3E9] tracking-wide">
                              {visual.title}
                            </div>
                            {visual.subtitle && (
                              <div className="text-[10px] font-mono text-[#E0BE72]">
                                {visual.subtitle}
                              </div>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((row, ridx) => {
                              const chipBg =
                                row.color === 'sky'
                                  ? '#BAE6FD'
                                  : row.color === 'amber'
                                  ? '#FDE68A'
                                  : row.color === 'rose'
                                  ? '#FECDD3'
                                  : row.color === 'mint' ||
                                    row.color === 'emerald' ||
                                    row.color === 'teal'
                                  ? '#A7F3D0'
                                  : '#DDD6FE';
                              const arrowHex = ACCENT_HEX[row.color] ?? '#7BD3B0';
                              return (
                                <div
                                  key={ridx}
                                  className="flex items-center justify-between gap-2 bg-[#0B1717]/90 border border-[#486356]/70 rounded-lg px-2 py-1"
                                >
                                  <span
                                    className="px-2 py-0.5 rounded font-mono text-[11px] font-extrabold text-[#0B1717] shrink-0 border"
                                    style={{
                                      backgroundColor: chipBg,
                                      borderColor: arrowHex,
                                    }}
                                  >
                                    {row.leftChip}
                                  </span>
                                  <span
                                    className="font-mono text-[12px] font-extrabold shrink-0"
                                    style={{ color: arrowHex }}
                                  >
                                    ━━▶
                                  </span>
                                  <div className="flex-1 text-right min-w-0">
                                    <span className="font-mono text-[11px] font-bold text-[#EEF3E9] break-words">
                                      {row.rightValue}
                                    </span>
                                    {row.note && (
                                      <span className="block font-sans text-[9.5px] text-[#91B9CC]">
                                        {row.note}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] font-mono text-center text-[#7BD3B0]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'output-pill' && (
                        <div className="w-full h-full flex flex-col justify-between p-2.5">
                          <div className="text-[10.5px] font-mono text-[#7BD3B0] text-center uppercase tracking-wider font-bold">
                            {visual.headerBadge ?? visual.title}
                          </div>
                          <div className="my-auto rounded-2xl bg-[#F5F7F2] border-4 border-[#38BDF8] px-3 py-3 shadow-lg text-center">
                            <div className="font-mono text-[12.5px] font-extrabold text-[#0B1717] break-words leading-snug">
                              {visual.highlightText ?? visual.title}
                            </div>
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10.5px] text-center text-[#B5C5BD] leading-snug">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'vector-bars' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border border-[#486356] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#486356] pb-1">
                            <span className="text-[12px] font-bold text-[#EEF3E9]">
                              {visual.title}
                            </span>
                            {(visual.normLabel ?? visual.headerBadge) && (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0B1717] text-[#E0BE72] border border-[#E0BE72]/50">
                                {visual.normLabel ?? visual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.floats ?? []).map((val, bidx) => {
                              const isNeg = val < 0;
                              const barHex = isNeg ? '#F472B6' : hex;
                              const pct = Math.min(100, Math.round(Math.abs(val) * 62));
                              return (
                                <div key={bidx} className="flex items-center gap-2">
                                  <span className="font-mono text-[9.5px] text-[#B5C5BD] w-8 shrink-0">
                                    d[{bidx}]
                                  </span>
                                  <div className="flex-1 h-2.5 bg-[#0B1717] rounded overflow-hidden border border-[#486356]/50">
                                    <div
                                      className="h-full rounded"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: barHex,
                                      }}
                                    />
                                  </div>
                                  <span
                                    className="font-mono text-[10px] font-bold w-11 text-right shrink-0"
                                    style={{ color: barHex }}
                                  >
                                    {val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#91B9CC] font-mono">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'funnel-pool' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#E0BE72] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#486356] pb-1">
                            <span className="text-[12px] font-extrabold text-[#EEF3E9]">
                              {visual.title}
                            </span>
                            {visual.headerBadge && (
                              <span className="font-mono text-[9.5px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#0B1717] text-[#E0BE72] border border-[#E0BE72]/60">
                                {visual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((row, ridx) => {
                              const rHex = ACCENT_HEX[row.color] ?? '#7BD3B0';
                              return (
                                <div
                                  key={ridx}
                                  className="flex items-center justify-between bg-[#0B1717] border border-[#486356] rounded px-2 py-1"
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-bold"
                                    style={{ color: rHex }}
                                  >
                                    {row.leftChip}
                                  </span>
                                  <span className="font-mono text-[10.5px] font-bold text-[#EEF3E9]">
                                    {row.rightValue}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-[#B5C5BD] text-center leading-snug">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'score-meter' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border border-[#486356] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#486356] pb-1">
                            <span className="font-mono text-[11.5px] font-bold text-[#EEF3E9]">
                              {visual.title}
                            </span>
                            {visual.headerBadge && (
                              <span
                                className="font-mono text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-[#0B1717]"
                                style={{ color: hex }}
                              >
                                {visual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((r, ridx) => {
                              const rHex = ACCENT_HEX[r.color] ?? hex;
                              const pct = r.barPercent ?? 50;
                              return (
                                <div key={ridx} className="space-y-1">
                                  <div className="flex items-center justify-between font-mono text-[11px]">
                                    <span className="text-[#B5C5BD]">{r.leftChip}</span>
                                    <span className="font-extrabold" style={{ color: rHex }}>
                                      {r.rightValue}
                                    </span>
                                  </div>
                                  <div className="w-full h-3 bg-[#0B1717] rounded-full overflow-hidden border border-[#486356]">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${pct}%`, backgroundColor: rHex }}
                                    />
                                  </div>
                                  {r.note && (
                                    <div className="text-[9.5px] text-[#91B9CC] font-sans">
                                      {r.note}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-[#E0BE72] font-mono text-center">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'podium-rank' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#E0BE72] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#486356] pb-1">
                            <div className="text-[13px] font-extrabold text-[#EEF3E9]">
                              {visual.title}
                            </div>
                            {visual.subtitle && (
                              <div className="text-[10px] font-mono text-[#E0BE72]">
                                {visual.subtitle}
                              </div>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((p, pidx) => {
                              const pHex = ACCENT_HEX[p.color] ?? '#7BD3B0';
                              return (
                                <div
                                  key={pidx}
                                  className="flex items-center justify-between bg-[#0B1717] border rounded-lg px-2.5 py-1.5"
                                  style={{ borderColor: pHex }}
                                >
                                  <span
                                    className="font-mono text-[11px] font-extrabold px-2 py-0.5 rounded text-[#0B1717]"
                                    style={{ backgroundColor: pHex }}
                                  >
                                    {p.leftChip}
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-[#EEF3E9]">
                                    {p.rightValue}
                                  </span>
                                  {p.note && (
                                    <span
                                      className="font-mono text-[10px] font-bold"
                                      style={{ color: pHex }}
                                    >
                                      {p.note}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#B5C5BD]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'gate-keep-drop' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#E0BE72] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#486356] pb-1">
                            <div className="text-[12.5px] font-extrabold text-[#E0BE72]">
                              {visual.title}
                            </div>
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((r, ridx) => {
                              const rHex = ACCENT_HEX[r.color] ?? '#7BD3B0';
                              return (
                                <div
                                  key={ridx}
                                  className="bg-[#0B1717] border rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2"
                                  style={{ borderColor: rHex }}
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-extrabold shrink-0"
                                    style={{ color: rHex }}
                                  >
                                    {r.leftChip}
                                  </span>
                                  <div className="text-right min-w-0">
                                    <div className="font-mono text-[10.5px] font-bold text-[#EEF3E9] truncate">
                                      {r.rightValue}
                                    </div>
                                    {r.note && (
                                      <div className="text-[9.5px] text-[#91B9CC]">
                                        {r.note}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#B5C5BD]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'dropped-bin' && (
                        <div className="w-full h-full rounded-xl bg-[#2A1215]/90 border-2 border-dashed border-[#F472B6] p-2.5 flex flex-col justify-between text-center">
                          <div className="flex items-center justify-between border-b border-[#F472B6]/40 pb-1">
                            <span className="font-mono text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#F472B6] text-[#0B1717]">
                              {visual.headerBadge ?? 'DISCARDED'}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-[#F472B6]">
                              {visual.title}
                            </span>
                          </div>
                          <div className="my-auto space-y-1">
                            {(visual.lines ?? []).map((ln, idx) => (
                              <div
                                key={idx}
                                className="font-mono text-[11.5px] font-bold text-[#FECDD3] line-through decoration-[#F472B6]"
                              >
                                {ln}
                              </div>
                            ))}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-[#F472B6]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'doc-scroll' && (
                        <div className="w-full h-full rounded-xl bg-[#0B1717] border-2 border-[#7BD3B0] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#486356] pb-1">
                            <span className="font-mono text-[11.5px] font-bold text-[#7BD3B0]">
                              {visual.title}
                            </span>
                            {visual.headerBadge && (
                              <span className="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-[#142B25] text-[#E0BE72] border border-[#E0BE72]/50">
                                {visual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.lines ?? []).map((ln, idx) => (
                              <div
                                key={idx}
                                className="font-mono text-[11px] text-[#EEF3E9] bg-[#142B25] border-l-2 border-[#7BD3B0] px-2 py-1 rounded-r"
                              >
                                {ln}
                              </div>
                            ))}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#91B9CC]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'blueprint-slots' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#E0BE72] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#486356] pb-1">
                            <span className="text-[12.5px] font-extrabold text-[#EEF3E9]">
                              {visual.title}
                            </span>
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((slot, sidx) => {
                              const sHex = ACCENT_HEX[slot.color] ?? '#7BD3B0';
                              return (
                                <div
                                  key={sidx}
                                  className="bg-[#0B1717] border rounded px-2 py-1"
                                  style={{ borderColor: sHex }}
                                >
                                  <div
                                    className="font-mono text-[9.5px] font-extrabold uppercase"
                                    style={{ color: sHex }}
                                  >
                                    {slot.leftChip}
                                  </div>
                                  <div className="font-mono text-[10.5px] text-[#EEF3E9] truncate">
                                    {slot.rightValue}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#7BD3B0] font-mono">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'heatmap-spotlight' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#E0BE72] p-2.5 flex flex-col justify-between">
                          <div className="text-center border-b border-[#486356] pb-1">
                            <span className="text-[12.5px] font-extrabold text-[#E0BE72]">
                              {visual.title}
                            </span>
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((w, widx) => {
                              const wHex = ACCENT_HEX[w.color] ?? '#E0BE72';
                              const pct = w.barPercent ?? 50;
                              return (
                                <div key={widx} className="space-y-0.5">
                                  <div className="flex justify-between font-mono text-[10.5px]">
                                    <span className="text-[#EEF3E9] font-bold">
                                      {w.leftChip}
                                    </span>
                                    <span
                                      className="font-extrabold"
                                      style={{ color: wHex }}
                                    >
                                      {w.rightValue}
                                    </span>
                                  </div>
                                  <div className="w-full h-2.5 bg-[#0B1717] rounded overflow-hidden">
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
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#B5C5BD]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}

                      {visual.variant === 'citation-verifier' && (
                        <div className="w-full h-full rounded-xl bg-[#142B25] border-2 border-[#7BD3B0] p-2.5 flex flex-col justify-between">
                          <div className="flex items-center justify-between border-b border-[#486356] pb-1">
                            <span className="text-[12px] font-extrabold text-[#7BD3B0]">
                              {visual.title}
                            </span>
                            {visual.headerBadge && (
                              <span className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#0B1717] text-[#7BD3B0] border border-[#7BD3B0]">
                                {visual.headerBadge}
                              </span>
                            )}
                          </div>
                          <div className="my-auto space-y-1.5 py-1">
                            {(visual.rows ?? []).map((r, ridx) => {
                              const rHex = ACCENT_HEX[r.color] ?? '#7BD3B0';
                              return (
                                <div
                                  key={ridx}
                                  className="flex items-center justify-between bg-[#0B1717] border border-[#486356] rounded px-2 py-1"
                                >
                                  <span
                                    className="font-mono text-[10.5px] font-bold"
                                    style={{ color: rHex }}
                                  >
                                    {r.leftChip}
                                  </span>
                                  <span className="font-mono text-[10px]" style={{color:isGenerated&&r.color==='rose'?'#FB7185':'#7BD3B0'}}>
                                    {isGenerated&&r.color==='rose'?'×':'✓'}
                                  </span>
                                  <span className="font-mono text-[10.5px] text-[#EEF3E9]">
                                    {r.rightValue}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {visual.footerNote && (
                            <div className="text-[10px] text-center text-[#91B9CC]">
                              {visual.footerNote}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </foreignObject>
                ) : node.interface ? (
                  <foreignObject x={12} y={10} width={pos.width-24} height={pos.height-20}>
                    <div className="h-full w-full flex flex-col items-center justify-center text-center gap-2 overflow-hidden">
                      {renderLucideIcon(node.interface.outputs.length?'CheckCircle2':'MessageSquareQuote',hex,23)}
                      <div className="font-semibold text-[14px]" style={{color:hex}}>{node.interface.outputs.length?'Output':'Input'}</div>
                      <div className="text-[13px] leading-snug text-[#EEF3E9] break-words">{[...node.interface.inputs,...node.interface.outputs].slice(0,3).map(item=>item.label||item.name).join(' · ')||'No explicit arguments'}</div>
                      {[...node.interface.inputs,...node.interface.outputs].length>3&&<div className="text-[11px] text-[#B5C5BD]">+{[...node.interface.inputs,...node.interface.outputs].length-3} in Details</div>}
                    </div>
                  </foreignObject>
                ) : effectiveNonSummary ? (
                  /* NON-SUMMARY VIEW (@BlockName [ @Inputs, Goal, @Output ]) — Sized Dynamically to Content */
                  <g>
                    {/* Left Vertical Combiner Bar for multi-input blocks so all connected @input wires land cleanly */}
                    {effectiveNonSummary.inputs.length > 1 && (
                      <rect
                        x={-9}
                        y={24}
                        width={7}
                        height={pos.height - 48}
                        fill="#142B25"
                        stroke={hex}
                        strokeWidth={1.4}
                      />
                    )}

                    <foreignObject
                      x={12}
                      y={8}
                      width={pos.width - 24}
                      height={pos.height - 16}
                    >
                      <div className="w-full h-full flex flex-col justify-start gap-1.5 text-left font-sans select-none overflow-hidden">
                        {/* 1. Opening Header + @Inputs List */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between border-b border-[#486356]/70 pb-1">
                            <div className="flex items-center gap-2">
                              {renderLucideIcon(node.iconName, hex, 17)}
                              <span
                                className="font-mono font-bold text-[12.5px]"
                                style={{ color: hex }}
                              >
                                {effectiveNonSummary.blockTitle} [
                              </span>
                            </div>
                            <span className="font-mono text-[9.5px] text-[#8AA399]">
                              {effectiveNonSummary.inputs.length}{' '}
                              {node.structure==='source'?(node.sourceKind==='signature'?(effectiveNonSummary.inputs.length===1?'parameter':'parameters'):(effectiveNonSummary.inputs.length===1?'path':'paths')):(effectiveNonSummary.inputs.length === 1 ? 'input' : 'inputs')}
                            </span>
                          </div>

                          <div className="space-y-1 pl-1.5">
                            {effectiveNonSummary.inputs.map((inp, idx) => {
                              const inpHex = inp.color ? ACCENT_HEX[inp.color] : hex;
                              return (
                                <div
                                  key={idx}
                                  className={`${node.structure==='source'?'text-[13px]':'text-[11px]'} leading-snug bg-[#142B25]/85 border border-[#486356]/60 rounded px-2 py-0.5`}
                                >
                                  <span
                                    className="font-mono font-bold"
                                    style={{ color: inpHex }}
                                  >
                                    {inp.name}
                                  </span>
                                  <span className="text-[#8AA399] font-mono"> = </span>
                                  <span className="text-[#EEF3E9]">{inp.value}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 2. Block's Goal Section */}
                        <div
                          className="pl-2 pr-2 py-1 rounded bg-[#142B25] border-l-4"
                          style={{ borderColor: '#E0BE72' }}
                        >
                          <div className="text-[11px] font-bold text-[#E0BE72]">
                            {effectiveNonSummary.goalTitle}
                          </div>
                          <div className={`${node.structure==='source'?'text-[14px]':'text-[11.5px]'} text-[#EEF3E9] leading-snug mt-0.5`}>
                            {effectiveNonSummary.goalText}
                          </div>
                        </div>

                        {/* 3. @Output Section + Closing Bracket ] */}
                        <div className="space-y-0.5 mt-auto">
                          <div className="pl-2 pr-2 py-1 rounded bg-[#0B1717] border border-[#7BD3B0]/70">
                            <span className="font-mono font-bold text-[11px] text-[#7BD3B0]">
                              {effectiveNonSummary.outputLabel} ={' '}
                            </span>
                            <span className="text-[11px] text-[#EEF3E9] leading-snug">
                              {effectiveNonSummary.outputValue}
                            </span>
                          </div>
                          <div
                            className="font-mono font-bold text-[12.5px] leading-none"
                            style={{ color: hex }}
                          >
                            ]
                          </div>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                ) : effectiveStaticData ? (
                  /* UNPACKED STATIC @DATA BLOCK (@cleanup_rules, @vocab_table, @unit_scale, etc. — Never Summarized!) */
                  <g>
                    <foreignObject
                      x={10}
                      y={8}
                      width={pos.width - 20}
                      height={pos.height - 16}
                    >
                      <div className="w-full h-full flex flex-col justify-between text-left font-mono select-none overflow-hidden">
                        {/* Header: @cleanup_rules [ */}
                        <div className="flex items-center justify-between border-b border-[#486356]/70 pb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {renderLucideIcon(node.iconName, hex, 15)}
                            <span
                              className="font-bold text-[12px] truncate"
                              style={{ color: hex }}
                            >
                              {effectiveStaticData.header}
                            </span>
                          </div>
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-[#142B25] border border-[#486356]/70 text-[#8AA399] shrink-0">
                            static ({effectiveStaticData.entries.length})
                          </span>
                        </div>

                        {/* Unpacked Static Entries */}
                        <div className="space-y-1 pl-1.5 my-1">
                          {effectiveStaticData.entries.map((entry, eidx) => {
                            const entryHex = entry.color ? ACCENT_HEX[entry.color] : hex;
                            return (
                              <div
                                key={eidx}
                                className="text-[10.5px] leading-snug bg-[#142B25]/90 border border-[#486356]/60 rounded px-2 py-0.5 flex items-baseline justify-between gap-2"
                              >
                                <span
                                  className="font-bold shrink-0"
                                  style={{ color: entryHex }}
                                >
                                  {entry.key}:
                                </span>
                                <span className="text-[#EEF3E9] text-right truncate">
                                  {entry.value}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Closing Bracket ] */}
                        <div
                          className="font-bold text-[12px] leading-none"
                          style={{ color: hex }}
                        >
                          ]
                        </div>
                      </div>
                    </foreignObject>

                    {/* Clickable [refund-policy] citation badge on gen-out */}
                    {node.id === 'gen-out' && (
                      <g
                        transform={`translate(${pos.width / 2 - 52}, ${
                          pos.height + 8
                        })`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCitationClick();
                        }}
                      >
                        <rect
                          width={104}
                          height={20}
                          rx={3}
                          fill="#E0BE72"
                        />
                        <text
                          x={52}
                          y={14}
                          textAnchor="middle"
                          fill="#0B1717"
                          fontSize={10.5}
                          fontWeight="700"
                          className="font-mono"
                        >
                          [refund-policy] ↗
                        </text>
                      </g>
                    )}
                  </g>
                ) : isGenerated&&graph.systemContract&&(node.kind==='input'||node.kind==='output'||node.external) ? (
                  <foreignObject x={10} y={10} width={pos.width-20} height={pos.height-20}>
                    <div className="h-full w-full flex flex-col items-center justify-center text-center gap-3">
                      {renderLucideIcon(node.iconName,hex,compactOverview?14/camera.zoom:25)}<div style={compactOverview?{fontSize:12/camera.zoom}:undefined} className="text-[13px] leading-snug text-[#EEF3E9] break-words">{node.defaultPreview}</div>
                    </div>
                  </foreignObject>
                ) : (
                  /* COMPACT LEVEL-0 INPUT / OUTPUT BLOCK */
                  <g>
                    {/* Centered Colored Lucide Icon */}
                    <g
                      transform={`translate(${pos.width / 2 - 14}, ${
                        pos.height / 2 - 22
                      })`}
                    >
                      {renderLucideIcon(node.iconName, hex, 26)}
                    </g>

                    {/* Clean 1-line Data Value Below Icon */}
                    <text
                      x={pos.width / 2}
                      y={pos.height - 14}
                      textAnchor="middle"
                      fill="#EEF3E9"
                      fontSize={11}
                      fontWeight="600"
                      className="font-mono"
                    >
                      {node.defaultPreview}
                    </text>

                    {/* Clickable [refund-policy] citation badge on Answer node */}
                    {(node.id === 'answer' || node.id === 'gen-out') && (
                      <g
                        transform={`translate(${pos.width / 2 - 52}, ${
                          pos.height + 8
                        })`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCitationClick();
                        }}
                      >
                        <rect
                          width={104}
                          height={20}
                          rx={3}
                          fill="#E0BE72"
                        />
                        <text
                          x={52}
                          y={14}
                          textAnchor="middle"
                          fill="#0B1717"
                          fontSize={10.5}
                          fontWeight="700"
                          className="font-mono"
                        >
                          [refund-policy] ↗
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

            // If this edge crosses the Giant System Frame wall, split it at boundaryPort so it connects INTO the Giant Frame's square port (▸■) and then continues from it!
            const { firstSegment, secondSegment } = splitEdgeAtBoundaryPort(
              route.points,
              route.boundaryPort
            );

            let strokeColor = '#6C877A';
            let strokeWidth = 1.8;
            let markerEnd = 'url(#port-arrow-inactive)';
            let opacity = selectedNodeId ? 0.25 : 0.85;

            if (isSelectedIncoming) {
              strokeColor = '#38BDF8';
              strokeWidth = 3.2;
              markerEnd = 'url(#port-arrow-active)';
              opacity = 1;
            } else if (isSelectedOutgoing) {
              strokeColor = '#34D399';
              strokeWidth = 3.2;
              markerEnd = 'url(#port-arrow-output-hl)';
              opacity = 1;
            } else if (isActive) {
              strokeColor = isEvidenceEdge ? '#E0BE72' : '#38BDF8';
              strokeWidth = 2.8;
              markerEnd = isEvidenceEdge
                ? 'url(#port-arrow-evidence)'
                : 'url(#port-arrow-active)';
              opacity = selectedNodeId ? 0.45 : 1;
            } else if (isCompleted) {
              strokeColor = '#7BD3B0';
              strokeWidth = 2.2;
              markerEnd = 'url(#port-arrow-completed)';
              opacity = selectedNodeId ? 0.35 : 0.92;
            }

            const showControlLabel=graph.systemContract&&isActive&&edge.relationship==='control'&&edge.source!==graph.systemNodeId&&!graph.nodes.find(n=>n.id===edge.source)?.external;
            const ioBadgeText = isSelectedIncoming
              ? `⬅ INPUT: ${edge.label}`
              : isSelectedOutgoing
              ? `OUTPUT: ${edge.label} ➔`
              : showControlLabel ? edge.label : '';
            const ioBadgeWidth = Math.max(108, ioBadgeText.length * 6.5 + 18);

            return (
              <g key={edge.id} opacity={opacity}>
                {/* First Segment (or full path if internal): ends with arrowhead (▸) at Giant Frame Boundary Port or Target Port */}
                <path
                  d={buildOrthogonalPath(firstSegment)}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={edge.relationship === 'reference' ? '6 4' : graph.systemContract&&edge.relationship==='control'?'3 3':undefined}
                  markerEnd={markerEnd}
                />

                {/* Second Segment (when crossing Giant Frame Boundary Port): starts from Giant Frame Boundary Port (■) and ends with arrowhead (▸) at Target Port */}
                {secondSegment && (
                  <path
                    d={buildOrthogonalPath(secondSegment)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={edge.relationship === 'reference' ? '6 4' : graph.systemContract&&edge.relationship==='control'?'3 3':undefined}
                    markerEnd={markerEnd}
                  />
                )}

                {/* Giant System Frame Boundary Port Square (■) where wire enters/exits the Giant Box */}
                {route.boundaryPort && (
                  <rect
                    x={route.boundaryPort.x - 5.5}
                    y={route.boundaryPort.y - 5.5}
                    width={11}
                    height={11}
                    fill={isSelectedEdge || isActive ? strokeColor : '#7BD3B0'}
                    stroke="#0B1717"
                    strokeWidth={1.2}
                  />
                )}

                {/* Protruding Output Port Square (■) at Source Node */}
                <rect
                  x={route.sourcePort.x - 5}
                  y={route.sourcePort.y - 5}
                  width={10}
                  height={10}
                  fill={isSelectedEdge || isActive ? strokeColor : '#6C877A'}
                  stroke="#0B1717"
                  strokeWidth={1}
                />

                {/* Protruding Input Port Square (■) at Target Node */}
                <rect
                  x={route.targetPort.x - 5}
                  y={route.targetPort.y - 5}
                  width={10}
                  height={10}
                  fill={isSelectedEdge || isActive ? strokeColor : '#6C877A'}
                  stroke="#0B1717"
                  strokeWidth={1}
                />

                {/* Junction Dot (●) where orthogonal bus branches INSIDE the Giant Frame */}
                {route.junctionPoint && (
                  <circle
                    cx={route.junctionPoint.x}
                    cy={route.junctionPoint.y}
                    r={4.2}
                    fill={isSelectedEdge || isActive ? strokeColor : '#7BD3B0'}
                    stroke="#0B1717"
                    strokeWidth={1}
                  />
                )}

                {/* Highlighted Input / Output Callout Label on Wire when Node is Selected */}
                {(isSelectedEdge || showControlLabel) && (
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
                      fill="#0B1717"
                      stroke={strokeColor}
                      strokeWidth={1.8}
                    />
                    <text
                      x={ioBadgeWidth / 2}
                      y={14.5}
                      textAnchor="middle"
                      fill={strokeColor}
                      fontSize={10}
                      fontWeight="800"
                      className="font-mono"
                    >
                      {ioBadgeText}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Direction guides follow the declared routes and the lesson clock.
              They carry no invented runtime payloads or execution claims. */}
          {isGenerated&&graph.systemContract&&!reducedMotion&&[...activeEdgeIds].map(id=>{
            const edge=graph.edges.find(e=>e.id===id)||graph.nodes.flatMap(n=>n.connections||[]).find(e=>e.id===id);
            const route=layout.edges[id]||layout.internalEdges?.[id];
            if(!edge||edge.relationship==='reference'||!route||activePackets.some(p=>p.edgeId===id))return null;
            return <g key={'guide-'+id} aria-label={`Connection guide: ${'label' in edge?edge.label||id:id}`} pointerEvents="none">
              <title>Direction of the declared connection; not a recorded execution</title>
              {[0,1/3,2/3].map(offset=>{const point=interpolatePointOnPolyline(route.points,(flowTime/5+offset)%1);return <rect key={offset} x={point.x-3} y={point.y-3} width={6} height={6} fill={edge.relationship==='control'?'#E0BE72':'#38BDF8'} stroke="#0B1717" strokeWidth={.8}/>;})}
            </g>;
          })}
          {/* 3. Render Moving Data Packets Along Active Wires */}
          {activePackets.map((pkt) => {
            const labelScale=isGenerated?1/camera.zoom:1;
            const maxWidth=isGenerated?Math.max(80,viewportSize.width-32):Infinity;
            const maxChars=Math.max(8,Math.floor((maxWidth-20)/6.8));
            const payload=pkt.payload.length>maxChars?pkt.payload.slice(0,maxChars-1)+'…':pkt.payload;
            const boxW = Math.min(maxWidth,Math.max(116, payload.length * 6.8 + 20));
            const boxH = 24;
            const labelX=isGenerated?Math.max((16-camera.x)/camera.zoom-pkt.x,Math.min(-boxW*labelScale/2,(viewportSize.width-16-camera.x)/camera.zoom-pkt.x-boxW*labelScale)):-boxW/2;
            return (
              <g
                key={pkt.id}
                transform={`translate(${pkt.x.toFixed(1)}, ${pkt.y.toFixed(1)})`}
                className="pointer-events-none"
              >
                <circle r={6} fill="#38BDF8" stroke="#0B1717" strokeWidth={2} />
                <g transform={`translate(${labelX}, ${-30*labelScale}) scale(${labelScale})`}>
                  <title>{pkt.detail||pkt.payload}</title>
                  <rect
                    width={boxW}
                    height={boxH}
                    rx={4}
                    fill="#0B1717"
                    stroke="#38BDF8"
                    strokeWidth={1.6}
                  />
                  <text
                    x={boxW / 2}
                    y={15.5}
                    textAnchor="middle"
                    fill="#EEF3E9"
                    fontSize={10.5}
                    fontWeight="600"
                    className="font-mono"
                  >
                    {payload}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Bottom Reserved Stage Region: Transparent 2-Line Narration Overlay */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 z-10 flex justify-center">
        <div className="pointer-events-auto max-w-4xl w-full bg-[#0B1717]/92 border border-[#486356] rounded px-3.5 py-2 shadow-lg">
          <div className="flex items-center justify-between gap-2 text-xs mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-semibold text-[#E0BE72] truncate">
                {miniModeActive && miniStep
                  ? miniStep.title
                  : activeSubFunction
                  ? `${activeSubFunction.functionName.split('(')[0]}() · Logic Beat ${currentStep.beatNumber}/${totalStepsCount}: ${currentStep.title}`
                  : `Beat ${currentStep.beatNumber}/${totalStepsCount} · ${currentStep.title}`}
              </span>
              <span className="text-[#486356] hidden sm:inline">·</span>
              <span className="text-[#7BD3B0] truncate hidden sm:inline">
                {miniModeActive ? 'Tracing context to answer' : currentStep.question}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentStep.drillDownFunctionId && (
                <button
                  type="button"
                  onClick={() =>
                    currentStep.drillDownFunctionId &&
                    onDrillIntoFunction(currentStep.drillDownFunctionId)
                  }
                  className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded border border-[#7BD3B0] text-[#7BD3B0] hover:bg-[#7BD3B0] hover:text-[#0B1717] transition-colors cursor-pointer"
                >
                  <CornerDownRight className="w-3 h-3" />
                  <span>Inspect Function Logic ↘</span>
                </button>
              )}

              {!isGenerated&&(currentStep.beatNumber >= 6 || activeSubFunction?.id === 'fn-generate') && (
                <button
                  type="button"
                  onClick={onCitationClick}
                  className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded border border-[#E0BE72] text-[#E0BE72] hover:bg-[#E0BE72] hover:text-[#0B1717] transition-colors cursor-pointer"
                >
                  <span>Verify [refund-policy]</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <p className="text-xs sm:text-[14px] text-[#EEF3E9] leading-snug whitespace-pre-wrap">
            {miniModeActive && miniStep ? miniStep.caption : captionText ?? currentStep.narration}
          </p>
        </div>
      </div>
    </div>
  );
};
