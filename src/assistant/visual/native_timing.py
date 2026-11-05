"""Compile narration cues into one normalized native scene-time map.

The player should not re-derive timing from raw cues. Multiple narration cues
can share one spoken timestamp while pointing at different scene moments; a
native chapter with no matching cues still needs a sane linear fallback.

Each output point is chapter-relative audio seconds -> absolute scene seconds.
"""
from __future__ import annotations

import bisect

from .plan import PlanError


def choose_baked_frame(times: list[float], t: float, tolerance: float = 1e-6):
    """Index of the baked keyframe nearest to t, or None before the first one.

    A group may gain a child updater later in the scene.  Restoring the first
    baked frame for an earlier t would snap the whole group to its fully-built
    future state, so a seek before the updater existed must use the normal
    animation/checkpoint state instead.
    """
    if not times or t < times[0] - tolerance:
        return None
    if t >= times[-1]:
        return len(times) - 1
    index = bisect.bisect_left(times, t)
    before, after = index - 1, index
    return after if abs(times[after] - t) < abs(t - times[before]) else before


class NativeTimingError(PlanError):
    def __init__(self, chapter, message):
        self.chapter = chapter
        super().__init__(f"Native timing for '{chapter}': {message}")


def _semantic_native_map(chapter: dict, scene_cues: list[dict]) -> list[dict]:
    """New native jobs require measured, ordered semantic events; preserve holds."""
    start, end = float(chapter['start']), float(chapter['end'])
    span = end - start
    offset = float(chapter['nativeOffset'])
    scene_end = offset + float(chapter['nativeDuration']) - .001
    handoff = max(0.0, float(chapter.get('visualStart', start)) - start)
    by_id = {cue['id']: float(cue['time']) for cue in scene_cues}
    points = [(0.0, offset)]
    if handoff:
        points.append((handoff, offset))
    for obj in chapter['nativeCueObjects']:
        target = obj['id']
        spoken = [float(cue['start']) for cue in chapter.get('narrationCues', []) if cue.get('target') == target]
        if target not in by_id or not spoken:
            raise NativeTimingError(chapter['id'], f"Native action '{target}' has no measured speech/scene anchor.")
        audio, scene = max(handoff, min(spoken)), by_id[target]
        if not 0 <= audio < span or not offset <= scene <= scene_end:
            raise NativeTimingError(chapter['id'], f"Native action '{target}' lies outside its measured chapter.")
        previous_audio, previous_scene = points[-1]
        if audio < previous_audio or scene < previous_scene:
            raise NativeTimingError(chapter['id'], 'Native speech and scene cues disagree in order; no guessed timing was published.')
        if audio == previous_audio:
            if abs(scene - previous_scene) > .001:
                raise NativeTimingError(chapter['id'], 'Distinct native actions cannot share one spoken timestamp.')
            continue
        points.append((audio, scene))
    points.append((span, scene_end))
    for left, right in zip(points, points[1:]):
        if right[1] - left[1] > .25 and (right[1] - left[1]) / max(.001, right[0] - left[0]) > 6:
            raise NativeTimingError(chapter['id'], 'Action cues would compress construction by more than 6x. '
                'Anchor setup at the actual introduction of inputs after the bridge, operation at the described change, '
                'and result at the matching conclusion. Do not use earlier introductory phrases.')
    return [{'at': round(audio, 4), 'scene': round(scene, 4)} for audio, scene in points]


def native_map(chapter: dict, scene_cues: list[dict]) -> list[dict]:
    if chapter.get('nativeCueObjects'):
        return _semantic_native_map(chapter, scene_cues)
    start = float(chapter.get("start", 0.0))
    end = float(chapter.get("end", start))
    span = max(0.01, end - start)
    offset = float(chapter.get("nativeOffset", start))
    duration = float(chapter.get("nativeDuration") or span)
    by_id = {cue["id"]: float(cue["time"]) for cue in scene_cues or []}

    mentions: dict[float, float] = {}
    for cue in chapter.get("narrationCues") or []:
        scene_time = by_id.get(cue.get("target"))
        if scene_time is None:
            continue
        audio = max(0.0, min(span, float(cue.get("start", 0.0))))
        scene_time = max(offset, min(offset + duration, scene_time))
        # Combine cues spoken at the same moment. Keep the earliest scene time
        # so the map never jumps over an animation between them.
        key = round(audio, 3)
        mentions[key] = min(scene_time, mentions.get(key, scene_time))

    # Drop inverted anchors: a later spoken cue that points back to an earlier
    # scene moment would force a clamp and skip the animation between them.
    pairs = sorted(mentions.items())
    end_scene = offset + duration
    suffix = end_scene
    keep = []
    for audio, scene_time in reversed(pairs):
        if scene_time <= suffix + 1e-6:
            keep.append((audio, scene_time))
        suffix = min(suffix, scene_time)
    keep.reverse()

    points = [(0.0, offset)]
    for audio, scene_time in keep:
        previous = points[-1]
        if audio <= previous[0] + 1e-6:
            continue
        points.append((audio, max(scene_time, previous[1])))
    points.append((span, max(end_scene, points[-1][1])))

    # Drop repeated scene times (they would hold a still frame); keep the
    # earliest audio moment that reaches that scene state.
    cleaned = []
    for audio, scene_time in points:
        if cleaned and abs(scene_time - cleaned[-1][1]) < 1e-6:
            continue
        cleaned.append((audio, scene_time))
    return [{"at": round(audio, 4), "scene": round(scene_time, 4)}
            for audio, scene_time in cleaned]


def native_time_at(chapter: dict, audio_time: float) -> float:
    """Evaluate a compiled audio-to-scene map without state, for seek/rewind/review."""
    points = chapter.get('nativeMap') or []
    if not points:
        fraction = max(0, min(1, (audio_time - chapter['start']) / max(.01, chapter['end'] - chapter['start'])))
        return chapter['nativeOffset'] + chapter['nativeDuration'] * fraction
    local = max(0, min(chapter['end'] - chapter['start'], audio_time - chapter['start']))
    if local <= points[0]['at']:
        return points[0]['scene']
    for left, right in zip(points, points[1:]):
        if local <= right['at']:
            fraction = (local - left['at']) / (right['at'] - left['at'])
            return left['scene'] + fraction * (right['scene'] - left['scene'])
    return points[-1]['scene']
