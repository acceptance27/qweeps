"""Shared visual contract for native Manim and browser-layout chapters.

The two renderers use different coordinate systems, palettes and object models.
This contract gives them one shared description of the stage, palette, anchors,
focal budget and chapter transitions.  The Director fills it; the native prompt
and the player both consume it.
"""
from __future__ import annotations

PALETTE = {
    "blue": "#8BD0DF",
    "gold": "#EDCA82",
    "green": "#9DCEB1",
    "coral": "#EDA994",
    "purple": "#C4B0E2",
    "ink": "#E6ECEB",
    "muted": "#7899A5",
    "background": "#071117",
}

TYPOGRAPHY = {
    "title": 34,
    "heading": 26,
    "label": 20,
    "caption": 18,
    "small": 16,
}

# Manim frame coordinates (14.22 x 8.00).  Layout uses normalized equivalents.
ZONES = {
    "title": {"x": -6.9, "y": 3.05, "width": 13.8, "height": 0.85},
    "left": {"x": -6.7, "y": -2.6, "width": 5.8, "height": 5.3},
    "right": {"x": 0.9, "y": -2.6, "width": 5.8, "height": 5.3},
    "full": {"x": -6.7, "y": -2.6, "width": 13.4, "height": 5.3},
    "caption": {"x": -6.7, "y": -3.75, "width": 13.4, "height": 0.65},
}

DEFAULT_TRANSITION = {"type": "fade", "duration": 0.35}


def _zone_for(beat: dict, index: int) -> str:
    layout = (beat.get("layout") or "").lower()
    if layout in {"timeline", "comparison", "matrix", "loci", "fanin"}:
        return "full"
    if layout in {"diagram", "process"}:
        return "left"
    return "full"


def base_contract(story: dict) -> dict:
    """Build the renderer-independent part of the contract from the storyboard."""
    beats = list(story.get("beats") or [])
    retained = [set(str(item) for item in (beat.get("retain") or []))
                for beat in beats]
    later = retained[1:] if len(retained) > 1 else retained
    persistent = sorted(set.intersection(*later)) if later and all(later) else []
    plan = []
    for index, beat in enumerate(beats):
        plan.append({
            "id": beat.get("id"),
            "zone": _zone_for(beat, index),
            "focalCap": 3,
            "camera": "static",
            "enter": [],
            "exit": [],
        })
    transitions = []
    for left, right in zip(plan, plan[1:]):
        transitions.append({
            "from": left["id"],
            "to": right["id"],
            **DEFAULT_TRANSITION,
            "shared": list(persistent),
        })
    return {
        "palette": dict(PALETTE),
        "typography": dict(TYPOGRAPHY),
        "zones": {key: dict(value) for key, value in ZONES.items()},
        "persistent": persistent,
        "beats": plan,
        "transitions": transitions,
        "opening": {"type": "fade", "duration": 0.4},
        "closing": {"type": "fade", "duration": 0.4},
    }


def enrich_contract(contract: dict, candidate: dict) -> dict:
    """Attach directed node IDs and per-beat exits from the layout Director."""
    chapters = {chapter.get("id"): chapter for chapter in candidate.get("chapters") or []}
    beats = [dict(row) for row in contract.get("beats") or []]
    previous_enter: list[str] = []
    for row in beats:
        chapter = chapters.get(row["id"]) or {}
        nodes = [node.get("id") for node in (chapter.get("visual") or {}).get("nodes") or []
                 if node.get("id")]
        row["enter"] = nodes[:row.get("focalCap", 3)]
        row["exit"] = [node for node in previous_enter if node not in row["enter"]]
        previous_enter = row["enter"]
    contract = dict(contract)
    contract["beats"] = beats
    return contract


def layout_contract(contract: dict) -> dict:
    """The subset safe to send to the browser Director, which uses pixels."""
    return {key: contract.get(key) for key in
            ("palette", "typography", "persistent", "transitions")}


def contract_prompt(contract: dict) -> list[str]:
    """Compact prompt lines for the native Manim code generator."""
    palette = ", ".join(f"{name} {value}" for name, value in (contract.get("palette") or {}).items())
    type_scale = ", ".join(f"{name} {value}" for name, value in (contract.get("typography") or {}).items())
    zones = "; ".join(
        f"{name} x={zone['x']} y={zone['y']} w={zone['width']} h={zone['height']}"
        for name, zone in (contract.get("zones") or {}).items())
    persistent = ", ".join(contract.get("persistent") or ["none"])
    lines = [
        "",
        "SHARED VISUAL CONTRACT (must match the layout chapters):",
        f"Palette: {palette}.",
        "Use these exact hex values for shared roles; do not substitute CE named colors.",
        f"Typography: {type_scale}.",
        f"Stage zones in Manim frame coordinates: {zones}.",
        f"Persistent anchors across chapters: {persistent}.",
        "Do not add a lesson title; the player header supplies it.",
        "Keep at most three focal groups plus one caption at a time. "
        "At each beat, fade out the previous beat's focal group before adding the next "
        "unless it is a persistent anchor.",
    ]
    for row in contract.get("beats") or []:
        enter = ", ".join(row.get("enter") or []) or "none"
        exit_ = ", ".join(row.get("exit") or []) or "none"
        lines.append(
            f'- {row.get("id")}: zone={row.get("zone")}, focalCap={row.get("focalCap", 3)}, '
            f"enter=[{enter}], exit=[{exit_}], camera={row.get('camera', 'static')}.")
    opening = contract.get("opening") or {}
    closing = contract.get("closing") or {}
    lines += [
        f"Opening: fade the stage/HUD in over {opening.get('duration', 0.4)}s; never snap it on.",
        f"Closing: hold or fade the stage out over {closing.get('duration', 0.4)}s; never end on a hard cut.",
        "Chapter transitions are fades; keep persistent anchors in the same screen position.",
    ]
    return lines
