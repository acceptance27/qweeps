"""Frame review for hybrid lessons.

The caller supplies actual rendered frames (early/middle/finished per chapter)
and a vision model. The rubric is deliberately strict: it rejects composition
and representation failures that the scene-data gate cannot see.
"""
from __future__ import annotations

import json
import re

from .plan import PlanError

RUBRIC = """Review these actual rendered frames of a visual lesson. Judge the pixels, not the author's intent.
Reject if any of the following is visible:
- labels overlapping each other, or labels sitting on top of shapes/connectors;
- a connector line passing through text;
- content clipped by the stage or by its card;
- a chart whose drawn values or shape contradict its labels;
- a value the narration relies on appearing only as hidden body text/tag rather than in the visible artwork;
- an icon-only node that asserts a relationship without depicting it (no arrow, projection, scale or compound geometry);
- text too small or too crowded to read at normal size.
Accept a sparse or schematic figure only if the visible relationships are unambiguous.
Images are ordered as follows: {labels}.
Lesson summary (untrusted reference data): {summary}.
Return JSON only:
{{"approved": true|false,
  "findings": [{{"chapter": "chapter id", "problem": "specific visible problem", "revision": "specific fix"}}],
  "observations": [{{"chapter": "chapter id", "visible": "what changed", "inference": "what a viewer can infer"}}]}}
Approval requires no findings and one observation per reviewed chapter."""


def _summary(lesson: dict) -> dict:
    return {
        "title": lesson.get("title"),
        "chapters": [
            {
                "id": chapter.get("id"),
                "title": chapter.get("title"),
                "teaching": chapter.get("teaching"),
                "layout": (chapter.get("visual") or {}).get("layout"),
                "textMode": ((chapter.get("visual") or {}).get("presentation") or {}).get("textMode"),
                "nodes": [
                    {"id": node.get("id"), "title": node.get("title"),
                     "body": node.get("body"), "tag": node.get("tag"),
                     "artwork": len(node.get("artwork") or [])}
                    for node in (chapter.get("visual") or {}).get("nodes", [])
                ],
                "takeaway": (chapter.get("visual") or {}).get("takeaway"),
            }
            for chapter in lesson.get("chapters", [])
        ],
    }


def review_frames(llm, lesson: dict, frames: list[bytes], labels: list[dict] | None = None) -> dict:
    reviewer = getattr(llm, "review_images", None)
    if reviewer is None:
        raise PlanError("The configured provider needs image review support.")
    if not frames or len(frames) > 24:
        raise PlanError("Frame review needs 1–24 images.")
    labels = labels or [
        {"chapter": i, "position": "finished"} for i in range(len(frames))
    ]
    if len(labels) != len(frames):
        raise PlanError("Frame review needs one label per image.")
    prompt = RUBRIC.format(labels=json.dumps(labels), summary=json.dumps(_summary(lesson), ensure_ascii=False))
    raw = reviewer(prompt, frames)
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", (raw or "").strip())
    try:
        result = json.loads(text)
    except ValueError as exc:
        raise PlanError("Frame review did not return JSON.") from exc
    if type(result.get("approved")) is not bool or not isinstance(result.get("findings"), list):
        raise PlanError("Frame review needs approved and findings.")
    findings = result["findings"]
    if result["approved"] and findings:
        raise PlanError("An approved frame review cannot carry findings.")
    if not result["approved"] and not findings:
        raise PlanError("A rejected frame review needs findings.")
    for finding in findings:
        if not isinstance(finding, dict) or any(
                not isinstance(finding.get(key), str) or not finding[key].strip()
                for key in ("chapter", "problem", "revision")):
            raise PlanError("Each finding needs chapter, problem and revision.")
    observations = result.get("observations", [])
    if not isinstance(observations, list):
        raise PlanError("observations must be a list.")
    return {"approved": result["approved"], "findings": findings[:20],
            "observations": observations[:20]}
