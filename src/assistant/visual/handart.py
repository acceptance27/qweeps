"""Validation for model-authored diagram artwork.

The model writes primitives directly. This module enforces the safety contract:
normalized 0-100 coordinates, a small shape vocabulary, palette colors, bounded
text and no executable/external markup.
"""
from __future__ import annotations

import re

from .motifs import PALETTE

TYPES = {"path", "line", "circle", "rect", "text"}
PATH = re.compile(r"^[MLCQTZ0-9 .,\-]+$")
NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
COLORS = PALETTE | {"none"}


def _num(value, low, high):
    return isinstance(value, (int, float)) and low <= value <= high


def validate_artwork(artwork) -> list[str]:
    findings: list[str] = []
    if not isinstance(artwork, list) or not 3 <= len(artwork) <= 16:
        return ["Each node needs 3–16 handcrafted primitives."]
    for index, item in enumerate(artwork):
        label = f"Primitive {index+1}"
        if not isinstance(item, dict) or item.get("type") not in TYPES:
            findings.append(f"{label} needs a supported type.")
            continue
        if item.get("stroke") not in COLORS or item.get("fill", "none") not in COLORS:
            findings.append(f"{label} must use a palette color or none.")
        if not _num(item.get("strokeWidth", 1), 0.3, 4):
            findings.append(f"{label} strokeWidth must be 0.3–4.")
        kind = item["type"]
        if kind == "text":
            if not isinstance(item.get("text"), str) or not 1 <= len(item["text"]) <= 40:
                findings.append(f"{label} text must be 1–40 characters.")
            if not _num(item.get("x"), 0, 100) or not _num(item.get("y"), 0, 100):
                findings.append(f"{label} text coordinates must be 0–100.")
            if not _num(item.get("size"), 5, 14):
                findings.append(f"{label} text size must be 5–14.")
        elif kind == "path":
            d = item.get("d")
            if not isinstance(d, str) or not PATH.fullmatch(d):
                findings.append(f"{label} path uses unsupported commands.")
            else:
                numbers = [float(value) for value in NUMBER.findall(d)]
                if not numbers or any(value < 0 or value > 100 for value in numbers):
                    findings.append(f"{label} path coordinates must be 0–100.")
        elif kind == "line":
            for key in ("x1", "y1", "x2", "y2"):
                if not _num(item.get(key), 0, 100):
                    findings.append(f"{label} {key} must be 0–100.")
        elif kind == "circle":
            if not _num(item.get("cx"), 0, 100) or not _num(item.get("cy"), 0, 100):
                findings.append(f"{label} circle centre must be 0–100.")
            if not _num(item.get("r"), 1, 40):
                findings.append(f"{label} circle radius must be 1–40.")
        elif kind == "rect":
            if not _num(item.get("width"), 1, 100) or not _num(item.get("height"), 1, 100):
                findings.append(f"{label} rect size must be 1–100.")
            if not _num(item.get("x"), 0, 100) or not _num(item.get("y"), 0, 100):
                findings.append(f"{label} rect position must be 0–100.")
    return findings
