import { ContextualQuestion, MiniExplanationStep } from '../types/lesson';

export const PREPARED_QUESTIONS: ContextualQuestion[] = [
  {
    id: 'q-why-numbers',
    question: 'Why convert the question into numbers?',
    relatedNodes: ['question', 'embed', 'retrieve'],
    relatedStepIds: ['beat-1-raw-question', 'beat-2-query-representation', 'beat-3-retrieval'],
    shortContext: 'Query representation · embed(question) at line 2',
    answer:
      'Prototype response (authored locally): A customer might ask "How long do I have to request a refund?" while the shop document says "Refund requests must be submitted within 30 days of purchase." Converting both into numerical vectors lets retrieve() compare semantic closeness in vector space rather than failing when exact phrasing differs. In this illustrative trace, we display a 6-number vector [0.12, -0.44, 0.08, 0.71, -0.21, 0.36] so every number is readable on screen.',
    codeLines: [2, 3],
    takeaway: 'Embedding turns text into comparable numerical coordinates while preserving the raw question string for the prompt.',
  },
  {
    id: 'q-model-weights',
    question: "Does retrieval change the model's weights?",
    relatedNodes: ['index', 'retrieve', 'context', 'model'],
    relatedStepIds: ['beat-3-retrieval', 'beat-4-context-assembly', 'beat-6-generation'],
    shortContext: 'Retrieval vs. fine-tuning · lines 3–6',
    answer:
      'Prototype response (authored locally): No. Retrieval does not train, fine-tune, or update any model parameters. Instead, retrieve(query_vector, limit=2) looks up existing text chunks (refund-policy and returns-guide) from the external index and passes their plain text into build_prompt(question, context). If the shop updates its refund window tomorrow, updating the document store changes what context is supplied at runtime without touching model weights.',
    codeLines: [3, 4, 5, 6],
    takeaway: 'RAG supplies external text inside the prompt at request time; the language model’s weights remain frozen.',
  },
  {
    id: 'q-where-30-days',
    question: 'Where did 30 days come from?',
    relatedNodes: ['index', 'context', 'prompt', 'answer'],
    relatedStepIds: ['beat-4-context-assembly', 'beat-5-prompt-assembly', 'beat-6-generation', 'beat-7-evidence-check'],
    shortContext: 'Evidence trace · [refund-policy] citation at lines 3–7',
    answer:
      'Prototype response (authored locally): The "within 30 days of purchase" figure comes directly from the first retrieved document, refund-policy ("Refund requests must be submitted within 30 days of purchase. Approved refunds return to the original payment method."). It was selected in Beat 3 (limit=2), joined into context in Beat 4, inserted into prompt in Beat 5, and cited as [refund-policy] in Beat 6–7.',
    codeLines: [3, 4, 5, 7],
    takeaway: 'Every factual claim in the RAG output should be traceable back to a specific retrieved passage in context.',
  },
  {
    id: 'q-why-shipping-excluded',
    question: 'Why was shipping-guide excluded from the context?',
    relatedNodes: ['index', 'retrieve', 'context'],
    relatedStepIds: ['beat-3-retrieval', 'beat-4-context-assembly'],
    shortContext: 'Top-k filtering · retrieve(query_vector, limit=2) at line 3',
    answer:
      'Prototype response (authored locally): The index holds three prepared candidates: refund-policy, returns-guide, and shipping-guide ("Standard delivery usually takes three to five business days."). Because retrieve(query_vector, limit=2) keeps only the two highest-ranked illustrative matches for a refund question, shipping-guide is filtered out before line 4 joins match.text.',
    codeLines: [3, 4],
    takeaway: 'Filtering with limit=2 prevents unrelated delivery timeframes ("three to five business days") from cluttering the prompt.',
  },
  {
    id: 'q-guarantee-correct',
    question: 'Does retrieved context guarantee a correct answer?',
    relatedNodes: ['prompt', 'model', 'answer'],
    relatedStepIds: ['beat-5-prompt-assembly', 'beat-6-generation', 'beat-7-evidence-check'],
    shortContext: 'Generation caveats · generate(prompt) at line 6',
    answer:
      'Prototype response (authored locally): No. Providing relevant policy passages in the prompt strongly helps the language model ground its answer, but it does not guarantee correctness. The model could still misread a condition, blend two passages, or omit a qualifier—which is why exposing clickable source references like [refund-policy] for verification in Beat 7 is essential.',
    codeLines: [5, 6, 7],
    takeaway: 'Retrieved context improves grounding, but source citations are still needed so humans can verify the claim.',
  },
];

export const MINI_EXPLANATION_TITLE = 'Mini-Explanation: How retrieved context reaches the answer';

export const MINI_EXPLANATION_STEPS: MiniExplanationStep[] = [
  {
    stepNumber: 1,
    title: 'Step 1 of 3 · Select & join the winning passage',
    caption:
      'retrieve(query_vector, limit=2) picks refund-policy and returns-guide (excluding shipping-guide), and line 4 joins their text into context.',
    focusNodes: ['retrieve', 'context'],
    activeEdges: ['e-retrieve-context'],
    codeLines: [3, 4],
    highlightPassage: 'Refund requests must be submitted within 30 days of purchase.',
    dataSnapshot:
      'context = "[refund-policy] Refund requests must be submitted within 30 days of purchase...\\n\\n[returns-guide] Include your order number..."',
  },
  {
    stepNumber: 2,
    title: 'Step 2 of 3 · Embed context alongside the question',
    caption:
      'build_prompt(question, context) places the joined policy sentences directly above the learner’s original question in a single prompt string.',
    focusNodes: ['question', 'context', 'prompt'],
    activeEdges: ['e-question-prompt', 'e-context-prompt'],
    codeLines: [5],
    highlightPassage: 'Context: 1. [refund-policy]: Refund requests must be submitted within 30 days of purchase.',
    dataSnapshot:
      'prompt = build_prompt(question="How long do I have to request a refund?", context=context)',
  },
  {
    stepNumber: 3,
    title: 'Step 3 of 3 · Generate & verify the [refund-policy] citation',
    caption:
      'generate(prompt) reads the prompt and outputs the 30-day answer with [refund-policy], allowing direct verification against the source sentence.',
    focusNodes: ['prompt', 'model', 'answer', 'context'],
    activeEdges: ['e-prompt-model', 'e-model-answer', 'e-context-answer'],
    codeLines: [6, 7],
    highlightPassage: 'Refund requests must be submitted within 30 days of purchase [refund-policy].',
    dataSnapshot:
      'response = "Refund requests must be submitted within 30 days of purchase [refund-policy]. Approved refunds are returned to your original payment method."',
  },
];
