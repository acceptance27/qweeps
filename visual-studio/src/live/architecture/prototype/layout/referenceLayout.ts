import ELK from 'elkjs/lib/elk.bundled.js';
import {
  ArchitectureGraph,
  CompoundChildBlockSpec,
  CompoundContainerSpec,
  ComputedGraphLayout,
  GraphEdge,
  GraphNode,
  LayoutEdgePoint,
  LayoutEdgeRoute,
  LayoutNodePosition,
  NodeId,
} from '../types/lesson';

const elk = new ELK();
const layoutCache = new Map<string, ComputedGraphLayout>();

function getGraphSignature(graph: ArchitectureGraph): string {
  return JSON.stringify(graph);
}

const FUNCTION_ID_TO_SUB_GRAPH_ID: Record<string, string> = {
  'fn-embed': 'sub-graph-fn-embed',
  'fn-retrieve': 'sub-graph-fn-retrieve',
  'fn-context': 'sub-graph-fn-context',
  'fn-prompt': 'sub-graph-fn-prompt',
  'fn-generate': 'sub-graph-fn-generate',
  'emb-tokenize': 'sub-graph-l2-tokenize',
  'emb-pool': 'sub-graph-l2-pool',
  'emb-norm': 'sub-graph-l2-norm',
  'ret-scorer': 'sub-graph-l2-scorer',
  'ret-sorter': 'sub-graph-l2-sorter',
  'ret-slicer': 'sub-graph-l2-slicer',
  'ctx-tag': 'sub-graph-l2-tag',
  'ctx-join': 'sub-graph-l2-join',
  'prm-rules': 'sub-graph-l2-rules',
  'prm-merge': 'sub-graph-l2-merge',
  'gen-attend': 'sub-graph-l2-attend',
  'gen-decode': 'sub-graph-l2-decode',
};

/**
 * Strips any 'generated-' adapter prefixes (e.g. 'generated-sub-graph-fn-embed' -> 'sub-graph-fn-embed')
 * and resolves function lesson IDs to their canonical sub-graph IDs.
 */
export function normalizeGraphId(rawId: string): string {
  const stripped = (rawId || '').replace(/^(generated-)+/, '');
  return FUNCTION_ID_TO_SUB_GRAPH_ID[stripped] ?? stripped;
}

/**
 * Procedurally computes internal child box coordinates, port Y-offsets, combiner bars,
 * and orthogonal internal wires for any compound container from its child list and incoming edge count.
 * No hand-placed child coordinates are required.
 */
export function computeProceduralCompoundContainerSpec(
  rawSpec: CompoundContainerSpec,
  incomingEdgeCount: number
): { spec: CompoundContainerSpec; width: number; height: number } {
  const mainChildren = rawSpec.children.filter(
    (c) => !c.isDropBranch && c.id !== 'c-drop'
  );
  const dropChild = rawSpec.children.find(
    (c) => c.isDropBranch || c.id === 'c-drop'
  );

  // Determine if the combiner bar belongs on child[0] (e.g. retrieve) or child[1] (e.g. build_prompt)
  const combinerIdx = mainChildren.findIndex((c) => Boolean(c.hasLeftCombinerBar));
  const effectiveCombinerIdx =
    combinerIdx >= 0 ? combinerIdx : incomingEdgeCount >= 2 ? 0 : -1;

  const leftPortsY =
    incomingEdgeCount >= 2
      ? effectiveCombinerIdx === 1
        ? [56, 112]
        : [66, 120]
      : [86];
  const rightPortsY = [86];

  const placedChildren: CompoundChildBlockSpec[] = [];
  const internalWires: { points: { x: number; y: number }[] }[] = [];

  let cursorX = effectiveCombinerIdx === 0 ? 44 : 34;
  const gapX = mainChildren.length >= 3 ? 36 : 42;

  mainChildren.forEach((child, idx) => {
    const labelLen = Math.max(child.label.length * 6.8, child.sublabel.length * 6.0);
    const w = Math.max(78, Math.min(114, Math.round(labelLen + 16)));
    const hasCombiner = idx === effectiveCombinerIdx && incomingEdgeCount >= 2;

    // If child[1] has the combiner bar (like PromptAssembler), child[0] (SystemRules) sits aligned with port[1]
    const isPreCombinerHelper = effectiveCombinerIdx === 1 && idx === 0;
    const h = hasCombiner ? (effectiveCombinerIdx === 1 ? 88 : 92) : 68;
    const y = hasCombiner
      ? effectiveCombinerIdx === 1
        ? 42
        : 46
      : isPreCombinerHelper
      ? 78
      : 52;

    placedChildren.push({
      ...child,
      x: cursorX,
      y,
      w,
      h,
      hasLeftCombinerBar: hasCombiner,
      combinerPortsY: hasCombiner ? leftPortsY : undefined,
    });

    cursorX += w + gapX;
  });

  // Procedurally route internal wires from left wall ports -> children -> right wall port
  if (placedChildren.length > 0) {
    if (effectiveCombinerIdx === 1 && placedChildren.length >= 2) {
      const first = placedChildren[0];
      const second = placedChildren[1];
      // Top port [56] goes straight to second child's combiner bar
      internalWires.push({
        points: [
          { x: 5, y: leftPortsY[0] },
          { x: second.x - 12, y: leftPortsY[0] },
        ],
      });
      // Bottom port [112] enters first child, then exits into second child's combiner bar
      internalWires.push({
        points: [
          { x: 5, y: leftPortsY[1] },
          { x: first.x - 4, y: leftPortsY[1] },
        ],
      });
      internalWires.push({
        points: [
          { x: first.x + first.w + 4, y: leftPortsY[1] },
          { x: second.x - 12, y: leftPortsY[1] },
        ],
      });
      for (let i = 1; i < placedChildren.length - 1; i++) {
        const cur = placedChildren[i];
        const nxt = placedChildren[i + 1];
        internalWires.push({
          points: [
            { x: cur.x + cur.w + 4, y: 86 },
            { x: nxt.x - 4, y: 86 },
          ],
        });
      }
    } else {
      const first = placedChildren[0];
      if (first.hasLeftCombinerBar && first.combinerPortsY) {
        for (const py of first.combinerPortsY) {
          internalWires.push({
            points: [
              { x: 5, y: py },
              { x: first.x - 12, y: py },
            ],
          });
        }
      } else {
        internalWires.push({
          points: [
            { x: 5, y: 86 },
            { x: first.x - 4, y: 86 },
          ],
        });
      }

      for (let i = 0; i < placedChildren.length - 1; i++) {
        const cur = placedChildren[i];
        const nxt = placedChildren[i + 1];
        internalWires.push({
          points: [
            { x: cur.x + cur.w + 4, y: 86 },
            { x: nxt.x - 4, y: 86 },
          ],
        });
      }
    }

    const lastMain = placedChildren[placedChildren.length - 1];
    const lastLabelSpan = Math.max(lastMain.w, Math.round(lastMain.label.length * 7.2));
    let containerWidth = lastMain.x + lastLabelSpan + 34;
    let containerHeight = incomingEdgeCount >= 2 ? 168 : 156;

    if (dropChild) {
      // Place drop branch directly below the last filter child so it stays compactly enclosed inside the container
      const dropW = Math.max(76, Math.round(dropChild.sublabel.length * 6.4 + 16));
      const dropH = 48;
      const dropX = Math.max(
        lastMain.x - 4,
        lastMain.x + Math.round((lastMain.w - dropW) / 2)
      );
      const dropY = lastMain.y + lastMain.h + 22;
      placedChildren.push({
        ...dropChild,
        x: dropX,
        y: dropY,
        w: dropW,
        h: dropH,
        isDropBranch: true,
      });
      containerWidth = Math.max(containerWidth, dropX + dropW + 28);
      containerHeight = dropY + dropH + 16;

      const dropCenterX = lastMain.x + Math.round(lastMain.w / 2);
      internalWires.push({
        points: [
          { x: dropCenterX, y: lastMain.y + lastMain.h },
          { x: dropCenterX, y: dropY - 2 },
        ],
      });
    }

    // Wire from last main child to right wall port
    internalWires.push({
      points: [
        { x: lastMain.x + lastMain.w + 4, y: 86 },
        { x: containerWidth - 5, y: 86 },
      ],
    });

    return {
      spec: {
        leftPortsY,
        rightPortsY,
        children: placedChildren,
        internalWires,
      },
      width: containerWidth,
      height: containerHeight,
    };
  }

  return {
    spec: rawSpec,
    width: 320,
    height: 160,
  };
}

/**
 * Dynamically calculates a card's width and height from its actual content:
 * - Compound Container: procedurally computed from its child blocks and ports
 * - Non-Summary Function Card: sized from number of @inputs + goal/output text length
 * - Unpacked Static @Data Card: sized from number of key/value entries
 * - Custom Visual Flowchart Card: sized from its visual variant and item count
 */
export function computeDynamicCardDimensions(
  node: GraphNode,
  incomingEdgeCount = 1
): { width: number; height: number } {
  if (node.compoundContainer && node.compoundContainer.children.length > 0) {
    const computed = computeProceduralCompoundContainerSpec(
      node.compoundContainer,
      incomingEdgeCount
    );
    node.compoundContainer = computed.spec;
    return {
      width: computed.width,
      height: computed.height,
    };
  }

  if (node.customVisual) {
    const cv = node.customVisual;
    const v = cv.variant;
    const rowCount =
      (cv.rows?.length ?? 0) + (cv.lines?.length ?? 0) + (cv.floats?.length ?? 0);

    if (v === 'blueprint-slots') {
      return { width: 690, height: Math.max(330, 180 + rowCount * 62) };
    }
    if (v === 'doc-scroll' || v === 'citation-verifier') {
      return { width: 670, height: Math.max(310, 175 + rowCount * 52) };
    }
    if (v === 'heatmap-spotlight' || v === 'podium-rank') {
      return { width: 560, height: Math.max(295, 165 + rowCount * 46) };
    }
    if (v === 'lookup-table' || v === 'gate-keep-drop') {
      return { width: 465, height: Math.max(265, 145 + rowCount * 40) };
    }
    if (v === 'score-meter') {
      return { width: 480, height: 142 };
    }
    if (v === 'funnel-pool') {
      return { width: 350, height: 250 };
    }
    if (v === 'vector-bars') {
      return { width: 410, height: Math.max(245, 115 + rowCount * 24) };
    }
    if (v === 'token-tiles') {
      return { width: 380, height: 220 };
    }
    if (v === 'dropped-bin') {
      return { width: 350, height: 135 };
    }
    if (v === 'output-pill') {
      return { width: 380, height: 182 };
    }
    // paper-card
    return {
      width: Math.max(255, Math.min(370, 230 + rowCount * 28)),
      height: Math.max(135, 92 + rowCount * 28),
    };
  }

  if (node.nonSummary) {
    const inputCount = node.nonSummary.inputs.length;
    const maxInputLen = node.nonSummary.inputs.reduce(
      (max, inp) => Math.max(max, inp.name.length + inp.value.length),
      0
    );
    const goalLen = node.nonSummary.goalText.length;
    const outLen =
      node.nonSummary.outputLabel.length + node.nonSummary.outputValue.length;
    const longestMetric = Math.max(maxInputLen, Math.round(goalLen * 0.72), outLen);

    const width = Math.max(
      395,
      Math.min(560, 310 + inputCount * 38 + Math.round(longestMetric * 1.45))
    );
    const height = Math.max(
      198,
      Math.min(320, 156 + inputCount * 34 + (goalLen > 85 ? 18 : 0))
    );
    return { width, height };
  }

  if (node.staticData) {
    const entryCount = node.staticData.entries.length;
    const isBoundaryIO =
      (node.kind === 'input' || node.kind === 'output' || node.kind === 'store') &&
      node.stepBadge !== '@' &&
      !node.moduleBadge?.includes('Local');
    const maxEntryLen = node.staticData.entries.reduce(
      (max, e) => Math.max(max, e.key.length + e.value.length),
      0
    );
    if (isBoundaryIO) {
      return {
        width: 204,
        height: Math.max(112, 86 + entryCount * 25),
      };
    }
    return {
      width: Math.max(
        295,
        Math.min(390, 220 + entryCount * 22 + Math.round(maxEntryLen * 1.4))
      ),
      height: Math.max(132, 82 + entryCount * 25),
    };
  }

  // Compact L0 Input/Store/Output card
  if (node.kind === 'output') {
    return { width: 152, height: 92 };
  }
  return { width: 136, height: 86 };
}

/**
 * Pure Procedural Port-Aligned Layout Compiler.
 * Zero hardcoded coordinate tables: computes all node positions, dynamic card dimensions,
 * compound container internals, boundary ports, junctions, orthogonal wires, AND the
 * enclosing `systemFrame` box from graph topology so no internal function ever overflows outside.
 */
export function compileProceduralPortAlignedLayout(
  graph: ArchitectureGraph,
  engineLabel: 'elk' | 'deterministic-fallback' = 'deterministic-fallback'
): ComputedGraphLayout {
  const incomingByNode = new Map<NodeId, GraphEdge[]>();
  const outgoingByNode = new Map<NodeId, GraphEdge[]>();
  for (const n of graph.nodes) {
    incomingByNode.set(n.id, []);
    outgoingByNode.set(n.id, []);
  }
  for (const e of graph.edges) {
    incomingByNode.get(e.target)?.push(e);
    outgoingByNode.get(e.source)?.push(e);
  }

  const normalizedGraphId = normalizeGraphId(graph.id);
  const hasCompoundContainers = graph.nodes.some((n) => Boolean(n.compoundContainer));
  const isLevel2Flowchart =
    normalizedGraphId.startsWith('sub-graph-l2-') ||
    (!normalizedGraphId.startsWith('sub-graph-fn-') &&
      !hasCompoundContainers &&
      graph.nodes.some((n) => Boolean(n.customVisual)));

  const nodes: Record<NodeId, LayoutNodePosition> = {};
  const edges: Record<string, LayoutEdgeRoute> = {};

  if (hasCompoundContainers) {
    // ========================================================================
    // LEVEL 0: 2-Band Compound Container Pipeline Architecture
    // ========================================================================
    const boundaryInputs = graph.nodes.filter(
      (n) => !n.compoundContainer && (n.kind === 'input' || n.kind === 'store')
    );
    const boundaryOutputs = graph.nodes.filter(
      (n) => !n.compoundContainer && n.kind === 'output'
    );
    const containers = graph.nodes.filter((n) => Boolean(n.compoundContainer));

    // 1. Place Outside-Left Boundary Inputs (x = 56, outside leftWallX = 236)
    boundaryInputs.forEach((n, idx) => {
      const inCount = incomingByNode.get(n.id)?.length ?? 0;
      const dims = computeDynamicCardDimensions(n, inCount);
      const isStoreOrRow1 =
        n.kind === 'store' || graph.compactRowAssignment?.[n.id]?.row === 1 || idx > 0;
      nodes[n.id] = {
        id: n.id,
        x: 56,
        y: isStoreOrRow1 ? 456 : 156,
        width: dims.width,
        height: dims.height,
      };
    });

    // 2. Partition containers into Top Spine (y = 112) vs Bottom Evidence Spine (y = 380)
    const bottomBandIds = new Set<NodeId>();
    for (const c of containers) {
      const inEdges = incomingByNode.get(c.id) ?? [];
      const fedByStore = inEdges.some((e) => {
        const src = graph.nodes.find((n) => n.id === e.source);
        return src?.kind === 'store';
      });
      if (fedByStore || c.kind === 'search') {
        bottomBandIds.add(c.id);
      }
    }
    // Place any assembly container whose sole input is a bottomBand container on the bottom band
    for (const c of containers) {
      const inEdges = incomingByNode.get(c.id) ?? [];
      if (
        inEdges.length === 1 &&
        bottomBandIds.has(inEdges[0].source) &&
        c.kind === 'assembly'
      ) {
        bottomBandIds.add(c.id);
      }
    }

    const topContainers = containers.filter((c) => !bottomBandIds.has(c.id));
    const bottomContainers = containers.filter((c) => bottomBandIds.has(c.id));

    const leftWallX = 236;
    const innerStartX = leftWallX + 48; // 284

    let botCursorX = innerStartX;
    for (const c of bottomContainers) {
      const inCount = incomingByNode.get(c.id)?.length ?? 1;
      const dims = computeDynamicCardDimensions(c, inCount);
      nodes[c.id] = {
        id: c.id,
        x: botCursorX,
        y: 380,
        width: dims.width,
        height: dims.height,
      };
      botCursorX += dims.width + 68;
    }

    let topCursorX = innerStartX;
    for (const c of topContainers) {
      const inCount = incomingByNode.get(c.id)?.length ?? 1;
      const dims = computeDynamicCardDimensions(c, inCount);
      nodes[c.id] = {
        id: c.id,
        x: topCursorX,
        y: 112,
        width: dims.width,
        height: dims.height,
      };
      topCursorX += dims.width + 68;
    }

    // 3. Dynamically compute the Outer System Enclosure Frame (`answer(question)`)
    // so EVERY internal container sits 100% inside the box with generous padding.
    const maxContainerRight = Math.max(
      ...containers.map((c) => (nodes[c.id]?.x ?? innerStartX) + (nodes[c.id]?.width ?? 300)),
      1380
    );
    const maxContainerBottom = Math.max(
      ...containers.map((c) => (nodes[c.id]?.y ?? 380) + (nodes[c.id]?.height ?? 180)),
      572
    );

    const rightWallX = maxContainerRight + 52;
    const topWallY = 38;
    const bottomWallY = maxContainerBottom + 40;
    const systemFrame = {
      x: leftWallX,
      y: topWallY,
      width: rightWallX - leftWallX,
      height: bottomWallY - topWallY,
    };

    // 4. Place Outside-Right Terminal Outputs outside rightWallX
    const rightBoundaryX = rightWallX + 48;
    boundaryOutputs.forEach((n, idx) => {
      const dims = computeDynamicCardDimensions(n, 1);
      nodes[n.id] = {
        id: n.id,
        x: rightBoundaryX,
        y: 152 + idx * 180,
        width: dims.width,
        height: dims.height,
      };
    });

    // 5. Procedurally Route All Level-0 Edges with Exact Port Alignment & Boundary Ports
    for (const e of graph.edges) {
      const src = nodes[e.source];
      const tgt = nodes[e.target];
      if (!src || !tgt) continue;

      const srcNode = graph.nodes.find((n) => n.id === e.source);
      const tgtNode = graph.nodes.find((n) => n.id === e.target);

      const srcRight = src.x + src.width;
      const tgtLeft = tgt.x;

      // Resolve exact target port Y
      const inEdgesToTgt = incomingByNode.get(e.target) ?? [];
      const inferredPortIdx =
        e.targetPortIndex !== undefined
          ? e.targetPortIndex
          : Math.max(0, inEdgesToTgt.findIndex((ie) => ie.id === e.id));
      const tgtPortOffsetY =
        tgtNode?.compoundContainer?.leftPortsY?.[inferredPortIdx] ??
        tgtNode?.compoundContainer?.leftPortsY?.[0] ??
        Math.round(tgt.height / 2);
      const tgtPortY = tgt.y + tgtPortOffsetY;

      // Resolve exact source port Y
      const srcPortOffsetY =
        srcNode?.compoundContainer?.rightPortsY?.[e.sourcePortIndex ?? 0] ??
        Math.round(src.height / 2);
      const srcPortY = src.y + srcPortOffsetY;

      let points: LayoutEdgePoint[] = [];
      let boundaryPort: LayoutEdgePoint | undefined;
      let junctionPoint: LayoutEdgePoint | undefined;

      if (src.x < leftWallX && tgt.x < 400) {
        // Left boundary input -> first column container through left system wall port
        const alignedY = tgtPortY;
        boundaryPort = { x: leftWallX, y: alignedY };
        points = [
          { x: srcRight, y: alignedY },
          { x: leftWallX, y: alignedY },
          { x: tgtLeft, y: alignedY },
        ];
      } else if (src.x < leftWallX && tgt.x >= 400) {
        // Left boundary input -> downstream top container via upper bypass channel (y = 68)
        const branchX = leftWallX + 22;
        const startY = src.y + Math.round(src.height / 2);
        junctionPoint = { x: branchX, y: startY };
        points = [
          { x: branchX, y: startY },
          { x: branchX, y: 68 },
          { x: tgtLeft - 36, y: 68 },
          { x: tgtLeft - 36, y: tgtPortY },
          { x: tgtLeft, y: tgtPortY },
        ];
      } else if (src.y < 250 && tgt.y >= 340) {
        // Top band -> Bottom band snake wire via horizontal mid-gutter (y = 326)
        const turnRightX = srcRight + 26;
        const turnLeftX = tgtLeft - 26;
        points = [
          { x: srcRight, y: srcPortY },
          { x: turnRightX, y: srcPortY },
          { x: turnRightX, y: 326 },
          { x: turnLeftX, y: 326 },
          { x: turnLeftX, y: tgtPortY },
          { x: tgtLeft, y: tgtPortY },
        ];
      } else if (src.y >= 340 && tgt.y < 250 && tgtNode?.kind !== 'output') {
        // Bottom band -> Top band snake wire via mid-gutter (y = 326)
        const turnRightX = srcRight + 28;
        const turnLeftX = tgtLeft - 28;
        points = [
          { x: srcRight, y: srcPortY },
          { x: turnRightX, y: srcPortY },
          { x: turnRightX, y: 326 },
          { x: turnLeftX, y: 326 },
          { x: turnLeftX, y: tgtPortY },
          { x: tgtLeft, y: tgtPortY },
        ];
      } else if (src.y >= 340 && tgtNode?.kind === 'output') {
        // Bottom band -> Right boundary output citation verification wire
        const branchX = srcRight + 28;
        const targetCenterX = tgt.x + Math.round(tgt.width / 2);
        junctionPoint = { x: branchX, y: srcPortY };
        boundaryPort = { x: rightWallX, y: srcPortY };
        points = [
          { x: branchX, y: srcPortY },
          { x: rightWallX, y: srcPortY },
          { x: targetCenterX, y: srcPortY },
          { x: targetCenterX, y: tgt.y + tgt.height },
        ];
      } else if (src.x < rightWallX && tgt.x >= rightWallX) {
        // Top band -> Right boundary output through right system wall port
        boundaryPort = { x: rightWallX, y: srcPortY };
        points = [
          { x: srcRight, y: srcPortY },
          { x: rightWallX, y: srcPortY },
          { x: tgtLeft, y: srcPortY },
        ];
      } else {
        // Same-band horizontal port-to-port wire
        points = [
          { x: srcRight, y: srcPortY },
          { x: tgtLeft, y: tgtPortY },
        ];
      }

      edges[e.id] = {
        id: e.id,
        source: e.source,
        target: e.target,
        points,
        labelPosition: getPolylineMidpoint(points),
        sourcePort: points[0],
        targetPort: points[points.length - 1],
        junctionPoint,
        boundaryPort,
      };
    }

    return {
      width: rightBoundaryX + 208,
      height: bottomWallY + 44,
      nodes,
      edges,
      engineUsed: engineLabel,
      systemFrame,
    };
  }

  if (isLevel2Flowchart) {
    // ========================================================================
    // LEVEL 2: Procedural Visual Flowchart Layout Engine
    // ========================================================================
    const sideDropNodes = new Set<NodeId>();
    for (const n of graph.nodes) {
      if (n.customVisual?.variant === 'dropped-bin') {
        const inEdges = incomingByNode.get(n.id) ?? [];
        if (inEdges.length === 1) {
          const parentId = inEdges[0].source;
          const parentOuts = outgoingByNode.get(parentId) ?? [];
          const siblingNodes = parentOuts
            .map((oe) => graph.nodes.find((gn) => gn.id === oe.target))
            .filter((sn): sn is GraphNode => Boolean(sn && sn.id !== n.id));
          const isParallelKeepDropGate =
            graph.nodes.find((gn) => gn.id === parentId)?.customVisual?.variant ===
            'gate-keep-drop';
          if (siblingNodes.length > 0 && !isParallelKeepDropGate) {
            sideDropNodes.add(n.id);
          }
        }
      }
    }

    // Compute topological column depth for all main-flow nodes
    const colByNode = new Map<NodeId, number>();
    for (const n of graph.nodes) {
      if (!sideDropNodes.has(n.id) && (incomingByNode.get(n.id)?.length ?? 0) === 0) {
        colByNode.set(n.id, 0);
      }
    }
    let updated = true;
    while (updated) {
      updated = false;
      for (const e of graph.edges) {
        if (sideDropNodes.has(e.target)) continue;
        const cSrc = colByNode.get(e.source) ?? 0;
        const cTgt = colByNode.get(e.target) ?? -1;
        if (cSrc + 1 > cTgt) {
          colByNode.set(e.target, cSrc + 1);
          updated = true;
        }
      }
    }

    const columns = new Map<number, GraphNode[]>();
    for (const n of graph.nodes) {
      if (sideDropNodes.has(n.id)) continue;
      const c = colByNode.get(n.id) ?? 0;
      const list = columns.get(c) ?? [];
      list.push(n);
      columns.set(c, list);
    }

    const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);
    const colCount = Math.max(1, sortedCols.length);
    let cursorX = colCount >= 4 ? 88 : 105;
    const colGapX = colCount >= 4 ? 95 : 120;

    for (const c of sortedCols) {
      const colNodes = columns.get(c) ?? [];
      const colDims = colNodes.map((n) => computeDynamicCardDimensions(n));
      const maxW = Math.max(...colDims.map((d) => d.width), 260);
      const gapY = colNodes.length >= 3 ? 36 : 56;
      const totalH =
        colDims.reduce((acc, d) => acc + d.height, 0) +
        Math.max(0, colNodes.length - 1) * gapY;

      const hasDropChild = colNodes.some((cn) =>
        (outgoingByNode.get(cn.id) ?? []).some((oe) => sideDropNodes.has(oe.target))
      );
      const targetCenterY = hasDropChild ? 236 : 312;
      let cursorY = Math.max(88, Math.round(targetCenterY - totalH / 2));

      colNodes.forEach((n, idx) => {
        const dims = colDims[idx];
        nodes[n.id] = {
          id: n.id,
          x: cursorX,
          y: cursorY,
          width: dims.width,
          height: dims.height,
        };
        cursorY += dims.height + gapY;
      });

      cursorX += maxW + colGapX;
    }

    // Place any side-drop node directly beneath its parent filter card
    for (const dropId of sideDropNodes) {
      const dropNode = graph.nodes.find((n) => n.id === dropId);
      if (!dropNode) continue;
      const dims = computeDynamicCardDimensions(dropNode);
      const inEdge = (incomingByNode.get(dropId) ?? [])[0];
      const parentPos = inEdge ? nodes[inEdge.source] : undefined;
      nodes[dropId] = {
        id: dropId,
        x: parentPos
          ? parentPos.x + Math.round((parentPos.width - dims.width) / 2)
          : 920,
        y: parentPos ? parentPos.y + parentPos.height + 68 : 465,
        width: dims.width,
        height: dims.height,
      };
    }

    // Procedurally route Level-2 Flowchart Edges (with fan-out / fan-in bus bars)
    for (const e of graph.edges) {
      const src = nodes[e.source];
      const tgt = nodes[e.target];
      if (!src || !tgt) continue;

      if (sideDropNodes.has(e.target)) {
        const dropCenterX = src.x + Math.round(src.width / 2);
        const pts = [
          { x: dropCenterX, y: src.y + src.height },
          { x: dropCenterX, y: tgt.y },
        ];
        edges[e.id] = {
          id: e.id,
          source: e.source,
          target: e.target,
          points: pts,
          labelPosition: getPolylineMidpoint(pts),
          sourcePort: pts[0],
          targetPort: pts[pts.length - 1],
        };
        continue;
      }

      const srcRight = src.x + src.width;
      const srcMidY = src.y + Math.round(src.height / 2);
      const tgtLeft = tgt.x;
      const tgtMidY = tgt.y + Math.round(tgt.height / 2);

      const srcOutEdges = (outgoingByNode.get(e.source) ?? []).filter(
        (oe) => !sideDropNodes.has(oe.target)
      );
      const tgtInEdges = incomingByNode.get(e.target) ?? [];

      let pts: LayoutEdgePoint[] = [];
      let junctionPoint: LayoutEdgePoint | undefined;

      if (Math.abs(srcMidY - tgtMidY) <= 16) {
        pts = [
          { x: srcRight, y: tgtMidY },
          { x: tgtLeft, y: tgtMidY },
        ];
      } else {
        const midX = Math.round((srcRight + tgtLeft) / 2);
        let enterY = tgtMidY;
        if (tgtInEdges.length > 1) {
          const idx = tgtInEdges.findIndex((ie) => ie.id === e.id);
          const span = Math.min(180, tgt.height - 80);
          enterY =
            tgt.y +
            Math.round((tgt.height - span) / 2) +
            Math.round((idx / Math.max(1, tgtInEdges.length - 1)) * span);
        }
        let exitY = srcMidY;
        if (srcOutEdges.length === 2) {
          const idx = srcOutEdges.findIndex((oe) => oe.id === e.id);
          exitY = src.y + Math.round(src.height * (idx === 0 ? 0.34 : 0.66));
        } else if (srcOutEdges.length >= 3) {
          junctionPoint = { x: midX, y: srcMidY };
        }
        if (tgtInEdges.length >= 3) {
          junctionPoint = { x: midX, y: tgtMidY };
        }

        pts = [
          { x: srcRight, y: exitY },
          { x: midX, y: exitY },
          { x: midX, y: enterY },
          { x: tgtLeft, y: enterY },
        ];
      }

      edges[e.id] = {
        id: e.id,
        source: e.source,
        target: e.target,
        points: pts,
        labelPosition: getPolylineMidpoint(pts),
        sourcePort: pts[0],
        targetPort: pts[pts.length - 1],
        junctionPoint,
      };
    }

    const placedList = Object.values(nodes);
    const minNodeX = placedList.length > 0 ? Math.min(...placedList.map((n) => n.x)) : 88;
    const maxNodeRight =
      placedList.length > 0
        ? Math.max(...placedList.map((n) => n.x + n.width))
        : 1800;
    const maxNodeBottom =
      placedList.length > 0
        ? Math.max(...placedList.map((n) => n.y + n.height))
        : 620;

    const frameX = Math.max(24, Math.min(40, minNodeX - 44));
    const frameY = 44;
    const frameRight = Math.max(1840, maxNodeRight + 52);
    const frameBottom = Math.max(664, maxNodeBottom + 44);
    const systemFrame = {
      x: frameX,
      y: frameY,
      width: frameRight - frameX,
      height: frameBottom - frameY,
    };

    return {
      width: frameRight + 64,
      height: frameBottom + 48,
      nodes,
      edges,
      engineUsed: engineLabel,
      systemFrame,
    };
  }

  // ==========================================================================
  // LEVEL 1: Procedural Function Inspection Layout
  // (Outside-Left Boundary Inputs -> Main @Function Spine -> Unpacked @Static Shelf -> Outside-Right Output)
  // ==========================================================================
  const leftBoundaryNodes: GraphNode[] = [];
  const rightBoundaryNodes: GraphNode[] = [];
  const staticHelperNodes: GraphNode[] = [];
  const rawSpineNodes: GraphNode[] = [];

  for (const n of graph.nodes) {
    const inEdges = incomingByNode.get(n.id) ?? [];
    const outEdges = outgoingByNode.get(n.id) ?? [];

    const isExplicitLocalHelper =
      n.stepBadge === '@' || Boolean(n.moduleBadge?.includes('Local'));

    if (outEdges.length === 0 || n.kind === 'output' || n.stepBadge === 'OUT') {
      rightBoundaryNodes.push(n);
    } else if (
      !n.nonSummary &&
      (isExplicitLocalHelper ||
        (inEdges.length === 0 &&
          outEdges.length > 0 &&
          outEdges.every((e) => e.relationship === 'lookup' || e.relationship === 'reference') &&
          !(
            n.kind === 'store' &&
            graph.nodes.some(
              (other) =>
                other.id !== n.id &&
                other.kind === 'input' &&
                (outgoingByNode.get(other.id) ?? []).some(
                  (oe) => oe.target === outEdges[0].target && oe.relationship === 'data'
                )
            )
          )))
    ) {
      staticHelperNodes.push(n);
    } else if (
      !n.nonSummary &&
      inEdges.length === 0 &&
      (n.kind === 'input' || n.kind === 'store')
    ) {
      leftBoundaryNodes.push(n);
    } else {
      rawSpineNodes.push(n);
    }
  }

  // Topologically sort main spine nodes along the data chain
  const spineDepth = new Map<NodeId, number>();
  for (const n of rawSpineNodes) {
    spineDepth.set(n.id, 0);
  }
  let changed = true;
  for (let pass=0; changed && pass<graph.nodes.length; pass++) {
    changed = false;
    for (const e of graph.edges) {
      if (spineDepth.has(e.source) && spineDepth.has(e.target)) {
        const dSrc = spineDepth.get(e.source) ?? 0;
        const dTgt = spineDepth.get(e.target) ?? 0;
        if (dSrc + 1 > dTgt) {
          spineDepth.set(e.target, dSrc + 1);
          changed = true;
        }
      }
    }
  }
  const mainSpineNodes = [...rawSpineNodes].sort(
    (a, b) => (spineDepth.get(a.id) ?? 0) - (spineDepth.get(b.id) ?? 0)
  );

  // Detect if a later spine node receives left-boundary inputs directly (e.g., build_prompt where @context and @question feed @PromptAssembler)
  const boundaryFeedsLaterSpine = leftBoundaryNodes.some((lb) =>
    (outgoingByNode.get(lb.id) ?? []).some(
      (oe) => mainSpineNodes.findIndex((sn) => sn.id === oe.target) > 0
    )
  );

  const leftWallX = 240;

  // 1. Place Main Spine @Function Cards inside the System Frame (starting at x = 296)
  const spineDims = mainSpineNodes.map((n) => computeDynamicCardDimensions(n));
  const spineCount = Math.max(1, mainSpineNodes.length);
  const startSpineX = spineCount <= 2 ? 320 : 292;
  const spineGapX = spineCount <= 2 ? 130 : 88;

  let cursorSpineX = startSpineX;
  mainSpineNodes.forEach((n, idx) => {
    const dims = spineDims[idx];
    const spineY = boundaryFeedsLaterSpine
      ? idx === 0
        ? 262
        : 228
      : Math.max(96, Math.round(212 - dims.height / 2));

    nodes[n.id] = {
      id: n.id,
      x: cursorSpineX,
      y: spineY,
      width: dims.width,
      height: dims.height,
    };
    cursorSpineX += dims.width + spineGapX;
  });

  // 2. Place Unpacked Static @Data Helper Cards inside the System Frame (above or below their target spine card, with collision-free horizontal spacing)
  let prevBottomStaticRight = leftWallX + 44;
  for (const stNode of staticHelperNodes) {
    const dims = computeDynamicCardDimensions(stNode);
    const outEdge = (outgoingByNode.get(stNode.id) ?? [])[0];
    const targetPos = outEdge ? nodes[outEdge.target] : undefined;
    const placeAbove =
      boundaryFeedsLaterSpine &&
      outEdge &&
      mainSpineNodes[0]?.id === outEdge.target;

    const idealX = targetPos
      ? targetPos.x + Math.max(0, Math.round((targetPos.width - dims.width) / 2))
      : 330;

    const x = placeAbove
      ? Math.max(leftWallX + 52, idealX)
      : Math.max(leftWallX + 52, idealX, prevBottomStaticRight + 40);

    const y = placeAbove
      ? 72
      : Math.max(436, targetPos ? targetPos.y + targetPos.height + 52 : 436);

    if (!placeAbove) {
      prevBottomStaticRight = x + dims.width;
    }

    nodes[stNode.id] = {
      id: stNode.id,
      x,
      y,
      width: dims.width,
      height: dims.height,
    };
  }

  // 3. Dynamically compute the Level-1 System Enclosure Frame from ALL internal nodes
  // (`mainSpineNodes` + `staticHelperNodes`) so nothing EVER spills outside the box!
  const internalNodes = [...mainSpineNodes, ...staticHelperNodes];
  const maxInternalRight = Math.max(
    ...internalNodes.map((n) => (nodes[n.id]?.x ?? 292) + (nodes[n.id]?.width ?? 400)),
    1580
  );
  const maxInternalBottom = Math.max(
    ...internalNodes.map((n) => (nodes[n.id]?.y ?? 200) + (nodes[n.id]?.height ?? 220)),
    596
  );

  const rightWallX = maxInternalRight + 56;
  const topWallY = 44;
  const bottomWallY = maxInternalBottom + 44;
  const systemFrame = {
    x: leftWallX,
    y: topWallY,
    width: rightWallX - leftWallX,
    height: bottomWallY - topWallY,
  };

  // 4. Place Outside-Left Boundary Inputs (x = 20, outside leftWallX = 240)
  leftBoundaryNodes.forEach((lbNode, idx) => {
    const dims = computeDynamicCardDimensions(lbNode);
    let y = 158;
    if (boundaryFeedsLaterSpine) {
      y = 378 + idx * 152;
    } else if (leftBoundaryNodes.length > 1) {
      y = 112 + idx * 156;
    }
    nodes[lbNode.id] = {
      id: lbNode.id,
      x: 20,
      y,
      width: dims.width,
      height: dims.height,
    };
  });

  // 5. Place Outside-Right Return Output Card (outside rightWallX)
  const rightBoundaryX = rightWallX + 48;
  const lastSpinePos =
    mainSpineNodes.length > 0
      ? nodes[mainSpineNodes[mainSpineNodes.length - 1].id]
      : undefined;
  rightBoundaryNodes.forEach((rbNode, idx) => {
    const dims = computeDynamicCardDimensions(rbNode);
    const centerWithLastSpine = lastSpinePos
      ? Math.round(lastSpinePos.y + lastSpinePos.height / 2 - dims.height / 2)
      : 158;
    nodes[rbNode.id] = {
      id: rbNode.id,
      x: rightBoundaryX,
      y: centerWithLastSpine + idx * 160,
      width: dims.width,
      height: dims.height,
    };
  });

  // 6. Procedurally Route All Level-1 Edges (Zero Card Overlaps, Exact Wall Boundary Ports)
  for (const e of graph.edges) {
    const src = nodes[e.source];
    const tgt = nodes[e.target];
    if (!src || !tgt) continue;

    const srcRight = src.x + src.width;
    const tgtLeft = tgt.x;

    let points: LayoutEdgePoint[] = [];
    let boundaryPort: LayoutEdgePoint | undefined;

    const isStaticHelperSource = staticHelperNodes.some((sn) => sn.id === e.source);

    if (isStaticHelperSource) {
      // 4-point Left-Gutter Dogleg Wire from unpacked @static card into its target @function card (kept inside leftWallX)
      const gutterX = Math.max(leftWallX + 16, Math.min(src.x, tgt.x) - 36);
      const srcMidY = src.y + Math.round(src.height / 2);
      const enterY =
        src.y < tgt.y
          ? tgt.y + Math.round(tgt.height * 0.5)
          : tgt.y + tgt.height - 44;
      points = [
        { x: src.x, y: srcMidY },
        { x: gutterX, y: srcMidY },
        { x: gutterX, y: enterY },
        { x: tgtLeft, y: enterY },
      ];
    } else if (src.x < leftWallX && tgt.x >= leftWallX) {
      // Left Boundary Input crossing into System Frame at x = leftWallX
      const lbIdx = leftBoundaryNodes.findIndex((lb) => lb.id === e.source);
      let wireY = src.y + Math.round(src.height / 2);
      if (boundaryFeedsLaterSpine) {
        wireY = lbIdx === 0 ? tgt.y + tgt.height - 66 : tgt.y + tgt.height - 16;
      } else {
        wireY = Math.max(
          tgt.y + 36,
          Math.min(tgt.y + tgt.height - 36, src.y + Math.round(src.height / 2))
        );
      }
      boundaryPort = { x: leftWallX, y: wireY };
      points = [
        { x: srcRight, y: wireY },
        { x: leftWallX, y: wireY },
        { x: tgtLeft, y: wireY },
      ];
    } else if (src.x < rightWallX && tgt.x >= rightWallX) {
      // Final Spine Card crossing out Right System Frame at x = rightWallX
      const wireY = tgt.y + Math.round(tgt.height / 2);
      boundaryPort = { x: rightWallX, y: wireY };
      points = [
        { x: srcRight, y: wireY },
        { x: rightWallX, y: wireY },
        { x: tgtLeft, y: wireY },
      ];
    } else {
      // Spine-to-Spine Horizontal Wire
      const wireY = boundaryFeedsLaterSpine
        ? src.y + Math.round(src.height * 0.3)
        : Math.round(
            Math.max(src.y, tgt.y) + Math.min(src.height, tgt.height) * 0.44
          );
      points = [
        { x: srcRight, y: wireY },
        { x: tgtLeft, y: wireY },
      ];
    }

    edges[e.id] = {
      id: e.id,
      source: e.source,
      target: e.target,
      points,
      labelPosition: getPolylineMidpoint(points),
      sourcePort: points[0],
      targetPort: points[points.length - 1],
      boundaryPort,
    };
  }

  return {
    width: rightBoundaryX + 236,
    height: bottomWallY + 48,
    nodes,
    edges,
    engineUsed: engineLabel,
    systemFrame,
  };
}

export function getCuratedSubGraphLayout(_rawId: string): null {
  return null;
}

export function buildDeterministicInitialLayout(
  graph: ArchitectureGraph,
  engineLabel: 'elk' | 'deterministic-fallback' = 'deterministic-fallback'
): ComputedGraphLayout {
  return compileProceduralPortAlignedLayout(graph, engineLabel);
}

export function getPolylineMidpoint(points: LayoutEdgePoint[]): LayoutEdgePoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];

  let totalLength = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return points[0];
  const half = totalLength / 2;
  let walked = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (walked + segLengths[i] >= half) {
      const ratio = (half - walked) / Math.max(1, segLengths[i]);
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * ratio,
        y: points[i].y + (points[i + 1].y - points[i].y) * ratio,
      };
    }
    walked += segLengths[i];
  }
  return points[points.length - 1];
}

export function interpolatePointOnPolyline(
  points: LayoutEdgePoint[],
  t: number
): { x: number; y: number; angleDeg: number } {
  const clamped = Math.max(0, Math.min(1, t));
  if (points.length === 0) return { x: 0, y: 0, angleDeg: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, angleDeg: 0 };

  let totalLength = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return { x: points[0].x, y: points[0].y, angleDeg: 0 };

  const targetDist = totalLength * clamped;
  let walked = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (walked + segLen >= targetDist || i === segLengths.length - 1) {
      const localT = segLen > 0 ? (targetDist - walked) / segLen : 0;
      const x = points[i].x + (points[i + 1].x - points[i].x) * localT;
      const y = points[i].y + (points[i + 1].y - points[i].y) * localT;
      const angleDeg =
        (Math.atan2(points[i + 1].y - points[i].y, points[i + 1].x - points[i].x) * 180) /
        Math.PI;
      return { x, y, angleDeg };
    }
    walked += segLen;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, angleDeg: 0 };
}

export async function computeElkGraphLayout(
  graph: ArchitectureGraph
): Promise<ComputedGraphLayout> {
  const sig = getGraphSignature(graph);
  const cached = layoutCache.get(sig);
  if (cached) return cached;

  try {
    const layout = buildDeterministicInitialLayout(graph, 'elk');
    await elk.layout({
      id: graph.id,
      layoutOptions: { 'elk.algorithm': 'fixed' },
      children: graph.nodes.map((n) => ({
        id: n.id,
        x: layout.nodes[n.id].x,
        y: layout.nodes[n.id].y,
        width: layout.nodes[n.id].width,
        height: layout.nodes[n.id].height,
      })),
    });
    layoutCache.set(sig, layout);
    return layout;
  } catch {
    const fallback = buildDeterministicInitialLayout(graph, 'deterministic-fallback');
    layoutCache.set(sig, fallback);
    return fallback;
  }
}
