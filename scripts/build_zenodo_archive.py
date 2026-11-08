#!/usr/bin/env python3
"""Package the current QWEEPS working tree and built studio for a Zenodo snapshot.

Includes uncommitted source changes and records every included file's SHA-256.
Does not upload, commit, copy local credentials, or bundle installed dependencies.
Run `npm ci && npm run build` and rebuild the report before packaging.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SKIP_PARTS = {'.git', '.venv', 'venv', 'env', 'node_modules', '__pycache__', '.pytest_cache', '.gradle', '.idea', '.vscode'}
KEYS = {
    'Google API key': rb'AIza[0-9A-Za-z_-]{35}',
    'OpenCode API key': rb'oc_sk_[0-9A-Za-z_-]{24,}',
    'GitHub token': rb'(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{40,})',
    'API token': rb'sk-(?:ant-api\d+-)?[0-9A-Za-z_-]{40,}',
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
}
# Previously excluded teaching PDF; preserve that release decision in nested assets too.
EXCLUDED_SHA256 = '9cff2dee86980d32f7445a94f0e803ca235636864efd24f2b48e37c5da548613'


def git(*args: str) -> str:
    return subprocess.check_output(['git', *args], cwd=ROOT).decode()


def safe_path(name: str) -> bool:
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or any(part in SKIP_PARTS for part in p.parts):
        return False
    if p.parts[0] in {'output', 'tmp', 'dist'} or 'build' in p.parts:
        return False
    if p.name == '.env.example':
        return True
    return not (p.name == '.env' or p.name.startswith('.env.') or p.suffix in {'.env', '.key', '.pem', '.pyc'}
                or p.name in {'secrets.toml', '.secrets', 'local.properties', '.npmrc'})


def scan(name: str, data: bytes, *, depth: int = 0) -> None:
    if hashlib.sha256(data).hexdigest() == EXCLUDED_SHA256:
        raise ValueError(f'Excluded teaching document found: {name}')
    for label, pattern in KEYS.items():
        if re.search(pattern, data):
            raise ValueError(f'Potential {label} in {name}; value withheld. Review before packaging.')
    if name.lower().endswith('.zip'):
        if depth >= 4:
            raise ValueError(f'Nested archive exceeds review depth: {name}')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for item in archive.infolist():
                if item.is_dir():
                    continue
                if not safe_path(item.filename):
                    raise ValueError(f'Excluded path in nested archive: {name}!{item.filename}')
                scan(name + '!' + item.filename, archive.read(item), depth=depth + 1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date', type=date.fromisoformat, default=datetime.now(ZoneInfo('Asia/Manila')).date())
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    output = args.output or ROOT / 'output/zenodo' / f'QWEEPS-{args.date}-architecture-preview.zip'
    if not (ROOT / 'visual-studio/dist/index.html').is_file():
        raise SystemExit('Run npm run build before packaging.')
    report = ROOT / 'docs/QWEEPS_Live_Visual_Teaching_Technical_Report.pdf'
    if not report.is_file():
        raise SystemExit('Build the maintained PDF before packaging.')
    version = re.search(r'TECHNICAL REPORT (\d+\.\d+)', (ROOT / 'docs/technical-report.md').read_text())[1]
    paths = {name for name in git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
             if name and safe_path(name) and (ROOT / name).is_file()}
    paths.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'visual-studio/dist').rglob('*')
                 if p.is_file() and safe_path(p.relative_to(ROOT).as_posix()))
    base_commit = git('rev-parse', 'HEAD').strip()
    changed = git('status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0')
    start = f'''# QWEEPS architecture-preview snapshot

Packaged {args.date}; technical report {version}. Architecture is INCOMPLETE.
Voice explanation and measured architecture narration synchronization are PLANNED,
not implemented. Existing visual-lesson narration is a separate working route.

This archive includes the current source (including uncommitted updates), tests,
the updated report, bundled visual lessons/media, demos, Android project source,
the supplied architecture prototype update 3, and a prebuilt browser studio.
It excludes installed dependencies, credentials, local app data, build caches,
Android SDK paths, APKs and desktop native renderers.

## Run from the extracted QWEEPS directory

Install Python 3.11+ and Node.js/npm, then:

    python3 -m venv .venv
    # Activate .venv using your platform's command.
    python -m pip install -e .
    npm ci
    python -m assistant.visual.server --port 4174

Open http://127.0.0.1:4174, or /?architecture=1 for the preview.
Node dependencies are needed for architecture APIs even with the prebuilt UI.
Configure the shared OpenCode Go key/model in QWEEPS Settings / API for the tutor
and gap-filler; compilation/playback do not need an AI key. No Gemini key is used.
Changing the model transport preserves the supplied instructions and schemas.

Repository scans are sampled and the compiler is template-based, not exhaustive
whole-program analysis. Displayed source is not executed, and teaching/example
values are not verified execution traces. See docs/architecture-remix.md.
This Node-backed feature is not integrated into the current Android APK.
For existing visual-lesson speech and optional native playback, follow README.md.

For development: npm test; npm run lint; npm run architecture:check; npm run build.
Report: docs/QWEEPS_Live_Visual_Teaching_Technical_Report.pdf.
ARCHIVE-MANIFEST.json records base commit {base_commit}, pending changes, and file
hashes identifying the exact snapshot. It does not claim this tree equals HEAD.
Retain all license texts, attribution and third-party notices. This package does
not upload or create a new Zenodo version automatically.
'''.encode()
    entries = []
    output.parent.mkdir(parents=True, exist_ok=True)
    pending = output.with_suffix('.zip.tmp')
    stamp = (args.date.year, args.date.month, args.date.day, 0, 0, 0)
    try:
        with zipfile.ZipFile(pending, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            def add(name: str, data: bytes, executable: bool = False) -> None:
                scan(name, data)
                info = zipfile.ZipInfo('QWEEPS/' + name, stamp)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o100755 if executable else 0o100644) << 16
                archive.writestr(info, data)
                entries.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            for name in sorted(paths):
                p = ROOT / name
                if p.is_symlink():
                    raise ValueError(f'Symlink needs explicit review: {name}')
                add(name, p.read_bytes(), bool(p.stat().st_mode & 0o111))
            add('START-HERE.md', start)
            manifest = {
                'project': 'QWEEPS', 'packagedDate': str(args.date), 'reportVersion': version,
                'sourceRepository': 'https://github.com/acceptance27/qweeps',
                'baseCommit': base_commit, 'workingTreeIncluded': True,
                'workingTreeChanges': [line for line in changed if line],
                'architectureStatus': 'incomplete-preview', 'architectureVoiceStatus': 'planned-not-implemented',
                'architectureProvider': 'opencode-go', 'architectureAndroidIntegrated': False,
                'files': entries,
            }
            archive.writestr('QWEEPS/ARCHIVE-MANIFEST.json', json.dumps(manifest, indent=2).encode())
        with zipfile.ZipFile(pending) as archive:
            if archive.testzip() is not None:
                raise ValueError('ZIP integrity check failed')
            for entry in entries:
                if hashlib.sha256(archive.read('QWEEPS/' + entry['path'])).hexdigest() != entry['sha256']:
                    raise ValueError(f'ZIP hash mismatch: {entry["path"]}')
        pending.replace(output)
    finally:
        pending.unlink(missing_ok=True)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
    print(f'Built {output} ({len(entries)} hashed files, {output.stat().st_size / 1024 / 1024:.1f} MiB)')


if __name__ == '__main__':
    main()
