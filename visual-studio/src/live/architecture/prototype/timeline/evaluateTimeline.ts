import { interpolatePointOnPolyline } from '../layout/elkLayout';
import {
  ArchitectureGraph,
  CameraState,
  ComputedGraphLayout,
  NodeBeatState,
  NodeId,
  Step,
} from '../types/lesson';

export interface ActivePacketFrame {
  id: string;
  edgeId: string;
  payload: string;
  detail?: string;
  progress: number;
  x: number;
  y: number;
}

export interface EvaluatedNodeFrame {
  id: NodeId;
  isFocused: boolean;
  isActive: boolean;
  isDimmed: boolean;
  hasExecuted: boolean;
  statusLabel: string;
  previewLines: string[];
  highlightToken?: string;
  badgeText?: string;
}

export interface TimelineFrame {
  playhead: number;
  totalDuration: number;
  stepIndex: number;
  step: Step;
  stepStartTime: number;
  stepLocalTime: number;
  stepProgress: number;
  isTransformComplete: boolean;
  activePackets: ActivePacketFrame[];
  nodeFrames: Record<NodeId, EvaluatedNodeFrame>;
  activeEdgeIds: Set<string>;
  completedEdgeIds: Set<string>;
  highlightedCodeLines: number[];
  currentVariables: Record<string, unknown>;
  targetCamera: CameraState;
}

function easeInOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * Computes the bounding camera target that frames a set of focusNodes
 * within a given viewport size, reserving space at the bottom for the 2-line narration overlay.
 */
export function computeFocusCameraForNodes(
  focusNodeIds: NodeId[],
  layout: ComputedGraphLayout,
  viewportWidth: number,
  viewportHeight: number
): CameraState {
  const safeW = Math.max(320, viewportWidth);
  const safeH = Math.max(260, viewportHeight);
  const topInset = 52;
  const bottomInset = 98;
  const sideInset = 36;

  const targetIds =
    focusNodeIds.length > 0 ? focusNodeIds : (Object.keys(layout.nodes) as NodeId[]);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of targetIds) {
    const pos = layout.nodes[id];
    if (!pos) continue;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }

  if (!Number.isFinite(minX)) {
    return { x: safeW / 2, y: safeH / 2, zoom: 0.75 };
  }

  const padX = 115;
  const padY = 85;
  const boxW = Math.max(520, maxX - minX + padX * 2);
  const boxH = Math.max(320, maxY - minY + padY * 2);

  const availW = Math.max(220, safeW - sideInset * 2);
  const availH = Math.max(160, safeH - topInset - bottomInset);

  const rawZoom = Math.min(availW / boxW, availH / boxH);
  const zoom = Math.max(0.54, Math.min(0.95, rawZoom));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const usableCenterX = safeW / 2;
  const usableCenterY = topInset + availH / 2;

  const x = usableCenterX - centerX * zoom;
  const y = usableCenterY - centerY * zoom;

  return { x, y, zoom };
}

export function computeOverviewCamera(
  layout: ComputedGraphLayout,
  viewportWidth: number,
  viewportHeight: number
): CameraState {
  const allIds = Object.keys(layout.nodes) as NodeId[];
  const safeW = Math.max(320, viewportWidth);
  const safeH = Math.max(260, viewportHeight);
  const topInset = 44;
  const bottomInset = 96;
  const sideInset = 28;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of allIds) {
    const pos = layout.nodes[id];
    if (!pos) continue;
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }

  const boxW = Math.max(400, maxX - minX + 90);
  const boxH = Math.max(260, maxY - minY + 90);

  const availW = Math.max(220, safeW - sideInset * 2);
  const availH = Math.max(160, safeH - topInset - bottomInset);

  const zoom = Math.max(0.32, Math.min(0.95, Math.min(availW / boxW, availH / boxH)));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: safeW / 2 - centerX * zoom,
    y: topInset + availH / 2 - centerY * zoom,
    zoom,
  };
}

/**
 * Pure deterministic function that evaluates the entire lesson state from a single playhead timestamp.
 */
export function evaluateTimeline(
  rawPlayhead: number,
  steps: Step[],
  graph: ArchitectureGraph,
  layout: ComputedGraphLayout,
  viewportWidth: number,
  viewportHeight: number,
  reducedMotion: boolean
): TimelineFrame {
  const totalDuration = steps.reduce((acc, s) => acc + s.duration, 0);
  const playhead = Math.max(0, Math.min(totalDuration, rawPlayhead));

  let accumulated = 0;
  let stepIndex = 0;
  let stepStartTime = 0;

  for (let i = 0; i < steps.length; i++) {
    const nextAcc = accumulated + steps[i].duration;
    if (playhead <= nextAcc || i === steps.length - 1) {
      stepIndex = i;
      stepStartTime = accumulated;
      break;
    }
    accumulated = nextAcc;
  }

  const step = steps[stepIndex];
  const stepLocalTime = Math.max(0, Math.min(step.duration, playhead - stepStartTime));
  const stepProgress = step.duration > 0 ? stepLocalTime / step.duration : 1;

  // Determine when the step's transformation settles into stateAfter
  const maxPacketEnd =
    step.packets.length > 0
      ? Math.max(...step.packets.map((p) => p.end))
      : step.duration * 0.35;

  const isTransformComplete = stepLocalTime >= (step.resultAt ?? maxPacketEnd * 0.85);

  // Evaluate active packets deterministically from stepLocalTime
  const activePackets: ActivePacketFrame[] = [];
  for (let i = 0; i < step.packets.length; i++) {
    const pkt = step.packets[i];
    if (stepLocalTime >= pkt.start && stepLocalTime <= pkt.end) {
      const span = Math.max(0.001, pkt.end - pkt.start);
      const rawP = (stepLocalTime - pkt.start) / span;
      const easedP = reducedMotion ? rawP : easeInOutCubic(rawP);
      const route = layout.edges[pkt.edgeId];
      const pt = route
        ? interpolatePointOnPolyline(route.points, easedP)
        : { x: 0, y: 0, angleDeg: 0 };

      activePackets.push({
        id: `${step.id}-pkt-${i}`,
        edgeId: pkt.edgeId,
        payload: pkt.payload,
        detail: pkt.detail,
        progress: rawP,
        x: pt.x,
        y: pt.y,
      });
    }
  }

  // Accumulate node data and completed edges up to the current playhead
  const cumulativeNodeState: Partial<Record<NodeId, NodeBeatState>> = {};
  const executedNodes = new Set<NodeId>();
  const completedEdgeIds = new Set<string>();

  for (let i = 0; i < stepIndex; i++) {
    const prevStep = steps[i];
    for (const nId of prevStep.activeNodes) {
      executedNodes.add(nId);
    }
    for (const eId of prevStep.activeEdges) {
      completedEdgeIds.add(eId);
    }
    for (const [nodeId, afterData] of Object.entries(prevStep.nodeDataAfter)) {
      if (afterData) {
        cumulativeNodeState[nodeId as NodeId] = afterData;
      }
    }
  }

  // Apply current step's nodeDataBefore or nodeDataAfter
  const currentStepNodeMap = isTransformComplete ? step.nodeDataAfter : step.nodeDataBefore;
  for (const [nodeId, data] of Object.entries(currentStepNodeMap)) {
    if (data) {
      cumulativeNodeState[nodeId as NodeId] = data;
    }
  }
  if (isTransformComplete) {
    for (const nId of step.activeNodes) {
      executedNodes.add(nId);
    }
    for (const eId of step.activeEdges) {
      completedEdgeIds.add(eId);
    }
  }

  const focusSet = new Set<NodeId>(step.focusNodes);
  const activeSet = new Set<NodeId>(step.activeNodes);
  const activeEdgeIds = new Set<string>(step.activeEdges);

  const nodeFrames = {} as Record<NodeId, EvaluatedNodeFrame>;
  for (const node of graph.nodes) {
    const isFocused = focusSet.has(node.id);
    const isActive = activeSet.has(node.id);
    const hasExecuted = executedNodes.has(node.id);
    const beatState = cumulativeNodeState[node.id];

    nodeFrames[node.id] = {
      id: node.id,
      isFocused,
      isActive,
      isDimmed: !isFocused && !isActive,
      hasExecuted,
      statusLabel: beatState?.statusLabel ?? (hasExecuted ? 'Ready' : 'Idle · awaiting stage'),
      previewLines: beatState?.previewLines ?? [node.defaultPreview],
      highlightToken: beatState?.highlightToken,
      badgeText: beatState?.badgeText ?? node.kind,
    };
  }

  // Compute deterministic camera interpolation across step transitions
  const currentStepCamera = computeFocusCameraForNodes(
    step.focusNodes,
    layout,
    viewportWidth,
    viewportHeight
  );

  let targetCamera = currentStepCamera;
  const cameraTransitionDuration = 1.15;
  if (!reducedMotion && stepIndex > 0 && stepLocalTime < cameraTransitionDuration) {
    const prevStep = steps[stepIndex - 1];
    const prevCamera = computeFocusCameraForNodes(
      prevStep.focusNodes,
      layout,
      viewportWidth,
      viewportHeight
    );
    const tCam = easeInOutCubic(stepLocalTime / cameraTransitionDuration);
    targetCamera = {
      x: prevCamera.x + (currentStepCamera.x - prevCamera.x) * tCam,
      y: prevCamera.y + (currentStepCamera.y - prevCamera.y) * tCam,
      zoom: prevCamera.zoom + (currentStepCamera.zoom - prevCamera.zoom) * tCam,
    };
  }

  const currentVariables = isTransformComplete ? step.stateAfter : step.stateBefore;

  return {
    playhead,
    totalDuration,
    stepIndex,
    step,
    stepStartTime,
    stepLocalTime,
    stepProgress,
    isTransformComplete,
    activePackets,
    nodeFrames,
    activeEdgeIds,
    completedEdgeIds,
    highlightedCodeLines: step.code.lines,
    currentVariables,
    targetCamera,
  };
}
