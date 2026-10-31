"""Security validation for compiler-generated SVG.

Model-authored illustrations go through ``plan.validate_svg``. Compiler output
may use richer structure (defs, gradients, patterns) but must never introduce
scripts, external references, event handlers or URL-valued attributes.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from .plan import PlanError

FORBIDDEN = re.compile(r"(?i)(javascript:|data:|https?:|file:|url\s*\()")
HANDLER = re.compile(r"(?i)\son[a-z]+\s*=")
REFERENCE = re.compile(r"(?i)\b(?:href|xlink:href)\s*=")
MAX_BYTES = 200_000


def validate_compiled_svg(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PlanError("compiled SVG is missing")
    if len(value.encode("utf-8")) > MAX_BYTES:
        raise PlanError(f"compiled SVG exceeds {MAX_BYTES} bytes")
    if "<!" in value or "<?" in value:
        raise PlanError("compiled SVG cannot contain declarations")
    if "<script" in value.lower() or HANDLER.search(value):
        raise PlanError("compiled SVG cannot contain scripts or event handlers")
    if REFERENCE.search(value) or FORBIDDEN.search(value):
        raise PlanError("compiled SVG cannot contain external references or URLs")
    try:
        root = ET.fromstring(value)
    except ET.ParseError as exc:
        raise PlanError("compiled SVG is not valid XML") from exc
    if root.tag.rsplit("}", 1)[-1] != "svg" or not root.get("viewBox"):
        raise PlanError("compiled SVG needs a viewBox")
    return value
