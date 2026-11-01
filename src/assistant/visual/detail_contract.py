"""Shared visual-detail contract for QWEEPS lesson planning.

Ported from Generative Manim's low/medium/high prompt families and adapted to
QWEEPS' plan schema (beats + elements), so a planner request carries an explicit
staging budget instead of "please be detailed".

    QWEEPS_VISUAL_DETAIL=low|medium|high     (default: high)
"""

from __future__ import annotations

import os

DETAIL_LEVELS = ("low", "medium", "high")

_HIGH = """## Visual detail contract: HIGH
The learner asked for a detailed explanation, so build one.

- 5 to 7 beats, 12 to 20 seconds each, 70 to 110 seconds total.
- 8 to 16 elements per beat, at least 4 of them labelled parts.
- Every beat answers a concrete question with ONE new inference made visible by a
  change: a motion, a transform between two states, a trace, or a measured value
  appearing. A new card with the same idea reworded is not a beat.
- Structure per beat: establish the setting, construct the geometry, change it,
  then hold 1 to 2 seconds so the result can be read.
- At least one continuous movement per beat. Never replace objects with a static
  cut when a shift, transform or traced path would show the relationship.
- When an element persists across beats, reuse its id so the renderer interpolates
  it; do not fade it out and recreate it.
- Keep 0.3 units between labels and geometry, labels inside their container with
  0.3 units of padding, and reserve y < -2.5 for the single conclusion line.
- Aim for 1080p legibility: nothing smaller than 0.15 units.

Before returning JSON, check: ids are unique; every edge references a distinct
same-beat node; labels are 45 characters or fewer; every beat has a visible
change; no beat repeats the previous inference; every coordinate is inside
x -6..6, y -2.8..2.8.
"""

_MEDIUM = """## Visual detail contract: MEDIUM
- 3 to 5 beats, 12 to 18 seconds each.
- 5 to 10 elements per beat, at least 2 labelled parts.
- Each beat changes the scene to reveal one inference; a hold of 1 to 2 seconds at
  the end. Labels are 45 characters or fewer and stay inside the frame.
"""

_LOW = """## Visual detail contract: LOW
- 1 to 3 beats, 8 to 12 seconds each, 4 to 8 elements per beat.
- One idea, one visible change, one label per part. No sub-panels.
"""

_CONTRACTS = {"low": _LOW, "medium": _MEDIUM, "high": _HIGH}


def detail_level(default: str = "high") -> str:
    value = (os.environ.get("QWEEPS_VISUAL_DETAIL") or default).strip().lower()
    return value if value in _CONTRACTS else default


def detail_contract(level: str | None = None) -> str:
    """Return the contract text for a level (reads the env when omitted)."""
    return _CONTRACTS.get((level or detail_level()).lower(), _HIGH)


def with_detail(prompt: str, level: str | None = None) -> str:
    """Append the contract to a planner prompt if it is not already present."""
    marker = "## Visual detail contract:"
    if marker in prompt:
        return prompt
    return prompt.rstrip() + "\n\n" + detail_contract(level)
