"""Hybrid lesson compiler: slot-based planning lowered to the live chapter schema.

The model writes chapters, layouts, slots and template data. It never writes
world coordinates. This module validates the plan, computes node boxes from a
layout template, expands declarative artwork, and hands the result to the live
validator (`browser_lessons.validate_lesson`).
"""
from __future__ import annotations

import math
from typing import Any

from .plan import PlanError, _text
from .browser_lessons import COLORS, LAYOUTS, validate_lesson, validate_presentation
from .diagrams import validate_diagram

TEMPLATES = {"weight-dial", "sum-node", "number-line", "sigmoid-plot",
             "vote-bar", "output-ring"}
MAX_ART = 8
ART_PAINTS = {"blue", "gold", "green", "coral", "purple", "white", "muted", "none"}
DIAGRAM = (45.0, 110.0, 1395.0, 505.0)
STAGE = (0.0, 0.0, 1440.0, 800.0)

SLOT_LIMITS = (3, 6)
CHAPTER_LIMITS = (2, 8)

# The teaching operation is chosen before the layout. The layout must be able to
# execute that operation; this is where the benchmark's topology errors died.
TEACHING_LAYOUTS = {
    "construction": {"diagram"},
    "mechanism": {"fanin", "diagram"},
    "quantitative": {"diagram", "matrix"},
    "comparison": {"comparison", "matrix"},
    "procedure": {"process", "timeline"},
    "algorithm": {"timeline", "process"},
    "narrative": {"timeline"},
    "recall": {"loci", "concept"},
}
QUANT_TEMPLATES = {"number-line", "sigmoid-plot", "vote-bar", "sum-node", "output-ring"}
CHAIN_LAYOUTS = {"process"}


def _num(value, name: str, low: float = -1e6, high: float = 1e6) -> float:
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise PlanError(f"{name} must be a finite number between {low:g} and {high:g}")
    return float(value)


def _label(value, name: str, limit: int) -> str:
    return _text(value, name, limit)


def _validated_art(art: Any, color: str) -> list[dict]:
    """Validate model-authored primitives in the 0–100 node space."""
    if not isinstance(art, list) or not 1 <= len(art) <= MAX_ART:
        raise PlanError(f"artwork must be a list of 1–{MAX_ART} primitives")
    probe = {"position": {"x": 100, "y": 150, "width": 200, "height": 150},
             "artwork": art, "motion": [], "color": color}
    return validate_diagram(probe)["artwork"]


def _optional_label(value, name: str, limit: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise PlanError(f"{name} must be text")
    value = value.strip()
    if len(value) > limit:
        raise PlanError(f"{name} exceeds {limit} characters")
    return value


def _slot_art(slot: dict) -> list[dict]:
    """Expand a template, or validate model-authored artwork, in 0–100 space."""
    authored = slot.get("artwork")
    template = slot.get("template")
    if authored is not None and template:
        raise PlanError("a slot may carry artwork or a template, not both")
    if authored is not None:
        return _validated_art(authored, slot.get("color", "blue"))
    if not template:
        return []
    if template not in TEMPLATES:
        raise PlanError(f"unknown slot template '{template}'; use one of {sorted(TEMPLATES)}")
    data = slot.get("data")
    if not isinstance(data, dict):
        raise PlanError(f"slot '{slot['slot']}' template '{template}' needs a data object")

    if template == "weight-dial":
        weight = _num(data.get("weight"), f"{template}.weight", -10, 10)
        product = _num(data.get("product"), f"{template}.product", -10, 10)
        return [
            {"type": "circle", "cx": 50, "cy": 46, "r": 24},
            {"type": "line", "x1": 50, "y1": 70, "x2": 50, "y2": 78},
            {"type": "line", "x1": 16, "y1": 78, "x2": 84, "y2": 78},
            {"type": "path", "d": "M77 73 L84 78 L77 83 Z", "fill": "blue"},
            {"type": "text", "x": 50, "y": 14, "size": 10, "fill": "white",
             "text": f"w = {weight:g}"},
            {"type": "text", "x": 50, "y": 93, "size": 11, "fill": "blue",
             "text": f"{product:+g}"},
        ]

    if template == "sum-node":
        terms = data.get("terms")
        if not isinstance(terms, list) or not 1 <= len(terms) <= 5:
            raise PlanError(f"{template}.terms must be a list of 1–5 numbers")
        values = [_num(v, f"{template}.term", -1e5, 1e5) for v in terms]
        total = _num(data.get("total"), f"{template}.total", -1e5, 1e5)
        # The live renderer draws 100-unit artwork at a fixed small scale;
        # keep the hub to two readable lines and let titles/edges carry the terms.
        return [
            {"type": "circle", "cx": 50, "cy": 50, "r": 35},
            {"type": "text", "x": 50, "y": 44, "size": 10, "fill": "white", "text": "Σ"},
            {"type": "text", "x": 50, "y": 66, "size": 10, "fill": "green",
             "text": f"{total:g}"},
        ]

    if template == "number-line":
        low = _num(data.get("min"), f"{template}.min", -1e5, 1e5)
        high = _num(data.get("max"), f"{template}.max", -1e5, 1e5)
        value = _num(data.get("value"), f"{template}.value", -1e5, 1e5)
        if high <= low or not low <= value <= high:
            raise PlanError(f"{template} needs min < value <= max")
        x = 10 + 80 * (value - low) / (high - low)
        return [
            {"type": "line", "x1": 8, "y1": 55, "x2": 92, "y2": 55},
            {"type": "line", "x1": 8, "y1": 49, "x2": 8, "y2": 61},
            {"type": "line", "x1": 92, "y1": 49, "x2": 92, "y2": 61},
            {"type": "circle", "cx": round(x, 1), "cy": 55, "r": 5,
             "fill": "blue"},
            {"type": "text", "x": 50, "y": 82, "size": 10, "fill": "white",
             "text": f"{value:g}"},
        ]

    if template == "sigmoid-plot":
        value = _num(data.get("input"), f"{template}.input", -20, 20)
        output = _num(data.get("output"), f"{template}.output", 0, 1)
        points = []
        for index in range(13):
            z = -6 + 12 * index / 12
            y = 1 / (1 + math.exp(-z))
            points.append(f"{10 + 80 * index / 12:.2f},{80 - 60 * y:.2f}")
        x = 10 + 80 * (max(-6, min(6, value)) + 6) / 12
        y = 80 - 60 * output
        return [
            {"type": "line", "x1": 10, "y1": 80, "x2": 90, "y2": 80},
            {"type": "line", "x1": 10, "y1": 20, "x2": 10, "y2": 80},
            {"type": "path", "d": "M " + " L ".join(points)},
            {"type": "line", "x1": round(x, 1), "y1": 80, "x2": round(x, 1),
             "y2": round(y, 1), "stroke": "green"},
            {"type": "circle", "cx": round(x, 1), "cy": round(y, 1), "r": 3.2,
             "fill": "coral"},
            {"type": "text", "x": 50, "y": 94, "size": 8, "fill": "white",
             "text": f"z={value:g} -> y={output:g}"},
        ]

    if template == "vote-bar":
        value = _num(data.get("value"), f"{template}.value", -1e5, 1e5)
        sign = 1 if value >= 0 else -1
        length = min(38, abs(value) * 10)
        x2 = 50 + sign * length
        return [
            {"type": "line", "x1": 12, "y1": 55, "x2": 88, "y2": 55},
            {"type": "line", "x1": 50, "y1": 47, "x2": 50, "y2": 63},
            {"type": "line", "x1": 50, "y1": 55, "x2": round(x2, 1), "y2": 55,
             "stroke": "blue" if value >= 0 else "coral", "strokeWidth": 3},
            {"type": "circle", "cx": round(x2, 1), "cy": 55, "r": 2.4,
             "fill": "blue" if value >= 0 else "coral"},
            {"type": "text", "x": 50, "y": 78, "size": 9, "fill": "white",
             "text": f"{value:+g}"},
        ]

    # output-ring
    value = _num(data.get("value"), f"{template}.value", -1e5, 1e5)
    label = _label(data.get("label", ""), f"{template}.label", 30)
    return [
        {"type": "circle", "cx": 50, "cy": 46, "r": 34},
        {"type": "circle", "cx": 50, "cy": 46, "r": 27, "stroke": "green"},
        {"type": "text", "x": 50, "y": 44, "size": 14, "fill": "green",
         "text": f"{value:g}"},
        {"type": "text", "x": 50, "y": 60, "size": 8, "fill": "muted",
         "text": label},
    ]


def _place_diagram(count: int, ids: list[str] | None = None,
                   connections: list[dict] | None = None) -> list[dict]:
    """Place nodes by graph shape: sources left, hub right, chains left-to-right."""
    ids = list(ids or [f"slot-{i}" for i in range(count)])
    incoming = {eid: 0 for eid in ids}
    for link in connections or []:
        if link.get("to") in incoming:
            incoming[link["to"]] += 1
    hub = None
    if count <= 4 and incoming:
        top = max(incoming.values())
        if top >= 2:
            hub = next(eid for eid in reversed(ids) if incoming[eid] == top)

    if hub is not None:
        sources = [eid for eid in ids if eid != hub]
        boxes: dict[str, dict] = {}
        if len(sources) == 2:
            for index, eid in enumerate(sources):
                boxes[eid] = {"x": 60.0, "y": 112.0 + index * 203.0,
                              "width": 360.0, "height": 185.0}
        else:
            for index, eid in enumerate(sources):
                boxes[eid] = {"x": 60.0, "y": 115.0 + index * 130.0,
                              "width": 380.0, "height": 120.0}
        boxes[hub] = {"x": 760.0, "y": 170.0, "width": 560.0, "height": 280.0}
        return [boxes[eid] for eid in ids]

    if count <= 6 and max(incoming.values() or [0]) <= 1:
        # A chain reads left to right.
        gap, left, right, height, y = 100.0, 45.0, 1395.0, 250.0, 140.0
        width = (right - left - (count - 1) * gap) / count
        return [{"x": round(left + index * (width + gap), 1), "y": y,
                 "width": round(width, 1), "height": height}
                for index in range(count)]

    if count <= 4:
        columns, rows = (2, 2) if count > 2 else (1, 2)
    else:
        columns, rows = 3, 2
    left, top, right, bottom = DIAGRAM
    gap = 26.0
    cell_w = (right - left - (columns - 1) * gap) / columns
    cell_h = min(190.0, (bottom - top - (rows - 1) * gap) / rows)
    boxes = []
    for index in range(count):
        row, column = divmod(index, columns)
        if count == 3 and index == 2:
            row, column = 1, 0
        boxes.append({
            "x": round(left + column * (cell_w + gap), 1),
            "y": round(top + row * (cell_h + gap), 1),
            "width": round(cell_w, 1),
            "height": round(cell_h, 1),
        })
    return boxes


def validate_hybrid_plan(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise PlanError("hybrid plan must be an object")
    out = {
        "title": _label(raw.get("title"), "title", 150),
        "question": _label(raw.get("question"), "question", 250),
        "representation": _label(raw.get("representation"), "representation", 1800),
    }
    example = raw.get("example")
    if not isinstance(example, dict):
        raise PlanError("hybrid plan needs a worked example")
    out["example"] = {
        "title": _label(example.get("title"), "example title", 90),
        "description": _label(example.get("description"), "example description", 300),
        "icon": _label(example.get("icon", "cpu"), "example icon", 40),
    }
    chapters = raw.get("chapters")
    if not isinstance(chapters, list) or not CHAPTER_LIMITS[0] <= len(chapters) <= CHAPTER_LIMITS[1]:
        raise PlanError(f"hybrid lesson needs {CHAPTER_LIMITS[0]}–{CHAPTER_LIMITS[1]} chapters")
    seen = set()
    out["chapters"] = []
    for index, chapter in enumerate(chapters):
        if not isinstance(chapter, dict):
            raise PlanError("chapter must be an object")
        cid = _label(chapter.get("id"), "chapter id", 64)
        if cid in seen:
            raise PlanError(f"duplicate chapter id '{cid}'")
        seen.add(cid)
        teaching = chapter.get("teaching")
        if teaching not in TEACHING_LAYOUTS:
            raise PlanError(
                f"chapter '{cid}' needs a teaching method; use one of {sorted(TEACHING_LAYOUTS)}")
        layout = chapter.get("layout")
        if layout not in LAYOUTS:
            raise PlanError(f"chapter '{cid}' layout must be one of {sorted(LAYOUTS)}")
        if layout not in TEACHING_LAYOUTS[teaching]:
            raise PlanError(
                f"chapter '{cid}' teaching '{teaching}' needs layout "
                f"{sorted(TEACHING_LAYOUTS[teaching])}, not '{layout}'")
        slots = chapter.get("slots")
        if not isinstance(slots, list) or not SLOT_LIMITS[0] <= len(slots) <= SLOT_LIMITS[1]:
            raise PlanError(f"chapter '{cid}' needs {SLOT_LIMITS[0]}–{SLOT_LIMITS[1]} slots")
        node_ids = set()
        nodes = []
        for slot in slots:
            if not isinstance(slot, dict):
                raise PlanError(f"chapter '{cid}' slot must be an object")
            sid = _label(slot.get("slot"), f"{cid} slot id", 64)
            if sid in node_ids:
                raise PlanError(f"chapter '{cid}' has duplicate slot '{sid}'")
            node_ids.add(sid)
            color = slot.get("color", "blue")
            if color not in COLORS:
                raise PlanError(f"chapter '{cid}' slot '{sid}' color must be one of {sorted(COLORS)}")
            at = _num(slot.get("at", 1 + len(nodes) * 3), f"{cid}.{sid}.at", 0, 55)
            node = {
                "id": sid,
                "title": _label(slot.get("title"), f"{cid}.{sid}.title", 65),
                "body": _label(slot.get("body"), f"{cid}.{sid}.body", 250),
                "icon": _label(slot.get("icon", "document"), f"{cid}.{sid}.icon", 40),
                "color": color,
                "tag": _label(slot.get("tag", ""), f"{cid}.{sid}.tag", 70) if slot.get("tag") else "",
                "at": round(at, 2),
            }
            node["artwork"] = _slot_art({**slot, "slot": sid})
            if len(node["artwork"]) > MAX_ART:
                raise PlanError(f"slot '{sid}' expands to {len(node['artwork'])} primitives; max {MAX_ART}")
            nodes.append(node)
        presentation = chapter.get("presentation")
        if not isinstance(presentation, dict):
            raise PlanError(f"chapter '{cid}' needs a presentation object")
        presentation = validate_presentation(presentation, layout)
        connections = chapter.get("connections", [])
        if not isinstance(connections, list) or len(connections) > 8:
            raise PlanError(f"chapter '{cid}' connections must be a list of at most 8")
        clean_links = []
        for link in connections:
            if not isinstance(link, dict):
                raise PlanError(f"chapter '{cid}' connection must be an object")
            source, target = link.get("from"), link.get("to")
            if source not in node_ids or target not in node_ids or source == target:
                raise PlanError(f"chapter '{cid}' connection must join two different slots")
            clean_links.append({"from": source, "to": target,
                                "label": _optional_label(link.get("label", ""), f"{cid}.link", 60)})
        if layout in {"comparison", "process", "timeline", "fanin"} and len(nodes) > 4:
            raise PlanError(
                f"chapter '{cid}' has {len(nodes)} slots; {layout} supports at most 4. "
                "Split the chapter or use diagram/concept.")
        if layout == "diagram" and len(nodes) > 3:
            raise PlanError(
                f"chapter '{cid}' uses diagram with {len(nodes)} nodes; diagram supports "
                "at most 3. Use process for up to 4 text cards, or split the chapter.")
        if layout == "fanin":
            incoming = {}
            for link in clean_links:
                incoming[link["to"]] = incoming.get(link["to"], 0) + 1
            if max(incoming.values() or [0]) < 2:
                raise PlanError(
                    f"chapter '{cid}' uses fanin without a hub that collects 2+ inputs; "
                    "use process for a sequence or diagram for simple geometry.")
        if teaching == "quantitative" and not any(
                slot.get("template") in QUANT_TEMPLATES for slot in slots):
            raise PlanError(
                f"chapter '{cid}' teaches a quantity but none of its slots uses a "
                f"quantitative template {sorted(QUANT_TEMPLATES)}")
        if layout in CHAIN_LAYOUTS:
            incoming = {}
            outgoing = {}
            for link in clean_links:
                incoming[link["to"]] = incoming.get(link["to"], 0) + 1
                outgoing[link["from"]] = outgoing.get(link["from"], 0) + 1
            if max(incoming.values() or [0]) > 1 or max(outgoing.values() or [0]) > 1:
                raise PlanError(
                    f"chapter '{cid}' uses process for a branching graph; use fanin or "
                    "diagram for several inputs feeding one stage")
        if layout == "diagram" and presentation.get("textMode") == "labels":
            pass
        if layout in {"diagram", "fanin"}:
            boxes = _place_diagram(len(nodes), [node["id"] for node in nodes], clean_links)
            for node, box in zip(nodes, boxes):
                node["position"] = box
        out["chapters"].append({
            "id": cid,
            "teaching": teaching,
            "title": _label(chapter.get("title"), f"{cid}.title", 100),
            "question": _label(chapter.get("question"), f"{cid}.question", 220),
            "insight": _label(chapter.get("insight"), f"{cid}.insight", 350),
            "safeguard": _label(chapter.get("safeguard", ""), f"{cid}.safeguard", 300),
            "narration": _label(chapter.get("narration"), f"{cid}.narration", 1600),
            "layout": layout,
            "nodes": nodes,
            "connections": clean_links,
            "columns": chapter.get("columns", []),
            "takeaway": _label(chapter.get("takeaway"), f"{cid}.takeaway", 230),
            "presentation": presentation,
            "duration": chapter.get("duration", 30),
        })
    return out


def check_hybrid_plan(raw: Any) -> dict:
    """Validate a raw slot plan and return it unchanged for compilation."""
    validate_hybrid_plan(raw)
    return raw


def compile_hybrid_lesson(raw: Any, icons: set[str] | list[str], lesson_id: str | None = None) -> dict:
    """Validate a slot plan and lower it into a publishable live lesson."""
    plan = validate_hybrid_plan(raw)
    icons = set(icons)
    raw_lesson = {
        "title": plan["title"],
        "question": plan["question"],
        "representation": plan["representation"],
        "example": plan["example"],
        "chapters": plan["chapters"],
    }
    lesson = validate_lesson(raw_lesson, None, icons, require_presentation=True)
    for chapter, source in zip(lesson["chapters"], plan["chapters"]):
        if source.get("teaching"):
            chapter["teaching"] = source["teaching"]
    lesson["id"] = lesson_id or "hybrid-preview"
    lesson["kind"] = "live_generated"
    lesson["generation"] = {"provider": "hybrid", "model": "slot-compiler"}
    return lesson


def check_lesson_geometry(lesson: dict) -> dict:
    """Pre-render gate: node boxes must be inside the stage and clear of each other.

    Text overflow is still enforced by the renderer's `data-layout-issue`
    markers; this gate catches the composition errors we can see without a
    browser.
    """
    blockers, advisories = [], []
    for chapter in lesson.get("chapters", []):
        visual = chapter.get("visual") or {}
        nodes = [n for n in visual.get("nodes", []) if isinstance(n.get("position"), dict)]
        for node in nodes:
            box = node["position"]
            x, y = box["x"], box["y"]
            w, h = box["width"], box["height"]
            if x < STAGE[0] or y < STAGE[1] or x + w > STAGE[2] or y + h > STAGE[3]:
                blockers.append({"chapter": chapter.get("id"), "node": node.get("id"),
                                 "problem": "node box leaves the stage"})
            if visual.get("layout") == "diagram":
                left, top, right, bottom = DIAGRAM
                if x < left or y < top or x + w > right or y + h > bottom:
                    blockers.append({"chapter": chapter.get("id"), "node": node.get("id"),
                                     "problem": "diagram node leaves the diagram region"})
        for i, first in enumerate(nodes):
            for second in nodes[i + 1:]:
                a, b = first["position"], second["position"]
                overlap = (min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"]) > 0
                           and min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]) > 0)
                if overlap:
                    blockers.append({"chapter": chapter.get("id"),
                                     "node": f"{first['id']}/{second['id']}",
                                     "problem": "node boxes overlap"})
        presentation = visual.get("presentation") or {}
        for node in visual.get("nodes", []):
            body = str(node.get("body") or "")
            box = node.get("position") or {}
            area = float(box.get("width", 300)) * float(box.get("height", 200))
            if body and len(body) > area / 18:
                advisories.append({"chapter": chapter.get("id"), "node": node.get("id"),
                                   "problem": "body text is dense for its box"})
            if (visual.get("layout") == "diagram"
                    and presentation.get("textMode") == "labels"
                    and (body or node.get("tag"))):
                advisories.append({
                    "chapter": chapter.get("id"), "node": node.get("id"),
                    "problem": "labels mode hides this node's body/tag; put the value in artwork or use descriptive text",
                })
    return {"approved": not blockers, "blockers": blockers, "advisories": advisories}
