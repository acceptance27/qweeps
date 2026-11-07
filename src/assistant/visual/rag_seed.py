"""Reference-seeded RAG hierarchy.

The supplied RAG prototype is the visual specification. This module keeps its
macro graph and function modules, adds the compound children/ports/connections
needed by the generic renderer, and supplies a deterministic worked example.
AI generation still writes the teaching beats and narration; it does not invent
the system structure.
"""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path

from .architecture_examples import compile_example

REFERENCE_LESSON = (
    Path(__file__).resolve().parents[3]
    / 'bundled-lessons/browser-lessons/a7c4e71f90d3426b84c719ea064bd230/lesson.json'
)

CHILDREN = {
    'embed': [
        ('op-tokenize', 'tokenize()', 'split words', 'Scissors', 'blue', 'how · long · request · refund'),
        ('op-pool', 'encode_pool()', 'IDs → mean vec', 'Layers', 'purple', '[0.24, -0.88, 0.16, 1.42, -0.42, 0.72]'),
        ('op-normalize', 'l2_normalize()', 'unit length', 'Binary', 'gold', '[0.1270, -0.4658, 0.0847, 0.7517, -0.2223, 0.3811]'),
    ],
    'retrieve': [
        ('op-score', 'score_dot()', 'score every document', 'Gauge', 'green', '0.89 · 0.64 · 0.18'),
        ('op-sort', 'sorted()', 'rank by score', 'ArrowUpDown', 'purple', 'refund > returns > shipping'),
        ('op-topk', 'ranked[:2]', 'select top-k', 'Filter', 'green', '2 selected · top-2'),
        ('op-dropped', 'Dropped', 'rejected document', 'XCircle', 'coral', 'shipping-guide'),
    ],
    'context': [
        ('op-tag-source', 'TagSourceID', 'attach source IDs', 'Tag', 'blue', '[refund-policy] · [returns-guide]'),
        ('op-join', 'JoinChunks', 'join passages', 'Layers', 'coral', 'tagged + joined context'),
    ],
    'prompt': [
        ('op-system-rules', 'SystemRules', 'answer with citations', 'ShieldCheck', 'gold', 'cite [ID]'),
        ('op-assemble', 'PromptAssembler', 'rules + context + question', 'FileCode2', 'gold', 'rules + context + question'),
    ],
    'model': [
        ('op-attend', 'attend_context()', 'read the context', 'SearchCheck', 'purple', '30 days'),
        ('op-cite', 'decode_and_cite()', 'write cited answer', 'FileText', 'purple', 'answer [refund-policy]'),
    ],
}

CONNECTIONS = {
    'embed': [
        ('conn-embed-tokenize-pool', 'op-tokenize', 'op-pool', 'tokens'),
        ('conn-embed-pool-normalize', 'op-pool', 'op-normalize', 'vector'),
    ],
    'retrieve': [
        ('conn-retrieve-score-sort', 'op-score', 'op-sort', 'scores'),
        ('conn-retrieve-sort-topk', 'op-sort', 'op-topk', 'ranked'),
        ('conn-retrieve-topk-drop', 'op-topk', 'op-dropped', 'rejected'),
    ],
    'context': [
        ('conn-context-tag-join', 'op-tag-source', 'op-join', 'tagged passages'),
    ],
    'prompt': [
        ('conn-prompt-rules-assemble', 'op-system-rules', 'op-assemble', 'rules'),
    ],
    'model': [
        ('conn-model-attend-cite', 'op-attend', 'op-cite', 'draft answer'),
    ],
}

PORTS = {
    'embed': ([('in', 'question text')], [('out', 'query vector')]),
    'retrieve': ([('vector', 'query vector'), ('index', 'document index')], [('out', 'top matches'), ('rejected', 'rejected matches')]),
    'context': ([('matches', 'top matches')], [('out', 'context block')]),
    'prompt': ([('question', 'question'), ('context', 'context block')], [('out', 'prompt')]),
    'model': ([('prompt', 'prompt')], [('out', 'answer')]),
}

# Exact compound geometry from the supplied RAG reference prototype. The renderer
# owns these coordinates; AI narration never supplies or mutates them.
COMPOUNDS = {
    'embed': {
        'leftPortsY': [86], 'rightPortsY': [86],
        'children': [
            {'id': 'op-tokenize', 'label': 'tokenize()', 'sublabel': 'split words', 'x': 36, 'y': 52, 'w': 88, 'h': 68, 'iconName': 'Scissors', 'color': 'sky', 'drillDownFunctionId': 'emb-tokenize'},
            {'id': 'op-pool', 'label': 'encode_pool()', 'sublabel': 'IDs → mean vec', 'x': 166, 'y': 52, 'w': 88, 'h': 68, 'iconName': 'Layers', 'color': 'violet', 'drillDownFunctionId': 'emb-pool'},
            {'id': 'op-normalize', 'label': 'l2_normalize()', 'sublabel': '[0.1270, -0.4658…]', 'x': 296, 'y': 52, 'w': 88, 'h': 68, 'iconName': 'Binary', 'color': 'amber', 'drillDownFunctionId': 'emb-norm'},
        ],
        'internalWires': [
            {'points': [{'x': 5, 'y': 86}, {'x': 32, 'y': 86}]},
            {'points': [{'x': 128, 'y': 86}, {'x': 162, 'y': 86}]},
            {'points': [{'x': 258, 'y': 86}, {'x': 292, 'y': 86}]},
            {'points': [{'x': 388, 'y': 86}, {'x': 411, 'y': 86}]},
        ],
    },
    'retrieve': {
        'leftPortsY': [66, 120], 'rightPortsY': [86],
        'children': [
            {'id': 'op-score', 'label': 'score_dot()', 'sublabel': '0.89 · 0.64 · 0.18', 'x': 46, 'y': 46, 'w': 94, 'h': 92, 'iconName': 'Gauge', 'color': 'teal', 'hasLeftCombinerBar': True, 'combinerPortsY': [66, 120], 'drillDownFunctionId': 'ret-scorer'},
            {'id': 'op-sort', 'label': 'sorted()', 'sublabel': 'reverse=True', 'x': 184, 'y': 52, 'w': 92, 'h': 68, 'iconName': 'ArrowUpDown', 'color': 'violet', 'drillDownFunctionId': 'ret-sorter'},
            {'id': 'op-topk', 'label': 'ranked[:2]', 'sublabel': 'keep 2 docs', 'x': 320, 'y': 52, 'w': 96, 'h': 68, 'iconName': 'Filter', 'color': 'emerald', 'drillDownFunctionId': 'ret-slicer'},
            {'id': 'op-dropped', 'label': 'Dropped', 'sublabel': '✕ shipping', 'x': 436, 'y': 124, 'w': 68, 'h': 52, 'iconName': 'XCircle', 'color': 'rose', 'isDropBranch': True},
        ],
        'internalWires': [
            {'points': [{'x': 5, 'y': 66}, {'x': 34, 'y': 66}]},
            {'points': [{'x': 5, 'y': 120}, {'x': 34, 'y': 120}]},
            {'points': [{'x': 144, 'y': 86}, {'x': 180, 'y': 86}]},
            {'points': [{'x': 280, 'y': 86}, {'x': 316, 'y': 86}]},
            {'points': [{'x': 420, 'y': 86}, {'x': 515, 'y': 86}]},
            {'points': [{'x': 368, 'y': 120}, {'x': 368, 'y': 150}, {'x': 432, 'y': 150}]},
        ],
    },
    'context': {
        'leftPortsY': [86], 'rightPortsY': [86],
        'children': [
            {'id': 'op-tag-source', 'label': 'TagSourceID', 'sublabel': 'f"[{m.id}]"', 'x': 38, 'y': 52, 'w': 112, 'h': 68, 'iconName': 'Tag', 'color': 'amber', 'drillDownFunctionId': 'ctx-tag'},
            {'id': 'op-join', 'label': 'JoinChunks', 'sublabel': '"\\n\\n".join()', 'x': 200, 'y': 52, 'w': 114, 'h': 68, 'iconName': 'Layers', 'color': 'rose', 'drillDownFunctionId': 'ctx-join'},
        ],
        'internalWires': [
            {'points': [{'x': 5, 'y': 86}, {'x': 34, 'y': 86}]},
            {'points': [{'x': 154, 'y': 86}, {'x': 196, 'y': 86}]},
            {'points': [{'x': 318, 'y': 86}, {'x': 351, 'y': 86}]},
        ],
    },
    'prompt': {
        'leftPortsY': [56, 112], 'rightPortsY': [86],
        'children': [
            {'id': 'op-system-rules', 'label': 'SystemRules', 'sublabel': 'cite [ID]', 'x': 38, 'y': 78, 'w': 100, 'h': 68, 'iconName': 'ShieldCheck', 'color': 'emerald', 'drillDownFunctionId': 'prm-rules'},
            {'id': 'op-assemble', 'label': 'PromptAssembler', 'sublabel': 'Rules+Ctx+Q', 'x': 196, 'y': 42, 'w': 118, 'h': 88, 'iconName': 'FileCode2', 'color': 'amber', 'hasLeftCombinerBar': True, 'combinerPortsY': [56, 112], 'drillDownFunctionId': 'prm-merge'},
        ],
        'internalWires': [
            {'points': [{'x': 5, 'y': 56}, {'x': 184, 'y': 56}]},
            {'points': [{'x': 5, 'y': 112}, {'x': 34, 'y': 112}]},
            {'points': [{'x': 142, 'y': 112}, {'x': 184, 'y': 112}]},
            {'points': [{'x': 318, 'y': 86}, {'x': 351, 'y': 86}]},
        ],
    },
    'model': {
        'leftPortsY': [86], 'rightPortsY': [86],
        'children': [
            {'id': 'op-attend', 'label': 'attend_context()', 'sublabel': '"30 days"', 'x': 26, 'y': 52, 'w': 80, 'h': 68, 'iconName': 'SearchCheck', 'color': 'teal', 'drillDownFunctionId': 'gen-attend'},
            {'id': 'op-cite', 'label': 'decode_and_cite()', 'sublabel': 'reply + [id]', 'x': 132, 'y': 52, 'w': 78, 'h': 68, 'iconName': 'Sparkles', 'color': 'violet', 'drillDownFunctionId': 'gen-decode'},
        ],
        'internalWires': [
            {'points': [{'x': 5, 'y': 86}, {'x': 22, 'y': 86}]},
            {'points': [{'x': 110, 'y': 86}, {'x': 128, 'y': 86}]},
            {'points': [{'x': 214, 'y': 86}, {'x': 231, 'y': 86}]},
        ],
    },
}

NODE_RENDER = {
    'question': {'width': 136, 'height': 84},
    'embed': {'width': 416, 'height': 156},
    'index': {'width': 136, 'height': 88},
    'retrieve': {'width': 520, 'height': 196},
    'context': {'width': 356, 'height': 176},
    'prompt': {'width': 356, 'height': 164},
    'model': {'width': 236, 'height': 164},
    'answer': {'width': 152, 'height': 92},
}

COMPACT_ROWS = {
    'question': {'col': 0, 'row': 0},
    'index': {'col': 0, 'row': 1},
    'embed': {'col': 1, 'row': 0},
    'retrieve': {'col': 1, 'row': 1},
    'context': {'col': 2, 'row': 1},
    'prompt': {'col': 2, 'row': 0},
    'answer': {'col': 3, 'row': 0},
    'model': {'col': 3, 'row': 0},
}

EDGE_PORTS = {
    'e-question-embed': {'targetPortIndex': 0},
    'e-embed-retrieve': {'targetPortIndex': 0},
    'e-index-retrieve': {'targetPortIndex': 1},
    'e-retrieve-context': {'targetPortIndex': 0},
    'e-question-prompt': {'targetPortIndex': 0},
    'e-context-prompt': {'targetPortIndex': 1},
    'e-prompt-model': {'targetPortIndex': 0},
    'e-model-answer': {'targetPortIndex': 0},
    'e-context-answer': {'targetPortIndex': 0},
}


def _vector_at_cosine(query, cosine):
    """Return a 6-number vector whose cosine similarity to query is the target."""
    norm = math.sqrt(sum(value * value for value in query)) or 1.0
    base = [value / norm for value in query]
    axis = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    projection = sum(a * b for a, b in zip(axis, base))
    orthogonal = [a - projection * b for a, b in zip(axis, base)]
    orthogonal_norm = math.sqrt(sum(value * value for value in orthogonal)) or 1.0
    orthogonal = [value / orthogonal_norm for value in orthogonal]
    sine = math.sqrt(max(0.0, 1.0 - cosine * cosine))
    return [cosine * a + sine * b for a, b in zip(base, orthogonal)]


def _worked_example():
    query = [0.1270, -0.4658, 0.0847, 0.7517, -0.2223, 0.3811]
    return compile_example({
        'inputs': {
            'question': 'How long do I have to request a refund?',
            'prompt_text': 'SystemRules: answer with citations.\n\nContext:\n[refund-policy] Refunds within 30 days of purchase.\n\n[returns-guide] Include your order number when contacting support.\n\nQuestion: How long do I have to request a refund?',
            'query': query,
            'documents': [
                {'id': 'refund-policy', 'text': 'Refunds within 30 days of purchase.', 'vector': _vector_at_cosine(query, 0.89)},
                {'id': 'returns-guide', 'text': 'Include your order number when contacting support.', 'vector': _vector_at_cosine(query, 0.64)},
                {'id': 'shipping-guide', 'text': 'Standard delivery takes five business days.', 'vector': _vector_at_cosine(query, 0.18)},
            ],
            'context_text': '[refund-policy] Refunds within 30 days of purchase.\n\n[returns-guide] Include your order number when contacting support.',
        },
        'calculations': [
            {'id': 'scores', 'operation': 'similarities', 'inputs': ['query', 'documents']},
            {'id': 'ranked', 'operation': 'rank', 'inputs': ['scores']},
            {'id': 'selected', 'operation': 'take', 'inputs': ['ranked'], 'parameters': {'count': 2}},
            {'id': 'selected_text', 'operation': 'get', 'inputs': ['selected'], 'parameters': {'key': 'text'}},
        ],
    })


def _align_worked_values(value):
    """Rewrite reference strings that predate this seed's deterministic toy values."""
    replacements = []
    if isinstance(value, str):
        for old, new in replacements:
            value = value.replace(old, new)
        return value
    if isinstance(value, list):
        return [_align_worked_values(item) for item in value]
    if isinstance(value, dict):
        return {key: _align_worked_values(item) for key, item in value.items()}
    return value


def rag_architecture() -> dict:
    base = json.loads(REFERENCE_LESSON.read_text())
    architecture = copy.deepcopy(base['architecture'])
    architecture['illustrative'] = True
    architecture['grounding'] = 'illustrative'
    architecture['assumptions'] = [
        'The RAG mechanism and values are an authored worked example, not a live embedding or retrieval run.',
        'Toy vectors and document scores are used to make ranking visible.',
    ]
    architecture['limitations'] = [
        'No model weights, index storage or runtime execution is observed.',
        'Retrieved context supports an answer but does not guarantee correctness.',
    ]
    architecture['workedExample'] = _worked_example()
    architecture['renderContract'] = 'reference'
    architecture['graph']['compactRowAssignment'] = copy.deepcopy(COMPACT_ROWS)
    for edge in architecture['graph']['edges']:
        edge.update(EDGE_PORTS.get(edge['id'], {}))
    for code_file in architecture.get('codeFiles', []):
        for line in code_file.get('lines', []):
            if line.get('lineNumber') == 4:
                line['text'] = '    context = "\\n\\n".join(f"[{match.id}] {match.text}" for match in matches)'
                line['resultText'] = '"[refund-policy] Refunds within 30 days of purchase.\\n\\n[returns-guide] Include your order number when contacting support."'
                line['explanation'] = 'Tag each selected passage with its [source-id], then join them into one context block.'
            elif line.get('lineNumber') == 5:
                line['inputValue'] = '"tagged context" + "How long do I have to request a refund?"'
                line['resultText'] = 'SystemRules + tagged context + question'
                line['explanation'] = 'Combine SystemRules, the tagged context, and the question into one prompt.'
    for node in architecture['graph']['nodes']:
        nid = node['id']
        node.update(copy.deepcopy(NODE_RENDER.get(nid, {})))
        if nid in COMPOUNDS:
            node['compoundContainer'] = copy.deepcopy(COMPOUNDS[nid])
        if nid in CHILDREN:
            node['children'] = [
                {'id': child_id, 'label': label, 'description': description,
                 'icon': icon, 'color': color, 'value': value}
                for child_id, label, description, icon, color, value in CHILDREN[nid]
            ]
            inputs, outputs = PORTS[nid]
            node['ports'] = {
                'inputs': [{'id': pid, 'label': label, 'data': label} for pid, label in inputs],
                'outputs': [{'id': pid, 'label': label, 'data': label} for pid, label in outputs],
            }
            node['connections'] = [
                {'id': cid, 'from': {'child': source}, 'to': {'child': target},
                 'label': label, 'relationship': 'data'}
                for cid, source, target, label in CONNECTIONS[nid]
            ]
    return _align_worked_values(architecture)
