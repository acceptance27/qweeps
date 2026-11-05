"""Capture review images from the same native renderer used by lesson playback."""
from __future__ import annotations
import hashlib
from pathlib import Path
import time
import uuid

from .native_host import NativeHost
from .plan import PlanError
from .native_timing import native_time_at


def capture_native_frames(studio, lesson):
    host = NativeHost(studio)
    sid = uuid.uuid4().hex
    frames, labels, sources = [], [], {}
    try:
        for index, chapter in enumerate(lesson['chapters']):
            if chapter.get('renderer') != 'manimgl':
                continue
            manifest = lesson['nativeScenes'][chapter['nativeScene']]
            source = Path(manifest['source'])
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            sources[source] = digest
            for position, fraction in [('early', .12), ('middle', .5), ('finished', .9)]:
                visual_start = chapter.get('visualStart', chapter['start'])
                audio_time = visual_start + (chapter['end'] - visual_start) * fraction
                native_time = native_time_at(chapter, audio_time)
                result = host.update(sid, {'lessonId': chapter['nativeScene'], 'time': native_time,
                    'selected': [], 'camera': {'x': 0, 'y': 0, 'zoom': 1}, 'experiment': {}})
                expected = result['expectedRevision']
                deadline = time.monotonic() + 90
                while True:
                    state = host.status(sid)
                    if state.get('ready') and state.get('revision') == expected:
                        break
                    if time.monotonic() > deadline:
                        raise PlanError(f"Native review frame did not arrive for '{chapter['id']}'.")
                    time.sleep(.05)
                frame = (host.jobs[sid]['folder'] / 'frame.jpg').read_bytes()
                if not frame.startswith(b'\xff\xd8') or len(frame) < 500:
                    raise PlanError('Native review did not return a valid current image.')
                frames.append(frame)
                labels.append({'chapter': index, 'position': position, 'nativeTime': native_time,
                    'time': audio_time,
                    'renderer': 'manimgl', 'sourceSha256': digest,
                    'frameSha256': hashlib.sha256(frame).hexdigest(), 'revision': expected})
        if any(hashlib.sha256(path.read_bytes()).hexdigest() != digest for path, digest in sources.items()):
            raise PlanError('Native source changed during frame review; review the new source again.')
        return frames, labels
    finally:
        host.close(sid)
