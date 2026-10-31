"""Validated visual plans shared by the interactive player and Manim renderer.

Model output is data, never executable Python. Each beat is a complete snapshot,
so seeking does not depend on replaying side effects from previous animations.
"""
from __future__ import annotations

import json
import math
import os
import re
import xml.etree.ElementTree as ET
from typing import Any

from .dsl import authoring_id, generated_for, generated_id


class PlanError(ValueError):
    pass


# Okabe-Ito-inspired, colourblind-safe identity slots. Every slot also carries a
# non-hue discriminator (shape/border/badge) in the authoring contract.
ROLE_SLOTS = {
    "slot_0": {"color": "#0072B2", "badge": "IN", "shape": "rounded", "border": "solid"},
    "slot_1": {"color": "#E69F00", "badge": "VEC", "shape": "pill", "border": "dashed"},
    "slot_2": {"color": "#009E73", "badge": "ATTN", "shape": "sharp", "border": "double"},
    "slot_3": {"color": "#CC79A7", "badge": "DIST", "shape": "hatched", "border": "solid"},
    "slot_4": {"color": "#D55E00", "badge": "OUT", "shape": "notched", "border": "thick"},
    "slot_5": {"color": "#56B4E9", "badge": "CTX", "shape": "rounded", "border": "solid"},
    "slot_6": {"color": "#F0E442", "badge": "KEY", "shape": "pill", "border": "dashed"},
    "slot_7": {"color": "#999999", "badge": "MUTED", "shape": "sharp", "border": "solid"},
}
FOCUS_STATES = {"normal", "highlight", "muted", "error"}


def validate_role_table(raw: Any) -> dict:
    if raw is None:
        return {}
    if not isinstance(raw, dict) or len(raw) > len(ROLE_SLOTS):
        raise PlanError(f"roleTable must map at most {len(ROLE_SLOTS)} roles to slots")
    table = {}
    for role, slot in raw.items():
        if not isinstance(role, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", role):
            raise PlanError("roleTable role names must match [a-z][a-z0-9_]*")
        if slot not in ROLE_SLOTS:
            raise PlanError(f"role '{role}' maps to unknown palette slot '{slot}'")
        table[role] = slot
    return table


def _signed_value(bar: dict, name: str) -> float:
    """Finite signed value for line/scatter plots (negative inputs are meaningful)."""
    value = bar.get("value")
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            value = 0
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value)):
        value = 0
    return max(-1_000_000.0, min(1_000_000.0, float(value)))


def _bar_value(bar: dict, name: str) -> float:
    value = bar.get("value")
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            value = 0
    if (isinstance(value, bool) or not isinstance(value, (int, float))
            or not math.isfinite(value) or value < 0):
        value = 0
    return min(1_000_000.0, float(value))


def _bars_svg(bars: list[dict], color: str, scale_max: float) -> str:
    """Draw horizontal bars on one shared scale with a fixed label gutter (x 0–30)."""
    top, bottom, left = 4.0, 56.0, 30.0
    usable = 96.0 - left
    slot = (bottom - top) / len(bars)
    parts = [f'<svg viewBox="0 0 100 60">',
             f'<line x1="{left}" y1="{top}" x2="{left}" y2="{bottom}" stroke="#5a6b7a" stroke-width="1.5"/>']
    for index, bar in enumerate(bars):
        length = max(0.0, usable * bar["value"] / scale_max)
        y = top + index * slot + slot * 0.15
        height = slot * 0.7
        fill = bar.get("color") or color
        parts.append(f'<rect x="{left:.2f}" y="{y:.2f}" width="{length:.2f}" height="{height:.2f}" '
                     f'fill="{fill}" fill-opacity="0.9" stroke="{fill}" stroke-width="0.6"/>')
    parts.append('</svg>')
    return ''.join(parts)


def _line_svg(bars: list[dict], color: str, scale_max: float) -> str:
    """Plot one continuous curve on its numeric x domain, including negatives."""
    from .geometry import chart_fractions

    top, bottom, left, right = 4.0, 56.0, 6.0, 96.0
    span = right - left
    x_at, y_at = chart_fractions(bars)
    points = []
    for index, bar in enumerate(bars):
        x = left + span * x_at(index)
        y = bottom - (bottom - top) * y_at(bar["value"])
        points.append(f"{x:.2f},{y:.2f}")
    return (f'<svg viewBox="0 0 100 60">'
            f'<line x1="{left}" y1="{bottom}" x2="{right}" y2="{bottom}" '
            f'stroke="#5a6b7a" stroke-width="1.2"/>'
            f'<line x1="{left}" y1="{top}" x2="{left}" y2="{bottom}" '
            f'stroke="#5a6b7a" stroke-width="1.2"/>'
            f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" '
            f'stroke-width="2.2" stroke-linejoin="round"/></svg>')


def _bar_label(value: float) -> str:
    text = f"{value:.3f}".rstrip('0').rstrip('.')
    return text or "0"


def validate_svg(value: Any, name: str = 'SVG') -> str:
    """Accept self-contained SVG geometry only; never fetch references or execute content."""
    if not isinstance(value, str) or not value.strip():
        raise PlanError(f"{name} markup is missing; supply a self-contained <svg> string with a viewBox")
    size=len(value.encode('utf-8'))
    if size > 20000:
        raise PlanError(f"{name} is {size} bytes; it must be at most 20 KB")
    if '<!' in value or '<?' in value:
        raise PlanError('SVG cannot contain external references, declarations or URLs')
    try:
        root=ET.fromstring(value)
    except ET.ParseError as exc:
        raise PlanError('Invalid SVG geometry') from exc
    allowed={'svg','g','path','rect','circle','ellipse','line','polyline','polygon'}
    attrs={'viewBox','width','height','d','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry',
           'points','transform','fill','fill-opacity','fill-rule','stroke','stroke-width',
           'stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray',
           'stroke-dashoffset','stroke-miterlimit','opacity'}
    count=0
    for node in root.iter():
        count+=1
        tag=node.tag.rsplit('}',1)[-1]
        if tag not in allowed:
            raise PlanError(f"Unsupported SVG element '{tag}'")
        if node.text and node.text.strip():
            raise PlanError(f"Unsupported SVG element text in '{tag}'")
        if count>200: raise PlanError('SVG contains too many elements')
        for name,content in node.attrib.items():
            if name not in attrs:
                raise PlanError(f"Unsupported SVG attribute '{name}'")
            if len(content)>10000 or re.search(r'(?i)\b(?:url\s*\(|javascript:|data:|https?:|file:)',content):
                raise PlanError(f"Unsupported SVG attribute '{name}' value")
    if root.tag.rsplit('}',1)[-1]!='svg' or not root.get('viewBox'):
        raise PlanError('SVG needs a viewBox')
    return value


def _text(value: Any, name: str, limit: int = 500) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PlanError(f"{name} must be nonempty text")
    return value.strip()[:limit]


def _clamp(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError as exc:
            raise PlanError(f"{name} must be a number") from exc
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise PlanError(f"{name} must be a finite number")
    return min(high, max(low, float(value)))


def _number(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            pass
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise PlanError(f"{name} must be between {low} and {high}")
    return float(value)


def validate_plan(raw: Any, *, strict_edges: bool = True, repair_containment: bool = False,
                  repair_duplicates: bool = False) -> dict:
    if not isinstance(raw, dict):
        raise PlanError("scene must be an object")
    plan = {"title": _text(raw.get("title"), "title", 120),
            "summary": _text(raw.get("summary"), "summary", 1000), "beats": []}
    role_table = validate_role_table(raw.get("roleTable"))
    if role_table:
        plan["roleTable"] = role_table
    beats = raw.get("beats")
    if not isinstance(beats, list) or not 1 <= len(beats) <= 8:
        raise PlanError("scene needs 1–8 beats")
    svg_assets: dict[str, str] = {}
    seen_elements: dict[str, dict] = {}
    clock = 0.0
    for i, beat in enumerate(beats):
        if not isinstance(beat, dict):
            raise PlanError("beat must be an object")
        camera = beat.get("camera", {"x": 0, "y": 0, "zoom": 1})
        if not isinstance(camera, dict):
            raise PlanError("camera must be an object")
        out = {"id": f"beat_{i}", "title": _text(beat.get("title"), "beat title", 120),
               "narration": _text(beat.get("narration"), "narration", 1400),
               "duration": _number(beat.get("duration", 12), "duration", 4, 90),
               "camera": {k: _number(camera.get(k, default), f"camera.{k}", lo, hi)
                          for k, default, lo, hi in [("x", 0, -30, 30), ("y", 0, -30, 30), ("zoom", 1, .3, 3)]},
               "elements": []}
        out["narrationAt"] = _number(beat.get("narrationAt", 1.5), "narrationAt", 0, out["duration"] - .1)
        out["transitionDuration"] = _number(beat.get("transitionDuration", 1.6), "transitionDuration", .2, min(5, out["duration"]))
        elements = beat.get("elements")
        if not isinstance(elements, list) or not 1 <= len(elements) <= 40:
            raise PlanError("each beat needs 1–40 elements; group repeated small items "
                            "(token chips, legend rows, repeated labels) into one svg or path instead of one element per item")
        links = beat.get("links")
        if links is not None:
            if not isinstance(links, list) or len(links) > 16:
                raise PlanError("links must be a list of at most 16 relationships")
            used = {e.get("id") for e in elements if isinstance(e, dict)}
            existing = {(e.get("from"), e.get("to")) for e in elements if isinstance(e, dict)}
            for index, link in enumerate(links):
                if not isinstance(link, dict):
                    raise PlanError("each link must be an object")
                source = _text(link.get("from"), "link.from", 64)
                target = _text(link.get("to"), "link.to", 64)
                if source == target or (source, target) in existing:
                    continue
                existing.add((source, target))
                link_id = generated_id(i, "link", str(index))
                suffix = 1
                while link_id in used:
                    link_id = f"{link_id}_{suffix}"
                    suffix += 1
                used.add(link_id)
                elements.append({"_generated": True, "id": link_id, "kind": "arrow", "from": source, "to": target,
                                 "label": str(link.get("label", ""))[:120],
                                 "description": "Connector generated from the declared relationship.",
                                 "color": link.get("color", "#FFFF00"),
                                 "revealAt": link.get("revealAt", 0)})
        chart_ids = {e.get("id") for e in elements if isinstance(e, dict) and e.get("bars")}
        if chart_ids:
            elements = [e for e in elements if not (
                isinstance(e, dict) and isinstance(e.get("id"), str)
                and any(generated_for(i, str(chart), e["id"]) for chart in chart_ids))]
        defaults = beat.get("defaults", {})
        if not isinstance(defaults, dict):
            raise PlanError("beat defaults must be an object")
        allowed_defaults = {"color", "entrance", "drawDuration", "opacity"}
        unknown_defaults = set(defaults) - allowed_defaults
        if unknown_defaults:
            raise PlanError(f"beat defaults may only set {sorted(allowed_defaults)}; unknown {sorted(unknown_defaults)}")
        ids = set()
        generated = []
        for element in elements:
            if not isinstance(element, dict):
                raise PlanError("element must be an object")
            if defaults:
                merged = {k: defaults[k] for k in allowed_defaults if k in defaults}
                merged.update(element)
                element = merged
            eid = _text(element.get("id"), "element id", 64)
            if not authoring_id(eid) and not element.get("_generated"):
                raise PlanError(f"element id '{eid}' is invalid; use letters, digits, '_' or '-' and do not use the generated namespace")
            if eid in ids:
                if repair_duplicates:
                    continue
                raise PlanError("element IDs must be unique within a beat")
            ids.add(eid)
            kind = element.get("kind")
            if not isinstance(kind, str) or kind not in {"circle", "box", "text", "arrow", "line", "path", "svg"}:
                raise PlanError("unsupported element kind")
            color = element.get("color", "#58C4DD")
            if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
                raise PlanError("color must be #RRGGBB")
            item = {"id": eid, "kind": kind, "label": str(element.get("label", ""))[:120],
                    "description": str(element.get("description", ""))[:800], "color": color,
                    "x": _clamp(element.get("x", 0), "x", -40, 40),
                    "y": _clamp(element.get("y", 0), "y", -40, 40),
                    "width": _clamp(element.get("width", 2), "width", .1, 14),
                    "height": _clamp(element.get("height", 1), "height", .1, 8)}
            role = element.get("semanticRole")
            if role is not None:
                if not isinstance(role, str) or role not in role_table:
                    raise PlanError(f"element '{eid}' uses semanticRole '{role}' not declared in roleTable")
                slot = role_table[role]
                item["semanticRole"] = role
                item["roleSlot"] = slot
                # Badge text follows the declared role, so it cannot claim a
                # different concept (e.g. ATTN on a neuron weight).
                cleaned = re.sub(r"[^A-Za-z0-9]", "", role).upper()
                item["badge"] = cleaned[:4] or ROLE_SLOTS[slot]["badge"]
                item["color"] = ROLE_SLOTS[slot]["color"]
                focus = element.get("focusState", "normal")
                if not isinstance(focus, str) or focus not in FOCUS_STATES:
                    raise PlanError(f"element '{eid}' focusState must be one of {sorted(FOCUS_STATES)}")
                item["focusState"] = focus
            if element.get("parentId"):
                item["parentId"] = _text(element.get("parentId"), f"element '{eid}' parentId", 64)
            if element.get("derivedFrom"):
                item["derivedFrom"] = _text(element.get("derivedFrom"), f"element '{eid}' derivedFrom", 64)
            if kind == "path":
                points = element.get("points")
                if isinstance(points, list) and points and all(isinstance(p, (int, float)) for p in points):
                    points = [[points[i], points[i + 1]] for i in range(0, len(points) - 1, 2)]
                cleaned = []
                for point in points if isinstance(points, list) else []:
                    if not isinstance(point, (list, tuple)) or len(point) != 2:
                        continue
                    cleaned.append([_number(point[0], "path x", -1, 1),
                                    _number(point[1], "path y", -1, 1)])
                if len(cleaned) < 2:
                    ids.discard(eid)
                    continue
                item["points"] = cleaned[:128]
                for key in ("closed", "smooth"):
                    value=element.get(key,False)
                    if type(value) is not bool: raise PlanError(f"{key} must be boolean")
                    item[key]=value
            if kind == 'text' and len(item['label']) > 60:
                raise PlanError(f"element '{eid}' label is {len(item['label'])} characters; keep text labels at most 45–60 characters")
            item["revealAt"] = _number(element.get("revealAt", min(len(ids) * .4 - .4, out["duration"] - 2)), "revealAt", 0, out["duration"] - .3)
            item["drawDuration"] = _number(element.get("drawDuration", min(1.2, out["duration"] - item["revealAt"])), "drawDuration", .15, min(8, out["duration"] - item["revealAt"]))
            item["opacity"] = _number(element.get("opacity", 1), "opacity", .08, 1)
            if item.get("focusState") == "muted":
                item["opacity"] = min(item["opacity"], 0.45)
            item["entrance"] = element.get("entrance", "write" if kind == "text" else "grow" if kind == "circle" else "draw")
            if not isinstance(item["entrance"], str) or item["entrance"] not in {"draw", "grow", "write"}:
                raise PlanError("entrance must be draw, grow or write")
            if kind == 'svg':
                bars = element.get("bars")
                if bars is not None:
                    if not isinstance(bars, list) or not 1 <= len(bars) <= 12:
                        raise PlanError(f"element '{eid}' bars must be a list of 1–12 entries")
                    chart_type = element.get("chartType") or "bars"
                    if chart_type not in {"bars", "line", "scatter"}:
                        raise PlanError(f"element '{eid}' chart type must be bars, line or scatter")
                    clean = []
                    for index, bar in enumerate(bars):
                        if not isinstance(bar, dict):
                            raise PlanError(f"element '{eid}' bar {index} must be an object")
                        if chart_type == "bars":
                            raw_value = bar.get("value")
                            if (isinstance(raw_value, (int, float))
                                    and not isinstance(raw_value, bool) and raw_value < 0):
                                raise PlanError(f"element '{eid}' bars cannot encode negative "
                                                "values; use type=line or separate text labels")
                            value = _bar_value(bar, f"element '{eid}' bar value")
                        else:
                            value = _signed_value(bar, f"element '{eid}' bar value")
                        clean.append({"label": _text(bar.get("label"), f"element '{eid}' bar label", 30),
                                      "value": value, "color": bar.get("color")})
                    scale = max(1.0, max(bar["value"] for bar in clean))
                    item["svg"] = (_line_svg(clean, item["color"], scale)
                                   if chart_type == "line"
                                   else _bars_svg(clean, item["color"], scale))
                    item["chartType"] = chart_type
                    item["bars"] = [{"label": bar["label"], "value": bar["value"]} for bar in clean]
                    slot = item["height"] / len(clean)
                    for index, bar in enumerate(clean):
                        label_id = generated_id(i, eid, f"l{index}")
                        while label_id in ids:
                            label_id = generated_id(i, eid, f"l{index}_{len(ids)}")
                        ids.add(label_id)
                        generated.append({
                            "id": label_id, "kind": "text",
                            "label": f"{bar['label']} {_bar_label(bar['value'])}",
                            "description": f"Value label for {eid}.",
                            "color": "#FFFFFF",
                            "x": item["x"] - item["width"] / 2 + item["width"] * 0.15,
                            "y": item["y"] + item["height"] / 2 - (index + 0.5) * slot,
                            "width": item["width"] * 0.26,
                            "height": min(0.30, slot * 0.6),
                            "revealAt": item["revealAt"], "drawDuration": 0.2,
                            "opacity": 1.0, "entrance": "write"})
                else:
                    ref = element.get('svgRef')
                    if isinstance(ref, str) and ref.strip() and not element.get('svg'):
                        ref = ref.strip()
                        if ref not in svg_assets:
                            raise PlanError(f"element '{eid}' references svgRef '{ref}', which is not an earlier svg element in this scene")
                        item['svg'] = svg_assets[ref]
                    else:
                        item['svg'] = validate_svg(element.get('svg'), name=f"element '{eid}' SVG")
                svg_assets[eid] = item['svg']
            if "emphasizeAt" in element:
                item["emphasizeAt"] = _number(element["emphasizeAt"], "emphasizeAt", 0, out["duration"] - 1.2)
            if kind in {"arrow", "line"}:
                if not element.get("from") or not element.get("to"):
                    # A connector with no endpoints carries no observable relation.
                    ids.discard(eid)
                    continue
                item["from"] = _text(element.get("from"), f"element '{eid}' from", 64)
                item["to"] = _text(element.get("to"), f"element '{eid}' to", 64)
            out["elements"].append(item)
        out["elements"].extend(generated)
        by_id = {e["id"]: e for e in out["elements"]}
        for element in out["elements"]:
            parent_id = element.get("parentId")
            if not parent_id:
                continue
            if parent_id == element["id"] or parent_id not in by_id:
                raise PlanError(f"element '{element['id']}' has unknown parentId '{parent_id}'")
            parent = by_id[parent_id]
            pad = 0.05
            def inside() -> bool:
                return (element["x"] - element["width"] / 2 >= parent["x"] - parent["width"] / 2 + pad
                        and element["x"] + element["width"] / 2 <= parent["x"] + parent["width"] / 2 - pad
                        and element["y"] - element["height"] / 2 >= parent["y"] - parent["height"] / 2 + pad
                        and element["y"] + element["height"] / 2 <= parent["y"] + parent["height"] / 2 - pad)
            if not inside():
                if not repair_containment:
                    raise PlanError(f"element '{element['id']}' overflows its parent '{parent_id}'")
                left = parent["x"] - parent["width"] / 2 + pad
                right = parent["x"] + parent["width"] / 2 - pad
                top = parent["y"] - parent["height"] / 2 + pad
                bottom = parent["y"] + parent["height"] / 2 - pad
                if right - left < 0.1 or bottom - top < 0.1:
                    element.pop("parentId", None)
                    continue
                element["width"] = min(element["width"], right - left)
                element["height"] = min(element["height"], bottom - top)
                element["x"] = min(right - element["width"] / 2,
                                   max(left + element["width"] / 2, element["x"]))
                element["y"] = min(bottom - element["height"] / 2,
                                   max(top + element["height"] / 2, element["y"]))
        parents = {e["id"]: e["parentId"] for e in out["elements"] if e.get("parentId")}
        for start in parents:
            seen, current = set(), start
            while current in parents:
                if current in seen:
                    raise PlanError("parentId containment has a cycle")
                seen.add(current)
                current = parents[current]
        camera = out["camera"]
        for element in out["elements"]:
            parent_id = element.get("derivedFrom")
            if not parent_id:
                continue
            parent = by_id.get(parent_id)
            parent_global = None
            if parent is not None:
                parent_global = clock + parent["revealAt"]
            elif parent_id in seen_elements:
                parent = seen_elements[parent_id]
                parent_global = parent["_global"]
            if parent is None or parent_global is None:
                raise PlanError(f"element '{element['id']}' derives from unknown element '{parent_id}'")
            if parent.get("kind") in {"arrow", "line"}:
                element.pop("derivedFrom", None)
                continue
            required = max(0.8, len(parent.get("label", "")) * 0.075)
            exposure = clock + element["revealAt"] - parent_global
            if exposure < required:
                shift = required - exposure
                element["revealAt"] = round(element["revealAt"] + shift, 3)
                if element["revealAt"] > out["duration"] - 0.3:
                    out["duration"] = min(90, element["revealAt"] + element["drawDuration"] + 0.3)
                element["drawDuration"] = min(element["drawDuration"],
                                              max(0.15, out["duration"] - element["revealAt"]))
                if element["revealAt"] > out["duration"] - 0.15:
                    raise PlanError(f"derived element '{element['id']}' cannot fit after its parent "
                                    f"'{parent_id}'")
            half_w, half_h = 6 / camera["zoom"], 2.8 / camera["zoom"]
            if not (camera["x"] - half_w <= parent["x"] <= camera["x"] + half_w
                    and camera["y"] - half_h <= parent["y"] <= camera["y"] + half_h):
                # The parent cannot be shown whole here; keep the element, drop the claim.
                element.pop("derivedFrom", None)
                continue
        for element in out["elements"]:
            seen_elements[element["id"]] = {
                "kind": element["kind"], "label": element["label"], "x": element["x"],
                "y": element["y"], "width": element["width"], "height": element["height"],
                "_global": clock + element["revealAt"]}
        nodes = {e["id"] for e in out["elements"] if e["kind"] not in {"arrow", "line"}}
        bad_edges = [e for e in out["elements"] if e["kind"] in {"arrow", "line"} and (
            e["from"] not in nodes or e["to"] not in nodes or e["from"] == e["to"])]
        if bad_edges and strict_edges:
            raise PlanError("edges must connect two distinct elements in the same beat")
        if bad_edges:
            out["elements"] = [e for e in out["elements"] if e not in bad_edges]
        if "teaching" in beat:
            meta = beat["teaching"]
            if not isinstance(meta, dict):
                raise PlanError("beat teaching metadata must be an object")
            evidence = meta.get("evidence")
            if not isinstance(evidence, list) or not evidence or not all(isinstance(e, str) and e in ids for e in evidence):
                raise PlanError("teaching evidence must identify actual scene elements")
            out["teaching"] = {"planBeat": _text(meta.get("planBeat"), "planBeat", 64),
                               "question": _text(meta.get("question"), "teaching question", 400),
                               "insight": _text(meta.get("insight"), "teaching insight", 600), "evidence": evidence}
        clock += out["duration"]
        plan["beats"].append(out)
    sources = raw.get("sources", [])
    if not isinstance(sources, list) or len(sources) > 12:
        raise PlanError("sources must be a list of at most 12 entries")
    plan["sources"] = [_text(s, "source", 400) for s in sources]
    if "teaching" in raw:
        from .pedagogy import validate_storyboard, validate_review
        meta = raw["teaching"]
        if not isinstance(meta, dict) or meta.get("method") != "qweeps-visual-teaching" or type(meta.get("version")) is not int or meta["version"] not in {1, 2}:
            raise PlanError("unknown teaching method metadata")
        storyboard = validate_storyboard(meta.get("storyboard"), require_visual_design=meta["version"] >= 2)
        review = validate_review(meta.get("review"), storyboard)
        if not review["approved"] or len(storyboard["beats"]) != len(plan["beats"]):
            raise PlanError("saved teaching metadata does not match an approved lesson")
        for intent, beat in zip(storyboard["beats"], plan["beats"]):
            if beat.get("teaching", {}).get("planBeat") != intent["id"]:
                raise PlanError("saved scene no longer matches its storyboard")
        plan["teaching"] = {"method": "qweeps-visual-teaching", "version": meta["version"], "storyboard": storyboard, "review": review}
        if 'frameReview' in meta:
            frame_review=meta['frameReview']
            if not isinstance(frame_review,dict) or frame_review.get('approved') is not True or frame_review.get('method')!='native-frames-and-vision-model':
                raise PlanError('Invalid rendered-frame review metadata')
            observations=frame_review.get('observations')
            if not isinstance(observations,list) or {o.get('beat') for o in observations if isinstance(o,dict)} != {b['id'] for b in storyboard['beats']}:
                raise PlanError('Rendered-frame review needs observations for each beat')
            clean=[]
            for o in observations:
                if not isinstance(o,dict):raise PlanError('Invalid rendered-frame observation')
                clean.append({k:_text(o.get(k),k,1000) for k in ('beat','visible','inference')})
            plan['teaching']['frameReview']={'approved':True,'method':'native-frames-and-vision-model','observations':clean}
    return plan


PLAN_PROMPT = """You are QWEEPS, a calm visual tutor. Answer the user's actual question.
Return ONE JSON object: {"answer":"spoken explanation", "scene":null OR a scene object}.
For mode=lesson or mode=branch you MUST provide a scene. For mode=question, provide a scene
only if a new visual helps. Anchor follow-ups to the supplied paused time, camera, selected
elements, their positions, and conversation. Do not replace the lesson for a simple answer.
Never claim you read game source, a document or the web unless it is supplied in sourceContext.
If source is needed, ask for it and label any general illustration as hypothetical.
Avoid unjustified causal claims, invented historical citations, or invented exact measurements.
If context.gridSearch is present, it is a real deterministic grid trace: g is accumulated
unit edge cost, h is Manhattan, open is sorted by f then h then coordinate ID. Inspect the
selected coordinates against open/closed lists. Walls force detours; undiscovered cells have
no known g yet. If only scores are supplied, that older sandbox uses direct-edge toy costs.
Use supplied live scores; A is not always preferred. Explain metric/edge-cost assumptions for
admissibility. Dijkstra is useful, not flawed; uniform expansion assumes equal edge costs.

Scene schema:
{"title":"short title","summary":"what this teaches and assumptions",
 "sources":["only supplied source references; otherwise leave empty"],
 "beats":[{"title":"short title","narration":"natural calm spoken explanation",
 "duration":14,"narrationAt":1.5,"transitionDuration":1.6,"camera":{"x":0,"y":0,"zoom":1},
 "defaults":{"color":"#58C4DD","entrance":"grow","drawDuration":1.2,"opacity":1},
 "links":[{"from":"existing_element_id","to":"other_element_id","label":"relationship"}],
 "elements":[{"id":"stable_semantic_id","kind":"circle|box|text|path|svg",
 "label":"short readable text","description":"what this means for inspection",
 "x":-3,"y":1,"width":2,"height":1,
 "revealAt":0,"emphasizeAt":4},
 {"id":"distribution","kind":"svg","bars":[{"label":"tired","value":0.62},{"label":"wide","value":0.18}],
 "x":3,"y":0,"width":4.8,"height":1.5},
 {"id":"reused_chart","kind":"svg","svgRef":"earlier_svg_element_id","x":2,"y":0,"width":3,"height":1.2},
 {"id":"connection","kind":"arrow|line","from":"existing_node_id","to":"other_node_id",
 "label":"relationship","revealAt":2}]}]}
Use "bars" for every bar chart instead of hand-drawing rectangles: the renderer draws all bars
on one shared 0..1 scale with a fixed label gutter and adds the value labels. Never place
bar widths or value labels by hand. Declare every relationship between objects in "links";
the renderer adds any connector you omit, using the declared from/to IDs.
Set only the fields that differ from the beat defaults. Reuse an earlier self-contained SVG
with svgRef instead of re-emitting identical markup; emit svg markup for every new svg
element. Never emit "svg": null. One beat maps to one storyboard beat: keep 4–12 elements,
group repeated small items (token chips, legend rows, one label per word) into a single svg
or path, and do not create one text element per word.
For a path provide points as [[x,y],...] in local coordinates from -1 to 1;
width, height and position scale and place it. closed and smooth are booleans.
A path is a single continuous curve connecting consecutive points; do not connect disjoint grid lines in one path (use distinct boxes, lines, or svg for grids).
Use paths for recognizable geometry or curves, and explain their meaning in description.
For svg, supply a self-contained svg string with viewBox, using only geometry
elements (path, g, rect, circle, ellipse, line, polyline or polygon). No text,
images, styles, scripts, external references, declarations or URLs. The SVG is
an object with a stable ID, position and size; use appropriate recognizable details.
Each beat is a COMPLETE independently seekable snapshot, not a diff. Follow the supplied
storyboard's conceptual beats. Repeated execution belongs inside a beat, not in more
copies of the same explanation. Teach a new visual insight in each beat: pose a concrete
question, construct the geometry that answers it, then change it to reveal WHY.
Follow the supplied teaching storyboard when present. Geometry should carry its inference.
Use stable IDs for meaningful anchors across related reasoning steps. On a spatial
blackboard, preserve earlier regions in the world as the camera explores a new concept.
To move an element across beats (such as atoms dissociating): reuse the exact same ID with the new (x, y) coordinates; the renderer smoothly interpolates it from the previous position over transitionDuration without jump cuts. Multiple lines between the same nodes automatically render as parallel lines (e.g. double or triple bonds). When bonds are cleaved/broken: remove the connecting bond lines in the separated beat so the two atoms stand visibly disconnected. Retain context shapes at readable opacity (.8).
Do not impose an arbitrary shared-object count or one universal narrative on every subject.
Choose motion that carries the particular explanation. A connection trace is useful for
a mechanism but not mandatory for every subject. Show mechanisms through motion: move a token down
a wire; transform an estimate into a measured quantity; grow a distance; add events along
a shared timeline. Do not just put headings and paragraphs inside boxes.
revealAt is seconds INTO this beat: stagger new elements at 0, 1.5, 3, 5, etc. so the
viewer sees one idea arrive at a time. drawDuration is .3–3 seconds. entrance=draw traces
outlines/arrows, grow expands geometry from its centre, write writes text. emphasizeAt
pulses a node or sends a moving signal along an edge for 1.2 seconds. Place it after
that object finishes appearing and before duration-1.2. opacity=.2 dims context; keep
the current subject at 1.0. narrationAt usually 1.5. Camera moves smoothly from the
previous beat over transitionDuration: deliberately frame the subject, then pull back
to compare. Use 12–20 seconds per beat so construction, narration and pauses can breathe.
Maximum 40 elements per beat, preferably 4–12. Coordinates x=-6..6,y=-2.8..2.8
at camera 0,0,1; keep boxes and labels apart and inside that frame. Labels <=45 characters.
Circle width=height=1. Boxes typically width=2.5 height=1. Text height=.5. Edges ("arrow" or "line")
require "from" and "to" referencing distinct non-edge element IDs in the SAME beat. Standalone shapes must use circle, box, text, path, or svg.
No code, scripts, HTML, external images, or LaTeX.
Use #58C4DD, #83C167, #FFFF00, #FC6255 on black. Build geometry before formulas.
Narration should explain the mechanism in 2–3 sentences per beat, not describe API calls
or announce drawing operations. Allow a 1.5 second pause for the first visual to register.
"""


def generate_scene_reply(llm: Any, question: str, context: dict, history: list, mode: str = "question") -> dict:
    if mode not in {"question", "lesson", "branch"}:
        raise PlanError("unknown explanation mode")
    question = _text(question, "question", 4000)
    request = json.dumps({"mode": mode, "question": question, "context": context,
                          "history": history[-16:]}, ensure_ascii=False)
    error = ""
    for attempt in range(2):
        prompt = request if not attempt else request + "\nYour previous response failed validation: " + error + ". Return corrected JSON."
        # Use the configured model directly: an offline canned fallback is not an AI answer.
        if hasattr(llm, "_chat"):
            raw = llm._chat([{"role": "system", "content": PLAN_PROMPT},
                             {"role": "user", "content": prompt}], max_tokens=6500)
        else:
            raw = llm.compose(prompt, system=PLAN_PROMPT)
        if not raw or not raw.strip():
            raise PlanError("The visual model returned no answer. Check QWEEPS model configuration and credentials.")
        try:
            clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
            result = json.loads(clean)
            answer = _text(result.get("answer"), "answer", 6000)
            scene = validate_plan(result["scene"]) if result.get("scene") is not None else None
            if mode != "question" and scene is None:
                raise PlanError("a lesson or branch must include a visual scene")
            return {"answer": answer, "scene": scene}
        except (ValueError, TypeError, AttributeError) as exc:
            error = str(exc)[:500]
    raise PlanError(f"The model did not produce a valid visual plan after two attempts: {error}")


def generate_reply(llm: Any, question: str, context: dict, history: list, mode: str = "question", rendered_review=None) -> dict:
    """Route every newly generated lesson through the reference teaching harness."""
    from .pedagogy import teach_visual
    if mode not in {"question", "lesson", "branch"}:
        raise PlanError("unknown explanation mode")
    if mode in {"lesson", "branch"} and os.environ.get("QWEEPS_V3") == "1":
        from .v3_pipeline import teach_v3
        return teach_v3(llm, question, context, history, mode, rendered_review=rendered_review)
    if mode in {"lesson", "branch"}:
        return teach_visual(llm, question, context, history, mode, rendered_review=rendered_review)
    reply = generate_scene_reply(llm, question, context, history, mode)
    if reply["scene"] is not None:
        return teach_visual(llm, question, context, history, "branch", seed_answer=reply["answer"], rendered_review=rendered_review)
    return reply


def manim_source(plan: dict) -> str:
    """Compile validated data to deterministic Manim Community Edition Python."""
    plan = validate_plan(plan)
    return '''from manim import *
import json, tempfile, os

PLAN = json.loads(''' + repr(json.dumps(plan, ensure_ascii=False)) + ''')

class QweepsLesson(MovingCameraScene):
    def make_object(self, e, nodes):
        group = VGroup()
        color = e["color"]
        if e["kind"] in ("arrow", "line"):
            a, b = nodes[e["from"]], nodes[e["to"]]
            start, end = np.array([a["x"],a["y"],0.]), np.array([b["x"],b["y"],0.])
            delta = end - start
            length = np.linalg.norm(delta)
            if length < .01: return VGroup(Dot(start, radius=.001).set_opacity(0))
            unit = delta / length
            def trim(node):
                if node["kind"] == "text": return .12
                return min(node["width"] / 2 / max(.01, abs(unit[0])), node["height"] / 2 / max(.01, abs(unit[1]))) + .07
            start = start + unit * min(trim(a), length * .4)
            end = end - unit * min(trim(b), length * .4)
            p_idx = e.get("parallel_index")
            p_cnt = e.get("parallel_count", 1)
            offset = np.zeros(3)
            if p_idx is not None and p_cnt > 1:
                normal = np.array([-unit[1], unit[0], 0.])
                offset = (p_idx - (p_cnt - 1) / 2.0) * 0.22 * normal
                start = start + offset
                end = end + offset
            wire = Arrow(start, end, buff=0, color=color, stroke_width=2) if e["kind"] == "arrow" else Line(start, end, color=color, stroke_width=2)
            group.add(wire)
            if e["label"]:
                lbl_offset = UP * .24 + offset if p_cnt > 1 else UP * .24
                label = Text(e["label"], font_size=16, color=color).move_to((start+end)/2 + lbl_offset)
                if label.width > 3: label.scale_to_fit_width(3)
                group.add(label)
        else:
            pos = [e["x"], e["y"], 0]
            if e["kind"] != "text":
                if e["kind"] == "svg":
                    with tempfile.NamedTemporaryFile(mode="w", suffix=".svg", encoding="utf-8", delete=False) as svg:
                        svg.write(e["svg"])
                        svg_name = svg.name
                    try:
                        shape = SVGMobject(svg_name)
                    finally:
                        os.unlink(svg_name)
                    if shape.width > .001 and shape.height > .001:
                        shape.scale_to_fit_width(e["width"])
                        if shape.height > e["height"]: shape.scale_to_fit_height(e["height"])
                elif e["kind"] == "path":
                    points = [np.array([pos[0]+p[0]*e["width"]/2,pos[1]+p[1]*e["height"]/2,0]) for p in e["points"]]
                    if e["closed"]: points.append(points[0])
                    shape = VMobject(color=color)
                    if e["smooth"]: shape.set_points_smoothly(points)
                    else: shape.set_points_as_corners(points)
                else:
                    shape = Ellipse(width=e["width"], height=e["height"], color=color) if e["kind"] == "circle" else RoundedRectangle(width=e["width"], height=e["height"], corner_radius=.12, color=color)
                if e["kind"] != "path": shape.move_to(pos)
                if e["kind"] != "svg": shape.set_fill(color, opacity=.08 if e.get("closed", True) else 0)
                group.add(shape)
            if e["label"]:
                label = Text(e["label"], font_size=26, color=color).move_to(pos)
                if label.width > e["width"]*.9: label.scale_to_fit_width(e["width"]*.9)
                group.add(label)
        if not len(group): group.add(Dot([e["x"],e["y"],0], radius=.001).set_opacity(0))
        return group.fade(1 - e["opacity"])

    def construct(self):
        self.camera.background_color = "#000000"
        self.camera.frame.set(width=14.22).move_to(ORIGIN)
        objects = {}
        for beat in PLAN["beats"]:
            began = self.time
            cam = beat["camera"]
            animations = [self.camera.frame.animate(run_time=beat["transitionDuration"], rate_func=smoothererstep).move_to([cam["x"],cam["y"],0]).set(width=14.22/cam["zoom"])]
            current_ids = {e["id"] for e in beat["elements"]}
            for eid in list(objects):
                if eid not in current_ids:
                    animations.append(FadeOut(objects.pop(eid), run_time=.7))
            nodes = {e["id"]: e for e in beat["elements"] if e["kind"] not in ("arrow", "line")}
            edges = [e for e in beat["elements"] if e["kind"] in ("arrow", "line")]
            pair_counts = {}
            for ed in edges:
                pair = tuple(sorted([ed["from"], ed["to"]]))
                pair_counts[pair] = pair_counts.get(pair, 0) + 1
            pair_seen = {}
            for ed in edges:
                pair = tuple(sorted([ed["from"], ed["to"]]))
                idx = pair_seen.get(pair, 0)
                pair_seen[pair] = idx + 1
                ed["parallel_index"] = idx
                ed["parallel_count"] = pair_counts[pair]
            for e in beat["elements"]:
                target = self.make_object(e, nodes)
                if e["id"] in objects:
                    obj = objects[e["id"]]
                    animations.append(Transform(obj, target, run_time=beat["transitionDuration"], rate_func=smoothererstep))
                else:
                    obj = target
                    objects[e["id"]] = obj
                    style = e["entrance"]
                    action = Write(obj, run_time=e["drawDuration"]) if style == "write" else GrowFromCenter(obj, run_time=e["drawDuration"]) if style == "grow" else Create(obj, run_time=e["drawDuration"])
                    animations.append(Succession(Wait(e["revealAt"]), action) if e["revealAt"] > 0 else action)
                if "emphasizeAt" in e:
                    if e["kind"] in ("arrow", "line"):
                        wire = target[0]
                        signal = Dot(wire.get_start(), radius=.07, color=YELLOW)
                        cue = Succession(FadeIn(signal, run_time=.1), MoveAlongPath(signal, Line(wire.get_start(), wire.get_end()), run_time=1, rate_func=linear), FadeOut(signal, run_time=.1))
                    else:
                        cue = Indicate(obj, color=YELLOW, scale_factor=1.12, run_time=1.2)
                    animations.append(Succession(Wait(e["emphasizeAt"]), cue))
            self.play(AnimationGroup(*animations, lag_ratio=0))
            remaining = beat["duration"] - (self.time - began)
            if remaining > 0: self.wait(remaining)
'''
