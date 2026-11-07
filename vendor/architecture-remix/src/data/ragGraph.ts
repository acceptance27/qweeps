import {
  ArchitectureGraph,
  CodeLineItem,
  CompoundChildBlockSpec,
  CompoundContainerSpec,
  DocumentCandidate,
  FunctionLessonId,
  NodeAccentColor,
  WorkedExampleLedger,
} from '../types/lesson';

export const LESSON_TITLE = 'How a RAG answer is assembled';

export const LEARNER_QUESTION_INPUT = 'How long do I have to request a refund?';

export const ILLUSTRATIVE_QUERY_VECTOR = [0.12, -0.44, 0.08, 0.71, -0.21, 0.36];
export const ILLUSTRATIVE_VECTOR_TEXT = '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]';

/**
 * Immutable worked-example ledger.
 * Downstream AI narration or repair passes reference these keys rather than mutating calculations.
 */
export const WORKED_EXAMPLE_LEDGER: WorkedExampleLedger = Object.freeze({
  $question_raw: '"How long do I have to request a refund?"',
  $tokens_clean: '["how", "long", "request", "refund"]',
  $raw_pool_vec: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]',
  $query_vec: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
  $similarity_scores: 'refund-policy: 0.89, returns-guide: 0.64, shipping-guide: 0.18',
  $top2_matches: '[refund-policy (0.89), returns-guide (0.64)]',
  $joined_context:
    '"[refund-policy] Refund requests within 30 days...\\n\\n[returns-guide] Include your order number..."',
  $assembled_prompt: 'Rules + Context ([refund-policy], [returns-guide]) + Question',
  $verified_answer:
    '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
});

import { computeProceduralCompoundContainerSpec } from '../layout/elkLayout';

/**
 * Deterministic procedural generator for a port-aligned CompoundContainerSpec.
 * Any generated container can pass its child operations and incoming edge count to produce
 * 100% port-aligned child boxes, combiner bars, and orthogonal internal wires with zero hand-placed coordinates.
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

export const ANSWER_PY_CODE = `def answer(question):
    query_vector = embed(question)
    matches = retrieve(query_vector, limit=2)
    context = "\\n\\n".join(match.text for match in matches)
    prompt = build_prompt(question, context)
    response = generate(prompt)
    return response`;

export const MACRO_SIDEBAR_INPUTS = [
  {
    name: '@question',
    value: '"How long do I have to request a refund?"',
    color: 'sky' as const,
  },
  {
    name: '@INDEX_DOCS',
    value: '3 shop policies: [refund-policy], [returns-guide], [shipping-guide]',
    color: 'emerald' as const,
  },
];

export const ANSWER_PY_LINES: CodeLineItem[] = [
  {
    lineNumber: 1,
    file: 'answer.py',
    text: 'def answer(question):',
    explanation: 'Beat 1: Receives the raw customer question string before any search happens.',
    moduleRangeLabel: 'answer.py · Entry Input',
    atName: '@question',
    goalText: 'Accept the customer’s raw question as our starting input',
    inputLabel: '@Customer Input',
    inputValue: '"How long do I have to request a refund?"',
    outputLabel: '@question output',
    resultText: '"How long do I have to request a refund?"',
  },
  {
    lineNumber: 2,
    file: 'answer.py',
    text: '    query_vector = embed(question)',
    explanation: 'Beat 2: Encodes the question into a 6-number vector.',
    drillDownFunctionId: 'fn-embed',
    moduleRangeLabel: 'embedder.py · 3 steps',
    atName: '@embed',
    goalText: 'Turn the question words into a 6-number meaning vector for search',
    inputLabel: '@question input',
    inputValue: '"How long do I have to request a refund?"',
    outputLabel: '@embed output',
    resultText: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
  },
  {
    lineNumber: 3,
    file: 'answer.py',
    text: '    matches = retrieve(query_vector, limit=2)',
    explanation: 'Beat 3: Searches the 3 policy docs, keeping top 2 and dropping shipping-guide.',
    drillDownFunctionId: 'fn-retrieve',
    moduleRangeLabel: 'vector_store.py · 3 steps',
    atName: '@retrieve',
    goalText: 'Compare the question vector against 3 policies and keep the top 2 matches',
    inputLabel: '@embed input',
    inputValue: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
    outputLabel: '@retrieve output',
    resultText: '[refund-policy (0.89), returns-guide (0.64)]',
  },
  {
    lineNumber: 4,
    file: 'answer.py',
    text: '    context = "\\n\\n".join(match.text for match in matches)',
    explanation: 'Beat 4: Joins the 2 winning policy passages into one context string.',
    drillDownFunctionId: 'fn-context',
    moduleRangeLabel: 'context_assembler.py · 2 steps',
    atName: '@join_context',
    goalText: 'Label the 2 winning passages with [id] tags and glue them together',
    inputLabel: '@retrieve input',
    inputValue: '[refund-policy (0.89), returns-guide (0.64)]',
    outputLabel: '@join_context output',
    resultText: '"[refund-policy] Refund requests within 30 days...\\n\\n[returns-guide]..."',
  },
  {
    lineNumber: 5,
    file: 'answer.py',
    text: '    prompt = build_prompt(question, context)',
    explanation: 'Beat 5: Combines the original question with the retrieved policy context.',
    drillDownFunctionId: 'fn-prompt',
    moduleRangeLabel: 'prompt_builder.py · 2 steps',
    atName: '@build_prompt',
    goalText: 'Combine SystemRules, retrieved context, and question into one AI prompt',
    inputLabel: '@join_context + @question input',
    inputValue: '"[refund-policy]..." + "How long do I have to request a refund?"',
    outputLabel: '@build_prompt output',
    resultText: 'Rules + Context ([refund-policy], [returns-guide]) + Question',
  },
  {
    lineNumber: 6,
    file: 'answer.py',
    text: '    response = generate(prompt)',
    explanation: 'Beat 6: Generates the grounded response from the assembled prompt.',
    drillDownFunctionId: 'fn-generate',
    moduleRangeLabel: 'generator_verifier.py · 2 steps',
    atName: '@generate',
    goalText: 'Spotlight the 30-day rule in context and write a grounded reply with [refund-policy]',
    inputLabel: '@build_prompt input',
    inputValue: 'Rules + Context ([refund-policy], [returns-guide]) + Question',
    outputLabel: '@generate output',
    resultText: '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
  },
  {
    lineNumber: 7,
    file: 'answer.py',
    text: '    return response',
    explanation: 'Beat 7: Verifies the [refund-policy] citation ("within 30 days") against the source sentence.',
    drillDownFunctionId: 'fn-generate',
    moduleRangeLabel: 'generator_verifier.py · Verified Output',
    atName: '@return_answer',
    goalText: 'Deliver the verified 30-day answer with a clickable [refund-policy] proof link',
    inputLabel: '@generate input',
    inputValue: '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
    outputLabel: '@return_answer output',
    resultText: 'Verified: "within 30 days of purchase" ➔ [refund-policy]',
  },
];

export const PREPARED_DOCUMENTS: DocumentCandidate[] = [
  {
    id: 'refund-policy',
    title: 'refund-policy',
    text: 'Refund requests must be submitted within 30 days of purchase. Approved refunds return to the original payment method.',
    illustrativeRank: 'Rank #1 · Illustrative match (0.89)',
    selected: true,
    reason: 'Directly defines the refund eligibility window ("within 30 days of purchase").',
    supportingSpan: 'Refund requests must be submitted within 30 days of purchase.',
  },
  {
    id: 'returns-guide',
    title: 'returns-guide',
    text: 'Include your order number when contacting support about a return.',
    illustrativeRank: 'Rank #2 · Illustrative match (0.64)',
    selected: true,
    reason: 'Included within limit=2 as procedural return context.',
  },
  {
    id: 'shipping-guide',
    title: 'shipping-guide',
    text: 'Standard delivery usually takes three to five business days.',
    illustrativeRank: 'Rank #3 · Illustrative match (0.18) — Excluded',
    selected: false,
    reason: 'Excluded because limit=2 keeps only the top two matches; delivery times do not answer refund timing.',
  },
];

export const ASSEMBLED_CONTEXT_STRING =
  '[refund-policy] Refund requests must be submitted within 30 days of purchase. Approved refunds return to the original payment method.\n\n[returns-guide] Include your order number when contacting support about a return.';

export const ASSEMBLED_PROMPT_STRING = `Use the provided shop policy context to answer the customer question. Cite the source ID.

Context:
1. [refund-policy]: Refund requests must be submitted within 30 days of purchase. Approved refunds return to the original payment method.
2. [returns-guide]: Include your order number when contacting support about a return.

Question: How long do I have to request a refund?`;

export const FINAL_SCRIPTED_ANSWER =
  'Refund requests must be submitted within 30 days of purchase [refund-policy]. Approved refunds are returned to your original payment method.';

export const RAG_GRAPH: ArchitectureGraph = {
  id: 'qweeps-rag-4col-architecture',
  title: LESSON_TITLE,
  workedExampleLedger: WORKED_EXAMPLE_LEDGER,
  codeFiles: {
    'answer.py': ANSWER_PY_LINES,
  },
  subsystemGroups: [
    {
      id: 'stage-1',
      title: '1. INPUT & STORE',
      subtitle: 'Raw Question + Docs',
      col: 0,
      accentColor: 'sky',
    },
    {
      id: 'stage-2',
      title: '2. VECTOR SEARCH',
      subtitle: 'Encode & Top-2 Filter',
      col: 1,
      accentColor: 'teal',
    },
    {
      id: 'stage-3',
      title: '3. PROMPT BUILD',
      subtitle: 'Join & Combine',
      col: 2,
      accentColor: 'rose',
    },
    {
      id: 'stage-4',
      title: '4. LLM & PROOF',
      subtitle: 'Generate & Verify',
      col: 3,
      accentColor: 'violet',
    },
  ],
  compactRowAssignment: {
    question: { col: 0, row: 0 },
    index: { col: 0, row: 1 },
    embed: { col: 1, row: 0 },
    retrieve: { col: 1, row: 1 },
    context: { col: 2, row: 0 },
    prompt: { col: 2, row: 1 },
    answer: { col: 3, row: 0 },
    model: { col: 3, row: 1 },
  },
  nodes: [
    {
      id: 'question',
      stepBadge: '①',
      label: 'question',
      kind: 'input',
      iconName: 'MessageSquareQuote',
      accentColor: 'sky',
      subtitle: 'Raw user input',
      description:
        'The raw natural-language question entered by the user before any vector conversion or document lookup occurs.',
      roleSummary:
        'Supplies the exact question text both to the embedding step (for search) and later to prompt assembly.',
      codeReference: {
        file: 'answer.py',
        lines: [1],
        snippet: 'def answer(question):',
      },
      defaultPreview: '"How long...request a refund?"',
      valueRef: '$question_raw',
      width: 136,
      height: 84,
      moduleBadge: 'L1 · Input',
    },
    {
      id: 'embed',
      stepBadge: '②',
      label: 'embed()',
      kind: 'transform',
      iconName: 'Binary',
      accentColor: 'amber',
      subtitle: 'Text → 6 numbers',
      description:
        'Transforms the question string into an illustrative numerical vector so retrieval can compare meaning rather than exact keyword overlap alone.',
      roleSummary:
        'Maps the input string to an illustrative 6-number array used to query the vector index.',
      codeReference: {
        file: 'answer.py',
        lines: [2],
        snippet: 'query_vector = embed(question)',
      },
      defaultPreview: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
      valueRef: '$query_vec',
      width: 416,
      height: 156,
      drillDownFunctionId: 'fn-embed',
      moduleBadge: '4 beats ↘',
      compoundContainer: buildProceduralCompoundContainer({
        incomingPortCount: 1,
        steps: [
          {
            id: 'c-tok',
            label: 'tokenize()',
            sublabel: 'split words',
            iconName: 'Scissors',
            color: 'sky',
            drillDownFunctionId: 'emb-tokenize',
          },
          {
            id: 'c-pool',
            label: 'encode_pool()',
            sublabel: 'IDs → mean vec',
            iconName: 'Layers',
            color: 'violet',
            drillDownFunctionId: 'emb-pool',
          },
          {
            id: 'c-norm',
            label: 'l2_normalize()',
            sublabel: '[0.12, -0.44…]',
            iconName: 'Binary',
            color: 'amber',
            drillDownFunctionId: 'emb-norm',
          },
        ],
      }),
    },
    {
      id: 'index',
      stepBadge: 'DB',
      label: 'index store',
      kind: 'store',
      iconName: 'Database',
      accentColor: 'emerald',
      subtitle: '3 prepared policies',
      description:
        'Holds pre-indexed shop policy passages alongside their precomputed illustrative vectors: refund-policy, returns-guide, and shipping-guide.',
      roleSummary:
        'Contributes candidate policy chunks to the retrieval stage without retraining or altering the language model.',
      codeReference: {
        file: 'answer.py',
        lines: [3],
        snippet: 'matches = retrieve(query_vector, limit=2)',
      },
      defaultPreview: 'refund, returns, shipping',
      width: 136,
      height: 88,
      drillDownFunctionId: 'fn-retrieve',
      moduleBadge: '3 docs',
    },
    {
      id: 'retrieve',
      stepBadge: '③',
      label: 'retrieve()',
      kind: 'search',
      iconName: 'SearchCheck',
      accentColor: 'teal',
      subtitle: 'Keep top 2 matches',
      description:
        'Compares the incoming query vector against the 3 prepared index candidates and selects the top 2 passages.',
      roleSummary:
        'Selects refund-policy and returns-guide while visibly excluding shipping-guide.',
      codeReference: {
        file: 'answer.py',
        lines: [3],
        snippet: 'matches = retrieve(query_vector, limit=2)',
      },
      defaultPreview: '✓ refund, ✓ returns (✕ shipping)',
      valueRef: '$top2_matches',
      width: 520,
      height: 196,
      drillDownFunctionId: 'fn-retrieve',
      moduleBadge: '4 beats ↘',
      compoundContainer: buildProceduralCompoundContainer({
        incomingPortCount: 2,
        steps: [
          {
            id: 'c-score',
            label: 'score_dot()',
            sublabel: '0.89 · 0.64 · 0.18',
            iconName: 'Gauge',
            color: 'teal',
            drillDownFunctionId: 'ret-scorer',
          },
          {
            id: 'c-sort',
            label: 'sorted()',
            sublabel: 'reverse=True',
            iconName: 'ArrowUpDown',
            color: 'violet',
            drillDownFunctionId: 'ret-sorter',
          },
          {
            id: 'c-top2',
            label: 'ranked[:2]',
            sublabel: 'keep 2 docs',
            iconName: 'Filter',
            color: 'emerald',
            drillDownFunctionId: 'ret-slicer',
          },
        ],
        droppedBranch: {
          id: 'c-drop',
          label: 'Dropped',
          sublabel: '✕ shipping',
          iconName: 'XCircle',
          color: 'rose',
        },
      }),
    },
    {
      id: 'context',
      stepBadge: '④',
      label: 'context',
      kind: 'assembly',
      iconName: 'Layers',
      accentColor: 'rose',
      subtitle: 'Join 2 selected docs',
      description:
        'Joins the retrieved document passages into a single plain-text context block ready to be inserted into the prompt.',
      roleSummary:
        'Holds the 2 selected passages ("within 30 days..." + order number note) with shipping-guide omitted.',
      codeReference: {
        file: 'answer.py',
        lines: [4],
        snippet: 'context = "\\n\\n".join(match.text for match in matches)',
      },
      defaultPreview: 'Joined: refund + returns',
      valueRef: '$joined_context',
      width: 356,
      height: 176,
      drillDownFunctionId: 'fn-context',
      moduleBadge: '3 beats ↘',
      compoundContainer: buildProceduralCompoundContainer({
        incomingPortCount: 1,
        steps: [
          {
            id: 'c-tag',
            label: 'TagSourceID',
            sublabel: 'f"[{m.id}]"',
            iconName: 'Tag',
            color: 'amber',
            drillDownFunctionId: 'ctx-tag',
          },
          {
            id: 'c-join',
            label: 'JoinChunks',
            sublabel: '"\\n\\n".join()',
            iconName: 'Layers',
            color: 'rose',
            drillDownFunctionId: 'ctx-join',
          },
        ],
      }),
    },
    {
      id: 'prompt',
      stepBadge: '⑤',
      label: 'build_prompt()',
      kind: 'assembly',
      iconName: 'FileCode2',
      accentColor: 'amber',
      subtitle: 'Question + Context',
      description:
        'Combines the original user question and the retrieved context string into a single structured instruction for the model.',
      roleSummary:
        'Packages instructions, retrieved policy evidence, and the original question into one prompt payload.',
      codeReference: {
        file: 'answer.py',
        lines: [5],
        snippet: 'prompt = build_prompt(question, context)',
      },
      defaultPreview: 'Context (2 docs) + Question',
      valueRef: '$assembled_prompt',
      width: 356,
      height: 164,
      drillDownFunctionId: 'fn-prompt',
      moduleBadge: '2 beats ↘',
      compoundContainer: buildProceduralCompoundContainer({
        incomingPortCount: 2,
        combinerOnStepIndex: 1,
        steps: [
          {
            id: 'c-rules',
            label: 'SystemRules',
            sublabel: 'cite [ID]',
            iconName: 'ShieldCheck',
            color: 'emerald',
            drillDownFunctionId: 'prm-rules',
          },
          {
            id: 'c-merge',
            label: 'PromptAssembler',
            sublabel: 'Rules+Ctx+Q',
            iconName: 'FileCode2',
            color: 'amber',
            drillDownFunctionId: 'prm-merge',
          },
        ],
      }),
    },
    {
      id: 'model',
      stepBadge: '⑥',
      label: 'generate()',
      kind: 'generation',
      iconName: 'Sparkles',
      accentColor: 'violet',
      subtitle: 'LLM synthesis stage',
      description:
        'Reads the assembled prompt and generates a response conditioned on the supplied context passages.',
      roleSummary:
        'Synthesizes the grounded response from the prompt without modifying model weights.',
      codeReference: {
        file: 'answer.py',
        lines: [6],
        snippet: 'response = generate(prompt)',
      },
      defaultPreview: 'Reads prompt → writes answer',
      width: 236,
      height: 164,
      drillDownFunctionId: 'fn-generate',
      moduleBadge: '3 beats ↘',
      compoundContainer: buildProceduralCompoundContainer({
        incomingPortCount: 1,
        steps: [
          {
            id: 'c-attend',
            label: 'attend_context()',
            sublabel: '"30 days"',
            iconName: 'SearchCheck',
            color: 'teal',
            drillDownFunctionId: 'gen-attend',
          },
          {
            id: 'c-decode',
            label: 'decode_and_cite()',
            sublabel: 'reply + [id]',
            iconName: 'Sparkles',
            color: 'violet',
            drillDownFunctionId: 'gen-decode',
          },
        ],
      }),
    },
    {
      id: 'answer',
      stepBadge: '⑦',
      label: 'answer',
      kind: 'output',
      iconName: 'ShieldCheck',
      accentColor: 'mint',
      subtitle: 'Verified 30-day reply',
      description:
        'The returned answer stating the 30-day refund window with an explicit source citation to [refund-policy].',
      roleSummary:
        'Delivers the final text and links the "30 days" claim back to refund-policy.',
      codeReference: {
        file: 'answer.py',
        lines: [6, 7],
        snippet: 'return response',
      },
      defaultPreview: '"...within 30 days [refund-policy]"',
      valueRef: '$verified_answer',
      width: 152,
      height: 92,
      drillDownFunctionId: 'fn-generate',
      moduleBadge: 'L7 · Output',
    },
  ],
  edges: [
    {
      id: 'e-question-embed',
      source: 'question',
      target: 'embed',
      label: 'raw text',
      relationship: 'data',
      description: 'Passes the question string to embed(question) to compute the query vector.',
    },
    {
      id: 'e-embed-retrieve',
      source: 'embed',
      target: 'retrieve',
      label: 'query_vector',
      relationship: 'data',
      description: 'Sends the 6-number illustrative query vector into retrieve(query_vector, limit=2).',
      targetPortIndex: 0,
    },
    {
      id: 'e-index-retrieve',
      source: 'index',
      target: 'retrieve',
      label: '3 docs',
      relationship: 'lookup',
      description: 'Supplies the 3 prepared shop policy passages from the index to retrieval.',
      targetPortIndex: 1,
    },
    {
      id: 'e-retrieve-context',
      source: 'retrieve',
      target: 'context',
      label: 'top 2 matches',
      relationship: 'data',
      description: 'Forwards only the 2 selected matches (refund-policy, returns-guide) to context assembly.',
    },
    {
      id: 'e-question-prompt',
      source: 'question',
      target: 'prompt',
      label: 'question',
      relationship: 'data',
      description: 'Provides the original question string directly to build_prompt(question, context).',
      targetPortIndex: 0,
    },
    {
      id: 'e-context-prompt',
      source: 'context',
      target: 'prompt',
      label: 'context',
      relationship: 'data',
      description: 'Supplies the joined policy passages to build_prompt(question, context).',
      targetPortIndex: 1,
    },
    {
      id: 'e-prompt-model',
      source: 'prompt',
      target: 'model',
      label: 'prompt',
      relationship: 'data',
      description: 'Sends the complete prompt (instructions + context + question) to generate(prompt).',
    },
    {
      id: 'e-model-answer',
      source: 'model',
      target: 'answer',
      label: 'response',
      relationship: 'data',
      description: 'Outputs the generated answer string containing the [refund-policy] citation.',
    },
    {
      id: 'e-context-answer',
      source: 'context',
      target: 'answer',
      label: 'verify [refund-policy]',
      relationship: 'reference',
      description: 'Verifies that "within 30 days of purchase" in the final answer comes directly from refund-policy in context.',
    },
  ],
};
