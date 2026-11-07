import {
  ANSWER_PY_LINES,
  ASSEMBLED_CONTEXT_STRING,
  ASSEMBLED_PROMPT_STRING,
  FINAL_SCRIPTED_ANSWER,
  ILLUSTRATIVE_QUERY_VECTOR,
  ILLUSTRATIVE_VECTOR_TEXT,
  LEARNER_QUESTION_INPUT,
  RAG_GRAPH,
} from './ragGraph';
import { ArchitectureGraph, Step, ValidationIssue } from '../types/lesson';

export const RAG_STEPS: Step[] = [
  {
    id: 'beat-1-raw-question',
    beatNumber: 1,
    title: 'Raw question',
    duration: 8,
    question: 'What enters the system before any search or generation happens?',
    narration:
      'We start with a plain question string: "How long do I have to request a refund?". Before retrieval runs, the system only has this raw text and a separate store of prepared shop policies.',
    focusNodes: ['question', 'index'],
    activeNodes: ['question'],
    activeEdges: [],
    packets: [],
    code: { file: 'answer.py', lines: [1] },
    stateBefore: {
      question: null,
      index_docs: ['refund-policy', 'returns-guide', 'shipping-guide'],
    },
    stateAfter: {
      question: LEARNER_QUESTION_INPUT,
      index_docs: ['refund-policy', 'returns-guide', 'shipping-guide'],
    },
    takeaway:
      'At line 1, only the raw input string and the external document store exist—no policy text has been attached to the question yet.',
    nodeDataBefore: {
      question: {
        statusLabel: 'Awaiting call',
        previewLines: ['answer(question) invoked', '"How long do I have to request a refund?"'],
        badgeText: 'str',
      },
      index: {
        statusLabel: 'Prepared store ready',
        previewLines: [
          '1. refund-policy ("...within 30 days...")',
          '2. returns-guide ("Include order number...")',
          '3. shipping-guide ("...three to five days...")',
        ],
        badgeText: '3 docs',
      },
    },
    nodeDataAfter: {
      question: {
        statusLabel: 'Bound to parameter',
        previewLines: ['question = "How long do I have to request a refund?"', 'Length: 40 chars · Ready to encode'],
        highlightToken: 'How long do I have to request a refund?',
        badgeText: 'input ready',
      },
      index: {
        statusLabel: 'Prepared store ready',
        previewLines: [
          '1. refund-policy ("...within 30 days...")',
          '2. returns-guide ("Include order number...")',
          '3. shipping-guide ("...three to five days...")',
        ],
        badgeText: '3 docs',
      },
    },
  },
  {
    id: 'beat-2-query-representation',
    beatNumber: 2,
    title: 'Query representation',
    duration: 8,
    drillDownFunctionId: 'fn-embed',
    question: 'How does the system prepare the question so it can search relevant policy passages?',
    narration:
      'To search by meaning rather than exact wording alone, embed(question) transforms the question into an illustrative six-number query vector while keeping the original text intact.',
    focusNodes: ['question', 'embed'],
    activeNodes: ['question', 'embed'],
    activeEdges: ['e-question-embed'],
    packets: [
      {
        edgeId: 'e-question-embed',
        start: 0.8,
        end: 4.4,
        payload: '"How long...refund?"',
        detail: 'Input string passed to embed(question)',
      },
    ],
    code: { file: 'answer.py', lines: [2] },
    stateBefore: {
      question: LEARNER_QUESTION_INPUT,
      query_vector: null,
    },
    stateAfter: {
      question: LEARNER_QUESTION_INPUT,
      query_vector: ILLUSTRATIVE_QUERY_VECTOR,
    },
    takeaway:
      'embed(question) produces query_vector = [0.12, -0.44, 0.08, 0.71, -0.21, 0.36] (illustrative 6-number vector) so retrieval can score candidate passages.',
    nodeDataBefore: {
      question: {
        statusLabel: 'Input string preserved',
        previewLines: ['"How long do I have to request a refund?"', 'Sending string to embed()...'],
        badgeText: 'str',
      },
      embed: {
        statusLabel: 'Encoding question...',
        previewLines: ['Input: "How long do I have to request a refund?"', 'Computing illustrative 6-number vector...'],
        badgeText: 'embed()',
      },
    },
    nodeDataAfter: {
      question: {
        statusLabel: 'Input string preserved',
        previewLines: ['"How long do I have to request a refund?"', 'Kept for build_prompt() in Beat 5'],
        badgeText: 'str',
      },
      embed: {
        statusLabel: 'Vector encoded',
        previewLines: [
          'Input: "How long do I have to request a refund?"',
          `Output: ${ILLUSTRATIVE_VECTOR_TEXT}`,
        ],
        highlightToken: ILLUSTRATIVE_VECTOR_TEXT,
        badgeText: '6 floats (illustrative)',
      },
    },
  },
  {
    id: 'beat-3-retrieval',
    beatNumber: 3,
    title: 'Retrieval',
    duration: 9,
    drillDownFunctionId: 'fn-retrieve',
    question: 'How does retrieval choose from the prepared store without changing the model?',
    narration:
      'retrieve(query_vector, limit=2) compares the vector against three prepared candidates in the index. It selects refund-policy and returns-guide, and excludes shipping-guide. Retrieval fetches existing text—it never updates model weights.',
    focusNodes: ['embed', 'index', 'retrieve'],
    activeNodes: ['embed', 'index', 'retrieve'],
    activeEdges: ['e-embed-retrieve', 'e-index-retrieve'],
    packets: [
      {
        edgeId: 'e-embed-retrieve',
        start: 0.6,
        end: 4.0,
        payload: '[0.12, -0.44, ...]',
        detail: 'Illustrative query_vector sent to similarity search',
      },
      {
        edgeId: 'e-index-retrieve',
        start: 1.0,
        end: 4.6,
        payload: '3 candidate docs',
        detail: 'refund-policy, returns-guide, shipping-guide compared',
      },
    ],
    code: { file: 'answer.py', lines: [3] },
    stateBefore: {
      query_vector: ILLUSTRATIVE_QUERY_VECTOR,
      candidates: ['refund-policy', 'returns-guide', 'shipping-guide'],
      matches: null,
    },
    stateAfter: {
      query_vector: ILLUSTRATIVE_QUERY_VECTOR,
      matches: [
        { id: 'refund-policy', illustrativeScore: 0.89, status: 'SELECTED (#1)' },
        { id: 'returns-guide', illustrativeScore: 0.64, status: 'SELECTED (#2)' },
      ],
      excluded: [{ id: 'shipping-guide', illustrativeScore: 0.18, status: 'EXCLUDED (limit=2)' }],
    },
    takeaway:
      'Retrieval supplies existing passages from the index (refund-policy and returns-guide) and drops shipping-guide rather than modifying any model parameters.',
    nodeDataBefore: {
      embed: {
        statusLabel: 'Sending vector',
        previewLines: [`query_vector = ${ILLUSTRATIVE_VECTOR_TEXT}`],
        badgeText: '6 floats',
      },
      index: {
        statusLabel: 'Supplying 3 candidates',
        previewLines: [
          '• refund-policy (30 days of purchase)',
          '• returns-guide (include order number)',
          '• shipping-guide (3–5 business days)',
        ],
        badgeText: '3 candidates',
      },
      retrieve: {
        statusLabel: 'Comparing query_vector (limit=2)',
        previewLines: [
          'Scoring 3 prepared index candidates...',
          'Selecting top 2 illustrative matches...',
        ],
        badgeText: 'limit=2',
      },
    },
    nodeDataAfter: {
      embed: {
        statusLabel: 'Vector used',
        previewLines: [`query_vector = ${ILLUSTRATIVE_VECTOR_TEXT}`],
        badgeText: '6 floats',
      },
      index: {
        statusLabel: 'Contributed 3 candidates',
        previewLines: [
          '✓ refund-policy (illustrative 0.89)',
          '✓ returns-guide (illustrative 0.64)',
          '✕ shipping-guide (illustrative 0.18)',
        ],
        badgeText: 'store unchanged',
      },
      retrieve: {
        statusLabel: 'Top 2 selected · 1 excluded',
        previewLines: [
          '✓ [1] refund-policy ("...within 30 days...")',
          '✓ [2] returns-guide ("Include order number...")',
          '✕ [3] shipping-guide — EXCLUDED',
        ],
        highlightToken: 'refund-policy',
        badgeText: '2 matches',
      },
    },
  },
  {
    id: 'beat-4-context-assembly',
    beatNumber: 4,
    title: 'Context assembly',
    duration: 8,
    drillDownFunctionId: 'fn-context',
    question: 'What happens to the two winning matches before we build the prompt?',
    narration:
      'Now we join the text of the two selected matches into a single context string. The refund window and order-number reminder move forward; the shipping delivery passage remains excluded.',
    focusNodes: ['retrieve', 'context'],
    activeNodes: ['retrieve', 'context'],
    activeEdges: ['e-retrieve-context'],
    packets: [
      {
        edgeId: 'e-retrieve-context',
        start: 0.7,
        end: 4.3,
        payload: '2 selected chunks',
        detail: 'refund-policy + returns-guide joined with "\\n\\n"',
      },
    ],
    code: { file: 'answer.py', lines: [4] },
    stateBefore: {
      matches: ['refund-policy', 'returns-guide'],
      context: null,
    },
    stateAfter: {
      matches: ['refund-policy', 'returns-guide'],
      context: ASSEMBLED_CONTEXT_STRING,
      excluded: 'shipping-guide (not in context)',
    },
    takeaway:
      'Line 4 extracts and joins only the two retrieved passages into one plain-text context string, keeping irrelevant shipping text out of the prompt.',
    nodeDataBefore: {
      retrieve: {
        statusLabel: 'Emitting 2 matches',
        previewLines: ['matches[0]: refund-policy', 'matches[1]: returns-guide', '(shipping-guide excluded)'],
        badgeText: '2 matches',
      },
      context: {
        statusLabel: 'Joining match.text...',
        previewLines: ['"\\n\\n".join(match.text for match in matches)', 'Awaiting 2 selected chunks...'],
        badgeText: 'joining',
      },
    },
    nodeDataAfter: {
      retrieve: {
        statusLabel: 'Matches forwarded',
        previewLines: ['✓ refund-policy', '✓ returns-guide', '✕ shipping-guide excluded'],
        badgeText: '2 matches',
      },
      context: {
        statusLabel: 'Context string assembled',
        previewLines: [
          '"Refund requests must be submitted within 30 days of purchase..."',
          '"Include your order number when contacting support..."',
          'Excluded: shipping-guide',
        ],
        highlightToken: 'within 30 days of purchase',
        badgeText: '2 chunks joined',
      },
    },
  },
  {
    id: 'beat-5-prompt-assembly',
    beatNumber: 5,
    title: 'Prompt assembly',
    duration: 8,
    drillDownFunctionId: 'fn-prompt',
    question: 'How do the original question and the retrieved policy text meet?',
    narration:
      'build_prompt(question, context) combines the original question string with the assembled policy context. Notice both inputs arriving together to form one explicit prompt.',
    focusNodes: ['question', 'context', 'prompt'],
    activeNodes: ['question', 'context', 'prompt'],
    activeEdges: ['e-question-prompt', 'e-context-prompt'],
    packets: [
      {
        edgeId: 'e-question-prompt',
        start: 0.6,
        end: 4.2,
        payload: 'question string',
        detail: '"How long do I have to request a refund?"',
      },
      {
        edgeId: 'e-context-prompt',
        start: 0.9,
        end: 4.5,
        payload: 'joined context',
        detail: 'refund-policy + returns-guide text',
      },
    ],
    code: { file: 'answer.py', lines: [5] },
    stateBefore: {
      question: LEARNER_QUESTION_INPUT,
      context: ASSEMBLED_CONTEXT_STRING,
      prompt: null,
    },
    stateAfter: {
      prompt: ASSEMBLED_PROMPT_STRING,
    },
    takeaway:
      'The model does not query the database itself—build_prompt(question, context) places the retrieved policy sentences right alongside the question inside the prompt.',
    nodeDataBefore: {
      question: {
        statusLabel: 'Supplying raw question',
        previewLines: ['"How long do I have to request a refund?"'],
        badgeText: 'arg 1',
      },
      context: {
        statusLabel: 'Supplying policy context',
        previewLines: ['[refund-policy] "...within 30 days..."', '[returns-guide] "Include your order number..."'],
        badgeText: 'arg 2',
      },
      prompt: {
        statusLabel: 'Combining question + context',
        previewLines: ['build_prompt(question, context)', 'Merging instructions, 2 passages, and question...'],
        badgeText: 'building',
      },
    },
    nodeDataAfter: {
      question: {
        statusLabel: 'Included in prompt',
        previewLines: ['"How long do I have to request a refund?"'],
        badgeText: 'arg 1',
      },
      context: {
        statusLabel: 'Included in prompt',
        previewLines: ['[refund-policy] + [returns-guide]'],
        badgeText: 'arg 2',
      },
      prompt: {
        statusLabel: 'Prompt ready for model',
        previewLines: [
          'Context: [refund-policy] "...within 30 days of purchase."',
          'Context: [returns-guide] "Include your order number..."',
          'Question: "How long do I have to request a refund?"',
        ],
        highlightToken: 'Context: [refund-policy]',
        badgeText: 'grounded prompt',
      },
    },
  },
  {
    id: 'beat-6-generation',
    beatNumber: 6,
    title: 'Generation',
    duration: 8,
    drillDownFunctionId: 'fn-generate',
    question: 'How does the model produce the answer from the assembled prompt?',
    narration:
      'generate(prompt) sends the assembled prompt into the language model stage, which produces the response citing [refund-policy]. Supplying retrieved context helps ground generation, though it does not guarantee a correct answer.',
    focusNodes: ['prompt', 'model', 'answer'],
    activeNodes: ['prompt', 'model', 'answer'],
    activeEdges: ['e-prompt-model', 'e-model-answer'],
    packets: [
      {
        edgeId: 'e-prompt-model',
        start: 0.5,
        end: 3.4,
        payload: 'assembled prompt',
        detail: 'Prompt containing context + question enters generate(prompt)',
      },
      {
        edgeId: 'e-model-answer',
        start: 3.6,
        end: 6.6,
        payload: '"...within 30 days [refund-policy]"',
        detail: 'Authored response emitted by model stage',
      },
    ],
    code: { file: 'answer.py', lines: [6] },
    stateBefore: {
      prompt: ASSEMBLED_PROMPT_STRING,
      response: null,
    },
    stateAfter: {
      prompt: ASSEMBLED_PROMPT_STRING,
      response: FINAL_SCRIPTED_ANSWER,
    },
    takeaway:
      'The final answer appears only after retrieval and prompt assembly feed generate(prompt). Retrieved context improves grounding, but does not guarantee correctness.',
    nodeDataBefore: {
      prompt: {
        statusLabel: 'Sending prompt payload',
        previewLines: ['Context (2 chunks) + Question', '-> generate(prompt)'],
        badgeText: 'input to model',
      },
      model: {
        statusLabel: 'Processing prompt...',
        previewLines: ['Reading policy context + question', 'Note: context helps but does not guarantee accuracy'],
        badgeText: 'generate()',
      },
      answer: {
        statusLabel: 'Awaiting generation...',
        previewLines: ['Waiting for generate(prompt) output...'],
        badgeText: 'pending',
      },
    },
    nodeDataAfter: {
      prompt: {
        statusLabel: 'Prompt consumed',
        previewLines: ['Context (2 chunks) + Question'],
        badgeText: 'sent',
      },
      model: {
        statusLabel: 'Generation complete',
        previewLines: ['Generated response using supplied context', 'Caveat: context guides but never guarantees accuracy'],
        badgeText: 'completed',
      },
      answer: {
        statusLabel: 'Response generated',
        previewLines: [
          '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
          '"Approved refunds are returned to your original payment method."',
        ],
        highlightToken: 'within 30 days of purchase [refund-policy]',
        badgeText: 'cited answer',
      },
    },
  },
  {
    id: 'beat-7-evidence-check',
    beatNumber: 7,
    title: 'Evidence check',
    duration: 9,
    drillDownFunctionId: 'fn-generate',
    question: 'Can we trace "30 days" in the final answer back to the exact policy sentence?',
    narration:
      'Finally, return response delivers the answer. Inspecting the [refund-policy] reference connects "within 30 days of purchase" directly back to the retrieved passage in context—confirming where the claim came from.',
    focusNodes: ['context', 'answer', 'index'],
    activeNodes: ['context', 'answer', 'index'],
    activeEdges: ['e-context-answer'],
    packets: [
      {
        edgeId: 'e-context-answer',
        start: 0.8,
        end: 4.5,
        payload: 'verify: "within 30 days" [refund-policy]',
        detail: 'Traces the 30-day claim to its exact sentence in refund-policy',
      },
    ],
    code: { file: 'answer.py', lines: [7] },
    stateBefore: {
      response: FINAL_SCRIPTED_ANSWER,
      citationVerified: false,
    },
    stateAfter: {
      response: FINAL_SCRIPTED_ANSWER,
      citationVerified: true,
      supportingSourceId: 'refund-policy',
      supportingSentence: 'Refund requests must be submitted within 30 days of purchase.',
    },
    takeaway:
      'Clicking [refund-policy] verifies that the answer’s "30 days" claim comes directly from the retrieved refund-policy sentence rather than unverified guesswork.',
    nodeDataBefore: {
      context: {
        statusLabel: 'Source passage in context',
        previewLines: [
          '[refund-policy]: "Refund requests must be submitted within 30 days of purchase."',
        ],
        highlightToken: 'within 30 days of purchase',
        badgeText: 'source',
      },
      answer: {
        statusLabel: 'Checking citation [refund-policy]',
        previewLines: [
          '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
          'Tracing citation back to context...',
        ],
        highlightToken: '[refund-policy]',
        badgeText: 'verifying',
      },
    },
    nodeDataAfter: {
      index: {
        statusLabel: 'Origin document verified',
        previewLines: [
          'Doc ID: refund-policy',
          '"Refund requests must be submitted within 30 days of purchase."',
        ],
        highlightToken: 'within 30 days of purchase',
        badgeText: 'origin doc',
      },
      context: {
        statusLabel: 'Supporting passage matched',
        previewLines: [
          'Matched span: "Refund requests must be submitted within 30 days of purchase."',
          'Source ID: [refund-policy]',
        ],
        highlightToken: 'within 30 days of purchase',
        badgeText: 'verified match',
      },
      answer: {
        statusLabel: 'Settled & verified result',
        previewLines: [
          '"Refund requests must be submitted within 30 days of purchase [refund-policy]."',
          '✓ Verified against refund-policy sentence (click citation to inspect)',
        ],
        highlightToken: 'within 30 days of purchase [refund-policy]',
        badgeText: 'verified',
      },
    },
  },
];

export const TOTAL_LESSON_DURATION = RAG_STEPS.reduce((acc, step) => acc + step.duration, 0);

/**
 * Validates graph node/edge references, positive step durations, packet time bounds,
 * and code-line ranges as specified in Section 7.
 */
export function validateLessonData(
  graph: ArchitectureGraph = RAG_GRAPH,
  steps: Step[] = RAG_STEPS,
  totalCodeLines: number = ANSWER_PY_LINES.length
): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push({
        type: 'error',
        message: `Edge "${edge.id}" references unknown source node "${edge.source}".`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        type: 'error',
        message: `Edge "${edge.id}" references unknown target node "${edge.target}".`,
      });
    }
  }

  for (const step of steps) {
    if (typeof step.duration !== 'number' || step.duration <= 0) {
      issues.push({
        type: 'error',
        stepId: step.id,
        message: `Step "${step.id}" must have a positive duration (found ${step.duration}).`,
      });
    }

    for (const focusId of step.focusNodes) {
      if (!nodeIds.has(focusId)) {
        issues.push({
          type: 'error',
          stepId: step.id,
          message: `Step "${step.id}" focusNodes references unknown node "${focusId}".`,
        });
      }
    }

    for (const activeId of step.activeNodes) {
      if (!nodeIds.has(activeId)) {
        issues.push({
          type: 'error',
          stepId: step.id,
          message: `Step "${step.id}" activeNodes references unknown node "${activeId}".`,
        });
      }
    }

    for (const edgeId of step.activeEdges) {
      if (!edgeIds.has(edgeId)) {
        issues.push({
          type: 'error',
          stepId: step.id,
          message: `Step "${step.id}" activeEdges references unknown edge "${edgeId}".`,
        });
      }
    }

    for (const packet of step.packets) {
      if (!edgeIds.has(packet.edgeId)) {
        issues.push({
          type: 'error',
          stepId: step.id,
          message: `Packet in "${step.id}" references unknown edge "${packet.edgeId}".`,
        });
      }
      if (packet.start < 0 || packet.end > step.duration || packet.start >= packet.end) {
        issues.push({
          type: 'error',
          stepId: step.id,
          message: `Packet on "${packet.edgeId}" in "${step.id}" has invalid time bounds [${packet.start}, ${packet.end}] for step duration ${step.duration}s.`,
        });
      }
    }

    for (const line of step.code.lines) {
      if (!Number.isInteger(line) || line < 1 || line > totalCodeLines) {
        issues.push({
          type: 'error',
          stepId: step.id,
          message: `Step "${step.id}" highlights invalid code line ${line} (valid range: 1..${totalCodeLines}).`,
        });
      }
    }
  }

  return {
    valid: issues.every((i) => i.type !== 'error'),
    issues,
  };
}
