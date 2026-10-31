"""Canonical v3 envelope and the authoring → compiled lowering pass."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import unicodedata
from typing import Any

from .dsl import is_generated, provenance as parse_provenance
from .plan import PlanError, validate_plan
from .text_layout import apply_layout
from .timing import expand_loops, resolve

SCHEMA_VERSION = 3


def canonical_json(value: Any) -> str:
    """Deterministic JSON: NFC, sorted keys, compact separators, floats 6dp."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise PlanError("non-finite numbers cannot be hashed")
        if value == 0:
            value = 0.0
        return f"{value:.6f}"
    if isinstance(value, str):
        return json.dumps(unicodedata.normalize("NFC", value), ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        parts = []
        for key in sorted(value):
            if not isinstance(key, str):
                raise PlanError("JSON object keys must be strings")
            parts.append(json.dumps(unicodedata.normalize("NFC", key), ensure_ascii=False)
                         + ":" + canonical_json(value[key]))
        return "{" + ",".join(parts) + "}"
    raise PlanError(f"unsupported JSON value type: {type(value).__name__}")


def authoring_hash(spec: dict, authoring_beats: list) -> str:
    payload = canonical_json({"spec": spec, "authoringBeats": authoring_beats})
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_envelope(spec: dict, authoring_beats: list, compiled_scene: dict) -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "authoringSha256": authoring_hash(spec, authoring_beats),
        "spec": spec,
        "authoringBeats": authoring_beats,
        "compiledScene": compiled_scene,
    }


def validate_envelope(document: Any) -> dict:
    if not isinstance(document, dict) or document.get("schemaVersion") != SCHEMA_VERSION:
        raise PlanError("unsupported v3 envelope")
    spec = document.get("spec")
    beats = document.get("authoringBeats")
    compiled = document.get("compiledScene")
    if not isinstance(spec, dict) or not isinstance(beats, list) or not isinstance(compiled, dict):
        raise PlanError("v3 envelope is missing spec, authoringBeats or compiledScene")
    expected = authoring_hash(spec, beats)
    if document.get("authoringSha256") != expected:
        raise PlanError("authoringHash mismatch; recompile before loading")
    return document


def needs_recompile(document: dict) -> bool:
    try:
        validate_envelope(document)
        return False
    except PlanError:
        return True


def _assign_containment(beat: dict) -> None:
    """A label fully inside exactly one shape is that shape's child."""
    shapes = [e for e in beat.get("elements", [])
              if e.get("kind") not in {"text", "arrow", "line"}]
    for text in beat.get("elements", []):
        if text.get("kind") != "text" or text.get("parentId"):
            continue
        inside = []
        for shape in shapes:
            if (text["x"] - text["width"] / 2 >= shape["x"] - shape["width"] / 2
                    and text["x"] + text["width"] / 2 <= shape["x"] + shape["width"] / 2
                    and text["y"] - text["height"] / 2 >= shape["y"] - shape["height"] / 2
                    and text["y"] + text["height"] / 2 <= shape["y"] + shape["height"] / 2):
                inside.append(shape)
        if len(inside) == 1:
            text["parentId"] = inside[0]["id"]


def compile_lesson(authoring: dict, cue_times: list[dict] | dict | None = None) -> dict:
    """Lower one authoring scene into a validated compiled scene.

    ``cue_times`` is either one mapping shared by every beat or a list per beat.
    Timing expressions are resolved here; the compiled scene contains absolute
    ``revealAt``/``drawDuration`` values only.
    """
    if not isinstance(authoring, dict) or not isinstance(authoring.get("beats"), list):
        raise PlanError("authoring scene needs a beats list")
    beats = copy.deepcopy(authoring["beats"])
    if not beats:
        raise PlanError("authoring scene needs at least one beat")
    shared = cue_times if isinstance(cue_times, dict) else None
    per_beat = cue_times if isinstance(cue_times, list) else None
    if per_beat is not None and len(per_beat) != len(beats):
        raise PlanError("cue_times must provide one mapping per beat")

    snapshots = []
    cursor = 0.0
    for index, beat in enumerate(beats):
        cues = (per_beat[index] if per_beat is not None else shared) or {}
        passes = expand_loops(beat.get("loops"), cues)
        elements = beat.get("elements")
        if not isinstance(elements, list) or not elements:
            raise PlanError(f"beat {index} has no elements")
        deduped, seen = [], set()
        for element in elements:
            eid = element.get("id") if isinstance(element, dict) else None
            if eid in seen:
                continue
            seen.add(eid)
            deduped.append(element)
        elements = deduped
        beat["elements"] = deduped
        times = resolve(elements, cues, passes)
        for element in elements:
            eid = element.get("id")
            if eid in times:
                element["revealAt"] = times[eid]["start"]
                element["drawDuration"] = times[eid]["drawDuration"]
        last_end = max((value["end"] for value in times.values()), default=0.0)
        duration = beat.get("duration", 12)
        if not isinstance(duration, (int, float)) or isinstance(duration, bool):
            duration = 12
        beat["duration"] = min(90, max(4, float(duration), last_end + 0.3))
        snapshots.append({
            "beat": index,
            "visualStart": round(cursor, 3),
            "visualEnd": round(cursor + beat["duration"], 3),
            "narrationAt": beat.get("narrationAt", 1.5),
            "cueTimes": dict(cues),
        })
        cursor += beat["duration"]

    scene = copy.deepcopy(authoring)
    scene["beats"] = beats
    compiled = validate_plan(scene, strict_edges=False, repair_containment=True,
                             repair_duplicates=True)
    for beat in compiled["beats"]:
        _assign_containment(beat)
        for element in beat["elements"]:
            apply_layout(element)

    provenance = {}
    for index, beat in enumerate(compiled["beats"]):
        for element in beat["elements"]:
            if is_generated(element["id"]):
                parsed = parse_provenance(element["id"]) or {}
                provenance[element["id"]] = {
                    "beat": index,
                    "authoringId": parsed.get("authoringId", ""),
                    "path": "beats[%d].elements" % index,
                }
    spec = {"roleTable": authoring.get("roleTable", {}),
            "cueTimes": per_beat if per_beat is not None else shared or {}}
    return {
        "compiled": compiled,
        "provenance": provenance,
        "snapshots": snapshots,
        "envelope": build_envelope(spec, authoring["beats"], compiled),
    }
