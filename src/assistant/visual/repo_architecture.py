"""Deterministic repository scanner for source-backed architecture explanations.

The scan produces the same coordinate-free architecture contract the browser
workspace consumes. It records files, imports, definitions and line evidence;
it never claims runtime values, call execution or data packets.
"""
from __future__ import annotations

import ast
import hashlib
import os
import re
from pathlib import Path

from .plan import PlanError

SOURCE_SUFFIXES = {'.py', '.ts', '.tsx', '.js', '.jsx'}
SKIP_DIRS = {
    '.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', 'env', '__pycache__',
    '.pytest_cache', '.mypy_cache', '.ruff_cache', 'dist', 'build', 'coverage',
    '.playwright-mcp', '.gg', 'media', 'bundled-lessons', 'android/app/build',
    'bench', 'tests', 'scripts', 'docs', 'android/app/src/androidTest',
}
MAX_FILES = 12
MAX_CODE_LINES = 60


def _slug(value: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_-]+', '-', value).strip('-')
    if not clean or not clean[0].isalpha():
        clean = 'file-' + clean
    return clean[:78]


def _node_id(path: str, used: set[str]) -> str:
    base = _slug(path.replace('/', '-').replace('.', '-'))
    candidate = base
    index = 2
    while candidate in used:
        candidate = f'{base[:74]}-{index}'
        index += 1
    used.add(candidate)
    return candidate


def _group_key(rel: str) -> str:
    for prefix in (
        'src/assistant/visual/',
        'src/assistant/',
        'visual-studio/src/live/architecture/',
        'visual-studio/src/live/',
        'visual-studio/src/',
        'android/app/src/main/',
    ):
        if rel.startswith(prefix):
            return prefix.rstrip('/')
    parts = rel.split('/')
    return '/'.join(parts[:-1]) if len(parts) > 1 else ''


def _iter_sources(root: Path, max_files: int) -> list[Path]:
    files: list[Path] = []
    for current, dirs, names in os.walk(root):
        rel_dir = Path(current).relative_to(root).as_posix()
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.endswith('.local') and not (rel_dir + '/' + d).strip('/').endswith('android/app/build')]
        for name in names:
            path = Path(current) / name
            if not path.resolve().is_relative_to(root):continue
            if path.suffix.lower() not in SOURCE_SUFFIXES:
                continue
            try:
                if path.stat().st_size > 2_000_000:
                    continue
            except OSError:
                continue
            files.append(path)
    return sorted(files, key=lambda path: path.relative_to(root).as_posix())[:max_files]


# Retrieval is bounded, but indexing must see the repository rather than the first
# few alphabetical files. These role terms are generic, not QWEEPS file overrides.
ROLES = {
    'server': ('server', 'api', 'handler', 'route'),
    'generation': ('generator', 'planner', 'storyboard', 'browser_lessons', 'director'),
    'narration': ('narration', 'synchronization', 'speech', 'tts'),
    'playback': ('player', 'playback', 'timeline'),
    'renderer': ('renderer', 'stage', 'canvas', 'render'),
    'review': ('review', 'audit', 'validate'),
    'entry': ('runner', 'cli', 'main'),
    'store': ('store', 'repository', 'database', 'cache'),
}


def _words(text: str) -> set[str]:
    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    return {word.lower() for word in re.findall(r'[A-Za-z][A-Za-z0-9]+', text)}


def _select_sources(root: Path, files: list[Path], question: str, limit: int) -> list[Path]:
    subject = re.split(r'\b(?:Use the repository|Group related|Do not invent)\b', question, maxsplit=1, flags=re.I)[0]
    words = _words(subject) - {'the', 'and', 'from', 'with', 'this', 'that', 'files', 'source', 'qweeps'}
    # Requests describe responsibilities in ordinary words, not source filenames.
    aliases={'request':'server','question':'server','input':'server','entry':'server','job':'server','planning':'generation','creation':'generation','construction':'renderer','visual':'renderer','visuals':'renderer','draft':'generation','audio':'narration','voice':'narration','approved':'review','rejected':'review','validation':'review','saved':'store','artifacts':'store','published':'store','storage':'store','interactive':'playback'}
    words.update(aliases[word] for word in list(words) if word in aliases)
    requested = [role for role, terms in ROLES.items()
                 if role in words or any(term in words for term in terms)
                 or (role == 'generation' and words & {'model', 'preparation', 'generate'})
                 or (role == 'entry' and words & {'request', 'trace', 'pipeline'})
                 or (role == 'renderer' and words & {'svg', 'native', 'browser'})]
    records = []
    for path in files:
        rel = path.relative_to(root).as_posix()
        stem = path.stem.lower()
        names = _words(rel)
        try:
            content = path.read_text(errors='replace')[:80_000]
        except OSError:
            content = ''
        symbols = _words(' '.join(re.findall(r'(?:def|class|function)\s+(\w+)', content)))
        score = len(words & _words(path.stem)) * 12 + len(words & symbols) * 2
        score += sum(min(3, len(re.findall(r'\b' + re.escape(word) + r'\b', content, re.I))) for word in words) * .1
        # Authored lesson/example data is not the live system that produces it.
        if len(re.findall(r'\b(?:narration|focusNodes|nodeDataAfter)\s*:',content))>5:score-=50
        if path.name.startswith('__') or 'test' in names:
            score -= 12
        records.append((path, stem, score))
    selected = []
    # Cover the requested responsibilities before filling remaining slots by relevance.
    for role in requested:
        terms = ROLES[role]
        matches = [(path, score + max((len(terms)-i)*6 for i, term in enumerate(terms) if term in stem)) for path, stem, score in records
                   if any(term in stem for term in terms)]
        if matches:
            chosen = sorted(matches, key=lambda item: (-item[1], item[0].as_posix()))[0][0]
            if chosen not in selected:
                selected.append(chosen)
        if len(selected) == limit:
            return selected
    # Requests spanning browser and Python need both sides of a boundary. Do
    # not spend the remaining budget on unrelated files with a repeated word.
    if words & {'python', 'browser'} == {'python', 'browser'} or any(p.suffix=='.py' for p in files) and any(p.suffix in {'.ts','.tsx','.js','.jsx'} for p in files):
        for role in ('narration', 'renderer'):
            if role not in requested: continue
            matches = [(path, score) for path, stem, score in records if any(term in stem for term in ROLES[role])]
            chosen = next((path for path in selected if any(term in path.stem.lower() for term in ROLES[role])), None)
            if chosen:
                other = sorted(((path, score) for path, score in matches if (path.suffix == '.py') != (chosen.suffix == '.py')), key=lambda item: (-item[1], item[0].as_posix()))
                if other and other[0][0] not in selected and len(selected)<limit: selected.append(other[0][0])
    ranked = sorted(records, key=lambda item: (-item[2], item[0].as_posix()))
    if not question:
        # Default to entry points and the most connected local modules.
        ranked.sort(key=lambda item: (not any(term in item[1] for term in ('main', 'app', 'server', 'index')), -item[2], item[0].as_posix()))
    selected.extend(path for path, _, _ in ranked if path not in selected)
    return selected[:limit]


def _file_style(rel: str) -> tuple[str, str, str]:
    name = Path(rel).stem.lower()
    for terms, icon, color, role in (
        (('server', 'api', 'handler', 'route'), 'Network', 'blue', 'request handling'),
        (('store', 'database', 'cache'), 'Database', 'green', 'storage'),
        (('synchronization', 'narration', 'speech', 'tts', 'audio'), 'AudioLines', 'gold', 'audio & timing'),
        (('review', 'audit', 'validat'), 'ShieldCheck', 'coral', 'validation'),
        (('player', 'playback', 'timeline'), 'Play', 'purple', 'playback'),
        (('stage', 'canvas', 'render', 'geometry', 'layout'), 'Workflow', 'green', 'visual rendering'),
        (('generator', 'planner', 'storyboard', 'browser_lessons'), 'Sparkles', 'gold', 'lesson preparation'),
        (('runner', 'cli', 'main'), 'Terminal', 'blue', 'entry point'),
    ):
        if any(term in name for term in terms):
            return icon, color, role
    return 'FileCode2', 'muted', 'source module'


def _python_info(path: Path) -> tuple[list[tuple[str, int, str]], list[tuple[str, int, str]]]:
    try:
        tree = ast.parse(path.read_text(errors='replace'))
    except (SyntaxError, OSError):
        return [], []
    imports: list[tuple[str, int, str]] = []
    definitions: list[tuple[str, int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append((alias.name, node.lineno, alias.name))
        elif isinstance(node, ast.ImportFrom):
            module = ('.' * (node.level or 0)) + (node.module or '')
            imports.append((module, node.lineno, module))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            kind = 'class' if isinstance(node, ast.ClassDef) else 'function'
            definitions.append((node.name, node.lineno, kind))
    return imports, definitions


def _js_info(path: Path) -> tuple[list[tuple[str, int, str]], list[tuple[str, int, str]]]:
    from .source_functions import javascript_index
    parsed=javascript_index(path)
    return ([(row['name'],row['line'],row['name']) for row in parsed.get('imports',[])],
            [(row['name'],row['line'],'function') for row in parsed.get('symbols',[])])


def _local_target(import_name: str, source: Path, root: Path) -> Path | None:
    """Resolve local Python imports to a source file when possible."""
    candidates: list[Path] = []
    if import_name.startswith('.'):
        levels=len(import_name)-len(import_name.lstrip('.'));base=source.parent
        for _ in range(max(0,levels-1)):base=base.parent
        module=import_name[levels:]
        if module:base=base/Path(*module.split('.'))
        candidates.extend([base.with_suffix('.py'),base/'__init__.py'])
    else:
        module=Path(*import_name.split('.'))
        for prefix in (root,root/'src'):
            base=prefix/module;candidates.extend([base.with_suffix('.py'),base/'__init__.py'])
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def _js_target(import_name: str, source: Path, root: Path, known: set[Path]) -> Path | None:
    if not import_name.startswith('.'):
        return None
    base = (source.parent / import_name).resolve()
    if base in known:return base
    for suffix in ('.ts', '.tsx', '.js', '.jsx', '.d.ts'):
        candidate = Path(str(base) + suffix)
        if candidate in known:
            return candidate
    for suffix in ('.ts', '.tsx', '.js', '.jsx'):
        candidate = base / ('index' + suffix)
        if candidate in known:
            return candidate
    return None


def _kind_for(rel: str) -> str:
    low = rel.lower()
    if any(word in low for word in ('store', 'database', 'persist', 'cache', 'asset', 'lesson')):
        return 'store'
    if any(word in low for word in ('search', 'retriev', 'index', 'query')):
        return 'search'
    if any(word in low for word in ('render', 'stage', 'canvas', 'player', 'ui', 'component')):
        return 'assembly'
    if any(word in low for word in ('server', 'api', 'route', 'handler', 'app')):
        return 'transform'
    if any(word in low for word in ('test', 'spec')):
        return 'search'
    return 'transform'


def _color_for(index: int) -> str:
    return ('blue', 'green', 'gold', 'coral', 'purple', 'white', 'muted')[index % 7]


def scan_repository(path: str | Path, *, max_files: int = MAX_FILES, question: str = "", include_snapshots: bool = False) -> dict:
    """Return a validated, source-backed architecture contract for a local folder."""
    root = Path(path).expanduser().resolve()
    if not root.is_dir():
        raise PlanError('Repository path must be an existing directory')
    all_sources = _iter_sources(root, 10_000)
    source_files = _select_sources(root, all_sources, question, max(1, min(max_files, MAX_FILES)))
    if not source_files:
        raise PlanError('Repository scan needs at least one supported source file')

    known = {p.resolve() for p in all_sources}
    relative_all = {p.resolve(): p.resolve().relative_to(root).as_posix() for p in all_sources}
    relative = {p.resolve(): p.resolve().relative_to(root).as_posix() for p in source_files}
    used_ids: set[str] = set()
    node_by_file: dict[Path, dict] = {}
    node_by_group: dict[str, dict] = {}
    files: list[dict] = []
    nodes: list[dict] = []
    edges: list[dict] = []
    edge_ids: set[str] = set()

    info: dict[Path, tuple[list[tuple[str, int, str]], list[tuple[str, int, str]]]] = {}
    for source in source_files:
        resolved = source.resolve()
        if source.suffix == '.py':
            info[resolved] = _python_info(source)
        else:
            info[resolved] = _js_info(source)

    records = []
    for index, source in enumerate(source_files):
        resolved = source.resolve()
        rel = relative[resolved]
        imports, definitions = info[resolved]
        try:
            text_lines = source.read_text(errors='replace').splitlines()
        except OSError:
            text_lines = []
        code_lines = []
        # Keep real line numbers and useful entry/definition excerpts even when
        # the requested mechanism lives beyond the first 60 lines of a module.
        relevant = sorted(definitions, key=lambda d: (-len(_words(d[0]) & _words(question)), d[1]))
        chosen_lines = set(range(1, min(13, len(text_lines) + 1)))
        for _, at, _ in relevant:
            window = set(range(max(1, at - 1), min(len(text_lines) + 1, at + 5)))
            if len(chosen_lines | window) <= MAX_CODE_LINES:
                chosen_lines |= window
        for at in range(1, len(text_lines) + 1):
            if len(chosen_lines) >= MAX_CODE_LINES: break
            chosen_lines.add(at)
        for line_number in sorted(chosen_lines):
            line = text_lines[line_number - 1]
            clean = line.replace('\t', '    ').rstrip()
            if len(clean) > 600:
                clean = clean[:597] + '...'
            explanation = 'source line'
            for name, at, kind in definitions:
                if at == line_number:
                    explanation = f'{kind} {name}'
                    break
            code_lines.append({'lineNumber': line_number, 'text': clean, 'explanation': explanation})
        if not code_lines:
            code_lines = [{'lineNumber': 1, 'text': '', 'explanation': 'empty source file'}]
        code_file = {'file': rel[:150], 'language': 'python' if source.suffix == '.py' else 'typescript', 'lines': code_lines}
        files.append(code_file)
        first_definition = next((d[1] for d in relevant if d[1] in chosen_lines), 1)
        records.append({'resolved': resolved, 'rel': rel, 'imports': imports, 'definitions': definitions,
                        'code_lines': code_lines, 'first_definition': first_definition, 'index': index})

    groups: dict[str, list[dict]] = {}
    for record in records:
        groups.setdefault(_group_key(record['rel']), []).append(record)

    # Bound each visible compound without silently dropping selected files.
    groups = {key if index == 0 else f'{key} · part {index+1}': members[start:start+8]
              for key, members in groups.items() for index, start in enumerate(range(0, len(members), 8))}

    # A single group would leave one top-level node. Fall back to flat files so
    # the graph still shows relationships and keeps the same evidence.
    grouped = len(groups) >= 2
    if grouped:
        for group_index, (group, members) in enumerate(groups.items()):
            container_id = _node_id(f'group-{group}', used_ids)
            child_ids = {record['resolved']: _slug(record['rel']) for record in members[:16]}
            children = []
            for child_index, record in enumerate(members[:16]):
                child_id = child_ids[record['resolved']]
                children.append({
                    'id': child_id,
                    'label': record['rel'].split('/')[-1][:80],
                    'description': record['rel'],
                    'icon': _file_style(record['rel'])[0],
                    'color': _file_style(record['rel'])[1],
                    'value': _file_style(record['rel'])[2],
                    'codeReference': {'file': record['rel'][:150], 'lines': [record['first_definition']]},
                    'ports': {'inputs': [{'id': 'in', 'label': 'input'}], 'outputs': [{'id': 'out', 'label': 'output'}]},
                })
            internal = []
            for record in members[:16]:
                for import_name, _line, _ in record['imports']:
                    target = _local_target(import_name, Path(record['resolved']), root) if record['rel'].endswith('.py') else _js_target(import_name, Path(record['resolved']), root, known)
                    if target is None or target not in child_ids or target == record['resolved']:
                        continue
                    cid = f"internal-{child_ids[record['resolved']]}-{child_ids[target]}"
                    if any(item['id'] == _slug(cid) for item in internal):
                        continue
                    internal.append({'id': _slug(cid), 'from': {'child': child_ids[record['resolved']]},
                                     'to': {'child': child_ids[target]}, 'label': import_name[:90],
                                     'relationship': 'reference','evidence':[{'kind':'file','path':record['rel'],'lines':[_line],'quote':import_name}]})
            first = members[0]
            node = {
                'id': container_id,
                'label': group[:65] or 'repository',
                'kind': _kind_for(group),
                'color': _color_for(group_index),
                'description': f'{group or "repository"} · {len(members)} source files',
                'defaultPreview': f'{len(members)} '+('file' if len(members)==1 else 'files'),
                'codeReference': {'file': first['rel'][:150], 'lines': [first['first_definition']]},
                'confidence': 'exact',
                'evidence': [{'kind': 'file', 'path': record['rel'], 'lines': [record['first_definition']]}
                             for record in members[:4]],
                'children': children,
                'ports': {'inputs': [{'id': 'in', 'label': 'source input', 'data': 'file contents'}],
                          'outputs': [{'id': 'out', 'label': 'source output', 'data': 'exports / definitions'}]},
                'connections': internal,
                'structure': 'source',
            }
            nodes.append(node)
            node_by_group[group] = node
            for record in members:
                node_by_file[record['resolved']] = node
    else:
        for record in records:
            node_id = _node_id(record['rel'], used_ids)
            node = {
                'id': node_id,
                'label': record['rel'][:65],
                'kind': _kind_for(record['rel']),
                'color': _color_for(record['index']),
                'description': f"{record['rel']} · {len(record['definitions'])} definitions · {len(record['imports'])} imports",
                'defaultPreview': record['code_lines'][0]['text'][:160] if record['code_lines'] else record['rel'],
                'codeReference': {'file': record['rel'][:150], 'lines': [record['first_definition']]},
                'confidence': 'exact',
                'evidence': [{'kind': 'file', 'path': record['rel'], 'lines': [record['first_definition']]}],
                'children': [],
                'visual': {
                    'variant': 'paper-card',
                    'headerBadge': 'FILE',
                    'title': record['rel'].split('/')[-1][:60],
                    'lines': [d[0] for d in record['definitions'][:3]] or [record['rel'].split('/')[-1][:60]],
                    'footerNote': f"{len(record['definitions'])} definitions · {len(record['imports'])} imports",
                },
            }
            nodes.append(node)
            node_by_group[_group_key(record['rel'])] = node
            node_by_file[record['resolved']] = node

    for source in source_files:
        resolved = source.resolve()
        imports, _definitions = info[resolved]
        source_node = node_by_file[resolved]
        for import_name, line_number, _ in imports:
            target = None
            if source.suffix == '.py':
                target = _local_target(import_name, source, root)
            else:
                target = _js_target(import_name, source, root, known)
            if target is None:
                continue
            target_rel = relative_all.get(target)
            if not target_rel:
                continue
            if grouped:
                target_node = node_by_file.get(target)
            else:
                target_node = node_by_file.get(target)
            if target_node is None or target_node['id'] == source_node['id']:
                continue
            edge_id = f"edge-{relative[resolved]}-{target_rel}"
            if edge_id in edge_ids:
                continue
            edge_ids.add(edge_id)
            edges.append({
                'id': 'import-'+hashlib.sha256(edge_id.encode()).hexdigest()[:16],
                'source': source_node['id'],
                'target': target_node['id'],
                **({'sourceChild': _slug(relative[resolved]), **({'targetChild': _slug(target_rel)} if target in node_by_file else {})}
                   if grouped else {}),
                'label': import_name[:90],
                'relationship': 'reference',
                'description': f'{source_node["label"]} imports {import_name}',
                'confidence': 'exact' if source.suffix=='.py' else 'inferred',
                'evidence': [{'kind': 'file', 'path': relative[resolved], 'lines': [line_number], 'quote': import_name}],
            })

    architecture = {
        'version': 1,
        'illustrative': False,
        'grounding': 'source-backed',
        'assumptions': [
            'Repository scan covers selected source files only; generated, cached and build output are excluded.',
            'Graph edges are import/reference relationships, not runtime calls.',
        ],
        'limitations': [
            'No runtime values, variable states or execution traces are inferred by this scan.',
            'JavaScript and TypeScript references use conservative text heuristics and are marked inferred.',
            'Unresolved imports and dynamic references remain outside the graph.',
            f'Showing {len(source_files)} of {len(all_sources)} indexed source files, selected for the requested responsibilities; this is a bounded view.',
        ],
        'codeFiles': files,
        'graph': {
            'id': 'repository-' + hashlib.sha256(str(root).encode()).hexdigest()[:8],
            'title': root.name,
            'nodes': nodes,
            'edges': edges,
        },
        'functions': {},
    }
    from .source_functions import attach_source_functions
    architecture=attach_source_functions(architecture, records, question)
    if include_snapshots:architecture['sourceSnapshots']={r['rel']:Path(r['resolved']).read_text(errors='replace') for r in records}
    return architecture
