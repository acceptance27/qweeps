"""Deterministic checks on a compiled native scene before it is published.

These are structural checks, not taste: overlapping labels, a duplicated
top title, and a beat whose first and last frames are identical.  The compiler
runs them in the visual environment where the scene can actually be evaluated.
"""
from __future__ import annotations


def _nearly_equal(a, b, tolerance=1e-3):
    return all(abs(float(x) - float(y)) <= tolerance for x, y in zip(a, b))


def _visible_texts(scene, t):
    scene.evaluate(t, [], None)
    found = {}
    tops = list(scene.mobjects)
    if not getattr(scene, "scene_baked", None):
        for mobs in getattr(scene, "roles", {}).values():
            tops.extend(mobs)
    for top in tops:
        try:
            family = top.get_family()
        except AttributeError:
            continue
        for mob in family:
            text = getattr(mob, "text", None)
            if not isinstance(text, str) or not text.strip():
                continue
            try:
                if mob.get_width() < 0.04 or mob.get_height() < 0.02:
                    continue
                opacities = []
                for part in mob.family_members_with_points():
                    try:
                        opacities.append(max(part.get_fill_opacity(), part.get_stroke_opacity()))
                    except AttributeError:
                        opacities.append(float(getattr(part, "opacity", 1)))
                if opacities and max(opacities) <= 0.08:
                    continue
                lo = mob.get_bounding_box()[0]
                hi = mob.get_bounding_box()[2]
            except (AttributeError, ValueError):
                continue
            found.setdefault(id(mob), (id(mob), text,
                                       [float(lo[0]), float(lo[1]), float(hi[0]), float(hi[1])]))
    return list(found.values())


def _active_transform_ids(scene, t):
    """Mobjects taking part in a transform that is on screen at `t`."""
    ids = set()
    for start, length, anim in getattr(scene, "tracks", []):
        if not (start - 0.05 <= t <= start + length + 0.05):
            continue
        if not hasattr(anim, "target_mobject"):
            continue
        for mob in (anim.mobject, getattr(anim, "target_mobject", None)):
            if hasattr(mob, "get_family"):
                ids.update(id(part) for part in mob.get_family())
    return ids


def _overlap(a, b):
    width = min(a[2], b[2]) - max(a[0], b[0])
    height = min(a[3], b[3]) - max(a[1], b[1])
    if width <= 0 or height <= 0:
        return 0.0
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return (width * height) / smaller if smaller > 0 else 0.0


def _iou(a, b):
    width = min(a[2], b[2]) - max(a[0], b[0])
    height = min(a[3], b[3]) - max(a[1], b[1])
    if width <= 0 or height <= 0:
        return 0.0
    intersection = width * height
    union = ((a[2] - a[0]) * (a[3] - a[1])
             + (b[2] - b[0]) * (b[3] - b[1]) - intersection)
    return intersection / union if union > 0 else 0.0


def _sample_times(scene):
    beats = list(getattr(scene, "beats", []) or [])
    duration = float(getattr(scene, "duration", 0.0))
    if not beats:
        count = 8
        return [duration * (i + 0.5) / count for i in range(count)]
    times = []
    for index, beat in enumerate(beats):
        start = float(beat.get("time", 0.0))
        end = (float(beats[index + 1]["time"]) if index + 1 < len(beats) else duration)
        span = max(0.0, end - start)
        for fraction in (0.25, 0.55, 0.85):
            times.append(min(duration, start + span * fraction))
    deduped = []
    for t in times:
        if not deduped or abs(t - deduped[-1]) > 0.2:
            deduped.append(t)
    return deduped


def audit_scene(scene, collision_threshold: float = 0.32,
                static_threshold: float = 0.1) -> list[dict]:
    findings = []
    duration = float(getattr(scene, "duration", 0.0))
    if duration <= 0:
        return [{"code": "empty-scene", "detail": "scene has no duration"}]

    for t in _sample_times(scene):
        texts = _visible_texts(scene, t)
        active = _active_transform_ids(scene, t)
        for i, (id_a, text_a, box_a) in enumerate(texts):
            for id_b, text_b, box_b in texts[i + 1:]:
                if text_a == text_b:
                    continue  # duplicate handling is separate
                # Morphing a label in place puts its source and target in the
                # same box for the duration of the transform; that is one
                # label, not a collision.
                if id_a in active and id_b in active:
                    continue
                if _nearly_equal(box_a, box_b):
                    continue
                if _iou(box_a, box_b) >= 0.9:
                    continue
                ratio = _overlap(box_a, box_b)
                if ratio >= collision_threshold:
                    findings.append({
                        "code": "label-collision",
                        "time": round(t, 2),
                        "detail": f"{text_a!r} overlaps {text_b!r} ({ratio:.0%})",
                    })
                    break

    # A duplicated top title is almost always the scene plus the lesson HUD.
    templates = [text for _id, text, box in _visible_texts(scene, min(0.5, duration))
                 if box[1] > 2.0]
    seen = {}
    for text in templates:
        seen[text] = seen.get(text, 0) + 1
    for text, count in seen.items():
        if count > 1:
            findings.append({"code": "duplicate-title", "time": 0.5,
                             "detail": f"{text!r} appears {count} times near the top"})

    # Each beat must actually change. First require a non-wait animation in
    # the beat, then compare several frames so a slow crossfade is not called
    # static just because its first and last frames happen to look alike.
    beats = list(getattr(scene, "beats", []) or [])
    if beats:
        for index, beat in enumerate(beats):
            start = float(beat.get("time", 0.0))
            end = (float(beats[index + 1]["time"]) if index + 1 < len(beats) else duration)
            if end - start < 1.5:
                continue
            moving = any(
                track_start < end - 1e-6 and track_start + track_length > start + 1e-6
                for track_start, track_length, _anim in getattr(scene, "tracks", [])
            )
            if not moving:
                findings.append({
                    "code": "static-beat",
                    "beat": beat.get("id"),
                    "time": round(start, 2),
                    "detail": "beat contains no animation",
                })
                continue
            span = end - start
            frames = [_frame(scene, start + span * fraction)
                      for fraction in (0.06, 0.2, 0.5, 0.8, 0.96)]
            frames = [frame for frame in frames if frame is not None]
            if len(frames) < 2:
                continue
            try:
                import numpy as np

                first = frames[0].astype(np.float32)
                diff = max(float(np.mean(np.abs(first - frame.astype(np.float32))))
                           for frame in frames[1:])
            except ImportError:
                continue
            if diff < static_threshold:
                findings.append({
                    "code": "static-beat",
                    "beat": beat.get("id"),
                    "time": round(start, 2),
                    "detail": f"sampled frames differ by only {diff:.3f}",
                })

    # Collapse repeats while keeping order.
    if getattr(scene, "_contract", None) is not None or getattr(scene, "CONTRACT", None) is not None:
        from .scene_contract import audit_contract_scene

        findings.extend(audit_contract_scene(scene))

    unique = []
    seen_findings = set()
    for finding in findings:
        key = (finding["code"], finding.get("beat"), finding.get("field"),
               finding.get("zone"), finding.get("detail"))
        if key not in seen_findings:
            seen_findings.add(key)
            unique.append(finding)
    return unique


def _frame(scene, t):
    try:
        import numpy as np

        scene.evaluate(t, [], None)
        scene.update_frame(0, force_draw=True)
        image = scene.camera.get_image().convert("RGB")
        return np.asarray(image)
    except Exception:
        return None
