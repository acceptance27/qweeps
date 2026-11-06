import ELK from 'elkjs/lib/elk.bundled.js';
import type {ElkNode} from 'elkjs/lib/elk-api';
import {
  ArchitectureGraph,
  ComputedGraphLayout,
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

interface EdgeRouteSpec {
  points: LayoutEdgePoint[];
  junction?: LayoutEdgePoint;
  boundaryPort?: LayoutEdgePoint;
}

const MACRO_COMPOUND_NODE_POSITIONS: Record<string, LayoutNodePosition> = {
  question: { id: 'question', x: 56, y: 156, width: 136, height: 84 },
  index: { id: 'index', x: 56, y: 456, width: 136, height: 88 },
  embed: { id: 'embed', x: 284, y: 112, width: 416, height: 156 },
  retrieve: { id: 'retrieve', x: 284, y: 380, width: 520, height: 196 },
  context: { id: 'context', x: 876, y: 380, width: 356, height: 176 },
  prompt: { id: 'prompt', x: 776, y: 112, width: 356, height: 164 },
  model: { id: 'model', x: 1196, y: 112, width: 236, height: 164 },
  answer: { id: 'answer', x: 1512, y: 152, width: 152, height: 92 },
};

const MACRO_COMPOUND_EDGE_ROUTES: Record<string, EdgeRouteSpec> = {
  'e-question-embed': {
    boundaryPort: { x: 236, y: 198 },
    points: [
      { x: 192, y: 198 },
      { x: 236, y: 198 },
      { x: 284, y: 198 },
    ],
  },
  'e-question-prompt': {
    junction: { x: 258, y: 198 },
    points: [
      { x: 258, y: 198 },
      { x: 258, y: 68 },
      { x: 736, y: 68 },
      { x: 736, y: 168 },
      { x: 776, y: 168 },
    ],
  },
  'e-embed-retrieve': {
    points: [
      { x: 700, y: 198 },
      { x: 726, y: 198 },
      { x: 726, y: 326 },
      { x: 258, y: 326 },
      { x: 258, y: 446 },
      { x: 284, y: 446 },
    ],
  },
  'e-index-retrieve': {
    boundaryPort: { x: 236, y: 500 },
    points: [
      { x: 192, y: 500 },
      { x: 236, y: 500 },
      { x: 284, y: 500 },
    ],
  },
  'e-retrieve-context': {
    points: [
      { x: 804, y: 466 },
      { x: 876, y: 466 },
    ],
  },
  'e-context-prompt': {
    points: [
      { x: 1232, y: 466 },
      { x: 1264, y: 466 },
      { x: 1264, y: 326 },
      { x: 744, y: 326 },
      { x: 744, y: 224 },
      { x: 776, y: 224 },
    ],
  },
  'e-prompt-model': {
    points: [
      { x: 1132, y: 198 },
      { x: 1196, y: 198 },
    ],
  },
  'e-model-answer': {
    boundaryPort: { x: 1464, y: 198 },
    points: [
      { x: 1432, y: 198 },
      { x: 1464, y: 198 },
      { x: 1512, y: 198 },
    ],
  },
  'e-context-answer': {
    junction: { x: 1264, y: 466 },
    boundaryPort: { x: 1464, y: 466 },
    points: [
      { x: 1264, y: 466 },
      { x: 1464, y: 466 },
      { x: 1588, y: 466 },
      { x: 1588, y: 244 },
    ],
  },
};

const SUB_GRAPH_LAYOUTS: Record<
  string,
  {
    nodes: Record<string, LayoutNodePosition>;
    edges: Record<string, EdgeRouteSpec>;
  }
> = {
  // ==========================================================================
  // LEVEL 1 FUNCTION GRAPHS (Dynamic Card Sizes Based on Content + Unpacked Static @Data)
  // System Frame spans x = 240..1840, y = 44..664 (width = 1600, height = 620)
  // Every function card and @static block is sized proportionally to how much it contains!
  // ==========================================================================
  'sub-graph-fn-embed': {
    nodes: {
      // 1-item input card
      'emb-input': { id: 'emb-input', x: 24, y: 162, width: 196, height: 112 },
      // Medium 2-input function card (415x224)
      'emb-tokenize': { id: 'emb-tokenize', x: 280, y: 100, width: 415, height: 224 },
      // 3-item static @cleanup_rules card (330x158)
      'emb-rules': { id: 'emb-rules', x: 315, y: 432, width: 330, height: 158 },
      // Larger 2-input + multi-token lookup function card (465x256)
      'emb-pool': { id: 'emb-pool', x: 780, y: 90, width: 465, height: 256 },
      // 4-row unpacked static @vocab_table card (395x192)
      'emb-vocab': { id: 'emb-vocab', x: 815, y: 418, width: 395, height: 192 },
      // Compact 2-input numeric norm function card (395x206)
      'emb-norm': { id: 'emb-norm', x: 1335, y: 110, width: 395, height: 206 },
      // 2-item static @unit_scale card (295x132)
      'emb-scale': { id: 'emb-scale', x: 1375, y: 444, width: 295, height: 132 },
      // 2-item output card
      'emb-out': { id: 'emb-out', x: 1875, y: 152, width: 215, height: 130 },
    },
    edges: {
      'e-emb-1': {
        boundaryPort: { x: 240, y: 196 },
        points: [
          { x: 220, y: 196 },
          { x: 240, y: 196 },
          { x: 280, y: 196 },
        ],
      },
      'e-emb-rules': {
        points: [
          { x: 315, y: 511 },
          { x: 258, y: 511 },
          { x: 258, y: 274 },
          { x: 280, y: 274 },
        ],
      },
      'e-emb-2': {
        points: [
          { x: 695, y: 196 },
          { x: 780, y: 196 },
        ],
      },
      'e-emb-vocab': {
        points: [
          { x: 815, y: 514 },
          { x: 735, y: 514 },
          { x: 735, y: 286 },
          { x: 780, y: 286 },
        ],
      },
      'e-emb-3': {
        points: [
          { x: 1245, y: 196 },
          { x: 1335, y: 196 },
        ],
      },
      'e-emb-scale': {
        points: [
          { x: 1375, y: 510 },
          { x: 1290, y: 510 },
          { x: 1290, y: 272 },
          { x: 1335, y: 272 },
        ],
      },
      'e-emb-4': {
        boundaryPort: { x: 1840, y: 215 },
        points: [
          { x: 1730, y: 215 },
          { x: 1840, y: 215 },
          { x: 1875, y: 215 },
        ],
      },
    },
  },

  'sub-graph-fn-retrieve': {
    nodes: {
      // 1-item input card
      'ret-query': { id: 'ret-query', x: 20, y: 112, width: 200, height: 112 },
      // 3-item static @INDEX_DOCS card (taller for 3 policies)
      'ret-store': { id: 'ret-store', x: 20, y: 268, width: 204, height: 164 },
      // Largest 3-doc similarity scorer card (465x256)
      'ret-scorer': { id: 'ret-scorer', x: 280, y: 92, width: 465, height: 256 },
      // Medium 3-doc sorter card (430x232)
      'ret-sorter': { id: 'ret-sorter', x: 825, y: 104, width: 430, height: 232 },
      // 2-item static @order_desc card (305x134)
      'ret-order': { id: 'ret-order', x: 870, y: 440, width: 305, height: 134 },
      // Compact top-2 slicer card (395x208)
      'ret-slicer': { id: 'ret-slicer', x: 1335, y: 115, width: 395, height: 208 },
      // 2-item static @cutoff_limit card (300x134)
      'ret-limit': { id: 'ret-limit', x: 1375, y: 440, width: 300, height: 134 },
      // 2-item output card
      'ret-out': { id: 'ret-out', x: 1875, y: 155, width: 215, height: 132 },
    },
    edges: {
      'e-ret-1': {
        boundaryPort: { x: 240, y: 168 },
        points: [
          { x: 220, y: 168 },
          { x: 240, y: 168 },
          { x: 280, y: 168 },
        ],
      },
      'e-ret-2': {
        boundaryPort: { x: 240, y: 300 },
        points: [
          { x: 224, y: 300 },
          { x: 240, y: 300 },
          { x: 280, y: 300 },
        ],
      },
      'e-ret-3': {
        points: [
          { x: 745, y: 195 },
          { x: 825, y: 195 },
        ],
      },
      'e-ret-order': {
        points: [
          { x: 870, y: 507 },
          { x: 785, y: 507 },
          { x: 785, y: 285 },
          { x: 825, y: 285 },
        ],
      },
      'e-ret-4': {
        points: [
          { x: 1255, y: 195 },
          { x: 1335, y: 195 },
        ],
      },
      'e-ret-limit': {
        points: [
          { x: 1375, y: 507 },
          { x: 1295, y: 507 },
          { x: 1295, y: 280 },
          { x: 1335, y: 280 },
        ],
      },
      'e-ret-5': {
        boundaryPort: { x: 1840, y: 220 },
        points: [
          { x: 1730, y: 220 },
          { x: 1840, y: 220 },
          { x: 1875, y: 220 },
        ],
      },
    },
  },

  'sub-graph-fn-context': {
    nodes: {
      // 2-item input card
      'ctx-in': { id: 'ctx-in', x: 20, y: 158, width: 204, height: 134 },
      // Larger 2-passage tagger card (520x256)
      'ctx-tag': { id: 'ctx-tag', x: 320, y: 95, width: 520, height: 256 },
      // 2-item static @tag_template card (345x136)
      'ctx-fmt': { id: 'ctx-fmt', x: 390, y: 445, width: 345, height: 136 },
      // Smaller paragraph joiner card (455x220)
      'ctx-join': { id: 'ctx-join', x: 1020, y: 113, width: 455, height: 220 },
      // 2-item static @blank_line_sep card (310x132)
      'ctx-sep': { id: 'ctx-sep', x: 1080, y: 445, width: 310, height: 132 },
      // 2-item output card
      'ctx-out': { id: 'ctx-out', x: 1875, y: 158, width: 215, height: 134 },
    },
    edges: {
      'e-ctx-1': {
        boundaryPort: { x: 240, y: 200 },
        points: [
          { x: 224, y: 200 },
          { x: 240, y: 200 },
          { x: 320, y: 200 },
        ],
      },
      'e-ctx-fmt': {
        points: [
          { x: 390, y: 513 },
          { x: 280, y: 513 },
          { x: 280, y: 300 },
          { x: 320, y: 300 },
        ],
      },
      'e-ctx-2': {
        points: [
          { x: 840, y: 200 },
          { x: 1020, y: 200 },
        ],
      },
      'e-ctx-sep': {
        points: [
          { x: 1080, y: 511 },
          { x: 940, y: 511 },
          { x: 940, y: 290 },
          { x: 1020, y: 290 },
        ],
      },
      'e-ctx-3': {
        boundaryPort: { x: 1840, y: 225 },
        points: [
          { x: 1475, y: 225 },
          { x: 1840, y: 225 },
          { x: 1875, y: 225 },
        ],
      },
    },
  },

  'sub-graph-fn-prompt': {
    nodes: {
      // 3-item static @grounding_policy card (360x158)
      'prm-policy': { id: 'prm-policy', x: 320, y: 66, width: 360, height: 158 },
      // Compact 1-input @SystemRules card (415x196)
      'prm-rules': { id: 'prm-rules', x: 320, y: 262, width: 415, height: 196 },
      // 2-item @context input card
      'prm-ctx': { id: 'prm-ctx', x: 20, y: 378, width: 204, height: 132 },
      // 1-item @question input card (smaller because 1 line)
      'prm-q': { id: 'prm-q', x: 20, y: 530, width: 204, height: 110 },
      // Large 3-input @PromptAssembler card (620x330)
      'prm-merge': { id: 'prm-merge', x: 920, y: 228, width: 620, height: 330 },
      // 3-item @prompt output card (taller for 3 sections)
      'prm-out': { id: 'prm-out', x: 1875, y: 315, width: 215, height: 158 },
    },
    edges: {
      'e-prm-policy': {
        points: [
          { x: 320, y: 145 },
          { x: 276, y: 145 },
          { x: 276, y: 360 },
          { x: 320, y: 360 },
        ],
      },
      'e-prm-1': {
        points: [
          { x: 735, y: 315 },
          { x: 920, y: 315 },
        ],
      },
      'e-prm-2': {
        boundaryPort: { x: 240, y: 492 },
        points: [
          { x: 224, y: 492 },
          { x: 240, y: 492 },
          { x: 920, y: 492 },
        ],
      },
      'e-prm-3': {
        boundaryPort: { x: 240, y: 545 },
        points: [
          { x: 224, y: 545 },
          { x: 240, y: 545 },
          { x: 920, y: 545 },
        ],
      },
      'e-prm-4': {
        boundaryPort: { x: 1840, y: 394 },
        points: [
          { x: 1540, y: 394 },
          { x: 1840, y: 394 },
          { x: 1875, y: 394 },
        ],
      },
    },
  },

  'sub-graph-fn-generate': {
    nodes: {
      // 3-item @prompt input card (204x158)
      'gen-in': { id: 'gen-in', x: 20, y: 148, width: 204, height: 158 },
      // Compact 1-input @attend_context card (430x202)
      'gen-attend': { id: 'gen-attend', x: 320, y: 118, width: 430, height: 202 },
      // Larger 2-input @decode_and_cite card (535x256)
      'gen-decode': { id: 'gen-decode', x: 960, y: 96, width: 535, height: 256 },
      // 2-item static @citation_rule card (345x136)
      'gen-cite-rule': { id: 'gen-cite-rule', x: 1035, y: 445, width: 345, height: 136 },
      // 2-item @verified_answer output card
      'gen-out': { id: 'gen-out', x: 1875, y: 158, width: 215, height: 134 },
    },
    edges: {
      'e-gen-1': {
        boundaryPort: { x: 240, y: 218 },
        points: [
          { x: 224, y: 218 },
          { x: 240, y: 218 },
          { x: 320, y: 218 },
        ],
      },
      'e-gen-2': {
        points: [
          { x: 750, y: 200 },
          { x: 960, y: 200 },
        ],
      },
      'e-gen-cite': {
        points: [
          { x: 1035, y: 513 },
          { x: 880, y: 513 },
          { x: 880, y: 295 },
          { x: 960, y: 295 },
        ],
      },
      'e-gen-3': {
        boundaryPort: { x: 1840, y: 225 },
        points: [
          { x: 1495, y: 225 },
          { x: 1840, y: 225 },
          { x: 1875, y: 225 },
        ],
      },
    },
  },

  // ==========================================================================
  // LEVEL 2 DYNAMIC FUNCTION-SPECIFIC VISUAL FLOWCHARTS (Spacious 1800px Frame)
  // ==========================================================================

  // 1) @tokenize — Word Slicer + Punctuation Drop Branch
  'sub-graph-l2-tokenize': {
    nodes: {
      'tok-in': { id: 'tok-in', x: 80, y: 150, width: 250, height: 180 },
      'tok-tiles': { id: 'tok-tiles', x: 420, y: 130, width: 380, height: 220 },
      'tok-filter': { id: 'tok-filter', x: 890, y: 95, width: 430, height: 290 },
      'tok-drop': { id: 'tok-drop', x: 945, y: 465, width: 320, height: 120 },
      'tok-out': { id: 'tok-out', x: 1410, y: 150, width: 360, height: 180 },
    },
    edges: {
      'e-tok-1': { points: [{ x: 330, y: 240 }, { x: 420, y: 240 }] },
      'e-tok-2': { points: [{ x: 800, y: 240 }, { x: 890, y: 240 }] },
      'e-tok-3': { points: [{ x: 1320, y: 240 }, { x: 1410, y: 240 }] },
      'e-tok-drop': { points: [{ x: 1105, y: 385 }, { x: 1105, y: 465 }] },
    },
  },

  // 2) @encode_pool — Parallel Token Lookup + Mean-Pooling Funnel
  'sub-graph-l2-pool': {
    nodes: {
      'pl-tok1': { id: 'pl-tok1', x: 80, y: 135, width: 230, height: 140 },
      'pl-tok2': { id: 'pl-tok2', x: 80, y: 365, width: 230, height: 140 },
      'pl-table': { id: 'pl-table', x: 400, y: 160, width: 440, height: 310 },
      'pl-funnel': { id: 'pl-funnel', x: 930, y: 190, width: 340, height: 250 },
      'pl-out': { id: 'pl-out', x: 1360, y: 190, width: 380, height: 250 },
    },
    edges: {
      'e-pl-1': { points: [{ x: 310, y: 205 }, { x: 400, y: 205 }] },
      'e-pl-2': { points: [{ x: 310, y: 435 }, { x: 400, y: 435 }] },
      'e-pl-3': { points: [{ x: 840, y: 315 }, { x: 930, y: 315 }] },
      'e-pl-4': { points: [{ x: 1270, y: 315 }, { x: 1360, y: 315 }] },
    },
  },

  // 3) @l2_normalize — Vector Bar Scaler (||v|| = 2.0 ➔ 1.0)
  'sub-graph-l2-norm': {
    nodes: {
      'nm-raw': { id: 'nm-raw', x: 110, y: 180, width: 430, height: 280 },
      'nm-scale': { id: 'nm-scale', x: 660, y: 180, width: 420, height: 280 },
      'nm-out': { id: 'nm-out', x: 1200, y: 180, width: 430, height: 280 },
    },
    edges: {
      'e-nm-1': { points: [{ x: 540, y: 320 }, { x: 660, y: 320 }] },
      'e-nm-2': { points: [{ x: 1080, y: 320 }, { x: 1200, y: 320 }] },
    },
  },

  // 4) @score_dot — 1-to-3 Fan-Out Parallel Similarity Comparator
  'sub-graph-l2-scorer': {
    nodes: {
      'sc-query': { id: 'sc-query', x: 90, y: 230, width: 280, height: 190 },
      'sc-doc1': { id: 'sc-doc1', x: 530, y: 78, width: 500, height: 140 },
      'sc-doc2': { id: 'sc-doc2', x: 530, y: 258, width: 500, height: 140 },
      'sc-doc3': { id: 'sc-doc3', x: 530, y: 438, width: 500, height: 140 },
      'sc-out': { id: 'sc-out', x: 1190, y: 230, width: 350, height: 190 },
    },
    edges: {
      'e-sc-1': {
        junction: { x: 450, y: 325 },
        points: [{ x: 370, y: 325 }, { x: 450, y: 325 }, { x: 450, y: 148 }, { x: 530, y: 148 }],
      },
      'e-sc-2': {
        points: [{ x: 370, y: 325 }, { x: 530, y: 325 }],
      },
      'e-sc-3': {
        points: [{ x: 370, y: 325 }, { x: 450, y: 325 }, { x: 450, y: 508 }, { x: 530, y: 508 }],
      },
      'e-sc-4': {
        junction: { x: 1110, y: 325 },
        points: [{ x: 1030, y: 148 }, { x: 1110, y: 148 }, { x: 1110, y: 325 }, { x: 1190, y: 325 }],
      },
      'e-sc-5': {
        points: [{ x: 1030, y: 325 }, { x: 1190, y: 325 }],
      },
      'e-sc-6': {
        points: [{ x: 1030, y: 508 }, { x: 1110, y: 508 }, { x: 1110, y: 325 }, { x: 1190, y: 325 }],
      },
    },
  },

  // 5) @sorted — Leaderboard Podium Ranker (#1, #2, #3)
  'sub-graph-l2-sorter': {
    nodes: {
      'srt-in': { id: 'srt-in', x: 100, y: 210, width: 350, height: 220 },
      'srt-podium': { id: 'srt-podium', x: 560, y: 165, width: 560, height: 310 },
      'srt-out': { id: 'srt-out', x: 1230, y: 225, width: 380, height: 190 },
    },
    edges: {
      'e-srt-1': { points: [{ x: 450, y: 320 }, { x: 560, y: 320 }] },
      'e-srt-2': { points: [{ x: 1120, y: 320 }, { x: 1230, y: 320 }] },
    },
  },

  // 6) @ranked[:2] — Top-2 Cutoff Gate with 2 Output Branches (Keep vs Drop)
  'sub-graph-l2-slicer': {
    nodes: {
      'slc-in': { id: 'slc-in', x: 100, y: 200, width: 340, height: 230 },
      'slc-gate': { id: 'slc-gate', x: 550, y: 175, width: 480, height: 280 },
      'slc-kept': { id: 'slc-kept', x: 1150, y: 110, width: 430, height: 175 },
      'slc-dropped': { id: 'slc-dropped', x: 1150, y: 360, width: 430, height: 150 },
    },
    edges: {
      'e-slc-1': { points: [{ x: 440, y: 315 }, { x: 550, y: 315 }] },
      'e-slc-keep': {
        points: [{ x: 1030, y: 255 }, { x: 1090, y: 255 }, { x: 1090, y: 197 }, { x: 1150, y: 197 }],
      },
      'e-slc-drop': {
        points: [{ x: 1030, y: 375 }, { x: 1090, y: 375 }, { x: 1090, y: 435 }, { x: 1150, y: 435 }],
      },
    },
  },

  // 7) @TagSourceID — 2-Lane Parallel Source Badge Stamper
  'sub-graph-l2-tag': {
    nodes: {
      'tg-d1': { id: 'tg-d1', x: 100, y: 120, width: 320, height: 165 },
      'tg-d2': { id: 'tg-d2', x: 100, y: 350, width: 320, height: 165 },
      'tg-stamp': { id: 'tg-stamp', x: 530, y: 185, width: 510, height: 265 },
      'tg-out': { id: 'tg-out', x: 1150, y: 220, width: 400, height: 195 },
    },
    edges: {
      'e-tg-1': {
        points: [{ x: 420, y: 202 }, { x: 475, y: 202 }, { x: 475, y: 255 }, { x: 530, y: 255 }],
      },
      'e-tg-2': {
        points: [{ x: 420, y: 432 }, { x: 475, y: 432 }, { x: 475, y: 380 }, { x: 530, y: 380 }],
      },
      'e-tg-3': { points: [{ x: 1040, y: 317 }, { x: 1150, y: 317 }] },
    },
  },

  // 8) @JoinChunks — 3-to-1 Vertical Paragraph Stacker
  'sub-graph-l2-join': {
    nodes: {
      'jn-p1': { id: 'jn-p1', x: 110, y: 95, width: 360, height: 125 },
      'jn-sep': { id: 'jn-sep', x: 110, y: 270, width: 360, height: 100 },
      'jn-p2': { id: 'jn-p2', x: 110, y: 420, width: 360, height: 125 },
      'jn-scroll': { id: 'jn-scroll', x: 620, y: 150, width: 700, height: 340 },
    },
    edges: {
      'e-jn-1': {
        points: [{ x: 470, y: 157 }, { x: 545, y: 157 }, { x: 545, y: 225 }, { x: 620, y: 225 }],
      },
      'e-jn-2': { points: [{ x: 470, y: 320 }, { x: 620, y: 320 }] },
      'e-jn-3': {
        points: [{ x: 470, y: 482 }, { x: 545, y: 482 }, { x: 545, y: 415 }, { x: 620, y: 415 }],
      },
    },
  },

  // 9) @SystemRules — 2-Pillar Guardrail Shield Builder
  'sub-graph-l2-rules': {
    nodes: {
      'rl-allow': { id: 'rl-allow', x: 120, y: 125, width: 400, height: 155 },
      'rl-forbid': { id: 'rl-forbid', x: 120, y: 350, width: 400, height: 155 },
      'rl-shield': { id: 'rl-shield', x: 660, y: 170, width: 660, height: 295 },
    },
    edges: {
      'e-rl-1': {
        points: [{ x: 520, y: 202 }, { x: 590, y: 202 }, { x: 590, y: 250 }, { x: 660, y: 250 }],
      },
      'e-rl-2': {
        points: [{ x: 520, y: 427 }, { x: 590, y: 427 }, { x: 590, y: 385 }, { x: 660, y: 385 }],
      },
    },
  },

  // 10) @PromptAssembler — 3-to-1 Blueprint Slot Assembler
  'sub-graph-l2-merge': {
    nodes: {
      'pm-r': { id: 'pm-r', x: 110, y: 95, width: 350, height: 125 },
      'pm-c': { id: 'pm-c', x: 110, y: 260, width: 350, height: 125 },
      'pm-q': { id: 'pm-q', x: 110, y: 425, width: 350, height: 125 },
      'pm-blueprint': { id: 'pm-blueprint', x: 610, y: 120, width: 720, height: 400 },
    },
    edges: {
      'e-pm-1': {
        points: [{ x: 460, y: 157 }, { x: 535, y: 157 }, { x: 535, y: 200 }, { x: 610, y: 200 }],
      },
      'e-pm-2': { points: [{ x: 460, y: 322 }, { x: 610, y: 322 }] },
      'e-pm-3': {
        points: [{ x: 460, y: 487 }, { x: 535, y: 487 }, { x: 535, y: 440 }, { x: 610, y: 440 }],
      },
    },
  },

  // 11) @attend_context — Attention Heatmap Spotlight Beam
  'sub-graph-l2-attend': {
    nodes: {
      'att-q': { id: 'att-q', x: 100, y: 225, width: 300, height: 185 },
      'att-beam': { id: 'att-beam', x: 510, y: 160, width: 600, height: 315 },
      'att-out': { id: 'att-out', x: 1220, y: 220, width: 380, height: 195 },
    },
    edges: {
      'e-att-1': { points: [{ x: 400, y: 317 }, { x: 510, y: 317 }] },
      'e-att-2': { points: [{ x: 1110, y: 317 }, { x: 1220, y: 317 }] },
    },
  },

  // 12) @decode_and_cite — Grounded Answer Weaver + Citation Verifier
  'sub-graph-l2-decode': {
    nodes: {
      'dec-ev': { id: 'dec-ev', x: 120, y: 135, width: 350, height: 150 },
      'dec-rule': { id: 'dec-rule', x: 120, y: 350, width: 350, height: 150 },
      'dec-verify': { id: 'dec-verify', x: 610, y: 155, width: 680, height: 325 },
    },
    edges: {
      'e-dec-1': {
        points: [{ x: 470, y: 210 }, { x: 540, y: 210 }, { x: 540, y: 250 }, { x: 610, y: 250 }],
      },
      'e-dec-2': {
        points: [{ x: 470, y: 425 }, { x: 540, y: 425 }, { x: 540, y: 385 }, { x: 610, y: 385 }],
      },
    },
  },
};

export function buildDeterministicInitialLayout(
  graph: ArchitectureGraph,
  engineLabel: 'elk' | 'deterministic-fallback' = 'deterministic-fallback'
): ComputedGraphLayout {
  const isMacro = graph.id === 'qweeps-rag-4col-architecture';
  const subSpec = SUB_GRAPH_LAYOUTS[graph.id];

  const nodeMap = isMacro ? MACRO_COMPOUND_NODE_POSITIONS : subSpec?.nodes ?? {};
  const edgeMap = isMacro ? MACRO_COMPOUND_EDGE_ROUTES : subSpec?.edges ?? {};

  const nodes: Record<NodeId, LayoutNodePosition> = {};
  for (const n of graph.nodes) {
    nodes[n.id] = nodeMap[n.id] ?? {
      id: n.id,
      x: 80 + graph.nodes.indexOf(n)*620,
      y: 100,
      width: n.width,
      height: n.height,
    };
  }

  const edges: Record<string, LayoutEdgeRoute> = {};
  for (const e of graph.edges) {
    const spec = edgeMap[e.id];
    const a=nodes[e.source],b=nodes[e.target];
    const pts = spec?.points ?? [{x:a.x+a.width,y:a.y+a.height/2},{x:b.x,y:b.y+b.height/2}];
    edges[e.id] = {
      id: e.id,
      source: e.source,
      target: e.target,
      points: pts,
      labelPosition: getPolylineMidpoint(pts),
      sourcePort: pts[0],
      targetPort: pts[pts.length - 1],
      junctionPoint: spec?.junction,
      boundaryPort: spec?.boundaryPort,
    };
  }

  return {
    width: isMacro ? 1720 : subSpec ? 2120 : Math.max(...Object.values(nodes).map(n=>n.x+n.width))+80,
    height: isMacro ? 640 : 720,
    nodes,
    edges,
    engineUsed: engineLabel,
  };
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
    if(graph.id!=='qweeps-rag-4col-architecture'&&!SUB_GRAPH_LAYOUTS[graph.id]){
      const result=await elk.layout<ElkNode>({id:graph.id,layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':'90','elk.layered.spacing.nodeNodeBetweenLayers':'130'},
        children:graph.nodes.map(n=>({id:n.id,width:n.width,height:n.height})),
        edges:graph.edges.map(e=>({id:e.id,sources:[e.source],targets:[e.target]}))});
      const nodes=Object.fromEntries((result.children||[]).map(n=>[n.id,{id:n.id,x:n.x!,y:n.y!,width:n.width!,height:n.height!}]));
      const edges:Record<string,LayoutEdgeRoute>={};
      for(const e of result.edges||[]){const source=graph.edges.find(g=>g.id===e.id)!;
        const points=(e.sections||[]).flatMap(s=>[s.startPoint,...s.bendPoints||[],s.endPoint]);
        if(points.length<2)throw new Error('Incomplete route');
        edges[e.id]={id:e.id,source:source.source,target:source.target,points,labelPosition:getPolylineMidpoint(points),sourcePort:points[0],targetPort:points[points.length-1]};}
      const routed={width:result.width!,height:result.height!,nodes,edges,engineUsed:'elk' as const};layoutCache.set(sig,routed);return routed;
    }
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
