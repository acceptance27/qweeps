"""Teaching methods and the layouts that can execute them.

The method is chosen before the layout: a layout is an implementation detail,
not the pedagogical operation. Shared by the hybrid compiler and the live
lesson planner so both enforce the same pairing.
"""
from __future__ import annotations

from .plan import PlanError

TEACHING_LAYOUTS = {
    "construction": {"diagram"},
    "mechanism": {"fanin", "diagram"},
    "quantitative": {"diagram", "matrix"},
    "comparison": {"comparison", "matrix", "diagram"},
    "procedure": {"process", "timeline"},
    "algorithm": {"timeline", "process"},
    "narrative": {"timeline"},
    "recall": {"loci", "concept"},
}


def validate_teaching(value, layout: str, label: str = "beat") -> str:
    """Return the teaching method, or raise when it cannot drive this layout."""
    if value not in TEACHING_LAYOUTS:
        raise PlanError(
            f"{label} needs a teaching method before a layout; use one of "
            f"{', '.join(sorted(TEACHING_LAYOUTS))}")
    allowed = TEACHING_LAYOUTS[value]
    if layout not in allowed:
        raise PlanError(
            f"{label} teaching '{value}' needs layout {', '.join(sorted(allowed))}, "
            f"not '{layout}'")
    return value
