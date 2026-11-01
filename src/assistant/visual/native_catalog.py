"""Native ManimGL scenes a generated lesson may interleave with layout beats.

The planner picks a scene and one of its pre-authored beats. Beat windows are
fixed by the scene itself, so a chapter marked native takes that window's
duration instead of a generated one.
"""
from __future__ import annotations

from .plan import PlanError

NATIVE_SCENES = {
    "wbc": {
        "title": "How a white blood cell decides what is a threat",
        "duration": 27.1,
        "beats": [
            {"id": "contact", "title": "Contact is not yet a decision", "start": 0.0, "end": 4.6},
            {"id": "candidates", "title": "Two candidates at once", "start": 4.6, "end": 10.4},
            {"id": "pamp-detail", "title": "Inside a PAMP spike", "start": 10.4, "end": 15.2},
            {"id": "response", "title": "From match to response", "start": 15.2, "end": 23.4},
            {"id": "rule", "title": "The decision rule", "start": 23.4, "end": 27.1},
        ],
    },
    "blood3d": {
        "title": "How blood is made, in 3D",
        "duration": 28.57,
        "beats": [
            {"id": "lattice", "title": "The marrow is a scaffold", "start": 0.0, "end": 11.0},
            {"id": "stem-cells", "title": "One stem cell becomes many", "start": 11.0, "end": 16.0},
            {"id": "lineages", "title": "Three cell lines enter the blood", "start": 16.0, "end": 28.57},
        ],
    },
}


def native_prompt() -> str:
    lines = ["Available native ManimGL scenes. A beat may use one instead of an SVG/GSAP layout.",
             "Native beats must stay in scene order and may not repeat a beat. Use them only when the",
             "scene's authored animation actually teaches this beat's inference; otherwise use a layout.",
             "A native beat still supplies teaching/presentation/continuity/narration/nodes for the",
             "transcript and inspection panels, but its duration is the scene beat's duration."]
    for scene_id, scene in NATIVE_SCENES.items():
        beats = ", ".join(f"{b['id']} ({b['start']}–{b['end']}s: {b['title']})" for b in scene["beats"])
        lines.append(f'- "{scene_id}" · {scene["title"]} · {scene["duration"]}s · beats: {beats}')
    lines.append('To use one add to that beat: "renderer":"manimgl","nativeScene":"<scene>","nativeBeat":"<beat>".')
    return "\n".join(lines)


def resolve_native(scene, beat) -> dict:
    if scene not in NATIVE_SCENES:
        raise PlanError(f"Unknown native scene '{scene}'. Choose one of {', '.join(sorted(NATIVE_SCENES))}.")
    scene_data = NATIVE_SCENES[scene]
    match = next((b for b in scene_data["beats"] if b["id"] == beat), None)
    if match is None:
        raise PlanError(f"Unknown native beat '{beat}' in '{scene}'. Choose one of {', '.join(b['id'] for b in scene_data['beats'])}.")
    return {**match, "scene": scene}
