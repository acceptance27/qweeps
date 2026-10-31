"""Deterministic text layout for the v3 compiler.

Approximate, font-pinned metrics: the renderer runs with fit:"none" and draws
the supplied lines at the supplied size. Values are world units.
"""
from __future__ import annotations

CHAR_RATIO = 0.55   # advance per character relative to font size
LINE_RATIO = 1.25   # line height relative to font size
MAX_LINES = 4


def wrap(text: str, width: float, font_size: float) -> list[str]:
    limit = max(1, int(width / max(0.01, font_size * CHAR_RATIO)))
    words = (text or "").split()
    lines, current = [], ""
    for word in words:
        while len(word) > limit:
            if current:
                lines.append(current)
                current = ""
            lines.append(word[:limit])
            word = word[limit:]
        candidate = f"{current} {word}".strip()
        if len(candidate) <= limit or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def layout(text: str, width: float, height: float, max_size: float = 0.5) -> dict:
    """Shrink until the wrapped text fits the box, or report that it cannot."""
    size = max(0.15, min(max_size, height))
    while size >= 0.15:
        lines = wrap(text, width, size)
        if len(lines) <= MAX_LINES and len(lines) * size * LINE_RATIO <= height:
            return {"lines": lines, "fontSize": round(size, 3), "fits": True}
        size -= 0.025
    return {"lines": wrap(text, width, 0.15), "fontSize": 0.15, "fits": False}


def apply_layout(element: dict) -> dict:
    if element.get("kind") != "text":
        return element
    result = layout(element.get("label", ""), element.get("width", 2), element.get("height", 0.5))
    element["lines"] = result["lines"]
    element["fontSize"] = result["fontSize"]
    if not result["fits"]:
        element["layoutOverflow"] = True
    return element
