"""Blind external judge for benchmark lessons.

The judge never sees the generator's model identity or its own self-review
metadata. Frames can be supplied once compileBeat/frame capture exists.
"""
from __future__ import annotations

import json
from typing import Any, Callable

RUBRIC = """Review this visual lesson as an independent teaching referee.
Judge only what the supplied scene data establishes. Return JSON only:
{"approved": true|false,
 "blockers": [{"beat": "beat id", "problem": "...", "revision": "..."}],
 "advisories": [{"beat": "beat id", "problem": "..."}]}
A blocker is: a false mechanism, a visual that contradicts the narration, an
unreadable overlap, or a missing object required by the stated inference.
Pacing, emphasis, metaphor and style are advisories. Do not approve a blocker.
Do not infer facts from the author's intentions."""

FIELDS = ("title", "summary", "sources", "beats")


def blind_scene(scene: dict) -> dict:
    """Strip generator identity and self-review metadata before judging."""
    clean = {name: scene.get(name) for name in FIELDS if scene.get(name) is not None}
    clean["beats"] = []
    for beat in scene.get("beats", []):
        clean["beats"].append({
            "title": beat.get("title"),
            "narration": beat.get("narration"),
            "duration": beat.get("duration"),
            "camera": beat.get("camera"),
            "elements": beat.get("elements", []),
        })
    return clean


def judge(scene: dict, chat: Callable[[str, str], str]) -> dict:
    raw = chat(RUBRIC, json.dumps({"scene": blind_scene(scene)}, ensure_ascii=False))
    from assistant.visual.pedagogy import _extract_json
    from assistant.visual.plan import PlanError

    result = _extract_json(raw or "")
    if not isinstance(result, dict) or not isinstance(result.get("approved"), bool):
        raise PlanError("external judge did not return an approved boolean")
    blockers = result.get("blockers", [])
    advisories = result.get("advisories", [])
    if not isinstance(blockers, list) or not isinstance(advisories, list):
        raise PlanError("external judge returned invalid finding lists")
    if result["approved"] and blockers:
        raise PlanError("external judge approved with blockers")
    return {"approved": result["approved"], "blockers": blockers, "advisories": advisories}
