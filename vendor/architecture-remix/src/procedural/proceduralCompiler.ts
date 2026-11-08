import {
  computeDynamicCardDimensions,
  computeProceduralCompoundContainerSpec,
  normalizeGraphId,
} from '../layout/elkLayout';
import {
  ArchitectureGraph,
  CodeLineItem,
  CompoundChildBlockSpec,
  CompoundContainerSpec,
  ContextualQuestion,
  CustomVisualCardSpec,
  FunctionLessonId,
  GraphEdge,
  GraphNode,
  NodeAccentColor,
  NodeId,
  NonSummaryInputItem,
  PacketSpec,
  StaticDataEntry,
  Step,
  SubFunctionLesson,
  SubsystemGroup,
  WorkedExampleLedger,
} from '../types/lesson';

export type FlowchartArchetype =
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
  | 'citation-verifier';

export interface ProceduralStepSpec {
  id: string;
  name: string;
  iconName: string;
  accentColor: NodeAccentColor;
  lineNumber: number;
  goalText: string;
  inputLabel: string;
  inputValue: string;
  outputLabel: string;
  outputValue: string;
  inputs: NonSummaryInputItem[];
  staticHelper?: {
    id: string;
    name: string;
    iconName: string;
    accentColor: NodeAccentColor;
    entries: StaticDataEntry[];
  };
  archetype?: FlowchartArchetype;
  droppedBranchLabel?: string;
}

export interface ProceduralFunctionSpec {
  id: FunctionLessonId;
  functionName: string;
  signature: string;
  fileName: string;
  codebaseRange: string;
  parentBeatNumber: number;
  parentNodeId: NodeId;
  entryInputs: {
    id: string;
    name: string;
    kind?: 'input' | 'store';
    iconName: string;
    accentColor: NodeAccentColor;
    entries: StaticDataEntry[];
    feedsStepId?: string;
  }[];
  steps: ProceduralStepSpec[];
  returnOutput: {
    id: string;
    name: string;
    iconName: string;
    accentColor: NodeAccentColor;
    entries: StaticDataEntry[];
  };
}

export interface CompiledWalkthroughBundle {
  id: string;
  title: string;
  sourceCode: string;
  sampleInput: string;
  compileTimeMs: number;
  macroGraph: ArchitectureGraph;
  macroSteps: Step[];
  subFunctions: Record<FunctionLessonId, SubFunctionLesson>;
  contextualQuestions: ContextualQuestion[];
  aiFillStatus: 'procedural-only' | 'filling' | 'filled' | 'error';
  aiFillTimeMs?: number;
}

export interface AiExplanatoryGapPayload {
  beatExplanations?: {
    beatNumber: number;
    question: string;
    narration: string;
    takeaway: string;
    goalText: string;
    lineExplanation: string;
  }[];
  nodeExplanations?: {
    nodeId: string;
    subtitle: string;
    description: string;
    roleSummary: string;
  }[];
  subStepExplanations?: {
    stepId: string;
    goalText: string;
    narration: string;
    takeaway: string;
  }[];
  contextualQuestions?: {
    id: string;
    question: string;
    shortContext: string;
    answer: string;
    takeaway: string;
    codeLines: number[];
    relatedNodes: string[];
  }[];
}

/**
 * Automatically infers the best Level-2 Visual Flowchart archetype from a step's name,
 * goal description, and input/output data values when not explicitly specified.
 */
export function inferFlowchartArchetype(
  name: string,
  goalText: string,
  outputValue: string
): FlowchartArchetype {
  const sig = `${name} ${goalText} ${outputValue}`.toLowerCase();
  if (sig.includes('token') || sig.includes('split') || sig.includes('chunk') && sig.includes('parse'))
    return 'split-tokens';
  if (sig.includes('pool') || sig.includes('vocab') || sig.includes('embed') || sig.includes('encode'))
    return 'vector-pool';
  if (sig.includes('norm') || sig.includes('scale') || sig.includes('unit'))
    return 'norm-scale';
  if (sig.includes('score') || sig.includes('dot') || sig.includes('similarity') || sig.includes('bm25'))
    return 'dot-product';
  if ((sig.includes('sort') || sig.includes('rank') || sig.includes('rerank')) && !sig.includes('[:'))
    return 'podium-rank';
  if (
    sig.includes('[:') ||
    sig.includes('slice') ||
    sig.includes('top') ||
    sig.includes('cutoff') ||
    sig.includes('filter') ||
    sig.includes('limit')
  )
    return 'gate-keep-drop';
  if (sig.includes('tag') || sig.includes('badge') || sig.includes('prefix') || sig.includes('schema'))
    return 'tag-stamp';
  if (sig.includes('join') || sig.includes('concat') || sig.includes('merge_text'))
    return 'doc-scroll';
  if (
    sig.includes('rule') ||
    sig.includes('policy') ||
    sig.includes('guard') ||
    sig.includes('safe') ||
    sig.includes('ast')
  )
    return 'guardrail-shield';
  if (sig.includes('prompt') || sig.includes('assemble') || sig.includes('plan') || sig.includes('sql'))
    return 'blueprint-slots';
  if (sig.includes('attend') || sig.includes('spotlight') || sig.includes('focus') || sig.includes('exec'))
    return 'heatmap-spotlight';
  return 'citation-verifier';
}

/**
 * Procedurally builds a CompoundContainerSpec with 100% port-aligned child blocks and orthogonal internal wires.
 */
export function buildProceduralCompoundContainer(options: {
  incomingPortCount: number;
  combinerOnStepIndex?: number;
  steps: {
    id: string;
    label: string;
    sublabel: string;
    iconName: string;
    color: NodeAccentColor;
    drillDownFunctionId?: FunctionLessonId;
  }[];
  droppedBranch?: {
    id: string;
    label: string;
    sublabel: string;
    iconName?: string;
    color?: NodeAccentColor;
  };
}): CompoundContainerSpec {
  const { incomingPortCount, combinerOnStepIndex = 0, steps, droppedBranch } = options;

  const rawChildren: CompoundChildBlockSpec[] = steps.map((step, idx) => ({
    id: step.id,
    label: step.label,
    sublabel: step.sublabel,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    iconName: step.iconName,
    color: step.color,
    hasLeftCombinerBar: incomingPortCount >= 2 && idx === combinerOnStepIndex,
    drillDownFunctionId: step.drillDownFunctionId,
  }));

  if (droppedBranch) {
    rawChildren.push({
      id: droppedBranch.id,
      label: droppedBranch.label,
      sublabel: droppedBranch.sublabel,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      iconName: droppedBranch.iconName ?? 'XCircle',
      color: droppedBranch.color ?? 'rose',
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
    incomingPortCount
  ).spec;
}

/**
 * Procedurally synthesizes a complete Level-2 Visual Flowchart `SubFunctionLesson`
 * from any step's inputs, goal, and output value across all 12 visual archetypes.
 */
export function compileProceduralLevel2Flowchart(
  step: ProceduralStepSpec,
  parentFn: { id: FunctionLessonId; fileName: string; parentBeatNumber: number }
): SubFunctionLesson {
  const archetype =
    step.archetype ??
    inferFlowchartArchetype(step.name, step.goalText, step.outputValue);

  const cleanName = step.name.startsWith('@') ? step.name : `@${step.name}`;
  const prefix = step.id;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const makeVisualNode = (
    id: string,
    badge: string,
    label: string,
    kind: GraphNode['kind'],
    color: NodeAccentColor,
    customVisual: CustomVisualCardSpec
  ): GraphNode => {
    const raw: GraphNode = {
      id,
      stepBadge: badge,
      label,
      kind,
      iconName: step.iconName,
      accentColor: color,
      subtitle: customVisual.title,
      description: step.goalText,
      roleSummary: customVisual.title,
      codeReference: {
        file: parentFn.fileName,
        lines: [step.lineNumber],
        snippet: cleanName,
      },
      defaultPreview: step.outputValue,
      width: 340,
      height: 200,
      customVisual,
    };
    const dims = computeDynamicCardDimensions(raw);
    raw.width = dims.width;
    raw.height = dims.height;
    return raw;
  };

  if (archetype === 'split-tokens') {
    const inId = `${prefix}-in`;
    const tilesId = `${prefix}-tiles`;
    const filterId = `${prefix}-filter`;
    const dropId = `${prefix}-drop`;
    const outId = `${prefix}-out`;

    const words = step.inputValue
      .replace(/^["']|["']$/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'sky', {
        variant: 'paper-card',
        headerBadge: 'Raw Input String',
        title: step.inputLabel,
        lines: [step.inputValue],
        footerNote: 'Raw text entering tokenizer',
      }),
      makeVisualNode(tilesId, '②', 'Split Word Pieces', 'transform', 'amber', {
        variant: 'token-tiles',
        headerBadge: 'Word Slicer',
        title: 'Sliced Word & Symbol Pieces',
        tiles: [
          ...words.map((w, i) => ({
            text: w.replace(/[?.,!]/g, ''),
            subtext: `piece ${i + 1}`,
            color: (['sky', 'amber', 'emerald', 'violet'] as NodeAccentColor[])[i % 4],
          })),
          { text: '?', subtext: 'strip', color: 'rose' },
        ],
        footerNote: 'Split on whitespace & punctuation boundary',
      }),
      makeVisualNode(filterId, '③', 'Apply Cleanup Gate', 'transform', 'teal', {
        variant: 'lookup-table',
        headerBadge: step.inputs[1]?.name ?? '@cleanup_rules',
        title: 'Lowercase & Strip Noise',
        rows: [
          {
            leftChip: words[0] ?? 'Word',
            rightValue: `"${(words[0] ?? 'word').toLowerCase()}" (lowercased)`,
            color: 'sky',
          },
          {
            leftChip: 'stop-words',
            rightValue: 'filtered out',
            color: 'amber',
          },
          {
            leftChip: '"?"',
            rightValue: '✕ diverted to trash bin',
            color: 'rose',
          },
        ],
        footerNote: 'Keeps clean lowercase tokens only',
      }),
      makeVisualNode(dropId, '✕', 'Stripped Noise', 'output', 'rose', {
        variant: 'dropped-bin',
        headerBadge: 'Excluded Punctuation',
        title: 'Dropped: [ ? ] & Stop-Words',
        subtitle: 'Removed before downstream lookup',
      }),
      makeVisualNode(outId, '④', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        highlightText: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: tilesId, label: 'slice', relationship: 'data', description: 'Splits raw text.' },
      { id: `${prefix}-e2`, source: tilesId, target: filterId, label: 'pieces', relationship: 'data', description: 'Applies cleanup rules.' },
      { id: `${prefix}-e3`, source: filterId, target: outId, label: 'clean tokens', relationship: 'data', description: 'Emits clean tokens.' },
      { id: `${prefix}-edrop`, source: filterId, target: dropId, label: 'drop "?"', relationship: 'reference', description: 'Drops punctuation.' }
    );
  } else if (archetype === 'vector-pool') {
    const t1 = `${prefix}-t1`;
    const t2 = `${prefix}-t2`;
    const tbl = `${prefix}-tbl`;
    const fnl = `${prefix}-fnl`;
    const out = `${prefix}-out`;

    nodes.push(
      makeVisualNode(t1, 'T1', 'Tokens [0..1]', 'input', 'sky', {
        variant: 'token-tiles',
        headerBadge: 'Input Tokens (Part 1)',
        title: 'Leading Tokens',
        tiles: [
          { text: 'token_0', subtext: 'ID 431', color: 'sky' },
          { text: 'token_1', subtext: 'ID 892', color: 'amber' },
        ],
      }),
      makeVisualNode(t2, 'T2', 'Tokens [2..3]', 'input', 'mint', {
        variant: 'token-tiles',
        headerBadge: 'Input Tokens (Part 2)',
        title: 'Trailing Tokens',
        tiles: [
          { text: 'token_2', subtext: 'ID 204', color: 'rose' },
          { text: 'token_3', subtext: 'ID 977', color: 'mint' },
        ],
      }),
      makeVisualNode(tbl, '②', 'Feature Lookup Table', 'store', 'violet', {
        variant: 'lookup-table',
        headerBadge: step.inputs[1]?.name ?? '@vocab_table',
        title: 'Token ➔ 6-Number Vector Row',
        rows: [
          { leftChip: 'ID 431', rightValue: '[+0.10, -0.60, +0.12, +1.10...]', color: 'sky' },
          { leftChip: 'ID 892', rightValue: '[+0.42, -1.12, +0.20, +1.64...]', color: 'amber' },
          { leftChip: 'ID 204', rightValue: '[+0.14, -0.80, +0.10, +1.22...]', color: 'rose' },
          { leftChip: 'ID 977', rightValue: '[+0.30, -1.00, +0.22, +1.72...]', color: 'mint' },
        ],
      }),
      makeVisualNode(fnl, '③', 'Mean-Pool Funnel', 'transform', 'amber', {
        variant: 'funnel-pool',
        headerBadge: 'Column-Wise Average',
        title: 'Blend 4 Rows ➔ 1 Vector',
        lines: [
          'Col 1: sum(row_0..row_3) ÷ 4 = +0.24',
          'Col 2: sum(row_0..row_3) ÷ 4 = -0.88',
          'Col 4: sum(row_0..row_3) ÷ 4 = +1.42',
        ],
        footerNote: 'Compresses variable-length tokens into 1 fixed vector',
      }),
      makeVisualNode(out, '④', step.outputLabel, 'output', 'mint', {
        variant: 'vector-bars',
        headerBadge: step.outputLabel,
        title: 'Pooled 6-Number Vector',
        normLabel: 'Length ||v|| = 2.0 (unscaled)',
        floats: [0.24, -0.88, 0.16, 1.42, -0.42, 0.72],
        footerNote: step.outputValue,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: t1, target: tbl, label: 'tokens 1..2', relationship: 'data', description: 'Looks up token IDs.' },
      { id: `${prefix}-e2`, source: t2, target: tbl, label: 'tokens 3..4', relationship: 'data', description: 'Looks up token IDs.' },
      { id: `${prefix}-e3`, source: tbl, target: fnl, label: '4 vector rows', relationship: 'data', description: 'Pools rows.' },
      { id: `${prefix}-e4`, source: fnl, target: out, label: 'pooled vec', relationship: 'data', description: 'Outputs 6 floats.' }
    );
  } else if (archetype === 'norm-scale') {
    const rawId = `${prefix}-raw`;
    const scaleId = `${prefix}-scale`;
    const outId = `${prefix}-out`;
    nodes.push(
      makeVisualNode(rawId, '①', step.inputLabel, 'input', 'violet', {
        variant: 'vector-bars',
        headerBadge: 'Before Scaling (||v|| = 2.0)',
        title: step.inputLabel,
        normLabel: 'Length ||v|| = 2.00',
        floats: [0.24, -0.88, 0.16, 1.42, -0.42, 0.72],
        footerNote: step.inputValue,
      }),
      makeVisualNode(scaleId, '②', 'Divide by Length ||v||', 'transform', 'amber', {
        variant: 'funnel-pool',
        headerBadge: 'Unit Circle Scaler (v ÷ ||v||)',
        title: 'Divide Every Number by 2.0',
        lines: [
          '0.24 ÷ 2.0 ➔  0.12',
          '-0.88 ÷ 2.0 ➔ -0.44',
          '1.42 ÷ 2.0 ➔  0.71',
          '0.72 ÷ 2.0 ➔  0.36',
        ],
        footerNote: 'Direction stays identical; length shrinks 2.0 ➔ 1.0',
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'vector-bars',
        headerBadge: 'After Scaling (||v|| = 1.0)',
        title: step.outputLabel,
        normLabel: 'Length ||v|| = 1.00 ✓ Ready for comparison',
        floats: [0.12, -0.44, 0.08, 0.71, -0.21, 0.36],
        footerNote: step.outputValue,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: rawId, target: scaleId, label: '||v|| = 2.0', relationship: 'data', description: 'Measures L2 length.' },
      { id: `${prefix}-e2`, source: scaleId, target: outId, label: '||v|| = 1.0', relationship: 'data', description: 'Emits normalized vector.' }
    );
  } else if (archetype === 'dot-product') {
    const qId = `${prefix}-query`;
    const d1 = `${prefix}-doc1`;
    const d2 = `${prefix}-doc2`;
    const d3 = `${prefix}-doc3`;
    const outId = `${prefix}-out`;

    const isRepoScore =
      step.name.includes('score_files') || step.outputValue.includes('browser_lessons.py');

    nodes.push(
      makeVisualNode(qId, '①', step.inputLabel, 'input', 'amber', {
        variant: 'paper-card',
        headerBadge: 'Query Input',
        title: step.inputLabel,
        lines: [step.inputValue],
        footerNote: 'Broadcasts to 3 candidates in parallel ➔',
      }),
      makeVisualNode(
        d1,
        'A',
        isRepoScore ? 'browser_lessons.py' : 'Candidate A (Strong)',
        'search',
        'mint',
        {
          variant: 'score-meter',
          headerBadge: 'Candidate #1',
          title: isRepoScore ? 'browser_lessons.py' : 'Primary Match Alignment',
          highlightText: isRepoScore ? '0.94' : '0.89',
          rows: [
            {
              leftChip: isRepoScore ? 'browser_lessons.py' : 'Candidate A',
              rightValue: isRepoScore ? '0.94 (High AST centrality)' : '0.89 (High)',
              color: 'mint',
              barPercent: isRepoScore ? 94 : 89,
            },
          ],
        }
      ),
      makeVisualNode(
        d2,
        'B',
        isRepoScore ? 'architecture_flow.py' : 'Candidate B (Medium)',
        'search',
        'sky',
        {
          variant: 'score-meter',
          headerBadge: 'Candidate #2',
          title: isRepoScore ? 'architecture_flow.py' : 'Secondary Match Alignment',
          highlightText: isRepoScore ? '0.91' : '0.64',
          rows: [
            {
              leftChip: isRepoScore ? 'architecture_flow.py' : 'Candidate B',
              rightValue: isRepoScore ? '0.91 (Core layout module)' : '0.64 (Medium)',
              color: 'sky',
              barPercent: isRepoScore ? 91 : 64,
            },
          ],
        }
      ),
      makeVisualNode(
        d3,
        'C',
        isRepoScore ? 'tests/test_cli.py' : 'Candidate C (Weak)',
        'search',
        'rose',
        {
          variant: 'score-meter',
          headerBadge: 'Candidate #3',
          title: isRepoScore ? 'tests/test_cli.py' : 'Off-Topic Alignment',
          highlightText: isRepoScore ? '0.14' : '0.18',
          rows: [
            {
              leftChip: isRepoScore ? 'tests/test_cli.py' : 'Candidate C',
              rightValue: isRepoScore ? '0.14 (Low — test artifact)' : '0.18 (Low)',
              color: 'rose',
              barPercent: isRepoScore ? 14 : 18,
            },
          ],
        }
      ),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'teal', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: 'Sent to ranking stage next',
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: qId, target: d1, label: 'compare A', relationship: 'data', description: 'Scores candidate A.' },
      { id: `${prefix}-e2`, source: qId, target: d2, label: 'compare B', relationship: 'data', description: 'Scores candidate B.' },
      { id: `${prefix}-e3`, source: qId, target: d3, label: 'compare C', relationship: 'data', description: 'Scores candidate C.' },
      { id: `${prefix}-e4`, source: d1, target: outId, label: isRepoScore ? '0.94' : '0.89', relationship: 'data', description: 'Emits top score.' },
      { id: `${prefix}-e5`, source: d2, target: outId, label: isRepoScore ? '0.91' : '0.64', relationship: 'data', description: 'Emits second score.' },
      { id: `${prefix}-e6`, source: d3, target: outId, label: isRepoScore ? '0.14' : '0.18', relationship: 'data', description: 'Emits low score.' }
    );
  } else if (archetype === 'podium-rank') {
    const inId = `${prefix}-in`;
    const podId = `${prefix}-podium`;
    const outId = `${prefix}-out`;
    const isRepoRank =
      step.name.includes('rank_modules') || step.outputValue.includes('browser_lessons.py');

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'teal', {
        variant: 'token-tiles',
        headerBadge: 'Scored Candidates',
        title: 'Compare Scores (reverse=True)',
        tiles: [
          { text: isRepoRank ? '0.94' : '0.89', subtext: isRepoRank ? 'lessons.py' : 'cand 1', color: 'mint' },
          { text: isRepoRank ? '0.91' : '0.64', subtext: isRepoRank ? 'arch_flow.py' : 'cand 2', color: 'sky' },
          { text: isRepoRank ? '0.14' : '0.18', subtext: isRepoRank ? 'tests/' : 'cand 3', color: 'rose' },
        ],
        footerNote: 'Highest score takes Rank #1',
      }),
      makeVisualNode(podId, '②', 'Descending Leaderboard', 'transform', 'violet', {
        variant: 'podium-rank',
        headerBadge: 'Leaderboard Podium',
        title: 'Ordered Highest Score ➔ Lowest Score',
        rows: [
          {
            leftChip: '🥇 Rank #1',
            rightValue: isRepoRank ? 'browser_lessons.py (0.94)' : 'Top Match (0.89)',
            note: 'Best match — Top of list',
            color: 'mint',
            barPercent: isRepoRank ? 94 : 89,
          },
          {
            leftChip: '🥈 Rank #2',
            rightValue: isRepoRank ? 'architecture_flow.py (0.91)' : 'Runner-Up (0.64)',
            note: 'Second match — Kept in top-k',
            color: 'sky',
            barPercent: isRepoRank ? 91 : 64,
          },
          {
            leftChip: '🥉 Rank #3',
            rightValue: isRepoRank ? 'tests/test_cli.py (0.14)' : 'Weakest (0.18)',
            note: 'Last place — Cut off next',
            color: 'rose',
            barPercent: isRepoRank ? 14 : 18,
          },
        ],
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: 'Ready for top-k slice gate',
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: podId, label: isRepoRank ? '0.94 > 0.91 > 0.14' : '0.89 > 0.64 > 0.18', relationship: 'data', description: 'Orders scores.' },
      { id: `${prefix}-e2`, source: podId, target: outId, label: 'ranked list', relationship: 'data', description: 'Emits ordered list.' }
    );
  } else if (archetype === 'gate-keep-drop') {
    const inId = `${prefix}-in`;
    const gateId = `${prefix}-gate`;
    const dropId = `${prefix}-drop`;
    const outId = `${prefix}-out`;
    const isRepoSlice =
      step.name.includes('top_k_slice') || step.outputValue.includes('browser_lessons.py');

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'violet', {
        variant: 'paper-card',
        headerBadge: 'Ranked Candidates',
        title: step.inputLabel,
        lines: [step.inputValue],
        footerNote: 'Entering top-k cutoff gate',
      }),
      makeVisualNode(gateId, '②', 'Top-K Cutoff Gate', 'assembly', 'emerald', {
        variant: 'gate-keep-drop',
        headerBadge: step.inputs[1]?.name ?? '@cutoff_limit',
        title: isRepoSlice ? 'Slice Gate: Keep Top 12 · Drop tests/' : 'Slice Gate: Keep Top 2 · Drop #3',
        rows: [
          {
            leftChip: '✓ KEEP #1',
            rightValue: isRepoSlice ? 'browser_lessons.py (0.94)' : 'Rank #1 (0.89)',
            note: 'passes gate',
            color: 'mint',
          },
          {
            leftChip: '✓ KEEP #2',
            rightValue: isRepoSlice ? 'architecture_flow.py (0.91)' : 'Rank #2 (0.64)',
            note: 'passes gate',
            color: 'sky',
          },
          {
            leftChip: '✕ DROP #3',
            rightValue: isRepoSlice ? 'tests/ & dist/ (0.14)' : 'Rank #3 (0.18)',
            note: 'blocked by cutoff',
            color: 'rose',
          },
        ],
      }),
      makeVisualNode(dropId, '✕', 'Excluded Branch', 'output', 'rose', {
        variant: 'dropped-bin',
        headerBadge: 'Excluded by Cutoff',
        title: step.droppedBranchLabel ?? 'Dropped: Rank #3 (0.18)',
        subtitle: 'Prevented from polluting downstream context',
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: gateId, label: 'ranked items', relationship: 'data', description: 'Enters cutoff gate.' },
      { id: `${prefix}-e2`, source: gateId, target: outId, label: 'kept winners', relationship: 'data', description: 'Emits kept matches.' },
      { id: `${prefix}-edrop`, source: gateId, target: dropId, label: 'drop #3', relationship: 'reference', description: 'Drops low-ranked item.' }
    );
  } else if (archetype === 'tag-stamp') {
    const inId = `${prefix}-in`;
    const stampId = `${prefix}-stamp`;
    const outId = `${prefix}-out`;
    const isRepoTag =
      step.name.includes('TagSourceSpans') || step.outputValue.includes('browser_lessons.py');

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'teal', {
        variant: 'paper-card',
        headerBadge: 'Untagged Input',
        title: step.inputLabel,
        lines: [step.inputValue],
      }),
      makeVisualNode(stampId, '②', 'Source ID Stamper', 'transform', 'amber', {
        variant: 'lookup-table',
        headerBadge: step.inputs[1]?.name ?? '@tag_template',
        title: 'Stamp Bracketed [source-id] Prefix',
        rows: isRepoTag
          ? [
              {
                leftChip: '[span-1]',
                rightValue: '"[browser_lessons.py:1858] plan_storyboard()"',
                color: 'mint',
              },
              {
                leftChip: '[span-2]',
                rightValue: '"[architecture_flow.py:118] author_arch_flow()"',
                color: 'sky',
              },
            ]
          : [
              {
                leftChip: '[doc-1]',
                rightValue: '"[refund-policy] Refund requests within 30 days..."',
                color: 'mint',
              },
              {
                leftChip: '[doc-2]',
                rightValue: '"[returns-guide] Include your order number..."',
                color: 'sky',
              },
            ],
        footerNote: 'Preserves provenance for downstream citation',
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: stampId, label: 'raw items', relationship: 'data', description: 'Feeds items to stamper.' },
      { id: `${prefix}-e2`, source: stampId, target: outId, label: 'tagged items', relationship: 'data', description: 'Emits tagged strings.' }
    );
  } else if (archetype === 'doc-scroll') {
    const inId = `${prefix}-in`;
    const scrollId = `${prefix}-scroll`;
    const outId = `${prefix}-out`;
    const isRepoJoin =
      step.name.includes('JoinGraphEdges') || step.outputValue.includes('browser_lessons.py');

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'amber', {
        variant: 'paper-card',
        headerBadge: 'Separate Chunks',
        title: step.inputLabel,
        lines: [step.inputValue],
      }),
      makeVisualNode(scrollId, '②', 'Unified Context Scroll', 'assembly', 'rose', {
        variant: 'doc-scroll',
        headerBadge: isRepoJoin ? 'Joined 2-Band ArchitectureGraph' : 'Joined Document Block',
        title: isRepoJoin
          ? 'Wire Top Spine + Bottom Repo Spine'
          : 'Concatenated with "\\n\\n" Separator',
        lines: isRepoJoin
          ? [
              'Band 0 (Top): [browser_lessons.py:1858] plan ──▸ assemble ──▸ review',
              '--- (Port-aligned cross-band wires + combiner bars) ---',
              'Band 1 (Bottom): [architecture_flow.py:118] scan_repo_ast ──▸ author_arch_flow',
            ]
          : [
              '[refund-policy] Refund requests must be submitted within 30 days of purchase.',
              '--- ("\\n\\n" blank line separator) ---',
              '[returns-guide] Include your order number when contacting support.',
            ],
        footerNote: isRepoJoin
          ? 'Unified 5-container graph ready for assemble_lesson()'
          : 'Single string ready for prompt insertion',
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: scrollId, label: 'chunks', relationship: 'data', description: 'Glues chunks together.' },
      { id: `${prefix}-e2`, source: scrollId, target: outId, label: 'context string', relationship: 'data', description: 'Emits unified string.' }
    );
  } else if (archetype === 'guardrail-shield') {
    const inId = `${prefix}-in`;
    const shieldId = `${prefix}-shield`;
    const outId = `${prefix}-out`;

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'emerald', {
        variant: 'paper-card',
        headerBadge: 'Policy Input',
        title: step.inputLabel,
        lines: [step.inputValue],
      }),
      makeVisualNode(shieldId, '②', 'Grounding & Safety Guardrails', 'transform', 'emerald', {
        variant: 'lookup-table',
        headerBadge: 'Guardrail Checklist',
        title: 'Enforce Grounding & Citation Constraints',
        rows: [
          { leftChip: '✓ ALLOWED', rightValue: 'Use supplied context facts only', color: 'mint' },
          { leftChip: '✕ FORBIDDEN', rightValue: 'Never guess or invent unverified claims', color: 'rose' },
          { leftChip: '✓ REQUIRED', rightValue: 'Cite bracketed [source-id] for every claim', color: 'amber' },
        ],
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: shieldId, label: 'policy spec', relationship: 'data', description: 'Configures guardrails.' },
      { id: `${prefix}-e2`, source: shieldId, target: outId, label: 'enforced rules', relationship: 'data', description: 'Emits guardrail header.' }
    );
  } else if (archetype === 'blueprint-slots') {
    const inItems =
      step.inputs.length > 0
        ? step.inputs
        : [{ name: step.inputLabel, value: step.inputValue, color: step.accentColor }];
    const hubId = `${prefix}-hub`;
    const outId = `${prefix}-out`;

    inItems.forEach((inp, idx) => {
      const inNodeId = `${prefix}-in-${idx}`;
      nodes.push(
        makeVisualNode(inNodeId, `IN ${idx + 1}`, inp.name, 'input', inp.color ?? 'sky', {
          variant: 'paper-card',
          headerBadge: `Slot Input ${idx + 1}`,
          title: inp.name,
          lines: [inp.value],
        })
      );
      edges.push({
        id: `${prefix}-ein-${idx}`,
        source: inNodeId,
        target: hubId,
        label: inp.name,
        relationship: 'data',
        description: `Locks ${inp.name} into slot ${idx + 1}.`,
      });
    });

    nodes.push(
      makeVisualNode(hubId, '②', '3-Slot Blueprint Assembler', 'assembly', 'amber', {
        variant: 'blueprint-slots',
        headerBadge: 'Structured Template Slots',
        title: `${cleanName} — Lock Inputs into Template`,
        rows: inItems.map((inp, i) => ({
          leftChip: `SLOT ${i + 1} · ${inp.name}`,
          rightValue: inp.value,
          color: inp.color ?? 'amber',
        })),
        footerNote: `Produces ${step.outputLabel}`,
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        highlightText: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push({
      id: `${prefix}-eout`,
      source: hubId,
      target: outId,
      label: step.outputLabel,
      relationship: 'data',
      description: `Outputs ${step.outputLabel}.`,
    });
  } else if (archetype === 'heatmap-spotlight') {
    const inId = `${prefix}-in`;
    const beamId = `${prefix}-beam`;
    const outId = `${prefix}-out`;
    const isFrameReview =
      step.name.includes('attend_frames') || step.outputValue.includes('FrameReviewVerdict');

    nodes.push(
      makeVisualNode(inId, '①', step.inputLabel, 'input', 'amber', {
        variant: 'paper-card',
        headerBadge: 'Assembled Input',
        title: step.inputLabel,
        lines: [step.inputValue],
      }),
      makeVisualNode(beamId, '②', 'Attention Relevance Spotlight', 'search', 'teal', {
        variant: 'heatmap-spotlight',
        headerBadge: isFrameReview
          ? 'Playwright 35% & 75% Beat Audit'
          : 'Token-to-Context Attention Weights',
        title: isFrameReview
          ? 'Audit Rendered Canvas Snapshots'
          : 'Lock Attention onto High-Signal Span',
        rows: [
          {
            leftChip: '94% FOCUS',
            rightValue: isFrameReview
              ? 'Beat @ 35% & 75% progress — 0 overlaps, legibility PASS'
              : step.outputValue,
            note: 'Primary evidence span',
            color: 'mint',
            barPercent: 94,
          },
          {
            leftChip: '6% FOCUS',
            rightValue: isFrameReview
              ? 'Outer canvas margins & inactive background grid'
              : 'Secondary procedural notes',
            note: 'Background context',
            color: 'sky',
            barPercent: 6,
          },
        ],
      }),
      makeVisualNode(outId, '③', step.outputLabel, 'output', 'mint', {
        variant: 'output-pill',
        headerBadge: step.outputLabel,
        title: step.outputValue,
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: inId, target: beamId, label: 'scan context', relationship: 'data', description: 'Scans context for target span.' },
      { id: `${prefix}-e2`, source: beamId, target: outId, label: 'focused span', relationship: 'data', description: 'Emits spotlit evidence.' }
    );
  } else {
    // citation-verifier
    const in1 = `${prefix}-in1`;
    const in2 = `${prefix}-in2`;
    const verId = `${prefix}-verify`;

    nodes.push(
      makeVisualNode(in1, 'IN 1', step.inputs[0]?.name ?? step.inputLabel, 'input', 'mint', {
        variant: 'paper-card',
        headerBadge: 'Focused Evidence',
        title: step.inputs[0]?.name ?? step.inputLabel,
        lines: [step.inputs[0]?.value ?? step.inputValue],
      }),
      makeVisualNode(in2, 'IN 2', step.inputs[1]?.name ?? '@citation_rule', 'input', 'amber', {
        variant: 'paper-card',
        headerBadge: 'Verification Rule',
        title: step.inputs[1]?.name ?? '@citation_rule',
        lines: [step.inputs[1]?.value ?? 'Attach [source-id] & verify claim match'],
      }),
      makeVisualNode(verId, '②', 'Grounded Claim & Citation Verifier', 'generation', 'violet', {
        variant: 'citation-verifier',
        headerBadge: 'Grounded Generation & Verification Check',
        title: step.outputValue,
        rows: [
          {
            leftChip: 'CLAIM CHECK',
            rightValue: `✓ Grounded in ${step.inputLabel}`,
            color: 'mint',
          },
          {
            leftChip: 'CITATION CHECK',
            rightValue: '✓ Bracketed [source-id] attached & verified',
            color: 'amber',
          },
          {
            leftChip: 'NO HALLUCINATION',
            rightValue: '✓ Zero claims from excluded branches',
            color: 'sky',
          },
        ],
        footerNote: step.goalText,
      })
    );
    edges.push(
      { id: `${prefix}-e1`, source: in1, target: verId, label: 'evidence span', relationship: 'data', description: 'Supplies grounded fact.' },
      { id: `${prefix}-e2`, source: in2, target: verId, label: 'citation rule', relationship: 'lookup', description: 'Attaches citation tag.' }
    );
  }

  // Group Level-2 Flowchart edges into sequential causal stages by source node topological depth
  // so a block never receives its input and emits its output simultaneously in the same beat.
  const depthByNode = new Map<string, number>();
  for (const n of nodes) {
    depthByNode.set(n.id, 0);
  }
  for (let pass = 0; pass < nodes.length; pass++) {
    for (const e of edges) {
      const dSrc = depthByNode.get(e.source) ?? 0;
      const dTgt = depthByNode.get(e.target) ?? 0;
      if (dSrc + 1 > dTgt) {
        depthByNode.set(e.target, dSrc + 1);
      }
    }
  }

  const edgesByStage = new Map<number, GraphEdge[]>();
  for (const e of edges) {
    const stageIdx = depthByNode.get(e.source) ?? 0;
    const list = edgesByStage.get(stageIdx) ?? [];
    list.push(e);
    edgesByStage.set(stageIdx, list);
  }
  const sortedStages = Array.from(edgesByStage.keys()).sort((a, b) => a - b);

  const l2Steps: Step[] = sortedStages.map((stageIdx, bIdx) => {
    const stageEdges = edgesByStage.get(stageIdx) ?? [];
    const stageEdgeIds = stageEdges.map((e) => e.id);
    const stageNodeIds = Array.from(
      new Set([
        ...stageEdges.map((e) => e.source),
        ...stageEdges.map((e) => e.target),
      ])
    );
    const isFirstStage = bIdx === 0;
    const isLastStage = bIdx === sortedStages.length - 1;
    const lineNum = step.lineNumber + bIdx;

    const stageTitle = isFirstStage
      ? `${cleanName} · Receive ${step.inputLabel}`
      : isLastStage
      ? `${cleanName} · Emit ${step.outputLabel}`
      : `${cleanName} · Transform Stage ${bIdx + 1}`;

    const stageNarration = isFirstStage
      ? `Stage ${bIdx + 1}: ${step.inputLabel} (${step.inputValue}) flows into ${cleanName} to begin: ${step.goalText}.`
      : isLastStage
      ? `Stage ${bIdx + 1}: After processing, ${cleanName} emits ${step.outputLabel} = ${step.outputValue}.`
      : `Stage ${bIdx + 1}: Intermediate transformation inside ${cleanName} processes the data toward ${step.outputLabel}.`;

    return {
      id: `${step.id}-beat-${bIdx + 1}`,
      beatNumber: bIdx + 1,
      title: stageTitle,
      duration: 5.5,
      question: isFirstStage
        ? `What inputs enter ${cleanName}?`
        : `What output does ${cleanName} emit after processing?`,
      narration: stageNarration,
      focusNodes: stageNodeIds,
      activeNodes: stageNodeIds,
      activeEdges: stageEdgeIds,
      packets: stageEdges.map((e, idx) => ({
        edgeId: e.id,
        start: 0.3 + idx * 0.35,
        end: 3.4 + idx * 0.35,
        payload: e.label ?? 'data',
      })),
      code: { file: parentFn.fileName, lines: [lineNum] },
      stateBefore: { [step.inputLabel]: step.inputValue },
      stateAfter: isLastStage
        ? { [step.outputLabel]: step.outputValue }
        : { [step.inputLabel]: step.inputValue },
      takeaway: `${step.outputLabel}: ${step.outputValue}`,
      nodeDataBefore: {},
      nodeDataAfter: {},
    };
  });

  const l2CodeLines: CodeLineItem[] = sortedStages.map((_, bIdx) => {
    const isFirstStage = bIdx === 0;
    const isLastStage = bIdx === sortedStages.length - 1;
    return {
      lineNumber: step.lineNumber + bIdx,
      file: parentFn.fileName,
      text: isFirstStage
        ? `${cleanName} (receive inputs)`
        : isLastStage
        ? `return ${step.outputLabel}`
        : `${cleanName} (transform)`,
      explanation: isFirstStage
        ? `Receives ${step.inputLabel} into ${cleanName}.`
        : isLastStage
        ? `Emits ${step.outputLabel} from ${cleanName}.`
        : step.goalText,
      atName: isFirstStage
        ? `${cleanName} · Input`
        : isLastStage
        ? `${cleanName} · Output`
        : `${cleanName} · Step ${bIdx + 1}`,
      goalText: isFirstStage
        ? `Receive ${step.inputLabel} and apply ${cleanName}`
        : isLastStage
        ? `Emit transformed ${step.outputLabel} to output port`
        : step.goalText,
      inputLabel: step.inputLabel,
      inputValue: step.inputValue,
      outputLabel: step.outputLabel,
      resultText: step.outputValue,
    };
  });

  return {
    id: step.id,
    parentFunctionId: parentFn.id,
    parentBeatNumber: parentFn.parentBeatNumber,
    parentNodeId: step.id,
    functionName: cleanName,
    signature: `${cleanName}(${step.inputs.map((i) => i.name).join(', ')})`,
    fileName: parentFn.fileName,
    codebaseRange: `Line ${step.lineNumber}`,
    totalModuleLines: 40,
    summary: step.goalText,
    sidebarInputs: step.inputs,
    codeLines: l2CodeLines,
    graph: {
      id: `sub-graph-l2-${step.id}`,
      title: `${cleanName} — Visual Flowchart (${archetype})`,
      nodes,
      edges,
    },
    steps: l2Steps,
  };
}

/**
 * Procedurally compiles a complete Level-1 `SubFunctionLesson` (nodes, unpacked @static cards,
 * nonSummary blocks, edges, 6s-per-beat steps, moving packets, and codeLines) from a declarative
 * `ProceduralFunctionSpec`.
 */
export function compileProceduralFunctionLesson(
  spec: ProceduralFunctionSpec
): SubFunctionLesson {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Entry Input / Store Nodes (Outside Left Boundary)
  for (const inp of spec.entryInputs) {
    const n: GraphNode = {
      id: inp.id,
      stepBadge: inp.kind === 'store' ? 'DB' : 'IN',
      label: inp.name.startsWith('@') ? inp.name : `@${inp.name}`,
      kind: inp.kind ?? 'input',
      iconName: inp.iconName,
      accentColor: inp.accentColor,
      subtitle: inp.entries[0]?.value ?? 'Input',
      description: `Entry input ${inp.name} passed into ${spec.functionName}.`,
      roleSummary: `Supplies ${inp.name}.`,
      codeReference: {
        file: spec.fileName,
        lines: [spec.steps[0]?.lineNumber ?? 1],
        snippet: spec.signature,
      },
      defaultPreview: inp.entries[0]?.value ?? '',
      width: 204,
      height: 112,
      staticData: {
        header: `${inp.name.startsWith('@') ? inp.name : `@${inp.name}`} [`,
        entries: inp.entries,
      },
    };
    const dims = computeDynamicCardDimensions(n);
    n.width = dims.width;
    n.height = dims.height;
    nodes.push(n);
  }

  // 2. Main @Function Spine Nodes + Unpacked @Static Helper Cards
  spec.steps.forEach((st, idx) => {
    if (st.staticHelper) {
      const sh = st.staticHelper;
      const helperNode: GraphNode = {
        id: sh.id,
        stepBadge: '@',
        label: sh.name.startsWith('@') ? sh.name : `@${sh.name}`,
        kind: 'input',
        iconName: sh.iconName,
        accentColor: sh.accentColor,
        subtitle: sh.entries[0]?.value ?? 'Static rules',
        description: `Unpacked static data ${sh.name} connected to ${st.name}.`,
        roleSummary: `Connected to ${st.name}.`,
        codeReference: {
          file: spec.fileName,
          lines: [st.lineNumber],
          snippet: sh.name,
        },
        defaultPreview: sh.entries[0]?.value ?? '',
        width: 320,
        height: 140,
        staticData: {
          header: `${sh.name.startsWith('@') ? sh.name : `@${sh.name}`} [`,
          entries: sh.entries,
        },
      };
      const hDims = computeDynamicCardDimensions(helperNode);
      helperNode.width = hDims.width;
      helperNode.height = hDims.height;
      nodes.push(helperNode);

      edges.push({
        id: `e-${sh.id}-${st.id}`,
        source: sh.id,
        target: st.id,
        label: sh.name,
        relationship: 'lookup',
        description: `Supplies ${sh.name} to ${st.name}.`,
      });
    }

    const stepNode: GraphNode = {
      id: st.id,
      stepBadge: String.fromCodePoint(0x2460 + idx),
      label: st.name,
      kind: 'transform',
      iconName: st.iconName,
      accentColor: st.accentColor,
      subtitle: st.goalText,
      description: st.goalText,
      roleSummary: st.goalText,
      codeReference: {
        file: spec.fileName,
        lines: [st.lineNumber],
        snippet: st.name,
      },
      defaultPreview: st.outputValue,
      width: 420,
      height: 220,
      drillDownFunctionId: st.id,
      nonSummary: {
        blockTitle: st.name.startsWith('@')
          ? st.name.replace(/\(\)$/, '')
          : `@${st.name.replace(/\(\)$/, '')}`,
        inputs: st.inputs,
        goalTitle: `${st.name.replace(/^@/, '').replace(/\(\)$/, '')}'s goal:`,
        goalText: st.goalText,
        outputLabel: st.outputLabel,
        outputValue: st.outputValue,
      },
    };
    const sDims = computeDynamicCardDimensions(stepNode);
    stepNode.width = sDims.width;
    stepNode.height = sDims.height;
    nodes.push(stepNode);

    if (idx > 0) {
      const prev = spec.steps[idx - 1];
      edges.push({
        id: `e-${prev.id}-${st.id}`,
        source: prev.id,
        target: st.id,
        label: prev.outputLabel,
        relationship: 'data',
        description: `Passes ${prev.outputLabel} to ${st.name}.`,
      });
    }
  });

  // Connect entry inputs to their target step (defaults to step[0])
  for (const inp of spec.entryInputs) {
    const targetId = inp.feedsStepId ?? spec.steps[0]?.id;
    if (targetId) {
      edges.push({
        id: `e-${inp.id}-${targetId}`,
        source: inp.id,
        target: targetId,
        label: inp.name,
        relationship: 'data',
        description: `Passes ${inp.name} into ${targetId}.`,
      });
    }
  }

  // 3. Return Output Card (Outside Right Boundary)
  const ret = spec.returnOutput;
  const outNode: GraphNode = {
    id: ret.id,
    stepBadge: 'OUT',
    label: ret.name.startsWith('@') ? ret.name : `@${ret.name}`,
    kind: 'output',
    iconName: ret.iconName,
    accentColor: ret.accentColor,
    subtitle: 'Return value',
    description: `Final return value of ${spec.functionName}.`,
    roleSummary: `Returns ${ret.name}.`,
    codeReference: {
      file: spec.fileName,
      lines: [spec.steps[spec.steps.length - 1]?.lineNumber ?? 1],
      snippet: `return ${ret.name}`,
    },
    defaultPreview: ret.entries[0]?.value ?? '',
    width: 215,
    height: 132,
    staticData: {
      header: `${ret.name.startsWith('@') ? ret.name : `@${ret.name}`} [`,
      entries: ret.entries,
    },
  };
  const oDims = computeDynamicCardDimensions(outNode);
  outNode.width = oDims.width;
  outNode.height = oDims.height;
  nodes.push(outNode);

  const lastStep = spec.steps[spec.steps.length - 1];
  const returnLineNumber = (lastStep?.lineNumber ?? 1) + 12;
  if (lastStep) {
    edges.push({
      id: `e-${lastStep.id}-${ret.id}`,
      source: lastStep.id,
      target: ret.id,
      label: lastStep.outputLabel,
      relationship: 'data',
      description: `Emits ${lastStep.outputLabel} to ${ret.name}.`,
    });
  }

  // 4. Procedurally Generate CodeLines (`@step goal "..."` + `@input` / `@output` + final `@return`)
  const codeLines: CodeLineItem[] = spec.steps.map((st) => ({
    lineNumber: st.lineNumber,
    file: spec.fileName,
    text: st.name.startsWith('@') ? st.name : `@${st.name}`,
    explanation: st.goalText,
    drillDownFunctionId: st.id,
    atName: st.name.startsWith('@') ? st.name : `@${st.name}`,
    goalText: st.goalText,
    inputLabel: st.inputLabel,
    inputValue: st.inputValue,
    outputLabel: st.outputLabel,
    resultText: st.outputValue,
  }));

  if (lastStep) {
    const retAtName = ret.name.startsWith('@') ? `return ${ret.name}` : `return @${ret.name}`;
    codeLines.push({
      lineNumber: returnLineNumber,
      file: spec.fileName,
      text: retAtName,
      explanation: `Emits the completed ${lastStep.outputLabel} from ${lastStep.name} to the return output port.`,
      atName: retAtName,
      goalText: `Emit completed ${lastStep.outputLabel} to ${ret.name} output port`,
      inputLabel: lastStep.outputLabel,
      inputValue: lastStep.outputValue,
      outputLabel: ret.name.startsWith('@') ? ret.name : `@${ret.name}`,
      resultText: lastStep.outputValue,
    });
  }

  // 5. Procedurally Generate Beat Choreography (`steps` with 6s duration & packets)
  // Each step beat ONLY receives its incoming wires. A dedicated final return beat emits the output wire!
  const steps: Step[] = spec.steps.map((st, idx) => {
    const incomingToStep = edges.filter((e) => e.target === st.id);
    const focusNodeIds = Array.from(
      new Set([
        ...incomingToStep.map((e) => e.source),
        st.id,
      ])
    );

    const packets: PacketSpec[] = incomingToStep.map((e, eIdx) => ({
      edgeId: e.id,
      start: 0.3 + eIdx * 0.4,
      end: 3.4 + eIdx * 0.4,
      payload: e.label,
    }));

    return {
      id: `${spec.id}-beat-${idx + 1}`,
      beatNumber: idx + 1,
      title: st.name,
      duration: 6,
      question: `What does ${st.name} do with ${st.inputLabel}?`,
      narration: `${st.name} receives ${st.inputLabel} (${st.inputValue}) and computes ${st.outputLabel}: ${st.outputValue}.`,
      focusNodes: focusNodeIds,
      activeNodes: focusNodeIds,
      activeEdges: incomingToStep.map((e) => e.id),
      packets,
      code: { file: spec.fileName, lines: [st.lineNumber] },
      drillDownFunctionId: st.id,
      stateBefore: { [st.inputLabel]: st.inputValue },
      stateAfter: { [st.outputLabel]: st.outputValue },
      takeaway: `${st.outputLabel} = ${st.outputValue}`,
      nodeDataBefore: {},
      nodeDataAfter: {
        [st.id]: {
          statusLabel: st.outputLabel,
          previewLines: [st.outputValue],
        },
      },
    };
  });

  if (lastStep) {
    const outgoingFromLast = edges.filter((e) => e.source === lastStep.id && e.target === ret.id);
    const retBeatNum = spec.steps.length + 1;
    const retLabel = ret.name.startsWith('@') ? ret.name : `@${ret.name}`;
    steps.push({
      id: `${spec.id}-beat-return`,
      beatNumber: retBeatNum,
      title: `return ${retLabel}`,
      duration: 5.5,
      question: `How does ${spec.functionName} emit its final ${retLabel} result?`,
      narration: `Once ${lastStep.name} finishes computing ${lastStep.outputLabel}, it emits ${retLabel} (${lastStep.outputValue}) across the return wire to the output port.`,
      focusNodes: [lastStep.id, ret.id],
      activeNodes: [lastStep.id, ret.id],
      activeEdges: outgoingFromLast.map((e) => e.id),
      packets: outgoingFromLast.map((e, eIdx) => ({
        edgeId: e.id,
        start: 0.3 + eIdx * 0.4,
        end: 3.4 + eIdx * 0.4,
        payload: e.label,
      })),
      code: { file: spec.fileName, lines: [returnLineNumber] },
      stateBefore: { [lastStep.outputLabel]: lastStep.outputValue },
      stateAfter: { [retLabel]: lastStep.outputValue },
      takeaway: `${spec.functionName} returns ${retLabel} = ${lastStep.outputValue}`,
      nodeDataBefore: {},
      nodeDataAfter: {
        [ret.id]: {
          statusLabel: 'Returned',
          previewLines: [lastStep.outputValue],
        },
      },
    });
  }

  const graph: ArchitectureGraph = {
    id: `sub-graph-${normalizeGraphId(spec.id)}`,
    title: `Inside ${spec.functionName}`,
    nodes,
    edges,
    codeFiles: {
      [spec.fileName]: codeLines,
    },
  };

  return {
    id: spec.id,
    functionName: spec.functionName,
    signature: spec.signature,
    fileName: spec.fileName,
    codebaseRange: spec.codebaseRange,
    totalModuleLines: 120,
    summary: spec.steps.map((s) => s.goalText).join(' -> '),
    parentBeatNumber: spec.parentBeatNumber,
    parentNodeId: spec.parentNodeId,
    sidebarInputs: spec.entryInputs.map((inp) => ({
      name: inp.name.startsWith('@') ? inp.name : `@${inp.name}`,
      value: inp.entries[0]?.value ?? '',
      color: inp.accentColor,
    })),
    graph,
    codeLines,
    steps,
  };
}

// ============================================================================
// DETERMINISTIC SOURCE-CODE-TO-3-LEVEL-WALKTHROUGH COMPILER (< 3ms)
// ============================================================================

const ACCENT_PALETTE: NodeAccentColor[] = [
  'amber',
  'teal',
  'rose',
  'violet',
  'emerald',
  'sky',
  'mint',
];

function inferNodeIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('embed') || lower.includes('vec') || lower.includes('norm')) return 'Binary';
  if (lower.includes('retrieve') || lower.includes('search') || lower.includes('score'))
    return 'SearchCheck';
  if (lower.includes('join') || lower.includes('context') || lower.includes('chunk'))
    return 'Layers';
  if (lower.includes('prompt') || lower.includes('plan') || lower.includes('sql'))
    return 'FileCode2';
  if (lower.includes('gen') || lower.includes('synth') || lower.includes('llm')) return 'Sparkles';
  if (lower.includes('guard') || lower.includes('verify') || lower.includes('safe'))
    return 'ShieldCheck';
  if (lower.includes('sort') || lower.includes('rank')) return 'ArrowUpDown';
  if (lower.includes('filter') || lower.includes('slice')) return 'Filter';
  return 'Workflow';
}

function inferNodeKind(name: string): GraphNode['kind'] {
  const lower = name.toLowerCase();
  if (lower.includes('retrieve') || lower.includes('search') || lower.includes('score'))
    return 'search';
  if (
    lower.includes('join') ||
    lower.includes('context') ||
    lower.includes('prompt') ||
    lower.includes('assemble')
  )
    return 'assembly';
  if (lower.includes('gen') || lower.includes('synth') || lower.includes('decode'))
    return 'generation';
  return 'transform';
}

/**
 * Synthesizes 3 realistic internal sub-steps for any macro function call so Level-1 and Level-2
 * drill-downs are 100% populated and inspectable immediately (< 3ms).
 */
function synthesizeSubStepsForCall(
  fnName: string,
  fnId: string,
  args: string[],
  outVar: string,
  inputVal: string,
  outputVal: string,
  color: NodeAccentColor,
  baseLine: number
): ProceduralStepSpec[] {
  const lower = fnName.toLowerCase();

  if (lower.includes('embed') || lower.includes('encode')) {
    return [
      {
        id: `${fnId}-tokenize`,
        name: '@tokenize()',
        iconName: 'Scissors',
        accentColor: 'sky',
        lineNumber: baseLine + 10,
        goalText: `Split ${args[0] ?? 'input'} into clean lowercase word tokens`,
        inputLabel: `@${args[0] ?? 'input'}`,
        inputValue: inputVal,
        outputLabel: '@tokens',
        outputValue: '["how", "long", "request", "refund"]',
        inputs: [
          { name: `@${args[0] ?? 'input'}`, value: inputVal, color: 'sky' },
          { name: '@cleanup_rules', value: 'Lowercase & strip "?"', color: 'teal' },
        ],
        staticHelper: {
          id: `${fnId}-rules`,
          name: '@cleanup_rules',
          iconName: 'Sliders',
          accentColor: 'teal',
          entries: [
            { key: 'lowercase', value: 'Convert words to lowercase', color: 'sky' },
            { key: 'strip_punct', value: 'Drop trailing "?" mark', color: 'rose' },
          ],
        },
        archetype: 'split-tokens',
      },
      {
        id: `${fnId}-pool`,
        name: '@encode_pool()',
        iconName: 'Layers',
        accentColor: 'violet',
        lineNumber: baseLine + 20,
        goalText: 'Map tokens to vocabulary rows and mean-pool into 6 numbers',
        inputLabel: '@tokens',
        inputValue: '["how", "long", "request", "refund"]',
        outputLabel: '@raw_vec',
        outputValue: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]',
        inputs: [
          { name: '@tokens', value: '["how", "long", "request", "refund"]', color: 'sky' },
          { name: '@vocab_table', value: 'Word ➔ 6-float table', color: 'violet' },
        ],
        staticHelper: {
          id: `${fnId}-vocab`,
          name: '@vocab_table',
          iconName: 'Database',
          accentColor: 'violet',
          entries: [
            { key: 'row_lookup', value: '4 token IDs ➔ 6-float vectors', color: 'violet' },
            { key: 'pooling', value: 'Column-wise average (Sum ÷ 4)', color: 'amber' },
          ],
        },
        archetype: 'vector-pool',
      },
      {
        id: `${fnId}-norm`,
        name: '@l2_normalize()',
        iconName: 'Binary',
        accentColor: 'amber',
        lineNumber: baseLine + 30,
        goalText: 'Scale raw vector by length ||v|| = 2.0 to unit length 1.0',
        inputLabel: '@raw_vec',
        inputValue: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]',
        outputLabel: `@${outVar}`,
        outputValue: outputVal,
        inputs: [
          { name: '@raw_vec', value: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]', color: 'violet' },
          { name: '@unit_scale', value: 'Divide by ||v|| = 2.0', color: 'amber' },
        ],
        staticHelper: {
          id: `${fnId}-scale`,
          name: '@unit_scale',
          iconName: 'Gauge',
          accentColor: 'amber',
          entries: [
            { key: 'norm_in', value: '||v|| = 2.00', color: 'violet' },
            { key: 'norm_out', value: '||v|| = 1.00 (unit vector)', color: 'mint' },
          ],
        },
        archetype: 'norm-scale',
      },
    ];
  }

  if (lower.includes('retrieve') || lower.includes('search') || lower.includes('rank')) {
    return [
      {
        id: `${fnId}-scorer`,
        name: '@score_dot()',
        iconName: 'Gauge',
        accentColor: 'teal',
        lineNumber: baseLine + 10,
        goalText: 'Score candidate similarity against query vector in parallel',
        inputLabel: `@${args[0] ?? 'query_vector'}`,
        inputValue: inputVal,
        outputLabel: '@scored_docs',
        outputValue: 'cand_1: 0.89, cand_2: 0.64, cand_3: 0.18',
        inputs: [
          { name: `@${args[0] ?? 'query_vector'}`, value: inputVal, color: 'amber' },
          { name: '@INDEX_STORE', value: '3 indexed candidates', color: 'emerald' },
        ],
        archetype: 'dot-product',
      },
      {
        id: `${fnId}-sorter`,
        name: '@sorted()',
        iconName: 'ArrowUpDown',
        accentColor: 'violet',
        lineNumber: baseLine + 20,
        goalText: 'Order scored candidates highest-to-lowest on podium',
        inputLabel: '@scored_docs',
        inputValue: 'cand_1: 0.89, cand_2: 0.64, cand_3: 0.18',
        outputLabel: '@ranked_docs',
        outputValue: '[#1 (0.89), #2 (0.64), #3 (0.18)]',
        inputs: [
          { name: '@scored_docs', value: '0.89, 0.64, 0.18', color: 'teal' },
          { name: '@order_desc', value: 'reverse=True (highest first)', color: 'violet' },
        ],
        staticHelper: {
          id: `${fnId}-order`,
          name: '@order_desc',
          iconName: 'ArrowUpDown',
          accentColor: 'violet',
          entries: [{ key: 'direction', value: 'Descending (0.89 ➔ 0.64 ➔ 0.18)', color: 'violet' }],
        },
        archetype: 'podium-rank',
      },
      {
        id: `${fnId}-slicer`,
        name: '@top_k_slice()',
        iconName: 'Filter',
        accentColor: 'emerald',
        lineNumber: baseLine + 30,
        goalText: 'Keep top 2 winning candidates and drop #3 outlier',
        inputLabel: '@ranked_docs',
        inputValue: '[#1 (0.89), #2 (0.64), #3 (0.18)]',
        outputLabel: `@${outVar}`,
        outputValue: outputVal,
        inputs: [
          { name: '@ranked_docs', value: '[#1 (0.89), #2 (0.64), #3 (0.18)]', color: 'violet' },
          { name: '@cutoff_limit', value: 'limit = 2 (drop #3)', color: 'emerald' },
        ],
        staticHelper: {
          id: `${fnId}-limit`,
          name: '@cutoff_limit',
          iconName: 'Filter',
          accentColor: 'emerald',
          entries: [
            { key: 'keep', value: 'Top 2 candidates (#1 & #2)', color: 'emerald' },
            { key: 'drop', value: 'Exclude #3 low-score candidate', color: 'rose' },
          ],
        },
        archetype: 'gate-keep-drop',
      },
    ];
  }

  if (lower.includes('join') || lower.includes('context') || lower.includes('format')) {
    return [
      {
        id: `${fnId}-tag`,
        name: '@TagSourceID()',
        iconName: 'Tag',
        accentColor: 'amber',
        lineNumber: baseLine + 10,
        goalText: 'Prefix each winning passage with its bracketed [source-id] badge',
        inputLabel: `@${args[0] ?? 'matches'}`,
        inputValue: inputVal,
        outputLabel: '@tagged_chunks',
        outputValue: '["[doc-1] Primary passage...", "[doc-2] Secondary passage..."]',
        inputs: [
          { name: `@${args[0] ?? 'matches'}`, value: inputVal, color: 'teal' },
          { name: '@tag_template', value: '"[{id}] {text}"', color: 'amber' },
        ],
        staticHelper: {
          id: `${fnId}-fmt`,
          name: '@tag_template',
          iconName: 'Tag',
          accentColor: 'amber',
          entries: [{ key: 'pattern', value: '"[{m.id}] {m.text}"', color: 'amber' }],
        },
        archetype: 'tag-stamp',
      },
      {
        id: `${fnId}-merge`,
        name: '@JoinChunks()',
        iconName: 'Layers',
        accentColor: 'rose',
        lineNumber: baseLine + 20,
        goalText: 'Concatenate tagged passages into one unified context block',
        inputLabel: '@tagged_chunks',
        inputValue: '["[doc-1] Primary passage...", "[doc-2] Secondary passage..."]',
        outputLabel: `@${outVar}`,
        outputValue: outputVal,
        inputs: [
          { name: '@tagged_chunks', value: '2 tagged strings', color: 'amber' },
          { name: '@blank_line_sep', value: '"\\n\\n"', color: 'rose' },
        ],
        staticHelper: {
          id: `${fnId}-sep`,
          name: '@blank_line_sep',
          iconName: 'Layers',
          accentColor: 'rose',
          entries: [{ key: 'delimiter', value: '"\\n\\n" (double newline)', color: 'rose' }],
        },
        archetype: 'doc-scroll',
      },
    ];
  }

  if (lower.includes('prompt') || lower.includes('plan') || lower.includes('guard')) {
    return [
      {
        id: `${fnId}-rules`,
        name: '@SystemRules()',
        iconName: 'ShieldCheck',
        accentColor: 'emerald',
        lineNumber: baseLine + 10,
        goalText: 'Enforce grounding rules: rely on supplied context and cite [source-id]',
        inputLabel: '@grounding_policy',
        inputValue: 'Use context only + Cite [ID]',
        outputLabel: '@system_header',
        outputValue: '"Use provided context only. Do not guess. Cite [source-id]."',
        inputs: [
          { name: '@grounding_policy', value: 'Use context only + Cite [ID]', color: 'emerald' },
        ],
        staticHelper: {
          id: `${fnId}-pol`,
          name: '@grounding_policy',
          iconName: 'ShieldCheck',
          accentColor: 'emerald',
          entries: [
            { key: 'rule_1', value: 'Use supplied evidence only', color: 'emerald' },
            { key: 'rule_2', value: 'Cite [source-id] on claims', color: 'amber' },
          ],
        },
        archetype: 'guardrail-shield',
      },
      {
        id: `${fnId}-assemble`,
        name: '@PromptAssembler()',
        iconName: 'FileCode2',
        accentColor: 'amber',
        lineNumber: baseLine + 20,
        goalText: `Lock SystemRules, ${args.join(', ')} into structured prompt slots`,
        inputLabel: `@SystemRules + ${args.map((a) => `@${a}`).join(' + ')}`,
        inputValue: inputVal,
        outputLabel: `@${outVar}`,
        outputValue: outputVal,
        inputs: [
          { name: '@SystemRules', value: 'Grounding & citation header', color: 'emerald' },
          ...args.map((a, i) => ({
            name: `@${a}`,
            value: i === 0 ? inputVal : 'Joined context passages',
            color: (i === 0 ? 'sky' : 'rose') as NodeAccentColor,
          })),
        ],
        archetype: 'blueprint-slots',
      },
    ];
  }

  // Default / Generation / Verification
  return [
    {
      id: `${fnId}-attend`,
      name: '@attend_context()',
      iconName: 'SearchCheck',
      accentColor: 'teal',
      lineNumber: baseLine + 10,
      goalText: `Focus attention weights on the highest-signal evidence in ${args[0] ?? 'prompt'}`,
      inputLabel: `@${args[0] ?? 'input'}`,
      inputValue: inputVal,
      outputLabel: '@focused_evidence',
      outputValue: 'Spotlit primary evidence span [doc-1]',
      inputs: [{ name: `@${args[0] ?? 'input'}`, value: inputVal, color }],
      archetype: 'heatmap-spotlight',
    },
    {
      id: `${fnId}-decode`,
      name: '@decode_and_cite()',
      iconName: 'Sparkles',
      accentColor: 'violet',
      lineNumber: baseLine + 20,
      goalText: 'Synthesize grounded output and verify [source-id] citation match',
      inputLabel: '@focused_evidence',
      inputValue: 'Spotlit primary evidence span [doc-1]',
      outputLabel: `@${outVar}`,
      outputValue: outputVal,
      inputs: [
        { name: '@focused_evidence', value: 'Spotlit primary evidence span [doc-1]', color: 'teal' },
        { name: '@citation_rule', value: 'Verify & attach [source-id]', color: 'amber' },
      ],
      staticHelper: {
        id: `${fnId}-cite-rule`,
        name: '@citation_rule',
        iconName: 'ShieldCheck',
        accentColor: 'amber',
        entries: [{ key: 'verify', value: 'Confirm claim matches source span', color: 'mint' }],
      },
      archetype: 'citation-verifier',
    },
  ];
}

/**
 * Deterministically parses ANY Python function/pipeline snippet into a complete 3-level
 * interactive walkthrough (Macro Graph + Compound Containers + Beats + Level-1 Sub-Functions
 * + Level-2 Visual Flowcharts) in < 3 milliseconds.
 */
export function compileSourceCodeToWalkthrough(options: {
  id?: string;
  title: string;
  fileName?: string;
  sourceCode: string;
  sampleInput: string;
  sampleStoreLabel?: string;
  sampleStorePreview?: string;
  ledgerOverrides?: Record<string, string>;
}): CompiledWalkthroughBundle {
  const t0 = performance.now();
  const {
    id = `proc-${Date.now()}`,
    title,
    fileName = 'pipeline.py',
    sourceCode,
    sampleInput,
    sampleStoreLabel = 'index store',
    sampleStorePreview = '3 prepared candidates',
    ledgerOverrides = {},
  } = options;

  const rawLines = sourceCode
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

  // Parse def header, assignments, and return line
  let entryParam = 'question';
  const callSteps: {
    lineNumber: number;
    rawText: string;
    outVar: string;
    fnName: string;
    args: string[];
  }[] = [];
  let returnLineNumber = rawLines.length;
  let returnVar = 'response';

  rawLines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();
    const defMatch = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
    if (defMatch) {
      const firstParam = defMatch[2].split(',')[0]?.split(':')[0]?.split('=')[0]?.trim();
      if (firstParam) entryParam = firstParam;
      return;
    }
    const retMatch = trimmed.match(/^return\s+(.+)$/);
    if (retMatch) {
      returnLineNumber = lineNum;
      returnVar = retMatch[1].trim();
      return;
    }
    // Check assignment: outVar = expr
    const assignMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s*=\s*(.+)$/);
    if (assignMatch) {
      const outVar = assignMatch[1].trim();
      const rhs = assignMatch[2].trim();
      // Check if rhs is `"\\n\\n".join(...)` or `fn(args)`
      if (rhs.includes('.join(')) {
        const varMatches = Array.from(rhs.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g)).map(
          (m) => m[1]
        );
        const lastIdentifier =
          varMatches.filter((v) => !['join', 'for', 'in', 'text', 'match', 'm'].includes(v)).pop() ??
          'matches';
        callSteps.push({
          lineNumber: lineNum,
          rawText: line,
          outVar,
          fnName: 'join_context',
          args: [lastIdentifier],
        });
      } else {
        const fnMatch = rhs.match(/^([a-zA-Z0-9_.]+)\s*\((.*)\)$/);
        if (fnMatch) {
          const fnName = fnMatch[1].trim();
          const args = fnMatch[2]
            .split(',')
            .map((a) => a.split('=')[0].trim())
            .filter((a) => a.length > 0 && !/^\d+$/.test(a) && !a.startsWith('"') && !a.startsWith("'"));
          callSteps.push({
            lineNumber: lineNum,
            rawText: line,
            outVar,
            fnName,
            args: args.length > 0 ? args : [entryParam],
          });
        } else {
          callSteps.push({
            lineNumber: lineNum,
            rawText: line,
            outVar,
            fnName: `compute_${outVar}`,
            args: [entryParam],
          });
        }
      }
    }
  });

  // Build deterministic ledger of intermediate values
  const ledger: WorkedExampleLedger = {
    [`$${entryParam}_raw`]: sampleInput,
    ...ledgerOverrides,
  };

  const varToNodeId: Record<string, string> = {
    [entryParam]: entryParam,
  };
  const varToPreview: Record<string, string> = {
    [entryParam]: sampleInput,
  };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const subFunctions: Record<FunctionLessonId, SubFunctionLesson> = {};
  const compactRowAssignment: Record<string, { col: number; row: number }> = {
    [entryParam]: { col: 0, row: 0 },
    index: { col: 0, row: 1 },
  };

  // 1. Entry Input Node + Index Store Node
  nodes.push(
    {
      id: entryParam,
      stepBadge: '①',
      label: entryParam,
      kind: 'input',
      iconName: 'MessageSquareQuote',
      accentColor: 'sky',
      subtitle: 'Raw entry input',
      description: `The raw input (${entryParam}) entering the pipeline before any transformation or lookup.`,
      roleSummary: `Supplies ${entryParam} to downstream stages.`,
      codeReference: {
        file: fileName,
        lines: [1],
        snippet: rawLines[0] ?? `def pipeline(${entryParam}):`,
      },
      defaultPreview: sampleInput,
      valueRef: `$${entryParam}_raw`,
      width: 140,
      height: 84,
      moduleBadge: 'L1 · Input',
    },
    {
      id: 'index',
      stepBadge: 'DB',
      label: sampleStoreLabel,
      kind: 'store',
      iconName: 'Database',
      accentColor: 'emerald',
      subtitle: sampleStorePreview,
      description: `Prepared candidate store (${sampleStoreLabel}) supplying indexed records to retrieval/search stages.`,
      roleSummary: 'Contributes candidate records without modifying model weights.',
      codeReference: {
        file: fileName,
        lines: [callSteps[1]?.lineNumber ?? 2],
        snippet: callSteps[1]?.rawText.trim() ?? 'retrieve(query_vector, limit=2)',
      },
      defaultPreview: sampleStorePreview,
      width: 140,
      height: 88,
      moduleBadge: 'Store',
    }
  );

  // 2. Transform / Search / Assembly / Generation Macro Nodes
  callSteps.forEach((step, idx) => {
    const nodeId = step.outVar === 'response' ? 'model' : step.outVar === 'query_vector' ? 'embed' : step.outVar === 'matches' ? 'retrieve' : step.outVar;
    const fnId = `fn-${nodeId}`;
    const color = ACCENT_PALETTE[idx % ACCENT_PALETTE.length];
    const badge = String.fromCodePoint(0x2461 + idx); // ②, ③, ...

    // Deterministic preview for each step output
    const lowerFn = step.fnName.toLowerCase();
    let outPreview = `${step.outVar} result`;
    if (lowerFn.includes('embed') || lowerFn.includes('vec')) {
      outPreview = '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]';
    } else if (lowerFn.includes('retrieve') || lowerFn.includes('search') || lowerFn.includes('rank')) {
      outPreview = '[#1 primary-match (0.89), #2 secondary-match (0.64)]';
    } else if (lowerFn.includes('join') || lowerFn.includes('context')) {
      outPreview = '"[doc-1] Primary evidence...\\n\\n[doc-2] Secondary note..."';
    } else if (lowerFn.includes('prompt') || lowerFn.includes('plan')) {
      outPreview = `Rules + Context + ${entryParam}`;
    } else if (lowerFn.includes('gen') || lowerFn.includes('exec') || lowerFn.includes('synth')) {
      outPreview = '"Verified response grounded in [doc-1]."';
    }

    ledger[`$${step.outVar}`] = outPreview;
    varToNodeId[step.outVar] = nodeId;
    varToPreview[step.outVar] = outPreview;

    // Determine incoming edges
    const incomingSources: { srcId: string; label: string; rel: 'data' | 'lookup' }[] = [];
    step.args.forEach((arg) => {
      const srcId = varToNodeId[arg] ?? entryParam;
      incomingSources.push({
        srcId,
        label: arg,
        rel: 'data',
      });
    });

    // If retrieval/search stage, also wire the `index` store into port 1
    if (
      (lowerFn.includes('retrieve') || lowerFn.includes('search') || lowerFn.includes('score')) &&
      incomingSources.length < 2
    ) {
      incomingSources.push({
        srcId: 'index',
        label: '3 candidates',
        rel: 'lookup',
      });
    }

    incomingSources.forEach((src, pIdx) => {
      edges.push({
        id: `e-${src.srcId}-${nodeId}`,
        source: src.srcId,
        target: nodeId,
        label: src.label,
        relationship: src.rel,
        description: `Passes ${src.label} from ${src.srcId} to ${step.fnName}().`,
        targetPortIndex: pIdx,
      });
    });

    // Synthesize Level-1 & Level-2 Sub-Functions
    const inputVal = varToPreview[step.args[0]] ?? sampleInput;
    const subStepSpecs = synthesizeSubStepsForCall(
      step.fnName,
      fnId,
      step.args,
      step.outVar,
      inputVal,
      outPreview,
      color,
      step.lineNumber * 100
    );

    const hasDropBranch =
      lowerFn.includes('retrieve') || lowerFn.includes('search') || lowerFn.includes('filter');

    const compoundContainer = buildProceduralCompoundContainer({
      incomingPortCount: Math.max(1, incomingSources.length),
      combinerOnStepIndex: incomingSources.length >= 2 && lowerFn.includes('prompt') ? 1 : 0,
      steps: subStepSpecs.map((st) => ({
        id: `c-${st.id}`,
        label: st.name.replace(/^@/, ''),
        sublabel: st.outputLabel.replace(/^@/, ''),
        iconName: st.iconName,
        color: st.accentColor,
        drillDownFunctionId: st.id,
      })),
      droppedBranch: hasDropBranch
        ? {
            id: `c-${fnId}-drop`,
            label: 'Dropped',
            sublabel: '✕ #3 excluded',
            iconName: 'XCircle',
            color: 'rose',
          }
        : undefined,
    });

    const col = Math.min(3, Math.floor((idx + 1) / 2) + 1);
    const row = (idx + 1) % 2 === 1 ? 0 : 1;
    compactRowAssignment[nodeId] = { col, row };

    const macroNode: GraphNode = {
      id: nodeId,
      stepBadge: badge,
      label: `${step.fnName}()`,
      kind: inferNodeKind(step.fnName),
      iconName: inferNodeIcon(step.fnName),
      accentColor: color,
      subtitle: `Produces ${step.outVar}`,
      description: `Executes ${step.fnName}(${step.args.join(', ')}) to transform ${step.args.join(', ')} into ${step.outVar}.`,
      roleSummary: `Outputs ${outPreview}`,
      codeReference: {
        file: fileName,
        lines: [step.lineNumber],
        snippet: step.rawText.trim(),
      },
      defaultPreview: outPreview,
      valueRef: `$${step.outVar}`,
      width: 400,
      height: 170,
      drillDownFunctionId: fnId,
      moduleBadge: `${subStepSpecs.length} steps ↘`,
      compoundContainer,
    };
    const dims = computeDynamicCardDimensions(macroNode);
    macroNode.width = dims.width;
    macroNode.height = dims.height;
    nodes.push(macroNode);

    // Compile Level-1 SubFunctionLesson
    const fnSpec: ProceduralFunctionSpec = {
      id: fnId,
      functionName: `${step.fnName}(${step.args.join(', ')})`,
      signature: `def ${step.fnName}(${step.args.join(', ')}):`,
      fileName: `src/${step.fnName}.py`,
      codebaseRange: `Lines ${step.lineNumber * 100}–${step.lineNumber * 100 + 30}`,
      parentBeatNumber: idx + 2,
      parentNodeId: nodeId,
      entryInputs: incomingSources.map((src, sIdx) => ({
        id: `${fnId}-in-${sIdx}`,
        name: `@${src.label.replace(/\s+/g, '_')}`,
        kind: src.rel === 'lookup' ? 'store' : 'input',
        iconName: src.rel === 'lookup' ? 'Database' : 'MessageSquareQuote',
        accentColor: src.rel === 'lookup' ? 'emerald' : 'sky',
        entries: [{ key: src.label, value: varToPreview[src.label] ?? sampleInput, color: 'sky' }],
      })),
      steps: subStepSpecs,
      returnOutput: {
        id: `${fnId}-out`,
        name: `@${step.outVar}`,
        iconName: 'CheckCircle2',
        accentColor: 'mint',
        entries: [{ key: step.outVar, value: outPreview, color: 'mint' }],
      },
    };

    const compiledL1 = compileProceduralFunctionLesson(fnSpec);
    subFunctions[fnId] = compiledL1;

    // Compile Level-2 Visual Flowchart for every step inside this Level-1 function
    subStepSpecs.forEach((st) => {
      subFunctions[st.id] = compileProceduralLevel2Flowchart(st, {
        id: fnId,
        fileName: fnSpec.fileName,
        parentBeatNumber: idx + 2,
      });
    });
  });

  // 3. Terminal Answer / Output Node
  const lastProducerNodeId = varToNodeId[returnVar] ?? nodes[nodes.length - 1]?.id ?? entryParam;
  const finalPreview = varToPreview[returnVar] ?? '"Verified output [doc-1]"';
  compactRowAssignment['answer'] = { col: 3, row: 0 };

  nodes.push({
    id: 'answer',
    stepBadge: String.fromCodePoint(0x2461 + callSteps.length),
    label: 'answer',
    kind: 'output',
    iconName: 'ShieldCheck',
    accentColor: 'mint',
    subtitle: 'Verified return value',
    description: `Final returned value (${returnVar}) verified against retrieved context.`,
    roleSummary: `Delivers ${finalPreview}`,
    codeReference: {
      file: fileName,
      lines: [returnLineNumber],
      snippet: `return ${returnVar}`,
    },
    defaultPreview: finalPreview,
    width: 152,
    height: 92,
    drillDownFunctionId: subFunctions[`fn-${lastProducerNodeId}`]
      ? `fn-${lastProducerNodeId}`
      : undefined,
    moduleBadge: `L${returnLineNumber} · Output`,
  });

  edges.push({
    id: `e-${lastProducerNodeId}-answer`,
    source: lastProducerNodeId,
    target: 'answer',
    label: returnVar,
    relationship: 'data',
    description: `Returns ${returnVar} as the final verified output.`,
  });

  // 4. Build CodeLines for CodePane
  const codeLines: CodeLineItem[] = [
    {
      lineNumber: 1,
      file: fileName,
      text: rawLines[0] ?? `def pipeline(${entryParam}):`,
      explanation: `Beat 1: Accepts ${entryParam} (${sampleInput}) as the starting input.`,
      moduleRangeLabel: `${fileName} · Entry Input`,
      atName: `@${entryParam}`,
      goalText: `Accept ${entryParam} as our starting input`,
      inputLabel: '@User Input',
      inputValue: sampleInput,
      outputLabel: `@${entryParam} output`,
      resultText: sampleInput,
    },
    ...callSteps.map((step, idx) => {
      const nodeId =
        step.outVar === 'response'
          ? 'model'
          : step.outVar === 'query_vector'
          ? 'embed'
          : step.outVar === 'matches'
          ? 'retrieve'
          : step.outVar;
      const fnId = `fn-${nodeId}`;
      const inVal = varToPreview[step.args[0]] ?? sampleInput;
      const outVal = varToPreview[step.outVar] ?? '';
      return {
        lineNumber: step.lineNumber,
        file: fileName,
        text: step.rawText,
        explanation: `Beat ${idx + 2}: Runs ${step.fnName}(${step.args.join(', ')}) to produce ${step.outVar}.`,
        drillDownFunctionId: fnId,
        moduleRangeLabel: `src/${step.fnName}.py · ${subFunctions[fnId]?.steps.length ?? 2} steps`,
        atName: `@${step.fnName}`,
        goalText: `Transform ${step.args.join(' + ')} into ${step.outVar} via ${step.fnName}()`,
        inputLabel: `@${step.args.join(' + @')} input`,
        inputValue: inVal,
        outputLabel: `@${step.fnName} output`,
        resultText: outVal,
      };
    }),
    {
      lineNumber: returnLineNumber,
      file: fileName,
      text: `    return ${returnVar}`,
      explanation: `Beat ${callSteps.length + 2}: Returns the verified ${returnVar} with source citations.`,
      drillDownFunctionId: subFunctions[`fn-${lastProducerNodeId}`]
        ? `fn-${lastProducerNodeId}`
        : undefined,
      moduleRangeLabel: `${fileName} · Verified Output`,
      atName: '@return_answer',
      goalText: `Deliver the verified ${returnVar} to the caller`,
      inputLabel: `@${returnVar} input`,
      inputValue: finalPreview,
      outputLabel: '@return_answer output',
      resultText: `Verified: ${finalPreview}`,
    },
  ];

  // 5. Build Macro Beats (`Step[]`)
  const macroSteps: Step[] = [
    {
      id: 'beat-1-entry',
      beatNumber: 1,
      title: `Entry input (${entryParam})`,
      duration: 7,
      question: `What enters the pipeline at line 1 before any function call runs?`,
      narration: `The pipeline starts with ${entryParam} = ${sampleInput} alongside the prepared ${sampleStoreLabel} (${sampleStorePreview}).`,
      focusNodes: [entryParam, 'index'],
      activeNodes: [entryParam],
      activeEdges: [],
      packets: [],
      code: { file: fileName, lines: [1] },
      stateBefore: { [entryParam]: null },
      stateAfter: { [entryParam]: sampleInput },
      takeaway: `Line 1 binds ${entryParam} = ${sampleInput} without running any search or generation yet.`,
      nodeDataBefore: {
        [entryParam]: {
          statusLabel: 'Awaiting call',
          previewLines: [sampleInput],
          badgeText: 'input',
        },
      },
      nodeDataAfter: {
        [entryParam]: {
          statusLabel: 'Bound to parameter',
          previewLines: [`${entryParam} = ${sampleInput}`],
          badgeText: 'ready',
        },
      },
    },
    ...callSteps.map((step, idx) => {
      const nodeId =
        step.outVar === 'response'
          ? 'model'
          : step.outVar === 'query_vector'
          ? 'embed'
          : step.outVar === 'matches'
          ? 'retrieve'
          : step.outVar;
      const fnId = `fn-${nodeId}`;
      const incoming = edges.filter((e) => e.target === nodeId);
      const focusNodes = Array.from(new Set([...incoming.map((e) => e.source), nodeId]));
      const outVal = varToPreview[step.outVar] ?? '';
      return {
        id: `beat-${idx + 2}-${nodeId}`,
        beatNumber: idx + 2,
        title: `${step.fnName}()`,
        duration: 8,
        drillDownFunctionId: fnId,
        question: `How does ${step.fnName}(${step.args.join(', ')}) produce ${step.outVar}?`,
        narration: `${step.fnName}() receives ${step.args.join(' and ')} and computes ${step.outVar} = ${outVal}. Click "Inspect Function ↘" to trace its internal steps.`,
        focusNodes,
        activeNodes: focusNodes,
        activeEdges: incoming.map((e) => e.id),
        packets: incoming.map((e, eIdx) => ({
          edgeId: e.id,
          start: 0.5 + eIdx * 0.4,
          end: 4.2 + eIdx * 0.4,
          payload: e.label,
        })),
        code: { file: fileName, lines: [step.lineNumber] },
        stateBefore: { [step.outVar]: null },
        stateAfter: { [step.outVar]: outVal },
        takeaway: `${step.fnName}() transforms ${step.args.join(', ')} into ${step.outVar} = ${outVal}.`,
        nodeDataBefore: {
          [nodeId]: {
            statusLabel: `Running ${step.fnName}()...`,
            previewLines: [`Input: ${step.args.join(', ')}`],
            badgeText: `${step.fnName}()`,
          },
        },
        nodeDataAfter: {
          [nodeId]: {
            statusLabel: `${step.outVar} ready`,
            previewLines: [outVal],
            badgeText: 'complete',
          },
        },
      };
    }),
    {
      id: `beat-${callSteps.length + 2}-return`,
      beatNumber: callSteps.length + 2,
      title: 'Verified return output',
      duration: 8,
      drillDownFunctionId: subFunctions[`fn-${lastProducerNodeId}`]
        ? `fn-${lastProducerNodeId}`
        : undefined,
      question: `How is the final ${returnVar} returned and verified?`,
      narration: `Line ${returnLineNumber} returns ${returnVar} (${finalPreview}), preserving full traceability back to the retrieved evidence.`,
      focusNodes: [lastProducerNodeId, 'answer'],
      activeNodes: [lastProducerNodeId, 'answer'],
      activeEdges: [`e-${lastProducerNodeId}-answer`],
      packets: [
        {
          edgeId: `e-${lastProducerNodeId}-answer`,
          start: 0.5,
          end: 4.2,
          payload: returnVar,
        },
      ],
      code: { file: fileName, lines: [returnLineNumber] },
      stateBefore: { returned: null },
      stateAfter: { returned: finalPreview },
      takeaway: `The pipeline returns ${finalPreview} with verifiable provenance.`,
      nodeDataBefore: {},
      nodeDataAfter: {
        answer: {
          statusLabel: 'Verified output',
          previewLines: [finalPreview],
          badgeText: 'returned',
        },
      },
    },
  ];

  const subsystemGroups: SubsystemGroup[] = [
    { id: 'stage-1', title: '1. INPUT & STORE', subtitle: 'Entry + Store', col: 0, accentColor: 'sky' },
    { id: 'stage-2', title: '2. ENCODE & SEARCH', subtitle: 'Vector & Top-K', col: 1, accentColor: 'teal' },
    { id: 'stage-3', title: '3. ASSEMBLE', subtitle: 'Context & Prompt', col: 2, accentColor: 'rose' },
    { id: 'stage-4', title: '4. SYNTHESIZE', subtitle: 'Generate & Verify', col: 3, accentColor: 'violet' },
  ];

  const macroGraph: ArchitectureGraph = {
    id: `proc-graph-${id}`,
    title,
    workedExampleLedger: ledger,
    codeFiles: {
      [fileName]: codeLines,
    },
    subsystemGroups,
    compactRowAssignment,
    nodes,
    edges,
  };

  const contextualQuestions: ContextualQuestion[] = callSteps.slice(0, 4).map((st, idx) => {
    const nodeId =
      st.outVar === 'response'
        ? 'model'
        : st.outVar === 'query_vector'
        ? 'embed'
        : st.outVar === 'matches'
        ? 'retrieve'
        : st.outVar;
    return {
      id: `proc-q-${idx + 1}`,
      question: `What is the role of ${st.fnName}() at line ${st.lineNumber}?`,
      relatedNodes: [nodeId],
      relatedStepIds: [`beat-${idx + 2}-${nodeId}`],
      shortContext: `${st.fnName}() · ${fileName} line ${st.lineNumber}`,
      answer: `Procedurally compiled trace: ${st.fnName}(${st.args.join(', ')}) transforms ${
        varToPreview[st.args[0]] ?? sampleInput
      } into ${st.outVar} = ${varToPreview[st.outVar] ?? ''}. Click "Fill Explanatory Gaps with AI" to enrich this explanation with OpenCode Go.`,
      codeLines: [st.lineNumber],
      takeaway: `${st.fnName}() produces ${st.outVar} at Beat ${idx + 2}.`,
    };
  });

  const compileTimeMs = Math.max(0.4, Number((performance.now() - t0).toFixed(2)));

  return {
    id,
    title,
    sourceCode,
    sampleInput,
    compileTimeMs,
    macroGraph,
    macroSteps,
    subFunctions,
    contextualQuestions,
    aiFillStatus: 'procedural-only',
  };
}

/**
 * Merges the Gemini AI Model's explanatory gap-fill response into a compiled walkthrough bundle
 * WITHOUT mutating any graph geometry, node IDs, edge routing, or WorkedExampleLedger values.
 */
export function applyAiExplanatoryGaps(
  bundle: CompiledWalkthroughBundle,
  gaps: AiExplanatoryGapPayload,
  aiFillTimeMs: number
): CompiledWalkthroughBundle {
  const fileName = Object.keys(bundle.macroGraph.codeFiles ?? {})[0] ?? 'pipeline.py';
  const existingLines = [...(bundle.macroGraph.codeFiles?.[fileName] ?? [])];

  const updatedSteps = bundle.macroSteps.map((step) => {
    const match = gaps.beatExplanations?.find((b) => b.beatNumber === step.beatNumber);
    if (!match) return step;
    return {
      ...step,
      question: match.question || step.question,
      narration: match.narration || step.narration,
      takeaway: match.takeaway || step.takeaway,
    };
  });

  const updatedLines = existingLines.map((line, idx) => {
    const match = gaps.beatExplanations?.find((b) => b.beatNumber === idx + 1);
    if (!match) return line;
    return {
      ...line,
      goalText: match.goalText || line.goalText,
      explanation: match.lineExplanation || line.explanation,
    };
  });

  const updatedNodes = bundle.macroGraph.nodes.map((node) => {
    const match = gaps.nodeExplanations?.find((n) => n.nodeId === node.id);
    if (!match) return node;
    return {
      ...node,
      subtitle: match.subtitle || node.subtitle,
      description: match.description || node.description,
      roleSummary: match.roleSummary || node.roleSummary,
    };
  });

  const updatedSubFunctions: Record<FunctionLessonId, SubFunctionLesson> = {};
  for (const [fnId, subFn] of Object.entries(bundle.subFunctions)) {
    const stepMatch = gaps.subStepExplanations?.find((s) => s.stepId === fnId);
    const nextSteps = subFn.steps.map((st) => {
      const m = gaps.subStepExplanations?.find(
        (s) => s.stepId === st.drillDownFunctionId || s.stepId === fnId
      );
      if (!m) return st;
      return {
        ...st,
        narration: m.narration || st.narration,
        takeaway: m.takeaway || st.takeaway,
      };
    });
    const nextNodes = subFn.graph.nodes.map((n) => {
      const m = gaps.subStepExplanations?.find((s) => s.stepId === n.id);
      if (!m) return n;
      return {
        ...n,
        subtitle: m.goalText || n.subtitle,
        description: m.narration || n.description,
        nonSummary: n.nonSummary
          ? {
              ...n.nonSummary,
              goalText: m.goalText || n.nonSummary.goalText,
            }
          : undefined,
      };
    });
    const nextCodeLines = subFn.codeLines.map((cl) => {
      const m = gaps.subStepExplanations?.find(
        (s) => s.stepId === cl.drillDownFunctionId || s.stepId === fnId
      );
      if (!m) return cl;
      return {
        ...cl,
        goalText: m.goalText || cl.goalText,
        explanation: m.narration || cl.explanation,
      };
    });

    updatedSubFunctions[fnId] = {
      ...subFn,
      summary: stepMatch?.goalText || subFn.summary,
      steps: nextSteps,
      codeLines: nextCodeLines,
      graph: {
        ...subFn.graph,
        nodes: nextNodes,
        codeFiles: subFn.graph.codeFiles
          ? { [subFn.fileName]: nextCodeLines }
          : undefined,
      },
    };
  }

  const updatedQuestions: ContextualQuestion[] =
    gaps.contextualQuestions && gaps.contextualQuestions.length > 0
      ? gaps.contextualQuestions.map((q, idx) => ({
          id: q.id || `ai-q-${idx + 1}`,
          question: q.question,
          shortContext: q.shortContext,
          answer: q.answer,
          takeaway: q.takeaway,
          codeLines: q.codeLines?.length ? q.codeLines : [1],
          relatedNodes: q.relatedNodes?.length ? q.relatedNodes : [],
        }))
      : bundle.contextualQuestions;

  return {
    ...bundle,
    macroGraph: {
      ...bundle.macroGraph,
      nodes: updatedNodes,
      codeFiles: {
        ...(bundle.macroGraph.codeFiles ?? {}),
        [fileName]: updatedLines,
      },
    },
    macroSteps: updatedSteps,
    subFunctions: updatedSubFunctions,
    contextualQuestions: updatedQuestions,
    aiFillStatus: 'filled',
    aiFillTimeMs,
  };
}

export interface ProceduralPresetTemplate {
  id: string;
  label: string;
  title: string;
  fileName: string;
  sampleInput: string;
  sampleStoreLabel: string;
  sampleStorePreview: string;
  sourceCode: string;
}

export const PROCEDURAL_PIPELINE_PRESETS: ProceduralPresetTemplate[] = [
  {
    id: 'preset-rag-refund',
    label: 'RAG Refund Policy (answer.py)',
    title: 'How a RAG answer is assembled',
    fileName: 'answer.py',
    sampleInput: '"How long do I have to request a refund?"',
    sampleStoreLabel: 'index store',
    sampleStorePreview: '3 policies: refund, returns, shipping',
    sourceCode: `def answer(question):
    query_vector = embed(question)
    matches = retrieve(query_vector, limit=2)
    context = "\\n\\n".join(match.text for match in matches)
    prompt = build_prompt(question, context)
    response = generate(prompt)
    return response`,
  },
  {
    id: 'preset-code-rerank',
    label: 'Hybrid Code Search & Reranker (search_code.py)',
    title: 'How Hybrid Code Search & Cross-Encoder Reranking Works',
    fileName: 'search_code.py',
    sampleInput: '"Where are JWT refresh tokens validated?"',
    sampleStoreLabel: 'AST repo index',
    sampleStorePreview: '3 modules: auth.py, session.py, css.py',
    sourceCode: `def search_code(query):
    query_vector = embed_query(query)
    candidates = retrieve_hybrid(query_vector, limit=2)
    context = "\\n\\n".join(chunk.text for chunk in candidates)
    prompt = build_prompt(query, context)
    response = generate_answer(prompt)
    return response`,
  },
  {
    id: 'preset-sql-agent',
    label: 'Guardrailed Text-to-SQL Agent (run_sql_agent.py)',
    title: 'How a Guardrailed Text-to-SQL Agent Verifies Queries',
    fileName: 'run_sql_agent.py',
    sampleInput: '"Show total refund volume for Q3 by region"',
    sampleStoreLabel: 'schema catalog',
    sampleStorePreview: '3 tables: refunds, orders, users',
    sourceCode: `def run_sql_agent(request):
    query_vector = embed_schema_intent(request)
    matches = retrieve_tables(query_vector, limit=2)
    context = "\\n\\n".join(table.ddl for table in matches)
    prompt = build_sql_prompt(request, context)
    response = generate_verified_sql(prompt)
    return response`,
  },
];
