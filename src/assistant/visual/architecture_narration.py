"""One continuous architecture recording, measured against the existing scene clock."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import threading
import uuid
import wave

from .alignment import ENGINE, align_recordings, phrase_range, runtime, script_word_times, tokens
from .plan import PlanError, _text
from .synchronization import RATE

VERSION = 2
CAPTION_VERSION = 1


def measured_captions(script, times):
    """Short subtitle windows, still anchored to the recording's actual words."""
    words = script.split()
    captions, cursor, pending = [], 0, []
    for index, word in enumerate(words):
        pending.append(word)
        if len(pending) >= 18 or (len(pending) >= 8 and word.endswith(('.', '!', '?', ',', ';'))) or index == len(words) - 1:
            text = ' '.join(pending)
            count = len(tokens(text))
            matched = [t for t in times[cursor:cursor + count] if t is not None]
            if not matched:
                raise PlanError('Could not measure a spoken subtitle; no guessed caption was published.')
            captions.append({'at': .3 + matched[0][0], 'text': text})
            cursor += count
            pending = []
    return captions


def checked_scope(raw):
    if not isinstance(raw, dict):
        raise PlanError('Supply the current architecture view.')
    graph = raw.get('graph')
    steps = raw.get('steps')
    if not isinstance(graph, dict) or not isinstance(graph.get('nodes'), list) or not isinstance(graph.get('edges'), list):
        raise PlanError('Narration needs the actual architecture graph.')
    if not isinstance(steps, list) or not 1 <= len(steps) <= 40:
        raise PlanError('Narration needs 1-40 architecture beats.')
    if len(graph['nodes']) > 300 or len(graph['edges']) > 600:
        raise PlanError('Open a smaller architecture view for narration.')
    node_ids = {n['id'] for n in graph['nodes']}
    edge_ids = {e['id'] for e in graph['edges']}
    if any(e.get('source') not in node_ids or e.get('target') not in node_ids for e in graph['edges']):
        raise PlanError('Narration graph has an unknown connection endpoint.')
    seen = set()
    for step in steps:
        sid = _text(step.get('id'), 'beat ID', 200)
        if sid in seen:
            raise PlanError('Narration beat IDs must be unique.')
        seen.add(sid)
        duration = step.get('duration')
        if type(duration) not in (float, int) or not math.isfinite(duration) or not .5 <= duration <= 180:
            raise PlanError('Narration needs valid scene durations.')
        _text(step.get('narration'), 'beat narration', 6000)
        packets = step.get('packets', [])
        if not isinstance(packets, list) or len(packets) > 30:
            raise PlanError('Too many packets for a narrated beat.')
        for packet in packets:
            start, end = packet.get('start'), packet.get('end')
            if packet.get('edgeId') not in edge_ids or type(start) not in (float, int) or type(end) not in (float, int) or not math.isfinite(start + end) or not 0 <= start < end <= duration:
                raise PlanError('Narration packet must use a real edge and valid scene times.')
    return {'title': _text(raw.get('title'), 'walkthrough title', 500),
            'scope': _text(raw.get('scope', 'system'), 'scope', 200),
            'sourceCode': _text(raw.get('sourceCode'), 'source', 200000),
            'sampleInput': str(raw.get('sampleInput', ''))[:6000], 'graph': graph, 'steps': steps}


def scene_moments(scope):
    """Group simultaneous events: the narrator must not invent a sequential trace."""
    edges = {e['id']: e for e in scope['graph']['edges']}
    nodes = {n['id']: n for n in scope['graph']['nodes']}
    chapters = []
    for step in scope['steps']:
        duration = step['duration']
        events = {0.001: ['Introduce the starting inputs/context after the incoming reasoning bridge.']}
        for packet in step.get('packets', []):
            edge = edges[packet['edgeId']]
            source = nodes[edge['source']].get('label', edge['source'])
            target = nodes[edge['target']].get('label', edge['target'])
            payload = packet.get('payload', '')
            for at, text in [(packet['start'], f'{source} sends {payload} toward {target}.'),
                             (packet['end'], f'{target} receives {payload} from {source}; its preview begins updating.')]:
                at = round(max(.02, min(duration - .03, at)), 3)
                events.setdefault(at, []).append(text)
        end = min(duration - .01, max(duration * .82, max(events) + 1.65))
        events.setdefault(round(end, 3), []).append('Show the settled result and explain the takeaway: ' + step.get('takeaway', ''))
        moments = [{'target': f'cue-{i}', 'sceneTime': at, 'actions': actions}
                   for i, (at, actions) in enumerate(sorted(events.items()))]
        chapters.append({'id': step['id'], 'title': step.get('title', ''), 'narration': step['narration'],
                         'question': step.get('question', ''), 'stateBefore': step.get('stateBefore', {}),
                         'stateAfter': step.get('stateAfter', {}), 'moments': moments})
    return chapters


def validate_plan(raw, chapters):
    if not isinstance(raw, dict) or not isinstance(raw.get('chapters'), list) or [c.get('id') for c in raw['chapters']] != [c['id'] for c in chapters]:
        raise PlanError('Keep the actual architecture beat IDs and order.')
    for index, (chapter, expected) in enumerate(zip(raw['chapters'], chapters)):
        text = _text(chapter.get('narration'), 'spoken explanation', 6000)
        if re.search(r'\b[A-Za-z_]\w*\s*\([^)]*\)|\b\w+_\w+\b|\b\w+\.(?:py|tsx?|jsx?)\b|https?://', text):
            raise PlanError('Write fresh, natural spoken prose for ALL chapters. Expand function calls, underscores, file paths and URLs into spoken words; do not read source notation aloud.')
        bridge = chapter.get('bridge', '')
        if not isinstance(bridge, str) or (bridge and not text.startswith(bridge)):
            raise PlanError('A reasoning bridge must be an exact opening phrase in its narration.')
        if index and len(tokens(bridge)) < 4:
            raise PlanError('Every later bridge must be a meaningful opening clause of at least four words connecting the previous result to the next question, not just a function name.')
        anchors = chapter.get('anchors')
        if not isinstance(anchors, list) or [a.get('target') for a in anchors] != [m['target'] for m in expected['moments']]:
            raise PlanError('Anchor every existing scene moment in order, without inventing events.')
        previous = -1
        for anchor in anchors:
            lo, hi = phrase_range(text, anchor.get('phrase', ''), anchor.get('occurrence', 1))
            if lo <= previous:
                raise PlanError('Scene moments need distinct phrases in their supplied chronological order.')
            if previous < 0 and lo < len(tokens(bridge)):
                raise PlanError('Keep the previous diagram through the bridge; introduce new inputs after it.')
            previous = lo
    if len(' '.join(c['narration'] for c in raw['chapters'])) > 24000:
        raise PlanError('The continuous narration exceeds the speech recording limit.')
    return raw['chapters']


def measured_track(scope, moments, plan, alignment, duration):
    script = ' '.join(c['narration'].strip() for c in plan)
    times, coverage = script_word_times(script, alignment, duration)
    cursor = 0
    spans, measured = [], []
    for chapter, expected in zip(plan, moments):
        count = len(tokens(chapter['narration']))
        section = times[cursor:cursor + count]
        matches = [t for t in section if t is not None]
        if len(matches) / max(1, count) < .8 or not any(section[:3]) or not any(section[-3:]):
            raise PlanError('Could not measure the complete architecture narration; no guessed timeline was published.')
        spans.append((matches[0][0], matches[-1][1]))
        cues = []
        for anchor, moment in zip(chapter['anchors'], expected['moments']):
            lo, hi = phrase_range(chapter['narration'], anchor['phrase'], anchor.get('occurrence', 1))
            # Require the actual first word, rather than assigning a nearby sentence's time.
            if section[lo] is None:
                raise PlanError('Could not measure a scene cue: ' + anchor['phrase'])
            cues.append({'target': moment['target'], 'sceneTime': moment['sceneTime'],
                         'audioTime': .3 + section[lo][0], 'phrase': anchor['phrase']})
        if any(b['audioTime'] <= a['audioTime'] + .02 for a, b in zip(cues, cues[1:])):
            raise PlanError('Spoken scene cues overlap or run backwards; no guessed timeline was published.')
        measured.append(cues)
        cursor += count
    if any(b[0] < a[1] - .05 for a, b in zip(spans, spans[1:])):
        raise PlanError('Narration beats overlap in the recording.')
    boundaries = [0] + [.3 + (a[1] + b[0]) / 2 for a, b in zip(spans, spans[1:])] + [.3 + duration + 1]
    points, chapters, scene_start = [], [], 0
    for index, (step, chapter, cues) in enumerate(zip(scope['steps'], plan, measured)):
        start, end = boundaries[index:index + 2]
        points.append({'audio': start, 'scene': scene_start})
        # A flat segment retains the preceding settled frame throughout the spoken bridge.
        context = cues[0]['audioTime']
        if context > start + .01:
            points.append({'audio': context - .005, 'scene': scene_start})
        for cue in cues:
            points.append({'audio': cue['audioTime'], 'scene': scene_start + cue['sceneTime']})
        scene_end = scene_start + step['duration']
        points.append({'audio': end, 'scene': scene_end})
        chapters.append({'id': step['id'], 'start': start, 'end': end, 'narration': chapter['narration'],
                         'bridge': chapter.get('bridge', ''), 'cues': cues})
        scene_start = scene_end
    # Adjacent beats share a boundary; remove the exact duplicate rather than perturbing time.
    points = [p for i, p in enumerate(points) if not i or p != points[i - 1]]
    if any(b['audio'] <= a['audio'] or b['scene'] < a['scene'] for a, b in zip(points, points[1:])):
        raise PlanError('Measured narration mapping must be monotonic.')
    return {'version': VERSION, 'duration': boundaries[-1], 'sceneDuration': scene_start,
            'points': points, 'chapters': chapters, 'script': script,
            'captions': measured_captions(script, times), 'captionVersion': CAPTION_VERSION,
            'alignment': {'method': ENGINE, 'coverage': coverage, 'recordingCount': 1}}


class ArchitectureNarrationStore:
    def __init__(self, folder=None):
        self.folder = Path(folder or Path.home() / '.cache/qweeps/architecture-narration')
        self.lock = threading.RLock()
        self.jobs = {}
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='architecture-voice')

    def start(self, raw, cfg, narration):
        scope = checked_scope(raw)
        signature = {'version': VERSION, 'alignment': ENGINE, 'scope': scope,
                     'voice': narration.signature(), 'model': cfg.llm.visual_model}
        key = hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()
        with self.lock:
            for job in self.jobs.values():
                if job['key'] == key and job['status'] in {'preparing', 'ready'}:
                    return self.status(job['id'])
            if sum(j['status'] == 'preparing' for j in self.jobs.values()) >= 2:
                raise PlanError('Two architecture recordings are already preparing. Cancel one or wait for it to finish.')
            self.folder.mkdir(parents=True, exist_ok=True)
            job = {'id': uuid.uuid4().hex, 'key': key, 'status': 'preparing', 'stage': 'Writing one connected explanation'}
            self.jobs[job['id']] = job
            cached = self.folder / (key + '.json')
            if cached.exists():
                track = json.loads(cached.read_text())
                if track.get('captionVersion') == CAPTION_VERSION and (narration.folder / (track['key'] + '.wav')).is_file():
                    job.update(status='ready', stage='Narration ready', track=track)
                    return self.status(job['id'])
            self.pool.submit(self._prepare, job, scope, cfg, narration)
            return self.status(job['id'])

    def status(self, jid):
        with self.lock:
            if jid not in self.jobs:
                raise PlanError('Architecture narration job was not found.')
            return {k: v for k, v in self.jobs[jid].items() if k != 'key'}

    def cancel(self, jid):
        with self.lock:
            job = self.jobs.get(jid)
            if job and job['status'] == 'preparing':
                job.update(status='cancelled', stage='Narration preparation cancelled')
            return self.status(jid)

    def _stage(self, job, stage):
        with self.lock:
            if job['status'] == 'cancelled':
                raise PlanError('Narration preparation cancelled')
            job['stage'] = stage

    def _prepare(self, job, scope, cfg, narration):
        try:
            from . import architecture_remix
            self._stage(job, 'Checking speech and alignment runtimes')
            runtime()
            if not shutil.which('ffmpeg'):
                raise PlanError('Recorded architecture narration needs ffmpeg to decode the speech.')
            moments = scene_moments(scope)
            plan_file = self.folder / (job['key'] + '.plan.json')
            if plan_file.exists():
                plan = validate_plan(json.loads(plan_file.read_text()), moments)
            else:
                feedback = ''
                for attempt in range(2):
                    self._stage(job, 'Writing one connected explanation' if not attempt else 'Correcting spoken scene anchors')
                    status, result = architecture_remix.request('POST', '/api/ai/narrate',
                        {**scope, 'chapters': moments, 'feedback': feedback}, cfg=cfg)
                    if status != 200:
                        raise PlanError(result.get('error', 'Could not write the architecture narration.'))
                    try:
                        plan = validate_plan(result.get('plan'), moments)
                        break
                    except (ValueError, KeyError, TypeError) as exc:
                        if attempt: raise
                        feedback = str(exc)
                self._stage(job, 'Saving the connected explanation')
                self._write(plan_file, {'chapters': plan})
            self._stage(job, 'Recording this view as one connected explanation')
            script = ' '.join(c['narration'].strip() for c in plan)
            clip = narration.prepare_lesson(script, lambda wait: self._stage(job, 'Waiting for the speech provider'))
            self._stage(job, 'Decoding the continuous recording')
            process = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(narration.folder / (clip['key'] + '.mp3')),
                '-f', 's16le', '-acodec', 'pcm_s16le', '-ar', str(RATE), '-ac', '1', 'pipe:1'], capture_output=True, timeout=60)
            if process.returncode or not process.stdout or len(process.stdout) % 2:
                raise PlanError('Could not decode architecture narration.')
            piece = process.stdout
            duration = len(piece) / (RATE * 2)
            self._stage(job, 'Measuring spoken word times locally')
            alignment = align_recordings(narration, [{**clip, 'text': script}],
                lambda stage: self._stage(job, stage), timeout=min(900, max(180, int(duration * 1.5))))[0]
            self._stage(job, 'Matching packet and result cues to the spoken words')
            track = measured_track(scope, moments, plan, alignment, duration)
            audio_key = hashlib.sha256((job['key'] + clip['key']).encode() + piece).hexdigest()
            target = narration.folder / (audio_key + '.wav')
            pending = target.with_suffix('.' + uuid.uuid4().hex + '.tmp')
            with wave.open(str(pending), 'wb') as wav:
                wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE)
                wav.writeframes(bytes(int(.3 * RATE) * 2) + piece + bytes(RATE * 2))
            pending.replace(target)
            track.update(key=audio_key, fingerprint=job['key'], url=f'/narration/{audio_key}.wav')
            self._stage(job, 'Saving the measured narration timeline')
            self._write(self.folder / (job['key'] + '.json'), track)
            with self.lock:
                if job['status'] != 'cancelled':
                    job.update(status='ready', stage='Narration ready', track=track)
        except Exception as exc:
            with self.lock:
                if job['status'] != 'cancelled':
                    job.update(status='failed', stage='Narration unavailable', error=str(exc)[:600])

    @staticmethod
    def _write(path, value):
        pending = path.with_suffix('.' + uuid.uuid4().hex + '.tmp')
        pending.write_text(json.dumps(value, ensure_ascii=False))
        pending.replace(path)
