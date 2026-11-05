#!/usr/bin/env python3
"""Capture actual native frames with revision and source fingerprints for review."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import time
import uuid



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lesson', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    import sys
    sys.argv = [sys.argv[0]]  # ManimGL parses argv while importing its runtime.
    from assistant.visual.native_host import NativeHost
    from PIL import Image, ImageDraw
    lesson = json.loads(args.lesson.read_text())
    args.out.mkdir(parents=True, exist_ok=True)
    chapters = [c for c in lesson['chapters'] if c.get('renderer') == 'manimgl']
    sources = {m['source']: hashlib.sha256(Path(m['source']).read_bytes()).hexdigest()
               for m in lesson['nativeScenes'].values()}
    host = NativeHost(Path(__file__).resolve().parents[1] / 'visual-studio')
    sid = uuid.uuid4().hex
    sheet = Image.new('RGB', (1152, len(chapters) * 240), '#101c20')
    draw = ImageDraw.Draw(sheet)
    receipts = []
    try:
        for row, chapter in enumerate(chapters):
            for col, fraction in enumerate((.12, .5, .9)):
                native_time = chapter['nativeOffset'] + chapter['nativeDuration'] * fraction
                requested = host.update(sid, {'lessonId': chapter['nativeScene'],
                                            'time': native_time, 'selected': [],
                                            'camera': {'x': 0, 'y': 0, 'zoom': 1}, 'experiment': {}})
                expected = requested['expectedRevision']
                deadline = time.monotonic() + 60
                while True:
                    state = host.status(sid)
                    if state.get('ready') and state.get('revision') == expected:
                        break
                    if time.monotonic() > deadline:
                        raise RuntimeError(f'No current native frame for {chapter["id"]}')
                    time.sleep(.05)
                path = args.out / f'{row+1:02d}-{chapter["id"]}-{col+1}.jpg'
                path.write_bytes((host.jobs[sid]['folder'] / 'frame.jpg').read_bytes())
                with Image.open(path) as frame:
                    sheet.paste(frame.convert('RGB').resize((384, 216)), (col * 384, row * 240))
                draw.text((col*384+4, row*240+218), f'{chapter["id"]} | native {native_time:.2f}s', fill='white')
                receipts.append({'chapter': chapter['id'], 'fraction': fraction, 'nativeTime': native_time,
                                 'file': path.name, 'revision': expected,
                                 'frameSha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                print(f'{chapter["id"]} {fraction}: captured', flush=True)
    finally:
        host.close(sid)
    if any(hashlib.sha256(Path(p).read_bytes()).hexdigest() != digest for p, digest in sources.items()):
        raise RuntimeError('Native source changed during capture')
    sheet.save(args.out / 'contact-sheet.jpg', quality=94)
    (args.out / 'receipt.json').write_text(json.dumps({'lesson': lesson['id'], 'sourceHashes': sources,
        'frames': receipts, 'review': 'Frames captured successfully; teaching review is separate.'}, indent=2))


if __name__ == '__main__':
    main()
