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


def _iter_sources(root: Path, max_files: int) -> list[Path]:
    files: list[Path] = []
    for current, dirs, names in os.walk(root):
        rel_dir = Path(current).relative_to(root).as_posix()
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not (rel_dir + '/' + d).strip('/').endswith('android/app/build')]
        for name in names:
            path = Path(current) / name
            if not path.resolve().is_relative_to(root):continue
            if path.suffix.lower() not in SOURCE_SUFFIXES:
                continue
            try:
                if path.stat().st_size > 240_000:
                    continue
            except OSError:
                continue
            files.append(path)
    def priority(path: Path) -> tuple[int, int, str]:
        rel = path.relative_to(root).as_posix()
        if rel.startswith('src/assistant/visual/'):
            rank = 0
        elif rel.startswith('src/assistant/'):
            rank = 1
        elif rel.startswith('visual-studio/src/live/architecture/'):
            rank = 2
        elif rel.startswith('visual-studio/src/live/'):
            rank = 3
        elif rel.startswith('visual-studio/src/'):
            rank = 4
        elif rel.startswith('src/'):
            rank = 5
        elif rel.startswith('android/app/src/main/'):
            rank = 6
        else:
            rank = 7
        return (rank, len(path.relative_to(root).parts), rel)
    files.sort(key=priority)
    return files[:max_files]


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
    try:
        text = path.read_text(errors='replace')
    except OSError:
        return [], []
    imports: list[tuple[str, int, str]] = []
    definitions: list[tuple[str, int, str]] = []
    for line_number, line in enumerate(text.splitlines(), 1):
        match = re.search(r"""\bfrom\s+['"]([^'"]+)['"]""", line)
        if match:
            imports.append((match.group(1), line_number, match.group(1)))
        match = re.search(r"""\bimport\s+['"]([^'"]+)['"]""", line)
        if match:
            imports.append((match.group(1), line_number, match.group(1)))
        match = re.search(r'\b(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)', line)
        if match:
            kind = 'class' if 'class ' in line else 'function'
            definitions.append((match.group(1), line_number, kind))
        match = re.search(r'\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(', line)
        if match:
            definitions.append((match.group(1), line_number, 'function'))
    return imports, definitions


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


def scan_repository(path: str | Path, *, max_files: int = MAX_FILES) -> dict:
    """Return a validated, source-backed architecture contract for a local folder."""
    root = Path(path).expanduser().resolve()
    if not root.is_dir():
        raise PlanError('Repository path must be an existing directory')
    source_files = _iter_sources(root, max(1, min(max_files, MAX_FILES)))
    if not source_files:
        raise PlanError('Repository scan needs at least one supported source file')

    known = {p.resolve() for p in source_files}
    relative = {p.resolve(): p.resolve().relative_to(root).as_posix() for p in source_files}
    used_ids: set[str] = set()
    node_by_file: dict[Path, dict] = {}
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

    for index, source in enumerate(source_files):
        resolved = source.resolve()
        rel = relative[resolved]
        imports, definitions = info[resolved]
        try:
            text_lines = source.read_text(errors='replace').splitlines()
        except OSError:
            text_lines = []
        code_lines = []
        for line_number, line in enumerate(text_lines[:MAX_CODE_LINES], 1):
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

        first_definition = definitions[0][1] if definitions and definitions[0][1] <= len(code_lines) else 1
        node_id = _node_id(rel, used_ids)
        node = {
            'id': node_id,
            'label': rel[:65],
            'kind': _kind_for(rel),
            'color': _color_for(index),
            'description': f'{rel} · {len(definitions)} definitions · {len(imports)} imports',
            'defaultPreview': code_lines[0]['text'][:160] if code_lines else rel,
            'codeReference': {'file': rel[:150], 'lines': [first_definition]},
            'confidence': 'exact',
            'evidence': [{'kind': 'file', 'path': rel, 'lines': [first_definition]}],
            'visual': {
                'variant': 'paper-card',
                'headerBadge': 'FILE',
                'title': rel.split('/')[-1][:60],
                'lines': [d[0] for d in definitions[:3]] or [rel.split('/')[-1][:60]],
                'footerNote': f'{len(definitions)} definitions · {len(imports)} imports',
            },
        }
        nodes.append(node)
        node_by_file[resolved] = node

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
            if target is None or target not in node_by_file:
                continue
            target_node = node_by_file[target]
            if target_node['id'] == source_node['id']:
                continue
            edge_id = f"edge-{source_node['id']}-{target_node['id']}"
            if edge_id in edge_ids:
                continue
            edge_ids.add(edge_id)
            edges.append({
                'id': 'import-'+hashlib.sha256(edge_id.encode()).hexdigest()[:16],
                'source': source_node['id'],
                'target': target_node['id'],
                'label': import_name[:90],
                'relationship': 'reference',
                'description': f'{source_node["label"]} imports {import_name}',
                'confidence': 'exact' if source.suffix=='.py' else 'inferred',
                'evidence': [{'kind': 'file', 'path': relative[resolved], 'lines': [line_number], 'quote': import_name}],
            })

    return {
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
