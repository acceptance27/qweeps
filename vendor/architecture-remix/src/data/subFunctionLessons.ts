import {
  computeDynamicCardDimensions,
  normalizeGraphId,
} from '../layout/elkLayout';
import { FunctionLessonId, StaticDataSpec, SubFunctionLesson } from '../types/lesson';
import { getInnerFunctionLesson, getNonSummarySpec } from './innerFunctionLessons';
import { WORKED_EXAMPLE_LEDGER } from './ragGraph';

export const SUB_FUNCTION_LESSONS: Record<FunctionLessonId, SubFunctionLesson> = {
  'fn-embed': {
    id: 'fn-embed',
    functionName: 'embed(question)',
    signature: 'def embed(question: str) -> list[float]:',
    fileName: 'src/rag/embedder.py',
    codebaseRange: 'Lines 112–136',
    totalModuleLines: 180,
    summary:
      'Matches the 3 blocks inside embed(question): tokenizes the raw question using @cleanup_rules, encodes & pools token vectors using @vocab_table, and normalizes using @unit_scale.',
    parentBeatNumber: 2,
    parentNodeId: 'embed',
    sidebarInputs: [
      {
        name: '@question',
        value: '"How long do I have to request a refund?"',
        color: 'sky',
      },
      {
        name: '@cleanup_rules',
        value: '"Lowercase letters & split punctuation (?)"',
        color: 'teal',
      },
    ],
    codeLines: [
      {
        lineNumber: 112,
        text: '@tokenize',
        explanation: 'Beat 1: Lowercases and splits the question into clean word tokens.',
        atName: '@tokenize',
        goalText: 'Split the question into clean, lowercase word pieces',
        resultText: '["how", "long", "request", "refund"]',
      },
      {
        lineNumber: 124,
        text: '@encode_pool',
        explanation: 'Beat 2: Maps tokens to vocabulary IDs and averages their features into a 6-float vector.',
        atName: '@encode_pool',
        goalText: 'Turn the tokens into one 6-number meaning vector',
        resultText: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]',
      },
      {
        lineNumber: 136,
        text: '@l2_normalize',
        explanation: 'Beat 3: Divides by vector length ||v|| so dot-product equals cosine similarity.',
        atName: '@l2_normalize',
        goalText: 'Scale the 6 numbers to standard length 1.0',
        resultText: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
      },
      {
        lineNumber: 138,
        text: 'return @query_vector',
        explanation: 'Beat 4: Emits the unit-normalized @query_vector back to answer.py.',
        atName: 'return @query_vector',
        goalText: 'Emit @query_vector from @l2_normalize to OUT @query_vector',
        resultText: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
        inputLabel: '@l2_normalize output',
        inputValue: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
        outputLabel: 'return @query_vector',
      },
    ],
    graph: {
      id: 'sub-graph-fn-embed',
      title: 'Inside embed(question) · 3 Steps + Connected @Inputs',
      subsystemGroups: [
        { id: 'emb-g1', title: '1. TOKENIZE', subtitle: 'Split Words', col: 0, accentColor: 'sky' },
        { id: 'emb-g2', title: '2. ENCODE & POOL', subtitle: 'Average Features', col: 1, accentColor: 'violet' },
        { id: 'emb-g3', title: '3. L2 NORMALIZE', subtitle: 'Unit Vector Out', col: 2, accentColor: 'amber' },
      ],
      compactRowAssignment: {
        'emb-input': { col: 0, row: 0 },
        'emb-rules': { col: 0, row: 1 },
        'emb-tokenize': { col: 0, row: 0 },
        'emb-vocab': { col: 1, row: 1 },
        'emb-pool': { col: 1, row: 0 },
        'emb-scale': { col: 1, row: 1 },
        'emb-norm': { col: 2, row: 1 },
        'emb-out': { col: 2, row: 0 },
      },
      nodes: [
        {
          id: 'emb-input',
          stepBadge: 'IN',
          label: '@question',
          kind: 'input',
          iconName: 'MessageSquareQuote',
          accentColor: 'sky',
          subtitle: 'Raw string input',
          description: 'The raw learner question passed into embed(question).',
          roleSummary: 'Provides raw characters before tokenization.',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [112],
            snippet: 'tokens = tokenize(question, cleanup_rules)',
          },
          defaultPreview: '"How long...refund?"',
          width: 136,
          height: 88,
          moduleBadge: 'Input',
        },
        {
          id: 'emb-rules',
          stepBadge: '@',
          label: '@cleanup_rules',
          kind: 'input',
          iconName: 'Sliders',
          accentColor: 'teal',
          subtitle: 'Lowercase & strip "?"',
          description: 'Rule inside embed() that tells @tokenize() to lowercase letters and remove punctuation.',
          roleSummary: 'Connected directly to @tokenize() bottom-left port.',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [112],
            snippet: 'cleanup_rules = "lowercase + strip ?"',
          },
          defaultPreview: 'lowercase + strip "?"',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'emb-tokenize',
          stepBadge: '①',
          label: 'tokenize()',
          kind: 'transform',
          iconName: 'Scissors',
          accentColor: 'sky',
          subtitle: 'Split into words',
          description: 'Strips punctuation and splits the sentence into normalized lowercase tokens.',
          roleSummary: 'Produces token list.',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [112],
            snippet: 'tokens = tokenize(question)',
          },
          defaultPreview: '["how", "long", "refund"]',
          width: 472,
          height: 236,
          moduleBadge: 'L112 · Beat 1',
        },
        {
          id: 'emb-vocab',
          stepBadge: '@',
          label: '@vocab_table',
          kind: 'store',
          iconName: 'Database',
          accentColor: 'violet',
          subtitle: 'Word ➔ 6 numbers',
          description: 'Vocabulary lookup table inside embed() connected directly to @encode_pool().',
          roleSummary: 'Supplies word meaning vectors to @encode_pool().',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [124],
            snippet: 'raw_vec = encode_pool(tokens, vocab_table)',
          },
          defaultPreview: 'Word ➔ 6-float table',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'emb-pool',
          stepBadge: '②',
          label: 'encode_pool()',
          kind: 'transform',
          iconName: 'Layers',
          accentColor: 'violet',
          subtitle: 'IDs → mean 6-float vec',
          description: 'Maps tokens to vocabulary IDs and averages their contextual vectors.',
          roleSummary: 'Aggregates token features into 6 floats.',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [124],
            snippet: 'raw_vec = encode_pool(tokens)',
          },
          defaultPreview: '[0.24, -0.88, 0.16, 1.42...]',
          width: 472,
          height: 236,
          moduleBadge: 'L124 · Beat 2',
        },
        {
          id: 'emb-scale',
          stepBadge: '@',
          label: '@unit_scale',
          kind: 'input',
          iconName: 'Gauge',
          accentColor: 'amber',
          subtitle: 'Divide by ||v|| = 2.0',
          description: 'Scaling rule inside embed() connected directly to @l2_normalize().',
          roleSummary: 'Scales vector length to 1.0.',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [136],
            snippet: 'query_vector = l2_normalize(raw_vec, unit_scale=1.0)',
          },
          defaultPreview: 'length ||v|| = 1.0',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'emb-norm',
          stepBadge: '③',
          label: 'l2_normalize()',
          kind: 'transform',
          iconName: 'Binary',
          accentColor: 'amber',
          subtitle: 'Scale to unit length',
          description: 'Scales raw_vec to unit L2 norm (||v|| = 1.0) for fast cosine similarity.',
          roleSummary: 'Produces final 6-number query vector.',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [136],
            snippet: 'query_vector = l2_normalize(raw_vec)',
          },
          defaultPreview: '[0.12, -0.44, 0.08, 0.71...]',
          width: 520,
          height: 212,
          moduleBadge: 'L136 · Beat 3',
        },
        {
          id: 'emb-out',
          stepBadge: 'OUT',
          label: '@query_vector',
          kind: 'output',
          iconName: 'CheckCircle2',
          accentColor: 'mint',
          subtitle: 'Back to answer.py L2',
          description: 'Returns the normalized 6-number illustrative query vector.',
          roleSummary: 'Hands query_vector to retrieve().',
          codeReference: {
            file: 'src/rag/embedder.py',
            lines: [136],
            snippet: 'return query_vector',
          },
          defaultPreview: '[0.12, -0.44, 0.08, 0.71...]',
          width: 152,
          height: 92,
          moduleBadge: 'Return',
        },
      ],
      edges: [
        {
          id: 'e-emb-1',
          source: 'emb-input',
          target: 'emb-tokenize',
          label: '@question',
          relationship: 'data',
          description: 'Passes raw @question string into @tokenize().',
        },
        {
          id: 'e-emb-rules',
          source: 'emb-rules',
          target: 'emb-tokenize',
          label: '@cleanup_rules',
          relationship: 'lookup',
          description: 'Connects @cleanup_rules inside embed() into @tokenize().',
        },
        {
          id: 'e-emb-2',
          source: 'emb-tokenize',
          target: 'emb-pool',
          label: '@tokens',
          relationship: 'data',
          description: 'Passes lowercase @tokens to @encode_pool().',
        },
        {
          id: 'e-emb-vocab',
          source: 'emb-vocab',
          target: 'emb-pool',
          label: '@vocab_table',
          relationship: 'lookup',
          description: 'Connects @vocab_table inside embed() into @encode_pool().',
        },
        {
          id: 'e-emb-3',
          source: 'emb-pool',
          target: 'emb-norm',
          label: '@raw_vec',
          relationship: 'data',
          description: 'Passes unnormalized @raw_vec to @l2_normalize().',
        },
        {
          id: 'e-emb-scale',
          source: 'emb-scale',
          target: 'emb-norm',
          label: '@unit_scale',
          relationship: 'lookup',
          description: 'Connects @unit_scale inside embed() into @l2_normalize().',
        },
        {
          id: 'e-emb-4',
          source: 'emb-norm',
          target: 'emb-out',
          label: '@query_vector',
          relationship: 'data',
          description: 'Outputs normalized @query_vector back to answer.py.',
        },
      ],
    },
    steps: [
      {
        id: 'fn-embed-beat-1',
        beatNumber: 1,
        title: '@tokenize(question, cleanup_rules)',
        duration: 6,
        question: 'How does @tokenize break down the raw question text?',
        narration:
          'Both @question and @cleanup_rules connect into @tokenize(), splitting "How long do I have to request a refund?" into ["how", "long", "request", "refund"]. Click "Inspect Function ↘" on @tokenize() to see its visual tokenization flowchart.',
        focusNodes: ['emb-input', 'emb-rules', 'emb-tokenize'],
        activeNodes: ['emb-input', 'emb-rules', 'emb-tokenize'],
        activeEdges: ['e-emb-1', 'e-emb-rules'],
        packets: [
          { edgeId: 'e-emb-1', start: 0.4, end: 3.2, payload: '"How long...refund?"' },
          { edgeId: 'e-emb-rules', start: 0.6, end: 3.2, payload: '@cleanup_rules' },
        ],
        code: { file: 'src/rag/embedder.py', lines: [112] },
        stateBefore: { question: 'How long do I have to request a refund?' },
        stateAfter: { tokens: ['how', 'long', 'request', 'refund'] },
        takeaway: '@cleanup_rules is wired directly into @tokenize() so "Refund" and "refund?" become clean lowercase word tokens.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-embed-beat-2',
        beatNumber: 2,
        title: '@encode_pool(tokens, vocab_table)',
        duration: 6,
        question: 'How do word tokens become one 6-number vector?',
        narration:
          '@tokens and @vocab_table connect into @encode_pool(), mapping each word to its vocabulary ID and averaging them into [0.24, -0.88, 0.16, 1.42, -0.42, 0.72].',
        focusNodes: ['emb-tokenize', 'emb-vocab', 'emb-pool'],
        activeNodes: ['emb-tokenize', 'emb-vocab', 'emb-pool'],
        activeEdges: ['e-emb-2', 'e-emb-vocab'],
        packets: [
          { edgeId: 'e-emb-2', start: 0.4, end: 3.2, payload: '["how", "long", "refund"]' },
          { edgeId: 'e-emb-vocab', start: 0.6, end: 3.2, payload: '@vocab_table' },
        ],
        code: { file: 'src/rag/embedder.py', lines: [124] },
        stateBefore: { tokens: ['how', 'long', 'request', 'refund'] },
        stateAfter: { raw_vec: [0.24, -0.88, 0.16, 1.42, -0.42, 0.72] },
        takeaway: '@vocab_table is wired directly into @encode_pool() to turn word pieces into a 6-number meaning vector.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-embed-beat-3',
        beatNumber: 3,
        title: '@l2_normalize(raw_vec, unit_scale)',
        duration: 6,
        question: 'Why normalize the vector before returning it to answer.py?',
        narration:
          '@raw_vec and @unit_scale connect into @l2_normalize(), scaling the vector to standard length 1.0: [0.12, -0.44, 0.08, 0.71, -0.21, 0.36].',
        focusNodes: ['emb-pool', 'emb-scale', 'emb-norm'],
        activeNodes: ['emb-pool', 'emb-scale', 'emb-norm'],
        activeEdges: ['e-emb-3', 'e-emb-scale'],
        packets: [
          { edgeId: 'e-emb-3', start: 0.3, end: 3.2, payload: '@raw_vec' },
          { edgeId: 'e-emb-scale', start: 0.5, end: 3.2, payload: '@unit_scale' },
        ],
        code: { file: 'src/rag/embedder.py', lines: [136] },
        stateBefore: { raw_vec: [0.24, -0.88, 0.16, 1.42, -0.42, 0.72] },
        stateAfter: { query_vector: [0.12, -0.44, 0.08, 0.71, -0.21, 0.36] },
        takeaway: 'Unit-normalized vectors let retrieve() rank candidate documents fairly.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-embed-beat-4',
        beatNumber: 4,
        title: 'return @query_vector',
        duration: 5,
        question: 'What does embed(question) emit back to the caller?',
        narration:
          'Once @l2_normalize() finishes scaling, it emits @query_vector ([0.12, -0.44, 0.08, 0.71, -0.21, 0.36]) out to the return port.',
        focusNodes: ['emb-norm', 'emb-out'],
        activeNodes: ['emb-norm', 'emb-out'],
        activeEdges: ['e-emb-4'],
        packets: [
          { edgeId: 'e-emb-4', start: 0.3, end: 3.4, payload: '[0.12, -0.44, 0.08...]' },
        ],
        code: { file: 'src/rag/embedder.py', lines: [138] },
        stateBefore: { query_vector: [0.12, -0.44, 0.08, 0.71, -0.21, 0.36] },
        stateAfter: { returned: [0.12, -0.44, 0.08, 0.71, -0.21, 0.36] },
        takeaway: '@l2_normalize() emits its completed unit vector only after normalization completes.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
    ],
  },

  'fn-retrieve': {
    id: 'fn-retrieve',
    functionName: 'retrieve(query_vector, limit=2)',
    signature: 'def retrieve(query_vector: list[float], limit: int = 2) -> list[DocMatch]:',
    fileName: 'src/rag/vector_store.py',
    codebaseRange: 'Lines 250–270',
    totalModuleLines: 290,
    summary:
      'Matches the 3 blocks inside retrieve(): @score_dot compares the question vector against @INDEX_DOCS, @sorted orders them using @order_desc, and @ranked[:2] slices the top 2 using @cutoff_limit.',
    parentBeatNumber: 3,
    parentNodeId: 'retrieve',
    sidebarInputs: [
      {
        name: '@query_vector',
        value: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
        color: 'amber',
      },
      {
        name: '@INDEX_DOCS',
        value: '"3 policies: refund-policy, returns-guide, shipping-guide"',
        color: 'emerald',
      },
      {
        name: '@cutoff_limit',
        value: '"limit = 2 (keep top 2 matches)"',
        color: 'emerald',
      },
    ],
    codeLines: [
      {
        lineNumber: 250,
        text: '@score_dot',
        explanation: 'Beat 1: Computes similarity scores (0.89, 0.64, 0.18).',
        atName: '@score_dot',
        goalText: 'Score how closely each policy matches the question vector',
        resultText: 'refund-policy = 0.89, returns-guide = 0.64, shipping-guide = 0.18',
      },
      {
        lineNumber: 262,
        text: '@sorted',
        explanation: 'Beat 2: Orders candidates highest-to-lowest by score.',
        atName: '@sorted',
        goalText: 'Order the scored documents from highest score (#1) to lowest (#3)',
        resultText: '#1 refund-policy (0.89) ➔ #2 returns-guide (0.64) ➔ #3 shipping-guide (0.18)',
      },
      {
        lineNumber: 270,
        text: '@ranked[:2]',
        explanation: 'Beat 3: Keeps top 2 (refund-policy & returns-guide) and drops shipping-guide.',
        atName: '@ranked[:2]',
        goalText: 'Keep only the top 2 matches and drop #3 shipping-guide',
        resultText: 'Kept: [refund-policy, returns-guide] · Dropped: shipping-guide',
      },
      {
        lineNumber: 272,
        text: 'return @matches',
        explanation: 'Beat 4: Emits the 2 selected policy matches back to answer.py.',
        atName: 'return @matches',
        goalText: 'Emit @matches from @ranked[:2] to OUT @matches',
        resultText: '[refund-policy, returns-guide]',
        inputLabel: '@ranked[:2] output',
        inputValue: 'Kept: [refund-policy, returns-guide]',
        outputLabel: 'return @matches',
      },
    ],
    graph: {
      id: 'sub-graph-fn-retrieve',
      title: 'Inside retrieve(query_vector, limit=2) · 3 Steps + Connected @Inputs',
      subsystemGroups: [
        { id: 'ret-g1', title: '1. DOT PRODUCT', subtitle: 'score_dot()', col: 0, accentColor: 'teal' },
        { id: 'ret-g2', title: '2. SORT DESC', subtitle: 'sorted()', col: 1, accentColor: 'violet' },
        { id: 'ret-g3', title: '3. SLICE TOP 2', subtitle: 'ranked[:2]', col: 2, accentColor: 'emerald' },
      ],
      compactRowAssignment: {
        'ret-query': { col: 0, row: 0 },
        'ret-store': { col: 0, row: 1 },
        'ret-scorer': { col: 0, row: 0 },
        'ret-order': { col: 1, row: 1 },
        'ret-sorter': { col: 1, row: 0 },
        'ret-limit': { col: 1, row: 1 },
        'ret-slicer': { col: 2, row: 1 },
        'ret-out': { col: 2, row: 0 },
      },
      nodes: [
        {
          id: 'ret-query',
          stepBadge: 'IN',
          label: '@query_vector',
          kind: 'input',
          iconName: 'Binary',
          accentColor: 'amber',
          subtitle: '6-float query input',
          description: 'The normalized query vector produced by embed(question).',
          roleSummary: 'Represents the refund timing question numerically.',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [250],
            snippet: 'scored = score_dot(query_vector, INDEX_DOCS)',
          },
          defaultPreview: '[0.12, -0.44, 0.08, 0.71...]',
          width: 136,
          height: 88,
          moduleBadge: 'Input 1',
        },
        {
          id: 'ret-store',
          stepBadge: 'IN',
          label: '@INDEX_DOCS',
          kind: 'store',
          iconName: 'Database',
          accentColor: 'emerald',
          subtitle: '3 prepared policies',
          description: 'The 3 pre-indexed policy documents: refund-policy, returns-guide, and shipping-guide.',
          roleSummary: 'Supplies the 3 candidate policy vectors.',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [250],
            snippet: 'scored = score_dot(query_vector, INDEX_DOCS)',
          },
          defaultPreview: 'refund, returns, shipping',
          width: 136,
          height: 96,
          moduleBadge: 'Input 2',
        },
        {
          id: 'ret-scorer',
          stepBadge: '①',
          label: 'score_dot()',
          kind: 'search',
          iconName: 'Gauge',
          accentColor: 'teal',
          subtitle: 'Compare similarity',
          description: 'Computes dot-product similarity between query_vector and each candidate.',
          roleSummary: 'Assigns 0.89, 0.64, and 0.18.',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [250],
            snippet: 'scored = [score_dot(query_vector, doc) for doc in INDEX_DOCS]',
          },
          defaultPreview: '0.89 · 0.64 · 0.18',
          width: 472,
          height: 236,
          moduleBadge: 'L250 · Beat 1',
        },
        {
          id: 'ret-order',
          stepBadge: '@',
          label: '@order_desc',
          kind: 'input',
          iconName: 'ArrowUpDown',
          accentColor: 'violet',
          subtitle: 'Highest score first',
          description: 'Sorting rule inside retrieve() connected directly to @sorted().',
          roleSummary: 'Orders highest score (#1) to lowest (#3).',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [262],
            snippet: 'reverse=True',
          },
          defaultPreview: 'reverse = True (desc)',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'ret-sorter',
          stepBadge: '②',
          label: 'sorted()',
          kind: 'transform',
          iconName: 'ArrowUpDown',
          accentColor: 'violet',
          subtitle: 'Order highest first',
          description: 'Orders all 3 candidates from highest score to lowest.',
          roleSummary: '#1 refund (0.89), #2 returns (0.64), #3 shipping (0.18).',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [262],
            snippet: 'ranked = sorted(scored, key=lambda m: m.score, reverse=True)',
          },
          defaultPreview: '#1 refund (0.89), #2 returns (0.64), #3 shipping (0.18)',
          width: 472,
          height: 236,
          moduleBadge: 'L262 · Beat 2',
        },
        {
          id: 'ret-limit',
          stepBadge: '@',
          label: '@cutoff_limit',
          kind: 'input',
          iconName: 'Filter',
          accentColor: 'emerald',
          subtitle: 'limit = 2 (top 2 only)',
          description: 'Cutoff parameter inside retrieve() connected directly to @ranked[:2].',
          roleSummary: 'Allows only the top 2 documents through.',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [270],
            snippet: 'limit = 2',
          },
          defaultPreview: 'limit = 2 (drop #3)',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'ret-slicer',
          stepBadge: '③',
          label: 'ranked[:2]',
          kind: 'assembly',
          iconName: 'Filter',
          accentColor: 'emerald',
          subtitle: 'Keep top 2 (drop #3)',
          description: 'Keeps the top 2 matches and drops #3 shipping-guide.',
          roleSummary: 'Keeps refund-policy & returns-guide; drops shipping-guide.',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [270],
            snippet: 'selected = ranked[:limit]  # keeps top 2, drops shipping-guide',
          },
          defaultPreview: '✓ refund-policy, ✓ returns-guide  (✕ shipping-guide dropped)',
          width: 520,
          height: 212,
          moduleBadge: 'L270 · Beat 3',
        },
        {
          id: 'ret-out',
          stepBadge: 'OUT',
          label: '@matches',
          kind: 'output',
          iconName: 'CheckCircle2',
          accentColor: 'mint',
          subtitle: '2 matches to L4',
          description: 'Returns the 2 selected document objects back to answer.py.',
          roleSummary: 'Emits matches list (length 2).',
          codeReference: {
            file: 'src/rag/vector_store.py',
            lines: [270],
            snippet: 'return selected',
          },
          defaultPreview: '[refund-policy, returns-guide]',
          width: 152,
          height: 92,
          moduleBadge: 'Return',
        },
      ],
      edges: [
        {
          id: 'e-ret-1',
          source: 'ret-query',
          target: 'ret-scorer',
          label: '@query_vector',
          relationship: 'data',
          description: 'Passes @query_vector into @score_dot().',
        },
        {
          id: 'e-ret-2',
          source: 'ret-store',
          target: 'ret-scorer',
          label: '@INDEX_DOCS',
          relationship: 'lookup',
          description: 'Supplies the 3 stored policy vectors to @score_dot().',
        },
        {
          id: 'e-ret-3',
          source: 'ret-scorer',
          target: 'ret-sorter',
          label: '@scored_docs',
          relationship: 'data',
          description: 'Passes scored candidates to @sorted().',
        },
        {
          id: 'e-ret-order',
          source: 'ret-order',
          target: 'ret-sorter',
          label: '@order_desc',
          relationship: 'lookup',
          description: 'Connects @order_desc into @sorted().',
        },
        {
          id: 'e-ret-4',
          source: 'ret-sorter',
          target: 'ret-slicer',
          label: '@ranked_docs',
          relationship: 'data',
          description: 'Passes ranked list into @ranked[:2].',
        },
        {
          id: 'e-ret-limit',
          source: 'ret-limit',
          target: 'ret-slicer',
          label: '@cutoff_limit',
          relationship: 'lookup',
          description: 'Connects @cutoff_limit (limit=2) into @ranked[:2].',
        },
        {
          id: 'e-ret-5',
          source: 'ret-slicer',
          target: 'ret-out',
          label: '@matches',
          relationship: 'data',
          description: 'Returns the 2 selected matches to answer.py.',
        },
      ],
    },
    steps: [
      {
        id: 'fn-ret-beat-1',
        beatNumber: 1,
        title: '@score_dot(query_vector, INDEX_DOCS)',
        duration: 7,
        question: 'How does retrieve() measure closeness between the question and each policy?',
        narration:
          '@query_vector and @INDEX_DOCS connect into @score_dot(), producing 0.89 for refund-policy, 0.64 for returns-guide, and 0.18 for shipping-guide.',
        focusNodes: ['ret-query', 'ret-store', 'ret-scorer'],
        activeNodes: ['ret-query', 'ret-store', 'ret-scorer'],
        activeEdges: ['e-ret-1', 'e-ret-2'],
        packets: [
          { edgeId: 'e-ret-1', start: 0.4, end: 3.4, payload: '[0.12, -0.44...]' },
          { edgeId: 'e-ret-2', start: 0.7, end: 3.8, payload: '3 candidate vecs' },
        ],
        code: { file: 'src/rag/vector_store.py', lines: [250] },
        stateBefore: { scored: null },
        stateAfter: { scored: ['0.89', '0.64', '0.18'] },
        takeaway: 'refund-policy scores highest (0.89) because its vector aligns with refund timing.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-ret-beat-2',
        beatNumber: 2,
        title: '@sorted(scored_docs, order_desc)',
        duration: 6,
        question: 'How are the scored candidates ordered?',
        narration:
          '@scored_docs and @order_desc connect into @sorted(), lining up #1 refund-policy (0.89), #2 returns-guide (0.64), and #3 shipping-guide (0.18).',
        focusNodes: ['ret-scorer', 'ret-order', 'ret-sorter'],
        activeNodes: ['ret-scorer', 'ret-order', 'ret-sorter'],
        activeEdges: ['e-ret-3', 'e-ret-order'],
        packets: [
          { edgeId: 'e-ret-3', start: 0.4, end: 3.4, payload: '3 scored docs' },
          { edgeId: 'e-ret-order', start: 0.6, end: 3.4, payload: '@order_desc' },
        ],
        code: { file: 'src/rag/vector_store.py', lines: [262] },
        stateBefore: { ranked: null },
        stateAfter: { ranked: ['#1 refund-policy (0.89)', '#2 returns-guide (0.64)', '#3 shipping-guide (0.18)'] },
        takeaway: 'Sorting places the most relevant policy passages at the front of the list before slicing.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-ret-beat-3',
        beatNumber: 3,
        title: '@ranked[:2] (ranked_docs, cutoff_limit)',
        duration: 6,
        question: 'Where does shipping-guide get excluded?',
        narration:
          '@ranked_docs and @cutoff_limit (limit=2) connect into @ranked[:2], keeping the top 2 documents (refund-policy and returns-guide) and dropping #3 shipping-guide.',
        focusNodes: ['ret-sorter', 'ret-limit', 'ret-slicer'],
        activeNodes: ['ret-sorter', 'ret-limit', 'ret-slicer'],
        activeEdges: ['e-ret-4', 'e-ret-limit'],
        packets: [
          { edgeId: 'e-ret-4', start: 0.3, end: 3.2, payload: 'ranked[0..2]' },
          { edgeId: 'e-ret-limit', start: 0.5, end: 3.2, payload: 'limit = 2' },
        ],
        code: { file: 'src/rag/vector_store.py', lines: [270] },
        stateBefore: { rankedCount: 3 },
        stateAfter: { selected: ['refund-policy', 'returns-guide'], excluded: ['shipping-guide'] },
        takeaway: 'Slicing ranked[:2] prevents shipping delivery days from entering the prompt.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-ret-beat-4',
        beatNumber: 4,
        title: 'return @matches',
        duration: 5,
        question: 'What does retrieve() emit after top-2 filtering completes?',
        narration:
          'Once @ranked[:2] finishes filtering, it emits @matches ([refund-policy, returns-guide]) out to the return port.',
        focusNodes: ['ret-slicer', 'ret-out'],
        activeNodes: ['ret-slicer', 'ret-out'],
        activeEdges: ['e-ret-5'],
        packets: [
          { edgeId: 'e-ret-5', start: 0.3, end: 3.4, payload: 'top 2 matches' },
        ],
        code: { file: 'src/rag/vector_store.py', lines: [272] },
        stateBefore: { selected: ['refund-policy', 'returns-guide'] },
        stateAfter: { returned: ['refund-policy', 'returns-guide'] },
        takeaway: '@ranked[:2] emits its filtered matches only after receiving and slicing the ranked list.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
    ],
  },

  'fn-context': {
    id: 'fn-context',
    functionName: 'join_context(matches)',
    signature: 'def join_context(matches: list[DocMatch]) -> str:',
    fileName: 'src/rag/context_assembler.py',
    codebaseRange: 'Lines 388–396',
    totalModuleLines: 90,
    summary:
      'Matches the 2 blocks inside join_context: @TagSourceID prefixes each passage using @tag_template, and @JoinChunks glues them together using @blank_line_sep.',
    parentBeatNumber: 4,
    parentNodeId: 'context',
    sidebarInputs: [
      {
        name: '@matches',
        value: '2 winning docs: [refund-policy], [returns-guide]',
        color: 'teal',
      },
    ],
    codeLines: [
      {
        lineNumber: 388,
        text: '@TagSourceID',
        explanation: 'Beat 1: Prefixes each passage with [refund-policy] and [returns-guide].',
        atName: '@TagSourceID',
        goalText: 'Attach [refund-policy] and [returns-guide] labels to each passage',
        resultText: '1) "[refund-policy] Refund requests..."  2) "[returns-guide] Include order number..."',
      },
      {
        lineNumber: 396,
        text: '@JoinChunks',
        explanation: 'Beat 2: Joins the 2 tagged strings with a blank line separator.',
        atName: '@JoinChunks',
        goalText: 'Glue the 2 labeled passages into one unified context string',
        resultText: '"[refund-policy] Refund requests within 30 days...\\n\\n[returns-guide]..."',
      },
      {
        lineNumber: 398,
        text: 'return @context',
        explanation: 'Beat 3: Emits the unified @context string back to answer.py.',
        atName: 'return @context',
        goalText: 'Emit @context from @JoinChunks to OUT @context',
        resultText: '"[refund-policy]...\\n\\n[returns-guide]..."',
        inputLabel: '@JoinChunks output',
        inputValue: '"[refund-policy]...\\n\\n[returns-guide]..."',
        outputLabel: 'return @context',
      },
    ],
    graph: {
      id: 'sub-graph-fn-context',
      title: 'Inside join_context(matches) · 2 Steps + Connected @Inputs',
      subsystemGroups: [
        { id: 'ctx-g1', title: '1. TAG SOURCE ID', subtitle: '@TagSourceID', col: 0, accentColor: 'amber' },
        { id: 'ctx-g2', title: '2. JOIN CHUNKS', subtitle: '@JoinChunks', col: 1, accentColor: 'rose' },
      ],
      compactRowAssignment: {
        'ctx-in': { col: 0, row: 0 },
        'ctx-fmt': { col: 0, row: 1 },
        'ctx-tag': { col: 0, row: 0 },
        'ctx-sep': { col: 1, row: 1 },
        'ctx-join': { col: 1, row: 0 },
        'ctx-out': { col: 1, row: 1 },
      },
      nodes: [
        {
          id: 'ctx-in',
          stepBadge: 'IN',
          label: '@matches',
          kind: 'input',
          iconName: 'Files',
          accentColor: 'teal',
          subtitle: '2 winning matches',
          description: 'The two selected matches (refund-policy, returns-guide) from retrieve().',
          roleSummary: 'Provides raw match objects.',
          codeReference: {
            file: 'src/rag/context_assembler.py',
            lines: [388],
            snippet: 'tagged = TagSourceID(matches, tag_template)',
          },
          defaultPreview: '[refund-policy, returns-guide]',
          width: 136,
          height: 88,
          moduleBadge: 'Input',
        },
        {
          id: 'ctx-fmt',
          stepBadge: '@',
          label: '@tag_template',
          kind: 'input',
          iconName: 'Tag',
          accentColor: 'amber',
          subtitle: 'f"[{m.id}] {m.text}"',
          description: 'Formatting rule inside join_context() connected directly to @TagSourceID.',
          roleSummary: 'Stamps [source-id] before each passage.',
          codeReference: {
            file: 'src/rag/context_assembler.py',
            lines: [388],
            snippet: 'tag_template = "[{id}] {text}"',
          },
          defaultPreview: '"[{id}] {text}"',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'ctx-tag',
          stepBadge: '①',
          label: 'TagSourceID',
          kind: 'transform',
          iconName: 'Tag',
          accentColor: 'amber',
          subtitle: 'Stamp [id] onto text',
          description: 'Prefixes each passage with its document ID so the model can cite [refund-policy].',
          roleSummary: 'Prepends [refund-policy] & [returns-guide].',
          codeReference: {
            file: 'src/rag/context_assembler.py',
            lines: [388],
            snippet: 'tagged = [f"[{m.id}] {m.text}" for m in matches]',
          },
          defaultPreview: '"[refund-policy] Refund requests..."',
          width: 520,
          height: 280,
          moduleBadge: 'L388 · Beat 1',
        },
        {
          id: 'ctx-sep',
          stepBadge: '@',
          label: '@blank_line_sep',
          kind: 'input',
          iconName: 'Layers',
          accentColor: 'rose',
          subtitle: 'Separator "\\n\\n"',
          description: 'Blank line separator inside join_context() connected directly to @JoinChunks.',
          roleSummary: 'Separates paragraphs cleanly.',
          codeReference: {
            file: 'src/rag/context_assembler.py',
            lines: [396],
            snippet: 'blank_line_sep = "\\n\\n"',
          },
          defaultPreview: '"\\n\\n" (blank line)',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'ctx-join',
          stepBadge: '②',
          label: 'JoinChunks',
          kind: 'assembly',
          iconName: 'Layers',
          accentColor: 'rose',
          subtitle: 'Glue passages together',
          description: 'Concatenates the 2 tagged passages with a double newline.',
          roleSummary: 'Produces unified context string.',
          codeReference: {
            file: 'src/rag/context_assembler.py',
            lines: [396],
            snippet: 'return "\\n\\n".join(tagged)',
          },
          defaultPreview: '"[refund-policy]...\\n\\n[returns-guide]..."',
          width: 520,
          height: 280,
          moduleBadge: 'L396 · Beat 2',
        },
        {
          id: 'ctx-out',
          stepBadge: 'OUT',
          label: '@context',
          kind: 'output',
          iconName: 'FileText',
          accentColor: 'mint',
          subtitle: 'Back to answer.py L4',
          description: 'Returns the assembled context string back to answer.py.',
          roleSummary: 'Supplies context to build_prompt().',
          codeReference: {
            file: 'src/rag/context_assembler.py',
            lines: [396],
            snippet: 'return "\\n\\n".join(tagged)',
          },
          defaultPreview: '[refund-policy] + [returns-guide]',
          width: 152,
          height: 92,
          moduleBadge: 'Return',
        },
      ],
      edges: [
        {
          id: 'e-ctx-1',
          source: 'ctx-in',
          target: 'ctx-tag',
          label: '@matches',
          relationship: 'data',
          description: 'Passes retrieved match objects into @TagSourceID.',
        },
        {
          id: 'e-ctx-fmt',
          source: 'ctx-fmt',
          target: 'ctx-tag',
          label: '@tag_template',
          relationship: 'lookup',
          description: 'Connects @tag_template into @TagSourceID.',
        },
        {
          id: 'e-ctx-2',
          source: 'ctx-tag',
          target: 'ctx-join',
          label: '@tagged_passages',
          relationship: 'data',
          description: 'Passes bracket-tagged passages into @JoinChunks.',
        },
        {
          id: 'e-ctx-sep',
          source: 'ctx-sep',
          target: 'ctx-join',
          label: '@blank_line_sep',
          relationship: 'lookup',
          description: 'Connects @blank_line_sep into @JoinChunks.',
        },
        {
          id: 'e-ctx-3',
          source: 'ctx-join',
          target: 'ctx-out',
          label: '@context',
          relationship: 'data',
          description: 'Outputs joined context string to answer.py.',
        },
      ],
    },
    steps: [
      {
        id: 'fn-ctx-beat-1',
        beatNumber: 1,
        title: '@TagSourceID(matches, tag_template)',
        duration: 6,
        question: 'How does the language model know the name of each source document?',
        narration:
          '@matches and @tag_template connect into @TagSourceID, prefixing each passage with its bracketed ID ([refund-policy] and [returns-guide]).',
        focusNodes: ['ctx-in', 'ctx-fmt', 'ctx-tag'],
        activeNodes: ['ctx-in', 'ctx-fmt', 'ctx-tag'],
        activeEdges: ['e-ctx-1', 'e-ctx-fmt'],
        packets: [
          { edgeId: 'e-ctx-1', start: 0.4, end: 3.2, payload: '2 DocMatch items' },
          { edgeId: 'e-ctx-fmt', start: 0.6, end: 3.2, payload: '@tag_template' },
        ],
        code: { file: 'src/rag/context_assembler.py', lines: [388] },
        stateBefore: { matches: ['refund-policy', 'returns-guide'] },
        stateAfter: { tagged: ['[refund-policy]...', '[returns-guide]...'] },
        takeaway: 'Without explicit [source-id] prefixes in the context string, the model cannot cite [refund-policy].',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-ctx-beat-2',
        beatNumber: 2,
        title: '@JoinChunks(tagged_passages, blank_line_sep)',
        duration: 6,
        question: 'How are the two tagged passages combined into one context variable?',
        narration:
          '@tagged_passages and @blank_line_sep connect into @JoinChunks, gluing the two tagged strings with a blank line separator.',
        focusNodes: ['ctx-tag', 'ctx-sep', 'ctx-join'],
        activeNodes: ['ctx-tag', 'ctx-sep', 'ctx-join'],
        activeEdges: ['e-ctx-2', 'e-ctx-sep'],
        packets: [
          { edgeId: 'e-ctx-2', start: 0.3, end: 3.2, payload: '2 tagged strings' },
          { edgeId: 'e-ctx-sep', start: 0.5, end: 3.2, payload: '"\\n\\n"' },
        ],
        code: { file: 'src/rag/context_assembler.py', lines: [396] },
        stateBefore: { context: null },
        stateAfter: { context: '[refund-policy]...\n\n[returns-guide]...' },
        takeaway: 'The joined context string contains only the 2 selected passages—shipping-guide never enters.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-ctx-beat-3',
        beatNumber: 3,
        title: 'return @context',
        duration: 5,
        question: 'What does join_context(matches) emit after joining?',
        narration:
          'Once @JoinChunks completes concatenating the passages, it emits @context out to the return port.',
        focusNodes: ['ctx-join', 'ctx-out'],
        activeNodes: ['ctx-join', 'ctx-out'],
        activeEdges: ['e-ctx-3'],
        packets: [
          { edgeId: 'e-ctx-3', start: 0.3, end: 3.4, payload: '@context' },
        ],
        code: { file: 'src/rag/context_assembler.py', lines: [398] },
        stateBefore: { context: '[refund-policy]...\n\n[returns-guide]...' },
        stateAfter: { returned: '[refund-policy]...\n\n[returns-guide]...' },
        takeaway: '@JoinChunks receives its inputs on Beat 2 and emits @context on Beat 3.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
    ],
  },

  'fn-prompt': {
    id: 'fn-prompt',
    functionName: 'build_prompt(question, context)',
    signature: 'def build_prompt(question: str, context: str) -> str:',
    fileName: 'src/rag/prompt_builder.py',
    codebaseRange: 'Lines 516–526',
    totalModuleLines: 80,
    summary:
      'Matches the 2 blocks inside build_prompt: @SystemRules formats @grounding_policy, and @PromptAssembler combines @SystemRules, @context, and @question into one coherent AI prompt.',
    parentBeatNumber: 5,
    parentNodeId: 'prompt',
    sidebarInputs: [
      {
        name: '@question',
        value: '"How long do I have to request a refund?"',
        color: 'sky',
      },
      {
        name: '@context',
        value: '"[refund-policy] Refund requests within 30 days... [returns-guide]..."',
        color: 'rose',
      },
    ],
    codeLines: [
      {
        lineNumber: 516,
        text: '@SystemRules',
        explanation: 'Beat 1: Defines the grounding & citation rules for the AI.',
        atName: '@SystemRules',
        goalText: 'Set strict grounding rules: use context only and cite [source-id]',
        resultText: '"Use the provided shop policy context. Do not guess. Cite [source-id]."',
      },
      {
        lineNumber: 526,
        text: '@PromptAssembler',
        explanation: 'Beat 2: Combines SystemRules, context, and question into one coherent prompt.',
        atName: '@PromptAssembler',
        goalText: 'Combine SystemRules, context, and question into one coherent AI prompt',
        resultText: '"Rules + Context ([refund-policy], [returns-guide]) + Question"',
      },
      {
        lineNumber: 528,
        text: 'return @prompt',
        explanation: 'Beat 3: Emits the assembled @prompt back to answer.py.',
        atName: 'return @prompt',
        goalText: 'Emit @prompt from @PromptAssembler to OUT @prompt',
        resultText: '"Rules + Context + Question"',
        inputLabel: '@PromptAssembler output',
        inputValue: '"Rules + Context ([refund-policy], [returns-guide]) + Question"',
        outputLabel: 'return @prompt',
      },
    ],
    graph: {
      id: 'sub-graph-fn-prompt',
      title: 'Inside build_prompt(question, context) · SystemRules + PromptAssembler',
      subsystemGroups: [
        { id: 'prm-g1', title: '1. SYSTEM RULES', subtitle: '@SystemRules', col: 0, accentColor: 'emerald' },
        { id: 'prm-g2', title: '2. PROMPT ASSEMBLER', subtitle: '@PromptAssembler', col: 1, accentColor: 'amber' },
      ],
      compactRowAssignment: {
        'prm-policy': { col: 0, row: 0 },
        'prm-ctx': { col: 0, row: 0 },
        'prm-q': { col: 0, row: 1 },
        'prm-rules': { col: 0, row: 0 },
        'prm-merge': { col: 1, row: 0 },
        'prm-out': { col: 1, row: 1 },
      },
      nodes: [
        {
          id: 'prm-policy',
          stepBadge: '@',
          label: '@grounding_policy',
          kind: 'input',
          iconName: 'ShieldCheck',
          accentColor: 'emerald',
          subtitle: 'Use docs & cite [ID]',
          description: 'Grounding rule preset inside build_prompt() connected directly into @SystemRules.',
          roleSummary: 'Supplies allowed/forbidden rules to @SystemRules.',
          codeReference: {
            file: 'src/rag/prompt_builder.py',
            lines: [516],
            snippet: 'grounding_policy = "Use context + Cite [ID]"',
          },
          defaultPreview: 'Use docs + Cite [ID]',
          width: 176,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'prm-ctx',
          stepBadge: 'IN',
          label: '@context',
          kind: 'input',
          iconName: 'Layers',
          accentColor: 'rose',
          subtitle: '2 joined policies',
          description: 'The context string containing refund-policy and returns-guide.',
          roleSummary: 'Provides policy evidence.',
          codeReference: {
            file: 'src/rag/prompt_builder.py',
            lines: [526],
            snippet: 'def build_prompt(question: str, context: str) -> str:',
          },
          defaultPreview: '[refund-policy] + [returns-guide]',
          width: 136,
          height: 88,
          moduleBadge: 'arg 2',
        },
        {
          id: 'prm-q',
          stepBadge: 'IN',
          label: '@question',
          kind: 'input',
          iconName: 'MessageSquareQuote',
          accentColor: 'sky',
          subtitle: 'Raw user question',
          description: 'The untouched user question string from Beat 1.',
          roleSummary: 'Specifies what to answer.',
          codeReference: {
            file: 'src/rag/prompt_builder.py',
            lines: [526],
            snippet: 'def build_prompt(question: str, context: str) -> str:',
          },
          defaultPreview: '"How long...refund?"',
          width: 136,
          height: 88,
          moduleBadge: 'arg 1',
        },
        {
          id: 'prm-rules',
          stepBadge: '①',
          label: 'SystemRules',
          kind: 'input',
          iconName: 'ShieldCheck',
          accentColor: 'emerald',
          subtitle: 'Grounding instruction',
          description: 'Instructs the model to rely on the supplied context and cite [source-id].',
          roleSummary: 'Sets grounding rule.',
          codeReference: {
            file: 'src/rag/prompt_builder.py',
            lines: [516],
            snippet: 'rules = "Use the provided shop policy context. Cite [source-id]."',
          },
          defaultPreview: '"Use shop policy context. Cite [ID]."',
          width: 440,
          height: 210,
          moduleBadge: 'L516 · Beat 1',
        },
        {
          id: 'prm-merge',
          stepBadge: '②',
          label: 'PromptAssembler',
          kind: 'assembly',
          iconName: 'FileCode2',
          accentColor: 'amber',
          subtitle: 'Combine Rules + Ctx + Q',
          description: 'Combines @SystemRules, @context, and @question into one coherent AI prompt.',
          roleSummary: 'Formats complete grounded prompt.',
          codeReference: {
            file: 'src/rag/prompt_builder.py',
            lines: [526],
            snippet: 'return f"{rules}\\n\\nContext:\\n{context}\\n\\nQuestion: {question}"',
          },
          defaultPreview: 'Rules + Context + Question',
          width: 616,
          height: 396,
          moduleBadge: 'L526 · Beat 2',
        },
        {
          id: 'prm-out',
          stepBadge: 'OUT',
          label: '@prompt',
          kind: 'output',
          iconName: 'CheckCircle2',
          accentColor: 'mint',
          subtitle: 'Back to answer.py L5',
          description: 'Returns the assembled prompt string ready for generate(prompt).',
          roleSummary: 'Hands prompt to model stage.',
          codeReference: {
            file: 'src/rag/prompt_builder.py',
            lines: [526],
            snippet: 'return f"{rules}\\n\\nContext:\\n{context}\\n\\nQuestion: {question}"',
          },
          defaultPreview: 'Ready for generate()',
          width: 152,
          height: 92,
          moduleBadge: 'Return',
        },
      ],
      edges: [
        {
          id: 'e-prm-policy',
          source: 'prm-policy',
          target: 'prm-rules',
          label: '@grounding_policy',
          relationship: 'lookup',
          description: 'Connects @grounding_policy into @SystemRules.',
        },
        {
          id: 'e-prm-1',
          source: 'prm-rules',
          target: 'prm-merge',
          label: '@SystemRules',
          relationship: 'data',
          description: 'Supplies @SystemRules string.',
        },
        {
          id: 'e-prm-2',
          source: 'prm-ctx',
          target: 'prm-merge',
          label: '@context',
          relationship: 'data',
          description: 'Supplies joined policy passages.',
        },
        {
          id: 'e-prm-3',
          source: 'prm-q',
          target: 'prm-merge',
          label: '@question',
          relationship: 'data',
          description: 'Supplies raw customer question.',
        },
        {
          id: 'e-prm-4',
          source: 'prm-merge',
          target: 'prm-out',
          label: '@prompt',
          relationship: 'data',
          description: 'Outputs assembled prompt.',
        },
      ],
    },
    steps: [
      {
        id: 'fn-prm-beat-1',
        beatNumber: 1,
        title: '@SystemRules(grounding_policy)',
        duration: 6,
        question: 'What is @SystemRules inside build_prompt()?',
        narration:
          '@grounding_policy connects into @SystemRules to set the AI boundaries: "Use the provided shop policy context. Do not guess. Cite [source-id]."',
        focusNodes: ['prm-policy', 'prm-rules'],
        activeNodes: ['prm-policy', 'prm-rules'],
        activeEdges: ['e-prm-policy'],
        packets: [{ edgeId: 'e-prm-policy', start: 0.4, end: 3.2, payload: '@grounding_policy' }],
        code: { file: 'src/rag/prompt_builder.py', lines: [516] },
        stateBefore: { rules: null },
        stateAfter: { rules: 'Use the provided shop policy context. Cite [source-id].' },
        takeaway: '@SystemRules tells the model to rely only on the retrieved context and cite [source-id].',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-prm-beat-2',
        beatNumber: 2,
        title: '@PromptAssembler(SystemRules, context, question)',
        duration: 6,
        question: 'How does @PromptAssembler combine the three pieces?',
        narration:
          '@SystemRules, @context, and @question all connect into @PromptAssembler to form one coherent instruction package for the AI.',
        focusNodes: ['prm-rules', 'prm-ctx', 'prm-q', 'prm-merge'],
        activeNodes: ['prm-rules', 'prm-ctx', 'prm-q', 'prm-merge'],
        activeEdges: ['e-prm-1', 'e-prm-2', 'e-prm-3'],
        packets: [
          { edgeId: 'e-prm-1', start: 0.3, end: 3.2, payload: '@SystemRules' },
          { edgeId: 'e-prm-2', start: 0.5, end: 3.2, payload: '@context' },
          { edgeId: 'e-prm-3', start: 0.7, end: 3.2, payload: '@question' },
        ],
        code: { file: 'src/rag/prompt_builder.py', lines: [526] },
        stateBefore: { full_prompt: null },
        stateAfter: { full_prompt: 'Rules + Context + Question' },
        takeaway: 'Every @input inside @PromptAssembler comes from a visible connected node.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-prm-beat-3',
        beatNumber: 3,
        title: 'return @prompt',
        duration: 5,
        question: 'What does build_prompt() emit after assembling the prompt?',
        narration:
          'Once @PromptAssembler finishes combining Rules, Context, and Question, it emits @prompt out to the return port.',
        focusNodes: ['prm-merge', 'prm-out'],
        activeNodes: ['prm-merge', 'prm-out'],
        activeEdges: ['e-prm-4'],
        packets: [
          { edgeId: 'e-prm-4', start: 0.3, end: 3.4, payload: '@prompt' },
        ],
        code: { file: 'src/rag/prompt_builder.py', lines: [528] },
        stateBefore: { full_prompt: 'Rules + Context + Question' },
        stateAfter: { returned: 'Rules + Context + Question' },
        takeaway: '@PromptAssembler receives its 3 inputs on Beat 2 and emits @prompt on Beat 3.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
    ],
  },

  'fn-generate': {
    id: 'fn-generate',
    functionName: 'generate(prompt)',
    signature: 'def generate(prompt: str) -> str:',
    fileName: 'src/rag/generator_verifier.py',
    codebaseRange: 'Lines 692–704',
    totalModuleLines: 210,
    summary:
      'Matches the 2 blocks inside generate(prompt): @attend_context spotlights the 30-day policy sentence in @prompt, and @decode_and_cite combines @focused_evidence with @citation_rule.',
    parentBeatNumber: 6,
    parentNodeId: 'model',
    sidebarInputs: [
      {
        name: '@prompt',
        value: '"Rules + Context ([refund-policy], [returns-guide]) + Question"',
        color: 'amber',
      },
      {
        name: '@citation_rule',
        value: '"Attach [refund-policy] proof tag to the final answer"',
        color: 'amber',
      },
    ],
    codeLines: [
      {
        lineNumber: 692,
        text: '@attend_context',
        explanation: 'Beat 1: Focuses attention on "within 30 days of purchase" in [refund-policy].',
        atName: '@attend_context',
        goalText: 'Lock attention onto the "within 30 days of purchase" sentence',
        resultText: '"[refund-policy] Refund requests must be submitted within 30 days of purchase."',
      },
      {
        lineNumber: 704,
        text: '@decode_and_cite',
        explanation: 'Beat 2: Drafts the reply and verifies the [refund-policy] citation.',
        atName: '@decode_and_cite',
        goalText: 'Write the 30-day answer and attach the [refund-policy] citation badge',
        resultText: '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
      },
      {
        lineNumber: 706,
        text: 'return @verified_answer',
        explanation: 'Beat 3: Emits the verified answer with [refund-policy] citation back to answer.py.',
        atName: 'return @verified_answer',
        goalText: 'Emit @verified_answer from @decode_and_cite to OUT @verified_answer',
        resultText: '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
        inputLabel: '@decode_and_cite output',
        inputValue: '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
        outputLabel: 'return @verified_answer',
      },
    ],
    graph: {
      id: 'sub-graph-fn-generate',
      title: 'Inside generate(prompt) · Attend + Decode with Connected @Inputs',
      subsystemGroups: [
        { id: 'gen-g1', title: '1. ATTEND CONTEXT', subtitle: '@attend_context', col: 0, accentColor: 'teal' },
        { id: 'gen-g2', title: '2. DECODE & CITE', subtitle: '@decode_and_cite', col: 1, accentColor: 'violet' },
      ],
      compactRowAssignment: {
        'gen-in': { col: 0, row: 0 },
        'gen-attend': { col: 0, row: 1 },
        'gen-cite-rule': { col: 1, row: 1 },
        'gen-decode': { col: 1, row: 0 },
        'gen-out': { col: 1, row: 1 },
      },
      nodes: [
        {
          id: 'gen-in',
          stepBadge: 'IN',
          label: '@prompt',
          kind: 'input',
          iconName: 'FileCode2',
          accentColor: 'amber',
          subtitle: 'Grounded prompt',
          description: 'The assembled prompt containing [refund-policy], [returns-guide], and the question.',
          roleSummary: 'Feeds context + question into model.',
          codeReference: {
            file: 'src/rag/generator_verifier.py',
            lines: [692],
            snippet: 'salient_span = attend_context(prompt)',
          },
          defaultPreview: 'Rules + Context + Question',
          width: 136,
          height: 88,
          moduleBadge: 'Input',
        },
        {
          id: 'gen-attend',
          stepBadge: '①',
          label: 'attend_context()',
          kind: 'transform',
          iconName: 'SearchCheck',
          accentColor: 'teal',
          subtitle: 'Focus on "30 days"',
          description: 'Attends to the policy sentence stating "within 30 days of purchase".',
          roleSummary: 'Highlights relevant span in prompt.',
          codeReference: {
            file: 'src/rag/generator_verifier.py',
            lines: [692],
            snippet: 'salient_span = attend_context(prompt)',
          },
          defaultPreview: '"within 30 days of purchase"',
          width: 520,
          height: 280,
          moduleBadge: 'L692 · Beat 1',
        },
        {
          id: 'gen-cite-rule',
          stepBadge: '@',
          label: '@citation_rule',
          kind: 'input',
          iconName: 'ShieldCheck',
          accentColor: 'amber',
          subtitle: 'Attach [refund-policy]',
          description: 'Citation verification rule inside generate() connected directly into @decode_and_cite().',
          roleSummary: 'Ensures [refund-policy] badge is attached.',
          codeReference: {
            file: 'src/rag/generator_verifier.py',
            lines: [704],
            snippet: 'citation_rule = "Cite [source-id]"',
          },
          defaultPreview: 'Cite [refund-policy]',
          width: 196,
          height: 76,
          moduleBadge: 'Local @Input',
        },
        {
          id: 'gen-decode',
          stepBadge: '②',
          label: 'decode_and_cite()',
          kind: 'generation',
          iconName: 'Sparkles',
          accentColor: 'violet',
          subtitle: 'Draft & verify [id]',
          description: 'Generates the response conditioned on the prompt and verifies the [refund-policy] citation.',
          roleSummary: 'Produces verified answer with citation.',
          codeReference: {
            file: 'src/rag/generator_verifier.py',
            lines: [704],
            snippet: 'answer = decode_and_cite(prompt, salient_span)',
          },
          defaultPreview: '"...within 30 days [refund-policy]"',
          width: 520,
          height: 280,
          moduleBadge: 'L704 · Beat 2',
        },
        {
          id: 'gen-out',
          stepBadge: 'OUT',
          label: '@verified_answer',
          kind: 'output',
          iconName: 'CheckCircle2',
          accentColor: 'mint',
          subtitle: 'Final settled result',
          description: 'Returns the final answer with an interactive [refund-policy] citation.',
          roleSummary: 'Final settled result.',
          codeReference: {
            file: 'src/rag/generator_verifier.py',
            lines: [704],
            snippet: 'return answer',
          },
          defaultPreview: '"...within 30 days [refund-policy]"',
          width: 152,
          height: 92,
          moduleBadge: 'Return',
        },
      ],
      edges: [
        {
          id: 'e-gen-1',
          source: 'gen-in',
          target: 'gen-attend',
          label: '@prompt',
          relationship: 'data',
          description: 'Passes @prompt into @attend_context().',
        },
        {
          id: 'e-gen-2',
          source: 'gen-attend',
          target: 'gen-decode',
          label: '@focused_evidence',
          relationship: 'data',
          description: 'Guides @decode_and_cite() with the focused 30-day policy span.',
        },
        {
          id: 'e-gen-cite',
          source: 'gen-cite-rule',
          target: 'gen-decode',
          label: '@citation_rule',
          relationship: 'lookup',
          description: 'Connects @citation_rule into @decode_and_cite().',
        },
        {
          id: 'e-gen-3',
          source: 'gen-decode',
          target: 'gen-out',
          label: '@verified_answer',
          relationship: 'data',
          description: 'Returns verified answer to answer.py.',
        },
      ],
    },
    steps: [
      {
        id: 'fn-gen-beat-1',
        beatNumber: 1,
        title: '@attend_context(prompt)',
        duration: 6,
        question: 'Which part of the prompt drives the 30-day answer?',
        narration:
          '@prompt connects into @attend_context(), focusing on the retrieved sentence "Refund requests must be submitted within 30 days of purchase" inside [refund-policy].',
        focusNodes: ['gen-in', 'gen-attend'],
        activeNodes: ['gen-in', 'gen-attend'],
        activeEdges: ['e-gen-1'],
        packets: [{ edgeId: 'e-gen-1', start: 0.4, end: 3.4, payload: 'Rules + Context + Question' }],
        code: { file: 'src/rag/generator_verifier.py', lines: [692] },
        stateBefore: { salient_span: null },
        stateAfter: { salient_span: 'Refund requests must be submitted within 30 days of purchase.' },
        takeaway: 'Because the policy sentence is inside the prompt, the model can attend to it without changing model weights.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-gen-beat-2',
        beatNumber: 2,
        title: '@decode_and_cite(focused_evidence, citation_rule)',
        duration: 6,
        question: 'How is the final grounded answer generated and verified?',
        narration:
          '@focused_evidence and @citation_rule connect into @decode_and_cite(), drafting the reply and attaching the verified [refund-policy] citation.',
        focusNodes: ['gen-attend', 'gen-cite-rule', 'gen-decode'],
        activeNodes: ['gen-attend', 'gen-cite-rule', 'gen-decode'],
        activeEdges: ['e-gen-2', 'e-gen-cite'],
        packets: [
          { edgeId: 'e-gen-2', start: 0.3, end: 3.2, payload: '@focused_evidence' },
          { edgeId: 'e-gen-cite', start: 0.5, end: 3.2, payload: '@citation_rule' },
        ],
        code: { file: 'src/rag/generator_verifier.py', lines: [704] },
        stateBefore: { answer: null },
        stateAfter: {
          answer: 'Refund requests must be submitted within 30 days of purchase [refund-policy].',
        },
        takeaway: 'Retrieved context helps ground generation, and verifying [refund-policy] confirms the supporting sentence.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
      {
        id: 'fn-gen-beat-3',
        beatNumber: 3,
        title: 'return @verified_answer',
        duration: 5,
        question: 'What does generate(prompt) emit once decoding and citation check complete?',
        narration:
          'Once @decode_and_cite() verifies the [refund-policy] citation, it emits @verified_answer out to the return port.',
        focusNodes: ['gen-decode', 'gen-out'],
        activeNodes: ['gen-decode', 'gen-out'],
        activeEdges: ['e-gen-3'],
        packets: [
          { edgeId: 'e-gen-3', start: 0.3, end: 3.4, payload: '@verified_answer' },
        ],
        code: { file: 'src/rag/generator_verifier.py', lines: [706] },
        stateBefore: {
          answer: 'Refund requests must be submitted within 30 days of purchase [refund-policy].',
        },
        stateAfter: {
          returned: 'Refund requests must be submitted within 30 days of purchase [refund-policy].',
        },
        takeaway: '@decode_and_cite() receives its inputs on Beat 2 and emits @verified_answer on Beat 3.',
        nodeDataBefore: {},
        nodeDataAfter: {},
      },
    ],
  },
};

export const SUB_FUNCTION_LIST: SubFunctionLesson[] = [
  SUB_FUNCTION_LESSONS['fn-embed'],
  SUB_FUNCTION_LESSONS['fn-retrieve'],
  SUB_FUNCTION_LESSONS['fn-context'],
  SUB_FUNCTION_LESSONS['fn-prompt'],
  SUB_FUNCTION_LESSONS['fn-generate'],
];

const LEVEL_1_LINE_TO_INNER_FN: Record<number, string> = {
  // fn-embed
  112: 'emb-tokenize',
  124: 'emb-pool',
  136: 'emb-norm',
  // fn-retrieve
  250: 'ret-scorer',
  262: 'ret-sorter',
  270: 'ret-slicer',
  // fn-context
  388: 'ctx-tag',
  396: 'ctx-join',
  // fn-prompt
  516: 'prm-rules',
  526: 'prm-merge',
  // fn-generate
  692: 'gen-attend',
  704: 'gen-decode',
};

const STATIC_DATA_SPECS: Record<string, StaticDataSpec> = {
  // 1) Inside embed(question)
  'emb-input': {
    header: '@question [',
    entries: [
      { key: 'text', value: '"How long do I have to request a refund?"', color: 'sky' },
    ],
  },
  'emb-rules': {
    header: '@cleanup_rules [',
    entries: [
      { key: 'lowercase', value: 'True ("How" ➔ "how")', color: 'teal' },
      { key: 'strip_punct', value: '["?", "!", ".", ","] (drop "?")', color: 'rose' },
      { key: 'split_on', value: '"whitespace" (spaces between words)', color: 'sky' },
    ],
  },
  'emb-vocab': {
    header: '@vocab_table [',
    entries: [
      { key: '"how" (ID 104)', value: '[+0.10, -0.30, +0.05, +0.40, -0.10, +0.20]', color: 'sky' },
      { key: '"long" (ID 219)', value: '[+0.22, -0.84, +0.18, +0.92, -0.34, +0.54]', color: 'amber' },
      { key: '"request" (ID 512)', value: '[+0.14, -0.52, +0.11, +1.46, -0.38, +0.62]', color: 'rose' },
      { key: '"refund" (ID 891)', value: '[+0.50, -1.86, +0.30, +2.90, -0.86, +1.52]', color: 'mint' },
    ],
  },
  'emb-scale': {
    header: '@unit_scale [',
    entries: [
      { key: 'raw_norm ||v||', value: '2.00 (unscaled vector length)', color: 'amber' },
      { key: 'scale_rule', value: 'raw_vec ÷ 2.00 ➔ unit length 1.00', color: 'mint' },
    ],
  },
  'emb-out': {
    header: '@query_vector [',
    entries: [
      { key: '6_floats', value: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]', color: 'mint' },
      { key: 'length ||v||', value: '1.00 (normalized)', color: 'amber' },
    ],
  },

  // 2) Inside retrieve(query_vector, limit=2)
  'ret-query': {
    header: '@query_vector [',
    entries: [
      { key: 'vec', value: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]', color: 'amber' },
    ],
  },
  'ret-store': {
    header: '@INDEX_DOCS [',
    entries: [
      { key: '[refund-policy]', value: '"Refunds within 30 days of purchase."', color: 'emerald' },
      { key: '[returns-guide]', value: '"Include order # and return label."', color: 'sky' },
      { key: '[shipping-guide]', value: '"Standard shipping takes 3–5 days."', color: 'rose' },
    ],
  },
  'ret-order': {
    header: '@order_desc [',
    entries: [
      { key: 'sort_key', value: 'doc.similarity_score', color: 'violet' },
      { key: 'reverse', value: 'True (highest #1 ➔ lowest #3)', color: 'amber' },
    ],
  },
  'ret-limit': {
    header: '@cutoff_limit [',
    entries: [
      { key: 'limit', value: '2 (keep rank #1 and rank #2)', color: 'emerald' },
      { key: 'drop_rule', value: 'Discard rank #3 (shipping-guide)', color: 'rose' },
    ],
  },
  'ret-out': {
    header: '@matches [',
    entries: [
      { key: '#1 (0.89)', value: '[refund-policy] "within 30 days..."', color: 'emerald' },
      { key: '#2 (0.64)', value: '[returns-guide] "Include order #..."', color: 'sky' },
    ],
  },

  // 3) Inside join_context(matches)
  'ctx-in': {
    header: '@matches [',
    entries: [
      { key: 'match[0]', value: 'id="refund-policy", "within 30 days..."', color: 'emerald' },
      { key: 'match[1]', value: 'id="returns-guide", "Include order #..."', color: 'sky' },
    ],
  },
  'ctx-fmt': {
    header: '@tag_template [',
    entries: [
      { key: 'format_str', value: '"[{m.id}] {m.text}"', color: 'amber' },
      { key: 'example_out', value: '"[refund-policy] Refund requests..."', color: 'mint' },
    ],
  },
  'ctx-sep': {
    header: '@blank_line_sep [',
    entries: [
      { key: 'separator', value: '"\\n\\n" (double newline)', color: 'rose' },
      { key: 'joins', value: 'Passage #1 + blank line + Passage #2', color: 'amber' },
    ],
  },
  'ctx-out': {
    header: '@context [',
    entries: [
      { key: 'chunk_1', value: '"[refund-policy] within 30 days..."', color: 'emerald' },
      { key: 'chunk_2', value: '"[returns-guide] Include order #..."', color: 'sky' },
    ],
  },

  // 4) Inside build_prompt(question, context)
  'prm-policy': {
    header: '@grounding_policy [',
    entries: [
      { key: 'allowed', value: '"Answer using shop policy context only"', color: 'emerald' },
      { key: 'forbidden', value: '"Do not guess or invent outside rules"', color: 'rose' },
      { key: 'required', value: '"Always cite [source-id] in answer"', color: 'amber' },
    ],
  },
  'prm-ctx': {
    header: '@context [',
    entries: [
      { key: 'doc_1', value: '"[refund-policy] within 30 days..."', color: 'emerald' },
      { key: 'doc_2', value: '"[returns-guide] Include order #..."', color: 'sky' },
    ],
  },
  'prm-q': {
    header: '@question [',
    entries: [
      { key: 'ask', value: '"How long do I have to request a refund?"', color: 'sky' },
    ],
  },
  'prm-out': {
    header: '@prompt [',
    entries: [
      { key: '1_rules', value: '"Use shop policy context. Cite [ID]."', color: 'emerald' },
      { key: '2_context', value: '"[refund-policy]... [returns-guide]..."', color: 'rose' },
      { key: '3_question', value: '"How long... request a refund?"', color: 'sky' },
    ],
  },

  // 5) Inside generate(prompt)
  'gen-in': {
    header: '@prompt [',
    entries: [
      { key: '1_rules', value: '"Use context only. Cite [source-id]."', color: 'emerald' },
      { key: '2_context', value: '"[refund-policy] within 30 days..."', color: 'rose' },
      { key: '3_question', value: '"How long... request a refund?"', color: 'sky' },
    ],
  },
  'gen-cite-rule': {
    header: '@citation_rule [',
    entries: [
      { key: 'badge_format', value: '"Append [source-id] at end of sentence"', color: 'amber' },
      { key: 'verify_match', value: '"Confirm [refund-policy] exists in context"', color: 'emerald' },
    ],
  },
  'gen-out': {
    header: '@verified_answer [',
    entries: [
      { key: 'answer', value: '"Refund requests within 30 days..."', color: 'mint' },
      { key: 'citation', value: '"[refund-policy]" (verified ✓)', color: 'amber' },
    ],
  },
};

const LEVEL_1_STEP_IO_SPECS: Record<
  string,
  {
    inputLabel: string;
    inputValue: string;
    outputLabel: string;
    resultText: string;
  }
> = {
  // 1) fn-embed
  'emb-tokenize': {
    inputLabel: '@Question Input',
    inputValue: '"How long do I have to request a refund?"',
    outputLabel: '@Tokenize output',
    resultText: '["how", "long", "request", "refund"]',
  },
  'emb-pool': {
    inputLabel: '@tokenize input',
    inputValue: '["how", "long", "request", "refund"]',
    outputLabel: '@encode_pool output',
    resultText: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]',
  },
  'emb-norm': {
    inputLabel: '@encode_pool input',
    inputValue: '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]',
    outputLabel: '@l2_normalize output',
    resultText: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
  },

  // 2) fn-retrieve
  'ret-scorer': {
    inputLabel: '@query_vector input',
    inputValue: '[0.12, -0.44, 0.08, 0.71, -0.21, 0.36]',
    outputLabel: '@score_dot output',
    resultText: 'refund-policy: 0.89, returns-guide: 0.64, shipping-guide: 0.18',
  },
  'ret-sorter': {
    inputLabel: '@score_dot input',
    inputValue: 'refund-policy: 0.89, returns-guide: 0.64, shipping-guide: 0.18',
    outputLabel: '@sorted output',
    resultText: '[#1 refund-policy (0.89), #2 returns-guide (0.64), #3 shipping-guide (0.18)]',
  },
  'ret-slicer': {
    inputLabel: '@sorted input',
    inputValue: '[#1 refund-policy (0.89), #2 returns-guide (0.64), #3 shipping-guide (0.18)]',
    outputLabel: '@ranked[:2] output',
    resultText: 'Kept: [refund-policy, returns-guide] | Dropped: shipping-guide',
  },

  // 3) fn-context
  'ctx-tag': {
    inputLabel: '@matches input',
    inputValue: '[refund-policy, returns-guide]',
    outputLabel: '@TagSourceID output',
    resultText: '["[refund-policy] Refund requests...", "[returns-guide] Include order #..."]',
  },
  'ctx-join': {
    inputLabel: '@TagSourceID input',
    inputValue: '["[refund-policy] Refund requests...", "[returns-guide] Include order #..."]',
    outputLabel: '@JoinChunks output',
    resultText: '"[refund-policy] Refund requests within 30 days...\\n\\n[returns-guide]..."',
  },

  // 4) fn-prompt
  'prm-rules': {
    inputLabel: '@grounding_policy input',
    inputValue: '"Use shop policy context only + Cite [source-id]"',
    outputLabel: '@SystemRules output',
    resultText: '"Use the provided shop policy context. Do not guess. Cite [source-id]."',
  },
  'prm-merge': {
    inputLabel: '@SystemRules + @context + @question input',
    inputValue: 'Rules + "[refund-policy]..." + "How long do I have to request a refund?"',
    outputLabel: '@PromptAssembler output',
    resultText: '"Rules + Context ([refund-policy], [returns-guide]) + Question"',
  },

  // 5) fn-generate
  'gen-attend': {
    inputLabel: '@prompt input',
    inputValue: '"Rules + Context ([refund-policy], [returns-guide]) + Question"',
    outputLabel: '@attend_context output',
    resultText: '"[refund-policy] Refund requests must be submitted within 30 days of purchase."',
  },
  'gen-decode': {
    inputLabel: '@attend_context input',
    inputValue: '"[refund-policy] Refund requests must be submitted within 30 days of purchase."',
    outputLabel: '@decode_and_cite output',
    resultText: '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
  },
};

// Automatically attach NonSummarySpec (@Inputs, Goal, @Output), StaticDataSpec, procedural dynamic widths/heights, and Visual Flowchart drill-down to all Level-1 blocks
for (const lesson of SUB_FUNCTION_LIST) {
  lesson.graph.workedExampleLedger = WORKED_EXAMPLE_LEDGER;
  for (const node of lesson.graph.nodes) {
    const ns = getNonSummarySpec(node.id);
    if (ns) {
      node.nonSummary = {
        blockTitle: ns.blockName,
        inputs: ns.inputs,
        goalTitle: ns.goalTitle,
        goalText: ns.goalText,
        outputLabel: ns.outputLabel,
        outputValue: ns.outputValue,
      };
      node.drillDownFunctionId = node.id;
    }
    const sd = STATIC_DATA_SPECS[node.id];
    if (sd) {
      node.staticData = sd;
    }
    const dims = computeDynamicCardDimensions(node);
    node.width = dims.width;
    node.height = dims.height;
  }
  for (const line of lesson.codeLines) {
    line.file = lesson.fileName;
    const innerId = LEVEL_1_LINE_TO_INNER_FN[line.lineNumber];
    if (innerId) {
      line.drillDownFunctionId = innerId;
      const ns = getNonSummarySpec(innerId);
      const ioSpec = LEVEL_1_STEP_IO_SPECS[innerId];
      if (ns) {
        line.atName = ns.blockName;
        line.goalText = ns.shortGoal;
        line.resultText = ioSpec?.resultText ?? ns.shortResult;
      }
      if (ioSpec) {
        line.inputLabel = ioSpec.inputLabel;
        line.inputValue = ioSpec.inputValue;
        line.outputLabel = ioSpec.outputLabel;
      }
    }
  }
  for (const step of lesson.steps) {
    for (const ln of step.code.lines) {
      const innerId = LEVEL_1_LINE_TO_INNER_FN[ln];
      if (innerId) {
        step.drillDownFunctionId = innerId;
        break;
      }
    }
  }
}

const SUB_GRAPH_TO_FUNCTION_ID: Record<string, string> = {
  'sub-graph-fn-embed': 'fn-embed',
  'sub-graph-fn-retrieve': 'fn-retrieve',
  'sub-graph-fn-context': 'fn-context',
  'sub-graph-fn-prompt': 'fn-prompt',
  'sub-graph-fn-generate': 'fn-generate',
  'sub-graph-l2-tokenize': 'emb-tokenize',
  'sub-graph-l2-pool': 'emb-pool',
  'sub-graph-l2-norm': 'emb-norm',
  'sub-graph-l2-scorer': 'ret-scorer',
  'sub-graph-l2-sorter': 'ret-sorter',
  'sub-graph-l2-slicer': 'ret-slicer',
  'sub-graph-l2-tag': 'ctx-tag',
  'sub-graph-l2-join': 'ctx-join',
  'sub-graph-l2-rules': 'prm-rules',
  'sub-graph-l2-merge': 'prm-merge',
  'sub-graph-l2-attend': 'gen-attend',
  'sub-graph-l2-decode': 'gen-decode',
};

const DYNAMIC_PROCEDURAL_LESSONS: Record<string, SubFunctionLesson> = {};

export function registerProceduralSubFunctions(
  lessons: Record<string, SubFunctionLesson>
): void {
  for (const [k, v] of Object.entries(lessons)) {
    DYNAMIC_PROCEDURAL_LESSONS[k] = v;
  }
}

export function normalizeFunctionLessonId(rawId: string | null | undefined): string {
  if (!rawId) return '';
  const stripped = rawId.replace(/^(generated-)+/, '');
  return SUB_GRAPH_TO_FUNCTION_ID[stripped] ?? stripped;
}

export function resolveSubFunctionLesson(id: string | null): SubFunctionLesson | null {
  if (!id) return null;
  const canonicalId = normalizeFunctionLessonId(id);
  return (
    DYNAMIC_PROCEDURAL_LESSONS[canonicalId] ??
    DYNAMIC_PROCEDURAL_LESSONS[id] ??
    SUB_FUNCTION_LESSONS[canonicalId] ??
    getInnerFunctionLesson(canonicalId)
  );
}

/**
 * Normalizes a generated or seed function module (`lesson.architecture.functions[*]`) so it:
 * 1. Strips 'generated-' prefixes from both `fn.id` and `fn.graph.id` (preserving `sub-graph-*` keys).
 * 2. Reuses the curated reference `SubFunctionLesson` (18s beats, nonSummary, staticData, dynamic sizes,
 *    and Level-2 visual flowcharts) whenever the ID matches one of the 17 reference functions.
 * 3. For brand-new generated functions, strips Level-1 paper-card `customVisual` overrides, synthesizes
 *    dark `nonSummary` and `staticData` specs, and applies `computeDynamicCardDimensions`.
 */
export function adaptGeneratedSubFunctionLesson(rawFn: SubFunctionLesson): SubFunctionLesson {
  const canonicalId = normalizeFunctionLessonId(rawFn.id || rawFn.graph?.id);
  const curated = resolveSubFunctionLesson(canonicalId);
  if (curated) {
    return curated;
  }

  const normalizedGraphId = normalizeGraphId(rawFn.graph.id);
  const isLevel2 =
    normalizedGraphId.startsWith('sub-graph-l2-') || Boolean(rawFn.parentFunctionId);

  const adaptedNodes = rawFn.graph.nodes.map((node) => {
    const cleanNode = { ...node };
    if (!isLevel2 && cleanNode.customVisual?.variant === 'paper-card') {
      delete cleanNode.customVisual;
    }
    const ns = getNonSummarySpec(cleanNode.id);
    if (ns && !cleanNode.nonSummary) {
      cleanNode.nonSummary = {
        blockTitle: ns.blockName,
        inputs: ns.inputs,
        goalTitle: ns.goalTitle,
        goalText: ns.goalText,
        outputLabel: ns.outputLabel,
        outputValue: ns.outputValue,
      };
    }
    const sd = STATIC_DATA_SPECS[cleanNode.id];
    if (sd && !cleanNode.staticData) {
      cleanNode.staticData = sd;
    }
    const dims = computeDynamicCardDimensions(cleanNode);
    cleanNode.width = dims.width;
    cleanNode.height = dims.height;
    return cleanNode;
  });

  return {
    ...rawFn,
    id: canonicalId || rawFn.id,
    graph: {
      ...rawFn.graph,
      id: normalizedGraphId,
      workedExampleLedger: rawFn.graph.workedExampleLedger ?? WORKED_EXAMPLE_LEDGER,
      nodes: adaptedNodes,
    },
  };
}
