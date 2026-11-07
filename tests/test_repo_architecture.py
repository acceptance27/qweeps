import json
from pathlib import Path

from assistant.visual.architecture_flow import validate_architecture
from assistant.visual.repo_architecture import scan_repository


def test_scan_repository_builds_source_backed_evidence(tmp_path: Path):
    (tmp_path / 'pkg').mkdir()
    (tmp_path / 'pkg' / '__init__.py').write_text('')
    (tmp_path / 'pkg' / 'store.py').write_text('def load(name):\n    return name\n')
    (tmp_path / 'pkg' / 'server.py').write_text('from .store import load\n\ndef handle(name):\n    return load(name)\n')
    (tmp_path / 'web.ts').write_text("import { load } from './pkg/store'\nexport function render() { return load('x') }\n")

    architecture = validate_architecture(scan_repository(tmp_path))

    assert architecture['grounding'] == 'source-backed'
    assert architecture['illustrative'] is False
    assert architecture['graph']['nodes']
    assert architecture['graph']['edges'] or any(node.get('connections') for node in architecture['graph']['nodes'])
    assert all(node['evidence'] for node in architecture['graph']['nodes'])
    assert all(edge['evidence'] for edge in architecture['graph']['edges'])
    labels = [child['label'] for node in architecture['graph']['nodes'] for child in node.get('children', [])]
    assert any('store.py' in label for label in labels)
    assert any('server.py' in label for label in labels)
    assert any(edge['relationship'] == 'reference' for edge in architecture['graph']['edges']) or any(
        conn['relationship'] == 'reference' for node in architecture['graph']['nodes'] for conn in node.get('connections', []))
    assert architecture['limitations']


def test_source_backed_architecture_requires_evidence(tmp_path: Path, monkeypatch):
    from assistant.visual import architecture_flow

    raw = {
        'version': 1,
        'grounding': 'source-backed',
        'codeFiles': [{'file': 'a.py', 'language': 'python', 'lines': [{'lineNumber': 1, 'text': 'x = 1'}]}],
        'graph': {
            'id': 'g',
            'title': 'G',
            'nodes': [
                {'id': 'a', 'label': 'A', 'kind': 'input', 'color': 'blue', 'description': 'A'},
                {'id': 'b', 'label': 'B', 'kind': 'output', 'color': 'green', 'description': 'B'},
            ],
            'edges': [{'id': 'e', 'source': 'a', 'target': 'b', 'label': 'x', 'relationship': 'data'}],
        },
    }
    try:
        architecture_flow.validate_architecture(raw)
    except Exception as exc:
        assert 'needs evidence' in str(exc)
    else:
        raise AssertionError('source-backed graph without evidence was accepted')


def test_proposed_architecture_requires_assumptions():
    from assistant.visual.architecture_flow import validate_architecture
    from assistant.visual.plan import PlanError

    raw = {
        'version': 1,
        'grounding': 'proposed',
        'codeFiles': [{'file': 'a.py', 'language': 'python', 'lines': [{'lineNumber': 1, 'text': 'x = 1'}]}],
        'graph': {
            'id': 'g',
            'title': 'G',
            'nodes': [
                {'id': 'a', 'label': 'A', 'kind': 'input', 'color': 'blue', 'description': 'A'},
                {'id': 'b', 'label': 'B', 'kind': 'output', 'color': 'green', 'description': 'B'},
            ],
            'edges': [{'id': 'e', 'source': 'a', 'target': 'b', 'label': 'x', 'relationship': 'data'}],
        },
    }
    try:
        validate_architecture(raw)
    except PlanError as exc:
        assert 'assumption' in str(exc)
    else:
        raise AssertionError('proposed architecture without assumptions was accepted')


def test_single_and_disconnected_files_do_not_invent_dependencies(tmp_path):
    (tmp_path/'one.py').write_text('def first():\n    return 1\n')
    single=validate_architecture(scan_repository(tmp_path))
    assert len(single['graph']['nodes'])==1
    assert single['graph']['edges']==[]
    (tmp_path/'two.py').write_text('def second():\n    return 2\n')
    disconnected=validate_architecture(scan_repository(tmp_path))
    assert len(disconnected['graph']['nodes'])==2
    assert disconnected['graph']['edges']==[]


def test_relative_python_and_explicit_typescript_imports_resolve(tmp_path):
    (tmp_path/'pkg'/'sub').mkdir(parents=True)
    (tmp_path/'pkg'/'store.py').write_text('def read():\n    return 1\n')
    (tmp_path/'pkg'/'sub'/'api.py').write_text('from ..store import read\n')
    (tmp_path/'store.ts').write_text('export const answer = 42;\n')
    (tmp_path/'page.ts').write_text("import { answer } from './store.ts';\n")
    architecture=validate_architecture(scan_repository(tmp_path))
    edges=architecture['graph']['edges']
    labels={edge['label'] for edge in edges}
    labels |= {conn['label'] for node in architecture['graph']['nodes'] for conn in node.get('connections', [])}
    assert labels=={'..store','./store.ts'}
    assert {edge['confidence'] for edge in edges}=={'exact'}


def test_scan_excludes_source_symlink_outside_root(tmp_path):
    root=tmp_path/'repo';root.mkdir()
    (root/'inside.py').write_text('x = 1\n')
    outside=tmp_path/'outside.py';outside.write_text('secret = 1\n')
    (root/'link.py').symlink_to(outside)
    architecture=scan_repository(root)
    assert [file['file'] for file in architecture['codeFiles']]==['inside.py']


def test_static_repository_explanation_cannot_invent_execution_values():
    import pytest
    from assistant.visual.architecture_flow import validate_static_source_flow
    from assistant.visual.plan import PlanError
    validate_static_source_flow({'packets':[],'stateBefore':{},'stateAfter':{}})
    for key,value in [('packets',[{'payload':'invented'}]),('stateAfter',{'result':42}),('stateBeforeRefs',{'query':'imagined'})]:
        with pytest.raises(PlanError,match='static source inspection'):validate_static_source_flow({key:value})


def test_long_shared_paths_keep_import_edge_ids_unique(tmp_path):
    package=tmp_path/('package_'+'a'*45);package.mkdir()
    (package/'one.py').write_text('value = 1\n')
    (package/'other.py').write_text('value = 2\n')
    (package/'source.py').write_text('from .one import value\nfrom .other import value\n')
    result=validate_architecture(scan_repository(tmp_path))
    edges=result['graph']['edges']
    assert len(edges)==2
    assert len({edge['id'] for edge in edges})==2


def test_architecture_preserves_nested_children():
    from assistant.visual.architecture_flow import validate_architecture

    raw = {
        'version': 1,
        'grounding': 'illustrative',
        'codeFiles': [{'file': 'demo.py', 'language': 'python', 'lines': [
            {'lineNumber': 1, 'text': 'def pipeline(request):'},
        ]}],
        'graph': {
            'id': 'nested',
            'title': 'Nested',
            'nodes': [
                {'id': 'input', 'label': 'Input', 'kind': 'input', 'color': 'blue', 'description': 'input'},
                {
                    'id': 'pipeline', 'label': 'pipeline()', 'kind': 'transform', 'color': 'green',
                    'description': 'container',
                    'children': [
                        {'id': 'plan', 'label': 'plan()', 'description': 'plan', 'icon': 'Layers', 'color': 'blue', 'value': '3 beats'},
                        {'id': 'render', 'label': 'render()', 'description': 'render', 'icon': 'Sparkles', 'color': 'gold', 'value': 'SVG'},
                    ],
                },
                {'id': 'output', 'label': 'Output', 'kind': 'output', 'color': 'purple', 'description': 'output'},
            ],
            'edges': [
                {'id': 'e1', 'source': 'input', 'target': 'pipeline', 'label': 'request', 'relationship': 'data'},
                {'id': 'e2', 'source': 'pipeline', 'target': 'output', 'label': 'lesson', 'relationship': 'data'},
            ],
        },
    }
    architecture = validate_architecture(raw)
    pipeline = next(n for n in architecture['graph']['nodes'] if n['id'] == 'pipeline')
    assert [child['label'] for child in pipeline['children']] == ['plan()', 'render()']
    assert pipeline['children'][1]['color'] == 'gold'


def test_flow_can_focus_internal_operations_and_packet_internal_connections():
    from assistant.visual.architecture_flow import validate_architecture, step

    raw = {
        'version': 1,
        'grounding': 'illustrative',
        'codeFiles': [{'file': 'demo.py', 'language': 'python', 'lines': [
            {'lineNumber': 1, 'text': 'def pipeline(request):'},
        ]}],
        'graph': {
            'id': 'nested', 'title': 'Nested',
            'nodes': [
                {'id': 'input', 'label': 'Input', 'kind': 'input', 'color': 'blue', 'description': 'input'},
                {
                    'id': 'pipeline', 'label': 'pipeline()', 'kind': 'transform', 'color': 'green',
                    'description': 'container',
                    'children': [
                        {'id': 'plan', 'label': 'plan()', 'color': 'blue'},
                        {'id': 'render', 'label': 'render()', 'color': 'gold'},
                    ],
                    'ports': {'inputs': [{'id': 'in', 'label': 'request'}], 'outputs': [{'id': 'out', 'label': 'lesson'}]},
                    'connections': [
                        {'id': 'plan-render', 'from': {'child': 'plan', 'port': 'out'}, 'to': {'child': 'render', 'port': 'in'}, 'label': 'plan', 'relationship': 'data'},
                    ],
                },
                {'id': 'output', 'label': 'Output', 'kind': 'output', 'color': 'purple', 'description': 'output'},
            ],
            'edges': [
                {'id': 'e1', 'source': 'input', 'target': 'pipeline', 'label': 'request', 'relationship': 'data'},
                {'id': 'e2', 'source': 'pipeline', 'target': 'output', 'label': 'lesson', 'relationship': 'data'},
            ],
        },
    }
    architecture = validate_architecture(raw)
    flow = step({
        'focusNodes': ['pipeline'],
        'focusOperations': ['plan'],
        'activeEdges': ['plan-render'],
        'packets': [{'id': 'plan-packet', 'edgeId': 'plan-render', 'start': 0, 'end': 1, 'payload': '3 beats'}],
        'code': {'file': 'demo.py', 'lines': [1]},
    }, architecture['graph'], architecture['codeFiles'], 10)
    assert flow['focusOperations'] == ['plan']
    assert flow['activeEdges'] == ['plan-render']
    assert flow['packets'][0]['edgeId'] == 'plan-render'


def test_disconnected_grouped_files_never_acquire_sequential_links(tmp_path):
    for group in ('api', 'web'):
        (tmp_path/group).mkdir()
        for name in ('one.py', 'two.py'):
            (tmp_path/group/name).write_text('def unrelated():\n    return 1\n')
    architecture=validate_architecture(scan_repository(tmp_path))
    assert architecture['graph']['edges']==[]
    assert all(node['connections']==[] for node in architecture['graph']['nodes'])
    assert all(child.get('codeReference') for node in architecture['graph']['nodes'] for child in node['children'])


def test_requested_pipeline_files_survive_alphabetical_distractors_and_large_modules(tmp_path):
    (tmp_path/'src').mkdir()
    for i in range(30):
        (tmp_path/'src'/f'aaa_helper_{i:02}.py').write_text('def unrelated():\n    return 0\n')
    (tmp_path/'src'/'server.py').write_text('from .generator import prepare\n\ndef handle_request():\n    return prepare()\n')
    (tmp_path/'src'/'generator.py').write_text('# large module\n'*20_000+'\ndef prepare():\n    return "lesson"\n')
    (tmp_path/'src'/'player.ts').write_text('export function playback() { return 1; }\n')
    architecture=validate_architecture(scan_repository(tmp_path,question='Trace a request through server, generation and playback.'))
    files={f['file']:f for f in architecture['codeFiles']}
    assert {'src/server.py','src/generator.py','src/player.ts'}<=files.keys()
    assert any('def prepare' in line['text'] for line in files['src/generator.py']['lines'])
    assert any('Showing 12 of 33' in line for line in architecture['limitations'])


def test_icons_and_cross_group_child_bindings_follow_actual_source(tmp_path):
    (tmp_path/'api').mkdir();(tmp_path/'web').mkdir()
    (tmp_path/'api'/'server.py').write_text('from web.player import play\n')
    (tmp_path/'web'/'player.py').write_text('def play():\n    return 1\n')
    architecture=validate_architecture(scan_repository(tmp_path))
    nodes=architecture['graph']['nodes'];edge=architecture['graph']['edges'][0]
    source=next(n for n in nodes if n['id']==edge['source'])
    target=next(n for n in nodes if n['id']==edge['target'])
    assert edge['sourceChild']==source['children'][0]['id']
    assert edge['targetChild']==target['children'][0]['id']
    assert {c['icon'] for n in nodes for c in n['children']}=={'Network','Play'}
    assert all(n['structure']=='source' for n in nodes)
