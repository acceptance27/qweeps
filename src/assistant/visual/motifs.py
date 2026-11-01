"""Safe motif layer for diagram nodes.

The model selects a motif and semantic parameters. This module expands them
into the primitive artwork consumed by DiagramArtwork. No arbitrary SVG paths
or coordinates come from the model.
"""
from __future__ import annotations

import math

PALETTE = {"blue", "gold", "green", "coral", "purple", "white", "muted"}

MOTIFS = {
    "wave": {"label": "wave packet", "params": ["direction", "amplitude", "frequency"]},
    "vector": {"label": "momentum/force vector", "params": ["angle", "length"]},
    "box": {"label": "energy/mass box", "params": ["filled", "symbol"]},
    "ring": {"label": "field/rest-mass rings", "params": ["rings"]},
    "pair": {"label": "particle/antiparticle pair", "params": ["labels"]},
    "axis": {"label": "axis with endpoints", "params": ["endpoints"]},
    "collision": {"label": "two incoming packets meeting", "params": ["burst"]},
    "field": {"label": "excited field", "params": ["rings"]},
    "equation": {"label": "equation plate", "params": ["formula"]},
}


def _text(x, y, text, color="white", size=8):
    return {"type": "text", "x": x, "y": y, "size": size, "text": text, "stroke": "none", "fill": color, "strokeWidth": 1}


def _line(x1, y1, x2, y2, color, width=1.6):
    return {"type": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "stroke": color, "fill": "none", "strokeWidth": width}


def _path(d, color, width=1.6, fill="none"):
    return {"type": "path", "d": d, "stroke": color, "fill": fill, "strokeWidth": width}


def _circle(cx, cy, r, color, fill="none", width=1.6):
    return {"type": "circle", "cx": cx, "cy": cy, "r": r, "stroke": color, "fill": fill, "strokeWidth": width}


def _rect(x, y, w, h, color, fill="none", rx=4, width=1.6):
    return {"type": "rect", "x": x, "y": y, "width": w, "height": h, "rx": rx, "stroke": color, "fill": fill, "strokeWidth": width}


def _arrow_head(x1, y1, x2, y2, color, size=6):
    angle = math.atan2(y2 - y1, x2 - x1)
    p1 = (x2 - math.cos(angle - .5) * size, y2 - math.sin(angle - .5) * size)
    p2 = (x2 - math.cos(angle + .5) * size, y2 - math.sin(angle + .5) * size)
    return _path(f"M{x2} {y2} L{p1[0]:.1f} {p1[1]:.1f} L{p2[0]:.1f} {p2[1]:.1f} Z", color, 1, color)


def _label(value, fallback=""):
    return str(value or fallback)[:40]


def wave(motif: dict, color: str):
    amp = max(6, min(22, float(motif.get("amplitude", 12))))
    freq = max(1, min(4, int(motif.get("frequency", 2))))
    direction = motif.get("direction", "right")
    start, end = (8, 90) if direction != "left" else (92, 10)
    if direction == "left":
        d = "M92 50 Q82 30 72 50 T52 50 T32 50 T12 50"
        arrow = [_line(12, 78, 38, 78, color), _arrow_head(38, 78, 12, 78, color)]
    else:
        controls = []
        step = 80 / (freq * 2)
        x = start
        for index in range(freq * 2):
            cx = x + step / 2
            cy = 50 - amp if index % 2 == 0 else 50 + amp
            controls.append(f"Q{cx:.1f} {cy:.1f} {x+step:.1f} 50")
            x += step
        d = f"M{start} 50 " + " ".join(controls)
        arrow = [_line(64, 78, 88, 78, color), _arrow_head(88, 78, 64, 78, color)]
    return [
        _path(d, color, 2.4),
        *arrow,
        _text(50, 92, _label(motif.get("label"), "propagating packet"), "muted", 8),
    ]


def vector(motif: dict, color: str):
    angle = int(motif.get("angle", 0))
    if angle not in (0, 45, 90, 135, 180):
        angle = 0
    length = max(20, min(60, float(motif.get("length", 38))))
    ox, oy = {0: (12, 72), 45: (25, 72), 90: (50, 88), 135: (75, 72), 180: (88, 72)}[angle]
    rad = math.radians(angle)
    ex, ey = ox + math.cos(rad) * length, oy - math.sin(rad) * length
    return [
        _line(ox, oy, ex, ey, color, 2.2),
        _arrow_head(ox, oy, ex, ey, color, 5),
        _text(50, 90, _label(motif.get("label"), "p = E/c"), color, 8),
    ]


def box(motif: dict, color: str):
    filled = bool(motif.get("filled"))
    return [
        _rect(28, 28, 44, 44, color, "none", 5, 1.8),
        _text(50, 55, _label(motif.get("symbol"), "m"), color, 13),
        _text(50, 88, _label(motif.get("label"), "confined energy"), "muted", 8),
    ]


def ring(motif: dict, color: str):
    rings = max(2, min(4, int(motif.get("rings", 3))))
    out = []
    for index in range(rings):
        out.append(_circle(50, 48, 32 - index * 8, color, "none", 1.8 if index == 0 else 1.2))
    out.append(_circle(50, 48, 4, color, color, 1))
    out.append(_text(50, 90, _label(motif.get("label"), "rest mass"), "muted", 8))
    return out


def pair(motif: dict, color: str):
    labels = motif.get("labels") or ["e⁻", "e⁺"]
    return [
        _line(32, 50, 68, 50, "muted", 1),
        _circle(30, 50, 12, color, "none", 1.4),
        _circle(70, 50, 12, "coral", "none", 1.4),
        _text(30, 54, str(labels[0])[:4], color, 9),
        _text(70, 54, str(labels[1])[:4], "coral", 9),
        _text(50, 88, _label(motif.get("label"), "particle pair"), "muted", 8),
    ]


def axis(motif: dict, color: str):
    endpoints = motif.get("endpoints") or ["−p", "+p"]
    return [
        _line(10, 66, 90, 66, "muted", 1.2),
        _line(50, 58, 50, 74, "muted", 1.2),
        _line(10, 60, 10, 72, color, 1.2),
        _line(90, 60, 90, 72, color, 1.2),
        _text(10, 84, str(endpoints[0])[:8], "muted", 8),
        _text(50, 84, "p = 0", "white", 8),
        _text(90, 84, str(endpoints[1])[:8], "muted", 8),
    ]


def collision(motif: dict, color: str):
    return [
        _path("M8 50 Q18 30 28 50 T48 50", "gold", 2.2),
        _path("M92 50 Q82 30 72 50 T52 50", "coral", 2.2),
        _circle(50, 50, 7 + min(8, float(motif.get("burst", 6))), "white", "none", 1.6),
        _circle(50, 50, 3, "white", "white", 1),
        _text(50, 88, _label(motif.get("label"), "collision"), "muted", 8),
    ]


def field(motif: dict, color: str):
    rings = max(2, min(4, int(motif.get("rings", 3))))
    out = [
        _line(10, 50, 90, 50, "muted", 1),
        _line(50, 10, 50, 90, "muted", 1),
    ]
    for index in range(rings):
        r = 26 - index * 6
        out.append(_circle(50, 50, r, color, "none", 1.4))
    for x, y in [(30, 50), (50, 30), (70, 50), (50, 70)]:
        out.append(_circle(x, y, 2, color, color, 1))
    out.append(_text(50, 92, _label(motif.get("label"), "field excitation"), "muted", 8))
    return out


def equation(motif: dict, color: str):
    formula = _label(motif.get("formula"), "E = mc²")
    return [
        _text(50, 45, formula, color, 10),
        _line(22, 55, 78, 55, "muted", 1),
        _text(50, 78, _label(motif.get("label"), "invariant relation"), "muted", 8),
    ]


EXPANDERS = {
    "wave": wave,
    "vector": vector,
    "box": box,
    "ring": ring,
    "pair": pair,
    "axis": axis,
    "collision": collision,
    "field": field,
    "equation": equation,
}


def validate_motif(motif) -> str | None:
    if not isinstance(motif, dict):
        return "Each node needs a motif object."
    kind = motif.get("type")
    if kind not in MOTIFS:
        return f"Motif type must be one of {sorted(MOTIFS)}."
    if kind in {"wave", "vector", "box", "ring", "pair", "collision", "field", "equation"}:
        label = motif.get("label")
        if label is not None and (not isinstance(label, str) or len(label) > 40):
            return "Motif label must be under 40 characters."
    if kind == "vector" and int(motif.get("angle", 0)) not in (0, 45, 90, 135, 180):
        return "Vector angle must be 0, 45, 90, 135 or 180."
    if kind == "wave" and int(motif.get("frequency", 2)) not in (1, 2, 3, 4):
        return "Wave frequency must be 1–4."
    return None


def expand_motif(motif: dict, color: str) -> list[dict]:
    error = validate_motif(motif)
    if error:
        raise ValueError(error)
    return EXPANDERS[motif["type"]](motif, color if color in PALETTE else "blue")
