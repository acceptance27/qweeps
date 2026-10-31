"""Analytic camera projection and screen-space overlap checks.

The renderer draws one beat at a time; these helpers let the compiler validate
layout without a browser. Coordinates are world units (x -6..6, y -2.8..2.8 at
zoom 1), matching the scene prompt.
"""
from __future__ import annotations

from .dsl import provenance

WORLD_HALF_W = 6.0
WORLD_HALF_H = 2.8


def project(x: float, y: float, camera: dict, width: int = 1440, height: int = 800) -> tuple[float, float]:
    zoom = max(0.3, float(camera.get("zoom", 1) or 1))
    half_w = WORLD_HALF_W / zoom
    half_h = WORLD_HALF_H / zoom
    screen_x = ((x - camera.get("x", 0)) / half_w + 1) / 2 * width
    screen_y = (1 - (y - camera.get("y", 0)) / half_h) / 2 * height
    return screen_x, screen_y


def screen_box(element: dict, camera: dict, width: int = 1440, height: int = 800) -> tuple[float, float, float, float]:
    """Map an element's centred world box to pixels (half-extents included)."""
    cx, cy = project(element.get("x", 0), element.get("y", 0), camera, width, height)
    zoom = max(0.3, float(camera.get("zoom", 1) or 1))
    half_w = element.get("width", 2) / 2 * zoom * width / (2 * WORLD_HALF_W)
    half_h = element.get("height", 1) / 2 * zoom * height / (2 * WORLD_HALF_H)
    return cx - half_w, cy - half_h, cx + half_w, cy + half_h


def intersection_ratio(a: tuple[float, float, float, float],
                       b: tuple[float, float, float, float]) -> float:
    left, right = max(a[0], b[0]), min(a[2], b[2])
    top, bottom = max(a[1], b[1]), min(a[3], b[3])
    if right <= left or bottom <= top:
        return 0.0
    inter = (right - left) * (bottom - top)
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return inter / smaller if smaller > 0 else 0.0


def _related(a: dict, b: dict) -> bool:
    if a.get("id") == b.get("parentId") or b.get("id") == a.get("parentId"):
        return True
    for first, second in ((a, b), (b, a)):
        parsed = provenance(first.get("id") or "")
        if parsed and parsed.get("authoringId") == second.get("id"):
            return True
        if parsed and parsed.get("authoringId") == second.get("parentId"):
            return True
    if a.get("parentId") and a.get("parentId") == b.get("parentId"):
        return True
    if a.get("derivedFrom") == b.get("id") or b.get("derivedFrom") == a.get("id"):
        return True
    return False


def occlusions(elements: list[dict], camera: dict, threshold: float = 0.08) -> list[dict]:
    """Return text/foreign-shape pairs whose screen boxes overlap too much."""
    boxes = {e.get("id"): screen_box(e, camera) for e in elements if e.get("id")}
    findings = []
    for i, first in enumerate(elements):
        for second in elements[i + 1:]:
            if _related(first, second):
                continue
            kinds = {first.get("kind"), second.get("kind")}
            if "text" not in kinds:
                continue
            if first.get("kind") == "text" and second.get("kind") == "text":
                pass
            elif second.get("kind") == "text" and first.get("kind") == "text":
                pass
            ratio = intersection_ratio(boxes[first["id"]], boxes[second["id"]])
            if ratio > threshold:
                findings.append({
                    "a": first.get("id"), "b": second.get("id"),
                    "ratio": round(ratio, 3),
                    "errorClass": "TEXT_OCCLUSION",
                })
    return findings


def separate_text(elements: list[dict], iterations: int = 8) -> int:
    """Nudge free text labels apart so no two text boxes stay stacked.

    Generated child labels (parentId set) are left where the compiler put them;
    a free readout next to a label cluster is the one that moves.
    """
    limit_y = 2.6
    moves = 0
    for _ in range(iterations):
        changed = False
        texts = [element for element in elements if element.get("kind") == "text"]
        for index, first in enumerate(texts):
            for second in texts[index + 1:]:
                a = (first["x"] - first["width"] / 2, first["y"] - first["height"] / 2,
                     first["x"] + first["width"] / 2, first["y"] + first["height"] / 2)
                b = (second["x"] - second["width"] / 2, second["y"] - second["height"] / 2,
                     second["x"] + second["width"] / 2, second["y"] + second["height"] / 2)
                if intersection_ratio(a, b) < 0.5:
                    continue
                if not first.get("parentId"):
                    mover, other = first, second
                elif not second.get("parentId"):
                    mover, other = second, first
                else:
                    continue
                gap = (mover["height"] + other["height"]) / 2 + 0.1
                options = [other["y"] + gap, other["y"] - gap]
                options = [value for value in options if abs(value) <= limit_y]
                if not options:
                    continue
                mover["y"] = round(min(options, key=lambda value: abs(value - mover["y"])), 3)
                changed = True
                moves += 1
        if not changed:
            break
    return moves


def _contains(shape: dict, text: dict) -> bool:
    """A label inside a field is intentional; connectors must not push it out."""
    tolerance = 0.06
    return (text["x"] - text["width"] / 2 >= shape["x"] - shape["width"] / 2 - tolerance
            and text["x"] + text["width"] / 2 <= shape["x"] + shape["width"] / 2 + tolerance
            and text["y"] - text["height"] / 2 >= shape["y"] - shape["height"] / 2 - tolerance
            and text["y"] + text["height"] / 2 <= shape["y"] + shape["height"] / 2 + tolerance)


def _segment_hits_box(box: tuple[float, float, float, float],
                      start: tuple[float, float], end: tuple[float, float]) -> bool:
    """Liang–Barsky clip: does the segment touch the box at all?"""
    xmin, ymin, xmax, ymax = box
    dx, dy = end[0] - start[0], end[1] - start[1]
    low, high = 0.0, 1.0
    for p, q in ((-dx, start[0] - xmin), (dx, xmax - start[0]),
                 (-dy, start[1] - ymin), (dy, ymax - start[1])):
        if p == 0:
            if q < 0:
                return False
            continue
        ratio = q / p
        if p < 0:
            if ratio > high:
                return False
            low = max(low, ratio)
        else:
            if ratio < low:
                return False
            high = min(high, ratio)
    return True


def separate_text_from_links(elements: list[dict], iterations: int = 3) -> int:
    """Shift free labels off connector lines so arrows never cross text."""
    by_id = {element.get("id"): element for element in elements if element.get("id")}
    links = [element for element in elements
             if element.get("kind") in {"arrow", "line"}
             and element.get("from") in by_id and element.get("to") in by_id]
    texts = [element for element in elements if element.get("kind") == "text"]
    shapes = [element for element in elements
              if element.get("kind") not in {"text", "arrow", "line"}]
    moves = 0
    for _ in range(iterations):
        changed = False
        for text in texts:
            if text.get("parentId") or text.get("derivedFrom"):
                continue
            if any(_contains(shape, text) for shape in shapes):
                continue
            box = (text["x"] - text["width"] / 2, text["y"] - text["height"] / 2,
                   text["x"] + text["width"] / 2, text["y"] + text["height"] / 2)
            for link in links:
                if text["id"] in {link["from"], link["to"]}:
                    continue
                start, end = by_id[link["from"]], by_id[link["to"]]
                if not _segment_hits_box(box, (start["x"], start["y"]), (end["x"], end["y"])):
                    continue
                dx, dy = end["x"] - start["x"], end["y"] - start["y"]
                length = (dx * dx + dy * dy) ** 0.5 or 1.0
                px, py = -dy / length, dx / length
                extent = abs(px) * text["width"] / 2 + abs(py) * text["height"] / 2
                shift = extent + 0.15
                if abs(text["x"] + px * shift) > 5.4 or abs(text["y"] + py * shift) > 2.5:
                    px, py = -px, -py
                text["x"] = round(max(-5.4, min(5.4, text["x"] + px * shift)), 3)
                text["y"] = round(max(-2.5, min(2.5, text["y"] + py * shift)), 3)
                box = (text["x"] - text["width"] / 2, text["y"] - text["height"] / 2,
                       text["x"] + text["width"] / 2, text["y"] + text["height"] / 2)
                moves += 1
                changed = True
        if not changed:
            break
    return moves


def resolve_text_layout(elements: list[dict], step: float = 0.5, rings: int = 6) -> int:
    """Place every free label once, at the nearest spot clear of text, fields and links.

    Parented, derived and connector-endpoint labels stay where the author put them;
    labels already contained in a field are intentional and stay put too.
    """
    by_id = {element.get("id"): element for element in elements if element.get("id")}
    shapes = [element for element in elements
              if element.get("kind") not in {"text", "arrow", "line"}]
    segments = []
    endpoints = set()
    for link in elements:
        if link.get("kind") in {"arrow", "line"} and link.get("from") in by_id and link.get("to") in by_id:
            start, end = by_id[link["from"]], by_id[link["to"]]
            segments.append(((start["x"], start["y"]), (end["x"], end["y"])))
            endpoints.update({link["from"], link["to"]})
    texts = [element for element in elements if element.get("kind") == "text"]
    fixed_boxes = []
    movable = []
    for text in texts:
        box = (text["x"] - text["width"] / 2, text["y"] - text["height"] / 2,
               text["x"] + text["width"] / 2, text["y"] + text["height"] / 2)
        if (text.get("parentId") or text.get("derivedFrom") or text["id"] in endpoints
                or any(_contains(shape, text) for shape in shapes)):
            fixed_boxes.append(box)
        else:
            movable.append(text)

    def free(text: dict, cx: float, cy: float) -> bool:
        if abs(cx) > 5.4 or abs(cy) > 2.5:
            return False
        box = (cx - text["width"] / 2, cy - text["height"] / 2,
               cx + text["width"] / 2, cy + text["height"] / 2)
        if any(intersection_ratio(box, other) >= 0.4 for other in fixed_boxes):
            return False
        if any(_segment_hits_box(box, start, end) for start, end in segments):
            return False
        return True

    moves = 0
    for text in movable:
        origin = (text["x"], text["y"])
        candidates = [origin]
        for ring in range(1, rings + 1):
            reach = ring * step
            offsets = [(0, -reach), (0, reach), (-reach, 0), (reach, 0),
                       (reach, -reach), (-reach, -reach), (reach, reach), (-reach, reach)]
            candidates.extend((origin[0] + dx, origin[1] + dy) for dx, dy in offsets)
        chosen = next(((cx, cy) for cx, cy in candidates if free(text, cx, cy)), origin)
        if chosen != origin:
            text["x"], text["y"] = round(chosen[0], 3), round(chosen[1], 3)
            moves += 1
        fixed_boxes.append((text["x"] - text["width"] / 2, text["y"] - text["height"] / 2,
                            text["x"] + text["width"] / 2, text["y"] + text["height"] / 2))
    return moves


def chart_fractions(bars: list[dict]) -> tuple:
    """Return (x_fraction(index), y_fraction(value)) for a compiled chart.

    Numeric data keys are the x domain (so 0.7 sits at 0.7, not at its index);
    categorical keys fall back to evenly spaced slots.
    """
    values = [float(bar.get("value", 0) or 0) for bar in bars]
    numeric = []
    try:
        numeric = [float(bar.get("label")) for bar in bars]
    except (TypeError, ValueError):
        numeric = []

    def x_at(index: int) -> float:
        if len(numeric) == len(bars) and len(bars) > 1:
            low, high = min(numeric), max(numeric)
            return (numeric[index] - low) / (high - low) if high > low else 0.5
        return index / (len(bars) - 1) if len(bars) > 1 else 0.5

    def y_at(value: float) -> float:
        low, high = min([0.0] + values), max(values)
        return (value - low) / (high - low) if high > low else 0.5

    return x_at, y_at
