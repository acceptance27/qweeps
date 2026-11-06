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
    assert architecture['graph']['edges']
    assert all(node['evidence'] for node in architecture['graph']['nodes'])
    assert all(edge['evidence'] for edge in architecture['graph']['edges'])
    assert any('store.py' in node['label'] for node in architecture['graph']['nodes'])
    assert any('server.py' in node['label'] for node in architecture['graph']['nodes'])
    assert any(edge['relationship'] == 'reference' for edge in architecture['graph']['edges'])
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
    assert {edge['label'] for edge in edges}=={'..store','./store.ts'}
    assert {edge['confidence'] for edge in edges}=={'exact','inferred'}


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
