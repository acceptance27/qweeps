"""Compile narration cues into one normalized native scene-time map.

The player should not re-derive timing from raw cues. Multiple narration cues
can share one spoken timestamp while pointing at different scene moments; a
native chapter with no matching cues still needs a sane linear fallback.

Each output point is chapter-relative audio seconds -> absolute scene seconds.
"""
from __future__ import annotations

import bisect


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


def native_map(chapter: dict, scene_cues: list[dict]) -> list[dict]:
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
