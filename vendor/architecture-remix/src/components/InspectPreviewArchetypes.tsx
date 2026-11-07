import React, { useState } from 'react';
import { BookOpen, Sparkles, X, Zap } from 'lucide-react';
import { ReactiveDataStage } from '../timeline/evaluateTimeline';
import {
  GraphNode,
  NodeAccentColor,
  SubFunctionLesson,
  VisualMappingRow,
  VisualTileItem,
} from '../types/lesson';

export type InspectPreviewArchetypeId =
  | 'split-tokens'
  | 'vector-pool'
  | 'norm-scale'
  | 'dot-product'
  | 'podium-rank'
  | 'gate-keep-drop'
  | 'tag-stamp'
  | 'doc-scroll'
  | 'guardrail-shield'
  | 'blueprint-slots'
  | 'heatmap-spotlight'
  | 'citation-verifier'
  | 'flowchart-fallback';

export interface InspectPreviewArchetypeDoc {
  id: InspectPreviewArchetypeId;
  number: number;
  title: string;
  functionExamples: string[];
  visualAnatomy: string;
  reactiveBehavior: string;
  whenToUse: string;
}

/**
 * Official Catalog & Documentation of the 12 Inspect Preview Function Archetypes (+ Flowchart Fallback).
 * Used both at runtime and in the interactive Archetype Documentation viewer.
 */
export const INSPECT_PREVIEW_ARCHETYPE_CATALOG: InspectPreviewArchetypeDoc[] = [
  {
    id: 'split-tokens',
    number: 1,
    title: 'Token Slicer & Cleanup Gate',
    functionExamples: ['@parse_intent()', '@tokenize()'],
    visualAnatomy:
      'Top strip of sliced word/symbol token chips + bottom lookup rows showing lowercasing and discarded punctuation (✕ drop "?").',
    reactiveBehavior:
      'Remains empty (none) while the input string packet travels along the wire; once the packet enters, token chips pop in left-to-right followed by cleanup rules.',
    whenToUse:
      'Functions that split raw text, parse intent tokens, strip punctuation, or normalize lexical pieces.',
  },
  {
    id: 'vector-pool',
    number: 2,
    title: 'Feature Lookup & Mean-Pool Funnel',
    functionExamples: ['@load_guidance()', '@encode_pool()'],
    visualAnatomy:
      'Token ID feature lookup rows (ID ──▸ vector) feeding into a Mean-Pool ÷4 badge strip of signed float values.',
    reactiveBehavior:
      'Reveals token lookup rows first as input enters, then interpolates the pooled float badges from 0.00 to their averaged values.',
    whenToUse:
      'Functions that map discrete IDs/tokens to table rows and pool/average them into a fixed-length representation.',
  },
  {
    id: 'norm-scale',
    number: 3,
    title: 'L2 Unit Length Vector Scaler',
    functionExamples: ['@normalize_beats()', '@l2_normalize()'],
    visualAnatomy:
      'Side-by-side Before (||v||=2.0) ──▸ ÷2 ──▸ After (||v||=1.0) horizontal vector bars per dimension d[i].',
    reactiveBehavior:
      'Animates the unscaled before-bars first, then smoothly scales the after-bars and float readouts to unit norm ||v||=1.0.',
    whenToUse:
      'Functions that normalize vectors, scale durations/weights, or enforce unit-circle constraints.',
  },
  {
    id: 'dot-product',
    number: 4,
    title: 'Parallel Candidate Score Meters',
    functionExamples: ['@score_files()', '@score_dot()'],
    visualAnatomy:
      '3 parallel candidate rows (Candidate A, B, C) each with a colored horizontal alignment bar and score readout.',
    reactiveBehavior:
      'All 3 candidate alignment bars sweep smoothly from 0% to their target score (e.g. 94%, 91%, 14%) after the query + store packets enter.',
    whenToUse:
      'Functions that broadcast a query across candidate files/documents and compute similarity or centrality scores.',
  },
  {
    id: 'podium-rank',
    number: 5,
    title: 'Descending Leaderboard Podium',
    functionExamples: ['@rank_modules()', '@rank_sort()'],
    visualAnatomy:
      'Ordered Rank #1, #2, #3 rows with medal badges, score progress bars, and left-aligned module/document names.',
    reactiveBehavior:
      'Cascades the sorted leaderboard from Rank #1 down to Rank #3 while filling each rank’s score bar.',
    whenToUse:
      'Functions that sort or rerank scored candidates in descending order.',
  },
  {
    id: 'gate-keep-drop',
    number: 6,
    title: 'Top-K Cutoff Gate (Keep vs. Drop)',
    functionExamples: ['@top_k_slice()', '@top_k_select()'],
    visualAnatomy:
      'Gate rows contrasting ✓ KEEP #1 / ✓ KEEP #2 (emerald/sky) against ✕ DROP #3 (rose excluded branch).',
    reactiveBehavior:
      'Evaluates each candidate row sequentially as the ranked list and @limit enter the gate.',
    whenToUse:
      'Functions that slice top-K items, apply threshold gates, or prune test/noise branches.',
  },
  {
    id: 'tag-stamp',
    number: 7,
    title: 'Source Provenance Stamper',
    functionExamples: ['@TagSourceSpans()', '@tag_sources()'],
    visualAnatomy:
      'Bracketed provenance chip ([span-1], [doc-1]) ──▸ left-aligned stamped string with [file:line] prefix.',
    reactiveBehavior:
      'Stamps each incoming item sequentially once both the items and @span_template have entered the block.',
    whenToUse:
      'Functions that attach metadata prefixes, [file:line] badges, or schema headers to records.',
  },
  {
    id: 'doc-scroll',
    number: 8,
    title: 'Unified Context & Graph Joiner',
    functionExamples: ['@JoinGraphEdges()', '@join_chunks()'],
    visualAnatomy:
      'Stacked document/band blocks separated by a highlighted join separator bar (e.g. "\\n\\n" or 2-band wire bus).',
    reactiveBehavior:
      'Stacks Band 0 / Chunk 1, illuminates the join separator bar, and locks in Band 1 / Chunk 2.',
    whenToUse:
      'Functions that concatenate text chunks, merge AST subgraphs, or join multi-band edges.',
  },
  {
    id: 'guardrail-shield',
    number: 9,
    title: 'Grounding & Schema Guardrail Checklist',
    functionExamples: ['@GroundingRules()', '@system_rules()'],
    visualAnatomy:
      'Checklist rows with ✓ ALLOWED, ✕ FORBIDDEN, and ✓ REQUIRED badges + left-aligned policy rules.',
    reactiveBehavior:
      'Activates each invariant check sequentially once the policy specification enters the block.',
    whenToUse:
      'Functions that enforce schema validation, safety policies, or grounding constraints.',
  },
  {
    id: 'blueprint-slots',
    number: 10,
    title: 'Multi-Slot Template Assembler',
    functionExamples: ['@LessonAssembler()', '@prompt_template()'],
    visualAnatomy:
      'Structured template slots (SLOT 1, SLOT 2, SLOT 3) showing each bound input locking into the final bundle.',
    reactiveBehavior:
      'Each template slot transitions from empty (awaiting slot input) to locked as its corresponding wire packet arrives.',
    whenToUse:
      'Functions that combine multiple upstream artifacts (rules + context + request) into a structured payload.',
  },
  {
    id: 'heatmap-spotlight',
    number: 11,
    title: 'Attention Focus & Frame Audit Weights',
    functionExamples: ['@attend_frames()', '@self_attend()'],
    visualAnatomy:
      'High-signal focus weight bar (94% FOCUS) contrasted against background weight bar (6% FOCUS).',
    reactiveBehavior:
      'Sweeps the attention focus bars from 0% to 94% / 6% after the assembled bundle enters.',
    whenToUse:
      'Functions that compute attention weights, audit rendered frames, or isolate high-signal spans.',
  },
  {
    id: 'citation-verifier',
    number: 12,
    title: 'Grounded Claim & Citation Verifier',
    functionExamples: ['@verify_and_narrate()', '@cite_decode()'],
    visualAnatomy:
      '3 verification rows (CLAIM CHECK ✓, CITATION CHECK ✓, NO HALLUCINATION ✓) confirming provenance.',
    reactiveBehavior:
      'Ticks each verification check from pending to ✓ verified as evidence and citation rules enter.',
    whenToUse:
      'Final verification, narration synthesis, or grounded decoding stages.',
  },
  {
    id: 'flowchart-fallback',
    number: 13,
    title: 'Full Inspect Flowchart Fallback',
    functionExamples: ['Custom user functions without a specialized table'],
    visualAnatomy:
      'Multi-column 2D miniature flowchart grid displaying each sub-block badge, label, and role summary.',
    reactiveBehavior:
      'Illuminates each flowchart column from left to right as the transformation progresses.',
    whenToUse:
      'Automatic fallback whenever a Level-2 inspection does not use one of the 12 specialized visual cards.',
  },
];

export interface ResolvedInspectPreview {
  archetypeId: InspectPreviewArchetypeId;
  l2Nodes: GraphNode[];
  sortedCols: number[];
  nodesByCol: Map<number, GraphNode[]>;
  vectorBarNodes: GraphNode[];
  lookupNode?: GraphNode;
  docScrollNode?: GraphNode;
  tokenTilesNode?: GraphNode;
  podiumNode?: GraphNode;
  previewRows: VisualMappingRow[];
}

/**
 * Pure resolver that inspects any Level-2 `SubFunctionLesson` across all node kinds
 * (`transform`, `search`, `assembly`, `generation`, `store`, `output`) and returns
 * its archetype ID, 2D topological column layout, and structured visual payload.
 */
export function resolveInspectPreviewArchetype(
  l2Lesson: SubFunctionLesson
): ResolvedInspectPreview {
  const l2Nodes = l2Lesson.graph.nodes;
  const l2Edges = l2Lesson.graph.edges;

  const colByNode = new Map<string, number>();
  l2Nodes.forEach((n) => colByNode.set(n.id, 0));
  for (let p = 0; p < l2Nodes.length; p++) {
    for (const e of l2Edges) {
      const cSrc = colByNode.get(e.source) ?? 0;
      const cTgt = colByNode.get(e.target) ?? 0;
      if (cSrc + 1 > cTgt) {
        colByNode.set(e.target, cSrc + 1);
      }
    }
  }

  const nodesByCol = new Map<number, GraphNode[]>();
  for (const n of l2Nodes) {
    const c = colByNode.get(n.id) ?? 0;
    const arr = nodesByCol.get(c) ?? [];
    arr.push(n);
    nodesByCol.set(c, arr);
  }
  const sortedCols = Array.from(nodesByCol.keys()).sort((a, b) => a - b);

  const scoreMeterNodes = l2Nodes.filter(
    (n) => n.customVisual?.variant === 'score-meter'
  );
  const spotlightNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'heatmap-spotlight'
  );
  const podiumNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'podium-rank'
  );
  const gateNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'gate-keep-drop'
  );
  const verifierNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'citation-verifier'
  );
  const blueprintNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'blueprint-slots'
  );
  const docScrollNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'doc-scroll'
  );
  const vectorBarNodes = l2Nodes.filter(
    (n) => n.customVisual?.variant === 'vector-bars'
  );
  const lookupNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'lookup-table'
  );
  const tokenTilesNode = l2Nodes.find(
    (n) => n.customVisual?.variant === 'token-tiles'
  );

  let archetypeId: InspectPreviewArchetypeId = 'flowchart-fallback';
  if (vectorBarNodes.length >= 2) {
    archetypeId = 'norm-scale';
  } else if (vectorBarNodes.length === 1 && lookupNode) {
    archetypeId = 'vector-pool';
  } else if (docScrollNode?.customVisual?.lines?.length) {
    archetypeId = 'doc-scroll';
  } else if (
    tokenTilesNode?.customVisual?.tiles?.length &&
    lookupNode &&
    !podiumNode &&
    vectorBarNodes.length === 0
  ) {
    archetypeId = 'split-tokens';
  } else if (scoreMeterNodes.length > 0) {
    archetypeId = 'dot-product';
  } else if (spotlightNode) {
    archetypeId = 'heatmap-spotlight';
  } else if (podiumNode) {
    archetypeId = 'podium-rank';
  } else if (gateNode) {
    archetypeId = 'gate-keep-drop';
  } else if (verifierNode) {
    archetypeId = 'citation-verifier';
  } else if (blueprintNode) {
    archetypeId = 'blueprint-slots';
  } else if (lookupNode) {
    const firstChip = lookupNode.customVisual?.rows?.[0]?.leftChip ?? '';
    archetypeId =
      firstChip.includes('ALLOWED') || firstChip.includes('✓')
        ? 'guardrail-shield'
        : 'tag-stamp';
  } else if (tokenTilesNode?.customVisual?.tiles?.length) {
    archetypeId = 'split-tokens';
  }

  const previewRows: VisualMappingRow[] =
    scoreMeterNodes.length > 0
      ? scoreMeterNodes.flatMap((sn) =>
          (sn.customVisual?.rows ?? []).map((r) => ({
            leftChip: r.leftChip === 'Alignment' ? sn.label : r.leftChip,
            rightValue: r.rightValue,
            color: r.color ?? sn.accentColor,
            barPercent: r.barPercent,
          }))
        )
      : (
          spotlightNode ??
          podiumNode ??
          gateNode ??
          verifierNode ??
          blueprintNode ??
          lookupNode
        )?.customVisual?.rows ?? [];

  return {
    archetypeId,
    l2Nodes,
    sortedCols,
    nodesByCol,
    vectorBarNodes,
    lookupNode,
    docScrollNode,
    tokenTilesNode,
    podiumNode,
    previewRows,
  };
}

interface InspectPreviewCardProps {
  l2Lesson: SubFunctionLesson;
  accentHex: string;
  activePalette: Record<NodeAccentColor, string>;
  reactiveEnabled: boolean;
  reactiveStage: ReactiveDataStage;
  inspectRevealProgress: number;
  onInspect: () => void;
  compact?: boolean;
  badgeLabel?: string;
}

/**
 * Embedded Inspect Preview component rendered inside Level-0 Compound Container child blocks
 * and right below the Goal section inside Level-1 function cards.
 * Supports Reactive Display: data starts as `none` until the incoming wire packet physically enters the node,
 * then animates smoothly over `inspectRevealProgress` (`0 ➔ 1`).
 */
export const InspectPreviewCard: React.FC<InspectPreviewCardProps> = ({
  l2Lesson,
  accentHex,
  activePalette,
  reactiveEnabled,
  reactiveStage,
  inspectRevealProgress,
  onInspect,
  compact = false,
  badgeLabel,
}) => {
  const resolved = resolveInspectPreviewArchetype(l2Lesson);
  const {
    l2Nodes,
    sortedCols,
    nodesByCol,
    vectorBarNodes,
    lookupNode,
    docScrollNode,
    tokenTilesNode,
    podiumNode,
    previewRows,
  } = resolved;

  const effStage: ReactiveDataStage = reactiveEnabled ? reactiveStage : 'ready';
  const effProgress = reactiveEnabled ? inspectRevealProgress : 1;
  const isWaitingForInput =
    effStage === 'waiting' || effStage === 'in-flight' || effProgress <= 0.01;
  const maxRowSlice = compact ? 2 : 3;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onInspect();
      }}
      className={`${
        compact ? 'w-full h-full px-2 py-1.5 space-y-1 flex flex-col justify-between overflow-hidden' : 'px-2.5 py-1.5 space-y-1.5'
      } rounded bg-[#1E1F22] border transition-colors cursor-pointer ${
        effStage === 'updating'
          ? 'border-[#3574F0] shadow-[0_0_10px_rgba(53,116,240,0.2)]'
          : 'border-[#34363B] hover:border-[#4E5157]'
      }`}
      title="Click to open full Inspect Flowchart"
    >
      {/* Header Row with Reactive Status Indicator */}
      <div className="flex items-center justify-between gap-1.5 border-b border-[#2E3035] pb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-[#868A91] truncate">
            {badgeLabel
              ? `${badgeLabel} · ${l2Nodes.length} blocks`
              : `Inspect Preview · ${l2Nodes.length} blocks`}
          </span>
          {reactiveEnabled && effStage === 'in-flight' && (
            <span className="px-1.5 py-0.2 rounded bg-[#2B2520] border border-[#D9A354]/50 text-[8.5px] font-mono font-semibold text-[#D9A354] animate-pulse shrink-0">
              ⇢ wire...
            </span>
          )}
          {reactiveEnabled && effStage === 'updating' && (
            <span className="px-1.5 py-0.2 rounded bg-[#202D42] border border-[#3574F0] text-[8.5px] font-mono font-semibold text-[#56A8F5] shrink-0">
              ⚡ {Math.round(effProgress * 100)}%
            </span>
          )}
          {reactiveEnabled && effStage === 'waiting' && (
            <span className="px-1.5 py-0.2 rounded bg-[#25272B] border border-[#393B40] text-[8.5px] font-mono text-[#6F737A] shrink-0">
              ○ none
            </span>
          )}
        </div>
        <span
          className="text-[9px] font-mono font-semibold shrink-0"
          style={{ color: accentHex }}
        >
          Inspect ↘
        </span>
      </div>

      {/* 2D Topological Mini Flowchart Strip */}
      <div className="flex items-center gap-1 overflow-hidden py-0.5">
        {sortedCols.map((colIdx, cPos) => {
          const colNodes = nodesByCol.get(colIdx) ?? [];
          const colThreshold = sortedCols.length > 1 ? cPos / sortedCols.length : 0;
          const colActive = !isWaitingForInput && effProgress >= colThreshold;
          const firstHex =
            activePalette[colNodes[0]?.accentColor ?? 'sky'] ?? accentHex;

          return (
            <React.Fragment key={colIdx}>
              <div
                className="flex flex-col gap-0.5 min-w-0 shrink transition-opacity duration-200"
                style={{ opacity: colActive ? 1 : 0.45 }}
              >
                {colNodes.slice(0, 2).map((subNode) => {
                  const subHex = activePalette[subNode.accentColor] ?? accentHex;
                  return (
                    <span
                      key={subNode.id}
                      className="px-1.5 py-0.5 rounded bg-[#26282C] border border-[#393B40] font-mono text-[9px] font-semibold truncate max-w-[128px]"
                      style={{ color: colActive ? subHex : '#868A91' }}
                    >
                      {subNode.label}
                    </span>
                  );
                })}
                {colNodes.length > 2 && (
                  <span className="px-1 text-[8.5px] font-mono text-[#868A91]">
                    +{colNodes.length - 2} parallel
                  </span>
                )}
              </div>
              {cPos < sortedCols.length - 1 && (
                <span
                  className="font-mono text-[9.5px] shrink-0 transition-opacity duration-200"
                  style={{
                    color: colActive ? firstHex : '#5A5D63',
                    opacity: colActive ? 1 : 0.4,
                  }}
                >
                  ──▸
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Reactive Awaiting Input State (when packet has not yet entered the node) */}
      {isWaitingForInput ? (
        <div className="space-y-1 pt-0.5">
          {[0, 1].map((placeholderIdx) => (
            <div
              key={placeholderIdx}
              className="flex items-center justify-between gap-2 text-[9.5px] font-mono bg-[#222428] px-2 py-1 rounded border border-dashed border-[#34363B] text-[#6F737A]"
            >
              <span className="truncate">
                {effStage === 'in-flight'
                  ? '⇢ Waiting for wire packet to enter port...'
                  : 'none · awaiting input data'}
              </span>
              <div className="w-16 h-1.5 bg-[#18191B] rounded overflow-hidden shrink-0 border border-[#2E3035]">
                <div className="h-full w-0 rounded bg-[#3574F0]" />
              </div>
            </div>
          ))}
        </div>
      ) : vectorBarNodes.length >= 2 ? (
        /* NORM-SCALE: Before (||v||=2.0) ──▸ ÷ 2.0 ──▸ After (||v||=1.0 ✓) */
        <div className="space-y-1 pt-0.5">
          {(vectorBarNodes[0].customVisual?.floats ?? [])
            .slice(0, maxRowSlice)
            .map((beforeVal, fIdx) => {
              const rowProg = Math.max(
                0,
                Math.min(1, (effProgress - fIdx * 0.15) / 0.65)
              );
              const targetAfterVal =
                vectorBarNodes[vectorBarNodes.length - 1].customVisual?.floats?.[
                  fIdx
                ] ?? Number((beforeVal / 2).toFixed(2));
              const currentAfterVal = Number((targetAfterVal * rowProg).toFixed(2));
              const isNeg = targetAfterVal < 0;
              const barColor = isNeg ? '#D46A6E' : '#6AAB73';
              const beforePct = Math.min(100, Math.round(Math.abs(beforeVal) * 62));
              const afterPct = Math.round(
                Math.min(100, Math.abs(targetAfterVal) * 62) * rowProg
              );
              return (
                <div
                  key={fIdx}
                  className="flex items-center gap-1.5 text-[9.5px] font-mono bg-[#25272B] px-2 py-0.5 rounded border border-[#34363B]"
                  style={{ opacity: Math.max(0.25, rowProg) }}
                >
                  <span className="text-[#868A91] shrink-0">d[{fIdx}]</span>
                  <span className="text-[#BCBEC4] shrink-0">
                    {beforeVal >= 0
                      ? `+${beforeVal.toFixed(2)}`
                      : beforeVal.toFixed(2)}
                  </span>
                  <div className="w-10 h-1.5 bg-[#18191B] rounded overflow-hidden shrink-0 border border-[#34363B]">
                    <div
                      className="h-full rounded opacity-60"
                      style={{
                        width: `${beforePct}%`,
                        backgroundColor: '#9876AA',
                      }}
                    />
                  </div>
                  <span className="text-[#D9A354] shrink-0">÷2 ──▸</span>
                  <div className="w-10 h-1.5 bg-[#18191B] rounded overflow-hidden shrink-0 border border-[#34363B]">
                    <div
                      className="h-full rounded transition-all duration-75"
                      style={{
                        width: `${afterPct}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <span
                    className="font-semibold text-left truncate"
                    style={{ color: barColor }}
                  >
                    {currentAfterVal >= 0
                      ? `+${currentAfterVal.toFixed(2)}`
                      : currentAfterVal.toFixed(2)}{' '}
                    (||v||=1.0)
                  </span>
                </div>
              );
            })}
        </div>
      ) : vectorBarNodes.length === 1 && lookupNode ? (
        /* VECTOR-POOL: Token Feature Rows ──▸ Mean-Pooled 6-Float Vector Bars */
        <div className="space-y-1 pt-0.5">
          {(lookupNode.customVisual?.rows ?? [])
            .slice(0, compact ? 1 : 2)
            .map((row, rIdx) => {
              const rowProg = Math.max(
                0,
                Math.min(1, (effProgress - rIdx * 0.18) / 0.55)
              );
              const rowHex = row.color ? activePalette[row.color] : accentHex;
              return (
                <div
                  key={rIdx}
                  className="flex items-center gap-1.5 text-[9.5px] font-mono bg-[#25272B] px-2 py-0.5 rounded border border-[#34363B]"
                  style={{ opacity: Math.max(0.2, rowProg) }}
                >
                  <span className="font-semibold shrink-0" style={{ color: rowHex }}>
                    {row.leftChip}
                  </span>
                  <span className="text-[#868A91] shrink-0">──▸</span>
                  <span className="text-[#DFE1E5] flex-1 min-w-0 text-left truncate">
                    {rowProg < 0.25 ? 'looking up row...' : row.rightValue}
                  </span>
                </div>
              );
            })}
          <div className="flex items-center gap-1 bg-[#25272B] px-2 py-0.5 rounded border border-[#34363B] overflow-hidden">
            <span className="font-mono text-[9px] text-[#D9A354] font-semibold shrink-0">
              Mean-Pool ÷4 ──▸
            </span>
            {(vectorBarNodes[0].customVisual?.floats ?? [])
              .slice(0, compact ? 4 : 5)
              .map((fVal, fIdx) => {
                const animVal = Number((fVal * effProgress).toFixed(2));
                return (
                  <span
                    key={fIdx}
                    className="px-1 py-0.2 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-[9px] font-semibold shrink-0"
                    style={{
                      color: fVal < 0 ? '#D46A6E' : '#6AAB73',
                    }}
                  >
                    {animVal >= 0 ? `+${animVal.toFixed(2)}` : animVal.toFixed(2)}
                  </span>
                );
              })}
          </div>
        </div>
      ) : docScrollNode?.customVisual?.lines?.length ? (
        /* DOC-SCROLL: Stacked Document / Graph Spines + Separator */
        <div className="space-y-1 pt-0.5">
          {docScrollNode.customVisual.lines.slice(0, maxRowSlice).map((ln, lIdx) => {
            const rowProg = Math.max(
              0,
              Math.min(1, (effProgress - lIdx * 0.22) / 0.55)
            );
            const isSep = ln.trim().startsWith('---');
            return (
              <div
                key={lIdx}
                style={{ opacity: Math.max(0.2, rowProg) }}
                className={`text-[9.5px] font-mono px-2 py-0.5 rounded border text-left truncate ${
                  isSep
                    ? 'bg-[#2B2520] border-[#D9A354]/40 text-[#D9A354] font-semibold'
                    : 'bg-[#25272B] border-[#34363B] text-[#DFE1E5]'
                }`}
              >
                {rowProg < 0.2 ? 'joining block...' : ln}
              </div>
            );
          })}
        </div>
      ) : tokenTilesNode?.customVisual?.tiles?.length &&
        lookupNode &&
        !podiumNode &&
        vectorBarNodes.length === 0 ? (
        /* SPLIT-TOKENS: Sliced Word Tiles + Cleanup Gate Rules */
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center gap-1 overflow-hidden">
            {tokenTilesNode.customVisual.tiles
              .slice(0, compact ? 4 : 5)
              .map((t: VisualTileItem, tIdx: number) => {
                const tileProg = Math.max(
                  0,
                  Math.min(1, (effProgress - tIdx * 0.12) / 0.45)
                );
                const tileHex = t.color ? activePalette[t.color] : accentHex;
                return (
                  <div
                    key={tIdx}
                    style={{ opacity: Math.max(0.2, tileProg) }}
                    className="px-1.5 py-0.5 rounded bg-[#25272B] border border-[#34363B] font-mono text-[9px] truncate"
                  >
                    <span style={{ color: tileHex }} className="font-semibold">
                      {t.text}
                    </span>
                    {t.subtext && (
                      <span className="text-[#868A91] ml-1">{t.subtext}</span>
                    )}
                  </div>
                );
              })}
          </div>
          {(lookupNode.customVisual?.rows ?? [])
            .slice(0, compact ? 1 : 2)
            .map((row, rIdx) => {
              const rowProg = Math.max(
                0,
                Math.min(1, (effProgress - 0.25 - rIdx * 0.2) / 0.5)
              );
              const rowHex = row.color ? activePalette[row.color] : accentHex;
              return (
                <div
                  key={rIdx}
                  style={{ opacity: Math.max(0.2, rowProg) }}
                  className="flex items-center justify-start gap-2 text-[9.5px] font-mono bg-[#25272B] px-2 py-0.5 rounded border border-[#34363B]"
                >
                  <span
                    className="font-semibold shrink-0 px-1.5 py-0.2 rounded bg-[#1E1F22] border border-[#393B40]"
                    style={{ color: rowHex }}
                  >
                    {row.leftChip}
                  </span>
                  <span
                    className="font-mono text-[9.5px] shrink-0"
                    style={{ color: rowHex }}
                  >
                    ──▸
                  </span>
                  <span className="text-[#DFE1E5] flex-1 min-w-0 text-left truncate">
                    {rowProg < 0.2 ? 'applying rule...' : row.rightValue}
                  </span>
                </div>
              );
            })}
        </div>
      ) : previewRows.length > 0 ? (
        /* UNIFIED ROWS: Score-Meters, Heatmap-Spotlight, Podium-Rank, Gate-Keep-Drop, Blueprint-Slots, Citation-Verifier, Lookup-Table */
        <div className="space-y-1 pt-0.5">
          {previewRows.slice(0, maxRowSlice).map((row, rIdx) => {
            const rowProg = Math.max(
              0,
              Math.min(1, (effProgress - rIdx * 0.18) / 0.58)
            );
            const rowHex = row.color ? activePalette[row.color] : accentHex;
            const animatedPct =
              typeof row.barPercent === 'number'
                ? Math.round(row.barPercent * rowProg)
                : undefined;

            return (
              <div
                key={rIdx}
                style={{ opacity: Math.max(0.25, rowProg) }}
                className="flex items-center justify-start gap-2 text-[9.5px] font-mono bg-[#25272B] px-2 py-0.5 rounded border border-[#34363B]"
              >
                <span
                  className="font-semibold shrink-0 px-1.5 py-0.2 rounded bg-[#1E1F22] border border-[#393B40]"
                  style={{ color: rowHex }}
                >
                  {row.leftChip}
                </span>
                {typeof animatedPct === 'number' ? (
                  <div className="w-14 h-1.5 bg-[#18191B] rounded overflow-hidden shrink-0 border border-[#34363B]">
                    <div
                      className="h-full rounded transition-all duration-75"
                      style={{
                        width: `${Math.max(4, Math.min(100, animatedPct))}%`,
                        backgroundColor: rowHex,
                      }}
                    />
                  </div>
                ) : (
                  <span
                    className="font-mono text-[9.5px] shrink-0"
                    style={{ color: rowHex }}
                  >
                    ──▸
                  </span>
                )}
                <span className="text-[#DFE1E5] flex-1 min-w-0 text-left truncate">
                  {rowProg < 0.2 ? 'updating...' : row.rightValue}
                </span>
              </div>
            );
          })}
        </div>
      ) : tokenTilesNode?.customVisual?.tiles?.length ? (
        /* TOKEN-TILES ONLY */
        <div className="flex items-center gap-1.5 overflow-hidden pt-0.5">
          {tokenTilesNode.customVisual.tiles.slice(0, 5).map((t, tIdx) => {
            const tileProg = Math.max(
              0,
              Math.min(1, (effProgress - tIdx * 0.15) / 0.5)
            );
            const tileHex = t.color ? activePalette[t.color] : accentHex;
            return (
              <div
                key={tIdx}
                style={{ opacity: Math.max(0.2, tileProg) }}
                className="px-1.5 py-0.5 rounded bg-[#25272B] border border-[#34363B] font-mono text-[9.5px] truncate"
              >
                <span style={{ color: tileHex }} className="font-semibold">
                  {t.text}
                </span>
                {t.subtext && (
                  <span className="text-[#868A91] ml-1">{t.subtext}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* FULL INSPECT FLOWCHART FALLBACK */
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          {l2Nodes.slice(0, 3).map((fnNode, nIdx) => {
            const nodeProg = Math.max(
              0,
              Math.min(1, (effProgress - nIdx * 0.22) / 0.55)
            );
            const fnHex = activePalette[fnNode.accentColor] ?? accentHex;
            return (
              <div
                key={fnNode.id}
                style={{ opacity: Math.max(0.25, nodeProg) }}
                className="bg-[#25272B] border border-[#393B40] rounded px-2 py-1 min-w-0 text-left"
              >
                <div
                  className="font-mono text-[9.5px] font-semibold truncate"
                  style={{ color: fnHex }}
                >
                  {fnNode.stepBadge ? `${fnNode.stepBadge} ` : ''}
                  {fnNode.label}
                </div>
                <div className="font-sans text-[9px] text-[#BCBEC4] truncate mt-0.5">
                  {fnNode.roleSummary || fnNode.subtitle}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface InspectPreviewDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Interactive Documentation Modal for the 12 Inspect Preview Function Archetypes + Reactive Display Lifecycle.
 */
export const InspectPreviewDocsModal: React.FC<InspectPreviewDocsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedId, setSelectedId] =
    useState<InspectPreviewArchetypeId>('split-tokens');

  if (!isOpen) return null;

  const selectedDoc =
    INSPECT_PREVIEW_ARCHETYPE_CATALOG.find((d) => d.id === selectedId) ??
    INSPECT_PREVIEW_ARCHETYPE_CATALOG[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[86vh] bg-[#2B2D30] border border-[#4E5157] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#DFE1E5]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-4 py-3 bg-[#1E1F22] border-b border-[#393B40] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-[#56A8F5]" />
            <div>
              <h2 className="text-sm font-semibold text-[#DFE1E5]">
                Inspect Preview Function Archetypes &amp; Reactive Display Docs
              </h2>
              <p className="text-[11px] font-mono text-[#868A91]">
                src/components/InspectPreviewArchetypes.tsx · src/docs/INSPECT_PREVIEW_ARCHETYPES.md
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#35373B] text-[#868A91] hover:text-[#DFE1E5] cursor-pointer"
            aria-label="Close documentation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reactive Display Lifecycle Banner */}
        <div className="px-4 py-2.5 bg-[#232529] border-b border-[#393B40] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[#D9A354]" />
            <span className="font-semibold text-[#DFE1E5]">
              Reactive Display Lifecycle:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-[#1E1F22] border border-[#393B40] text-[#868A91]">
              1. waiting (none)
            </span>
            <span className="text-[#6F737A]">──▸</span>
            <span className="px-2 py-0.5 rounded bg-[#2B2520] border border-[#D9A354]/50 text-[#D9A354]">
              2. in-flight (packet on wire)
            </span>
            <span className="text-[#6F737A]">──▸</span>
            <span className="px-2 py-0.5 rounded bg-[#202D42] border border-[#3574F0] text-[#56A8F5]">
              3. updating (packet enters port ➔ animate 0..100%)
            </span>
            <span className="text-[#6F737A]">──▸</span>
            <span className="px-2 py-0.5 rounded bg-[#1E2620] border border-[#3B523F] text-[#6AAB73]">
              4. ready (settled)
            </span>
          </div>
        </div>

        {/* Body: Left Archetype List + Right Detailed Specification */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#393B40] bg-[#1E1F22] overflow-y-auto p-2 space-y-1">
            {INSPECT_PREVIEW_ARCHETYPE_CATALOG.map((item) => {
              const active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-xs font-mono flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2E436E] text-[#DFE1E5] border border-[#3574F0]'
                      : 'text-[#BCBEC4] hover:bg-[#2B2D30]'
                  }`}
                >
                  <span className="truncate">
                    {item.number}. {item.id}
                  </span>
                  <Sparkles className="w-3 h-3 shrink-0 text-[#56A8F5]" />
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="border-b border-[#393B40] pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#1E1F22] border border-[#3574F0] font-mono text-xs text-[#56A8F5] font-semibold">
                  Archetype #{selectedDoc.number} · {selectedDoc.id}
                </span>
              </div>
              <h3 className="text-base font-semibold text-[#DFE1E5] mt-2">
                {selectedDoc.title}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-xs text-[#868A91]">Target Functions:</span>
                {selectedDoc.functionExamples.map((fn) => (
                  <span
                    key={fn}
                    className="px-2 py-0.5 rounded bg-[#1E1F22] border border-[#393B40] font-mono text-xs text-[#6AAB73]"
                  >
                    {fn}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="p-3 rounded bg-[#1E1F22] border border-[#393B40]">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#56A8F5] mb-1">
                  Visual Anatomy in Card
                </div>
                <p className="text-[#DFE1E5]">{selectedDoc.visualAnatomy}</p>
              </div>

              <div className="p-3 rounded bg-[#1E1F22] border border-[#393B40]">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#D9A354] mb-1">
                  Reactive Display Animation (Packet Arrival Triggered)
                </div>
                <p className="text-[#DFE1E5]">{selectedDoc.reactiveBehavior}</p>
              </div>

              <div className="p-3 rounded bg-[#1E1F22] border border-[#393B40]">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#6AAB73] mb-1">
                  When to Use in Future Walkthroughs
                </div>
                <p className="text-[#DFE1E5]">{selectedDoc.whenToUse}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
