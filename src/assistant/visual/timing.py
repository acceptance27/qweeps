"""Cue/relative timing lowering for AuthoringBeat.

Expressions are resolved to absolute seconds before a CompiledBeat is written.
Supported forms:

- ``0.0``                                  absolute
- ``with:cue.<id>``                        at a spoken cue
- ``after:cue.<id>+0.2``                   cue + offset
- ``with:el.<id>.start``                   at another element's start
- ``after:el.<id>.end+0.1``                after another element finishes
- ``with:pass.<loop>[0].start``            at a bounded loop pass start

The resolver performs a Kahn topological sort and rejects cycles, dangling
anchors, and effect elements that start at the root with no causal anchor.
"""
from __future__ import annotations

import re
from typing import Any

from .plan import PlanError

NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")
CUE = re.compile(r"^(with|after|at):cue[._]([a-z0-9_-]+)(?:\s*\+\s*(-?\d+(?:\.\d+)?))?$")
ELEMENT = re.compile(r"^(with|after|at):(?:el|element)[._]([A-Za-z0-9_-]+)[._](start|end)(?:\s*\+\s*(-?\d+(?:\.\d+)?))?$")
DOTTED = re.compile(r"^(with|after|at):([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+(?:\s*\+\s*(-?\d+(?:\.\d+)?))?$")
SHORT = re.compile(r"^(with|after|at):([A-Za-z0-9_-]+)(?:\s*\+\s*(-?\d+(?:\.\d+)?))?$")
PASS = re.compile(r"^(with|after|at):pass[._]([a-z0-9_-]+)\[(\d+)\][._](start|end)(?:\s*\+\s*(-?\d+(?:\.\d+)?))?$")

EFFECT_ROLES = {"sampled_output", "prediction", "result", "conclusion", "transformed_state"}
PART_ROLES = {"part", "token_piece", "component"}


class TimingError(PlanError):
    pass


def parse(expression: Any) -> dict:
    if isinstance(expression, (int, float)) and not isinstance(expression, bool):
        return {"kind": "absolute", "value": float(expression)}
    if not isinstance(expression, str) or not expression.strip():
        raise TimingError("timing expression must be a number or a string")
    text = expression.strip()
    if NUMBER.match(text):
        return {"kind": "absolute", "value": float(text)}
    match = CUE.match(text)
    if match:
        return {"kind": "cue", "name": match.group(2),
                "offset": float(match.group(3) or 0)}
    match = ELEMENT.match(text)
    if match:
        return {"kind": "element", "name": match.group(2), "edge": match.group(3),
                "offset": float(match.group(4) or 0)}
    match = PASS.match(text)
    if match:
        return {"kind": "pass", "name": match.group(2), "index": int(match.group(3)),
                "edge": match.group(4), "offset": float(match.group(5) or 0)}
    match = DOTTED.match(text)
    if match:
        return {"kind": "auto", "mode": match.group(1), "name": match.group(2),
                "offset": float(match.group(3) or 0)}
    match = SHORT.match(text)
    if match:
        return {"kind": "auto", "mode": match.group(1), "name": match.group(2),
                "offset": float(match.group(3) or 0)}
    raise TimingError(f"unsupported timing expression: {expression}")


def expand_loops(loops: list[dict] | None, cues: dict[str, float]) -> dict[str, list[tuple[float, float]]]:
    """Unroll finite loops into concrete pass intervals.
    ``{"id": "autoreg", "t_start": "with:cue.loop", "passes": 2, "passDuration": 1.8}``
    """
    out: dict[str, list[tuple[float, float]]] = {}
    for loop in loops or []:
        if not isinstance(loop, dict):
            raise TimingError("loop must be an object")
        name = loop.get("id")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9_-]+", name):
            raise TimingError("loop id must match [a-z0-9_-]+")
        passes = loop.get("passes")
        duration = loop.get("passDuration")
        if type(passes) is not int or not 1 <= passes <= 20:
            raise TimingError("loop passes must be an integer between 1 and 20")
        if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not 0.2 <= duration <= 30:
            raise TimingError("loop passDuration must be between 0.2 and 30 seconds")
        anchor = loop.get("t_start", 0.0)
        if isinstance(anchor, str):
            parsed = parse(anchor)
            if parsed["kind"] == "cue":
                if parsed["name"] not in cues:
                    raise TimingError(f"loop '{name}' references unknown cue '{parsed['name']}'")
                start = cues[parsed["name"]] + parsed.get("offset", 0)
            elif parsed["kind"] == "absolute":
                start = parsed["value"]
            elif parsed["kind"] == "auto" and parsed["name"] in cues:
                start = cues[parsed["name"]] + parsed.get("offset", 0)
            elif parsed["kind"] in {"auto", "element"}:
                # Phase 1 synthetic clock: an element/pass anchor cannot be resolved
                # before element times exist; start the macro at the beat's cue floor.
                start = 0.4 + parsed.get("offset", 0)
            else:
                raise TimingError(f"loop '{name}' must start at a cue or absolute time")
        elif isinstance(anchor, (int, float)) and not isinstance(anchor, bool):
            start = float(anchor)
        else:
            raise TimingError(f"loop '{name}' has an invalid t_start")
        out[name] = [(start + i * duration, start + (i + 1) * duration) for i in range(passes)]
    return out


def resolve(elements: list[dict], cues: dict[str, float],
            passes: dict[str, list[tuple[float, float]]] | None = None) -> dict[str, dict]:
    """Resolve every element's start/drawDuration to absolute seconds."""
    passes = passes or {}
    nodes: dict[str, dict] = {}
    for element in elements:
        if not isinstance(element, dict):
            raise TimingError("element must be an object")
        eid = element.get("id")
        if not isinstance(eid, str) or not eid:
            raise TimingError("element id is required")
        if eid in nodes:
            raise TimingError(f"duplicate element id '{eid}'")
        duration = element.get("drawDuration", 0.5)
        if isinstance(duration, str):
            try:
                duration = float(duration.strip())
            except ValueError:
                duration = 0.5
        if (not isinstance(duration, (int, float)) or isinstance(duration, bool)
                or not duration > 0 or duration != duration or duration in (float("inf"), float("-inf"))):
            duration = 0.5
        duration = min(2.5, max(0.15, float(duration)))
        nodes[eid] = {"id": eid, "parsed": parse(element.get("revealAt", 0.0)),
                      "duration": float(duration), "role": element.get("semanticRole"),
                      "deps": set()}
    for eid, node in nodes.items():
        parsed = node["parsed"]
        if parsed["kind"] == "cue":
            if parsed["name"] not in cues:
                raise TimingError(f"element '{eid}' references unknown cue '{parsed['name']}'")
            node["base"] = cues[parsed["name"]]
        elif parsed["kind"] == "element":
            if parsed["name"] not in nodes:
                raise TimingError(f"element '{eid}' references unknown element '{parsed['name']}'")
            node["deps"].add(parsed["name"])
            node["base"] = None
        elif parsed["kind"] == "auto":
            if parsed["name"] in cues:
                node["base"] = cues[parsed["name"]]
            elif parsed["name"] in nodes:
                node["deps"].add(parsed["name"])
                node["base"] = None
            else:
                raise TimingError(f"element '{eid}' references unknown anchor '{parsed['name']}'; "
                                  "use cue.<id> or el.<id>.start/end")
        elif parsed["kind"] == "pass":
            if parsed["name"] not in passes or parsed["index"] >= len(passes[parsed["name"]]):
                raise TimingError(f"element '{eid}' references unknown loop pass "
                                  f"'{parsed['name']}[{parsed['index']}]'")
            interval = passes[parsed["name"]][parsed["index"]]
            node["base"] = interval[0] if parsed["edge"] == "start" else interval[1]
        else:
            node["base"] = parsed["value"]
        node["offset"] = parsed.get("offset", 0.0)
        if parsed["kind"] == "auto" and node["base"] is None:
            parsed["edge"] = "end" if parsed.get("mode") == "after" else "start"

    ready = [eid for eid, node in nodes.items() if not node["deps"]]
    resolved: dict[str, float] = {}
    while ready:
        eid = ready.pop()
        node = nodes[eid]
        if node["base"] is not None:
            start = node["base"] + node["offset"]
        else:
            target = nodes[node["parsed"]["name"]]
            target_start = resolved.get(target["id"])
            if target_start is None:
                raise TimingError(f"element '{eid}' depends on unresolved '{target['id']}'")
            start = target_start + (target["duration"] if node["parsed"]["edge"] == "end" else 0) + node["offset"]
        resolved[eid] = start
        for other_id, other in nodes.items():
            if eid in other["deps"]:
                other["deps"].discard(eid)
                if not other["deps"]:
                    ready.append(other_id)
    if len(resolved) != len(nodes):
        stuck = sorted(set(nodes) - set(resolved))
        raise TimingError(f"cyclic timing dependencies: {stuck}")

    result = {}
    for eid, node in nodes.items():
        start = resolved[eid]
        role = node["role"]
        parsed = node["parsed"]
        if isinstance(role, str) and role in EFFECT_ROLES and parsed["kind"] == "absolute":
            raise TimingError(f"effect element '{eid}' must declare a cue/element anchor, not an absolute start")
        result[eid] = {"id": eid, "start": round(start, 3),
                       "end": round(start + node["duration"], 3),
                       "drawDuration": node["duration"], "role": role}
    return result


def check_cue_window(start: float, cue: float, next_cue_gap: float | None) -> str | None:
    """Return a problem string when a cue-anchored start violates the sync window."""
    upper = 0.8 if next_cue_gap is None else min(0.8, max(0.0, next_cue_gap / 2))
    if start < cue - 0.1:
        return f"starts {round(cue - start, 2)}s before its cue (limit 0.1s)"
    if start > cue + upper:
        return f"starts {round(start - cue, 2)}s after its cue (limit {round(upper, 2)}s)"
    return None
