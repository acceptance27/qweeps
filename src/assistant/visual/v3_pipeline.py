"""v3 /ask pipeline: two-stage planning, per-beat direction, compile, judge.

Enabled with ``QWEEPS_V3=1``; the legacy monolithic path remains the default
until this is benchmarked.
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

from .contract import boundary_snapshot, director_prompt, validate_state_contract
from .gate import check_scene
from .geometry import resolve_text_layout, separate_text, separate_text_from_links
from .judge import judge
from .pedagogy import (DIRECTOR, PLANNER, _call_model, _model_json, _text,
                       teaching_material, validate_storyboard)
from .plan import ROLE_SLOTS, PlanError, validate_role_table
from .timing import EFFECT_ROLES
from .v3 import compile_lesson

ROLE_ADDENDUM = """
In addition to the storyboard schema, return:
 "roleTable": {"role_name":"slot_0|slot_1|...|slot_7"} (at most 8 roles),
 "answer": "a direct answer to the original question".
Use only these roles for elements later: input_token, embedding_vector,
attention_weight, probability_dist, sampled_output, context, result, part.
"""

CONTRACT_PROMPT = """Compile the storyboard into a topological state contract.
Return JSON only:
{"beats":[{"beatId":"storyboard id",
 "retain":["existing element ids"],
 "mutate":[{"id":"existing id","toRole":"role"}],
 "enter":[{"id":"new stable id","kind":"box|text|circle|arrow|line|path|svg","role":"role","cue":"cue id"}],
 "exit":["element ids removed in this beat"],
 "cameraIntent":"short description"}]}
Every retained or mutated id must exist in a previous beat. Effect roles
(sampled_output, prediction, result, conclusion, transformed_state) need a cue.
Part roles (part, token_piece, component) need "derivedFrom":"parent id".
The registry must include EVERY object the beat narration names — inputs,
weights, sums, biases, markers, arrows, curves and readouts — not only the focal
objects. If an object is named in speech, it must be in enter or retain.
When a later beat changes an existing object's value or label, retain that same
id and let the director relabel it; never create `_case2`, `_v2` or otherwise
duplicated ids. Only genuinely new objects enter. Declare curves and plots as
kind svg (or path) so the director can draw them with `chart`. Use kind arrow or
line only for an edge between two objects (from/to). A one-anchor direction cue
(a bar dropping, a trend, a shift) is kind text with a glyph label, not an edge.
Axes and reference rules are kind line with role axis or guide; the director shows
them with direction=horizontal or vertical.
Do not invent narration."""


def _validate_1a(raw: Any) -> dict:
    storyboard = validate_storyboard(raw, require_visual_design=True)
    role_table = validate_role_table(raw.get("roleTable"))
    if not role_table:
        raise PlanError("the v3 planner must declare a roleTable")
    answer = _text(raw.get("answer"), "answer", 6000)
    return {"storyboard": storyboard, "roleTable": role_table, "answer": answer}


def _validate_contract(raw: Any, storyboard: dict) -> dict:
    beats = raw.get("beats") if isinstance(raw, dict) else None
    problems = validate_state_contract(beats, storyboard["beats"])
    if problems:
        raise PlanError("; ".join(problems[:4]))
    return {"beats": beats}


def _one_beat(raw: Any) -> dict:
    if isinstance(raw, dict) and isinstance(raw.get("beats"), list) and raw["beats"]:
        raw = raw["beats"][0]
    if not isinstance(raw, dict) or not isinstance(raw.get("elements"), list):
        raise PlanError("director must return one beat with elements")
    return raw


def _synthetic_cues(entry: dict, beat: dict) -> dict[str, float]:
    """Phase 1 has no measured speech: place declared/referenced cues evenly in a beat."""
    names: list[str] = []
    for item in entry.get("enter", []) or []:
        if isinstance(item, dict) and isinstance(item.get("cue"), str):
            names.append(item["cue"])
    text = json.dumps(beat, ensure_ascii=False)
    names.extend(re.findall(r"cue[._]([a-z0-9_-]+)", text))
    element_ids = {element.get("id") for element in beat.get("elements", []) if isinstance(element, dict)}
    names.extend(name for name in re.findall(r'(?:with|after|at):([A-Za-z0-9_-]+)"', text)
                 if name not in element_ids and not name.startswith(("cue_", "el_", "pass_")))
    names.extend(name for name in re.findall(r'(?:with|after|at):([A-Za-z0-9_-]+)\.', text)
                 if name not in element_ids)
    names = list(dict.fromkeys(names))
    duration = beat.get("duration", 10)
    duration = float(duration) if isinstance(duration, (int, float)) and not isinstance(duration, bool) else 10.0
    step = max(0.5, (max(4.0, duration) - 1.5) / max(1, len(names)))
    return {name: round(0.4 + index * step, 3) for index, name in enumerate(names)}


def _load_checkpoint(path: str | None, question: str, mode: str) -> dict | None:
    if not path or not Path(path).exists():
        return None
    data = json.loads(Path(path).read_text())
    if data.get("question") != question or data.get("mode") != mode:
        raise PlanError("checkpoint belongs to a different request")
    return data


def _save_checkpoint(path: str | None, payload: dict) -> None:
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_suffix(".tmp")
    pending.write_text(json.dumps(payload, ensure_ascii=False))
    pending.replace(target)


def _capture(payload: dict) -> None:
    """Persist a failing beat so the compiler can be replayed without a model call."""
    folder = Path(os.environ.get("QWEEPS_CAPTURE_DIR", "/tmp/opencode/qweeps-capture"))
    try:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"failure-{int(time.time() * 1000)}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=1))
    except OSError:
        pass


def _broken(element: dict) -> bool:
    kind = element.get("kind")
    if kind == "path" and not element.get("points"):
        return True
    if kind in {"arrow", "line"} and not (element.get("from") and element.get("to")):
        return True
    return False


def _inject_retained(beat: dict, retained_ids: list[str], previous: dict, known: dict,
                     registry: dict | None = None) -> None:
    present: dict[str, dict] = {}
    for element in beat.get("elements", []):
        if isinstance(element, dict) and element.get("id") not in present:
            present[element["id"]] = element
    for eid in retained_ids:
        existing = present.get(eid)
        if existing is not None and not _broken(existing):
            continue
        if existing is not None:
            beat["elements"] = [element for element in beat.get("elements", [])
                                if element.get("id") != eid]
        prev = existing or {**(known.get(eid) or {}), **((previous.get(eid) or {}))}
        if not prev and registry and eid in registry:
            spec = registry[eid]
            prev = {"id": eid, "kind": spec.get("kind") or "box", "label": eid,
                    "x": 0, "y": 0, "width": 2, "height": 1,
                    "semanticRole": spec.get("role")}
        if not prev:
            continue
        kind = prev.get("kind") or "box"
        if kind == "path" and not prev.get("points"):
            kind = "box"
        if kind in {"arrow", "line"} and not (prev.get("from") and prev.get("to")):
            kind = "box"
        injected = {"id": eid, "kind": kind,
                    "label": prev.get("label", ""), "x": prev.get("x", 0),
                    "y": prev.get("y", 0), "width": prev.get("width", 2),
                    "height": prev.get("height", 1), "revealAt": 0,
                    "drawDuration": 0.15, "opacity": 1}
        if prev.get("semanticRole"):
            injected["semanticRole"] = prev["semanticRole"]
        if prev.get("from") and prev.get("to"):
            injected["from"], injected["to"] = prev["from"], prev["to"]
        for field in ("points", "closed", "smooth", "svg", "svgRef", "bars", "chartType"):
            if prev.get(field) is not None:
                injected[field] = prev[field]
        beat.setdefault("elements", []).append(injected)
        present[eid] = injected


def _repair_svgs(beat: dict) -> None:
    """SVG must be geometry only; strip text/style nodes rather than abort."""
    for element in beat.get("elements", []) or []:
        if not isinstance(element, dict):
            continue
        if element.get("kind") == "svg" and not (element.get("svg") or element.get("svgRef") or element.get("bars")):
            element["kind"] = "box"
            continue
        if not isinstance(element.get("svg"), str):
            continue
        svg = element["svg"]
        if "<text" in svg.lower():
            svg = re.sub(r"<text\b[^>]*>.*?</text\s*>", "", svg, flags=re.I | re.S)
            svg = re.sub(r"<text\b[^>]*/>", "", svg, flags=re.I)
        if "<style" in svg.lower():
            svg = re.sub(r"<style\b[^>]*>.*?</style\s*>", "", svg, flags=re.I | re.S)
        element["svg"] = svg


def _repair_roles(beat: dict, role_table: dict[str, str]) -> None:
    """Extend the lesson role table with a free slot; drop roles when the palette is full."""
    used = set(role_table.values())
    for element in beat.get("elements", []) or []:
        if not isinstance(element, dict):
            continue
        role = element.get("semanticRole")
        if not role or role in role_table:
            continue
        if not isinstance(role, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", role):
            element.pop("semanticRole", None)
            continue
        free = [slot for slot in ROLE_SLOTS if slot not in used]
        if not free:
            element.pop("semanticRole", None)
            continue
        role_table[role] = free[0]
        used.add(free[0])


def _repair_malformed_timing(beat: dict, entry: dict, cues: dict[str, float]) -> dict[str, float]:
    """A value with no ':' is not a timing expression; restore a legal default."""
    for element in beat.get("elements", []) or []:
        if not isinstance(element, dict):
            continue
        value = element.get("revealAt")
        if not isinstance(value, str) or ":" in value:
            continue
        try:
            float(value)
            continue
        except ValueError:
            pass
        if element.get("semanticRole") in EFFECT_ROLES:
            cue = next(iter(cues), "beat")
            cues.setdefault(cue, 0.4)
            element["revealAt"] = f"with:cue.{cue}"
        else:
            element["revealAt"] = 0.0
    return cues


def _enforce_effect_anchors(beat: dict, entry: dict, cues: dict[str, float]) -> dict[str, float]:
    """The planner declares the dependency; if the director drops it, restore it."""
    declared = {}
    for item in entry.get("enter", []) or []:
        if isinstance(item, dict) and item.get("cue"):
            declared[item.get("id")] = item["cue"]
    for element in beat.get("elements", []) or []:
        if not isinstance(element, dict) or element.get("semanticRole") not in EFFECT_ROLES:
            continue
        anchor = element.get("revealAt")
        numeric = isinstance(anchor, (int, float)) and not isinstance(anchor, bool)
        if isinstance(anchor, str) and re.fullmatch(r"-?\d+(?:\.\d+)?", anchor.strip()):
            numeric = True
        if numeric or anchor is None:
            cue = declared.get(element.get("id"))
            if not cue:
                cue = next(iter(cues), "beat")
            cues.setdefault(cue, 0.4)
            element["revealAt"] = f"with:cue.{cue}"
    return cues


def _ids(value: Any) -> list[str]:
    out = []
    for item in value or []:
        eid = item.get("id") if isinstance(item, dict) else item
        if isinstance(eid, str):
            out.append(eid)
    return out


def teach_v3(llm: Any, question: str, context: dict, history: list, mode: str,
             rendered_review=None, judge_llm: Any = None, checkpoint: str | None = None) -> dict:
    if os.environ.get("QWEEPS_DSL") == "1":
        return _teach_v3_dsl(llm, question, context, history, mode, rendered_review,
                             judge_llm, checkpoint)
    checkpoint_path = checkpoint or os.environ.get("QWEEPS_CHECKPOINT")
    request = {"question": _text(question, "question", 4000), "mode": mode,
               "context": context, "history": history[-16:],
               "capabilities": {"primitives": ["circle", "box", "text", "arrow", "line", "path", "svg"]}}
    saved = _load_checkpoint(checkpoint_path, request["question"], mode)
    if saved:
        storyboard = saved["storyboard"]
        contract = saved["contract"]
        role_table = saved["roleTable"]
        compiled_beats = saved["compiledBeats"]
        known = saved["known"]
        cursor = saved["cursor"]
        boundary = saved["boundary"]
        answer = saved["answer"]
    else:
        plan = _model_json(
            llm,
            PLANNER + ROLE_ADDENDUM + "\n\n" + teaching_material("planner"),
            request, _validate_1a, tokens=6000)
        storyboard, role_table = plan["storyboard"], plan["roleTable"]
        answer = plan["answer"]

        contract = _model_json(
            llm, CONTRACT_PROMPT,
            {**request, "storyboard": storyboard, "roleTable": role_table},
            lambda raw: _validate_contract(raw, storyboard), tokens=3000)
        compiled_beats = []
        cursor = 0.0
        boundary = None
        known = {}

    registry: dict[str, dict] = {}
    for entry in contract["beats"]:
        for item in entry.get("enter", []) or []:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                registry[item["id"]] = {"kind": item.get("kind") or "box",
                                        "role": item.get("role")}

    start_index = len(compiled_beats)
    for index, intent in enumerate(storyboard["beats"]):
        if index < start_index:
            continue
        entry = contract["beats"][index]
        beat_request = {"question": question, "storyboardBeat": intent, "roleTable": role_table,
                        "contract": entry, "boundary": boundary, "mode": mode, "context": context}
        single = None
        for attempt in range(2):
            raw = _model_json(llm, director_prompt(entry, boundary or {}), beat_request,
                              _one_beat, tokens=5000)
            _repair_roles(raw, role_table)
            _repair_svgs(raw)
            cue_times = _synthetic_cues(entry, raw)
            cue_times = _repair_malformed_timing(raw, entry, cue_times)
            retained_ids = _ids(entry.get("retain"))
            previous = {element["id"]: element for element in (boundary["elements"] if boundary else [])}
            _inject_retained(raw, retained_ids, previous, known, registry)
            cue_times = _enforce_effect_anchors(raw, entry, cue_times)
            try:
                single = compile_lesson(
                    {"title": storyboard["driving_question"], "summary": storyboard["representation"],
                     "roleTable": role_table, "beats": [raw]}, cue_times)
            except PlanError as exc:
                if attempt == 1:
                    _capture({"beat": raw, "contract": entry, "roleTable": role_table,
                              "cueTimes": cue_times, "boundary": boundary,
                              "error": str(exc)[:800]})
                    raise
                beat_request = {**beat_request, "compile_error": str(exc)[:800]}
                continue
            beat = single["compiled"]["beats"][0]
            ids = {element["id"] for element in beat["elements"]}
            enter_ids = [item.get("id") for item in entry.get("enter", [])
                         if isinstance(item, dict) and isinstance(item.get("id"), str)]
            missing_enter = [eid for eid in enter_ids if eid not in ids]
            if missing_enter and attempt == 0:
                beat_request = {**beat_request,
                                "compile_error": f"include contract elements {missing_enter}"}
                continue
            if missing_enter:
                for eid in missing_enter:
                    spec = registry.get(eid, {})
                    injected = {"id": eid, "kind": spec.get("kind") or "box",
                                "label": eid, "x": 0, "y": 0, "width": 2, "height": 1,
                                "revealAt": 0, "drawDuration": 0.15, "opacity": 1}
                    if spec.get("role"):
                        injected["semanticRole"] = spec["role"]
                    raw.setdefault("elements", []).append(injected)
                try:
                    single = compile_lesson(
                        {"title": storyboard["driving_question"], "summary": storyboard["representation"],
                         "roleTable": role_table, "beats": [raw]}, cue_times)
                except PlanError as exc:
                    _capture({"beat": raw, "contract": entry, "roleTable": role_table,
                              "cueTimes": cue_times, "boundary": boundary,
                              "error": str(exc)[:800]})
                    raise
            break
        beat = single["compiled"]["beats"][0]
        beat["id"] = f"beat_{index}"
        ids = {element["id"] for element in beat["elements"]}
        missing = [eid for eid in retained_ids if eid not in ids]
        if missing:
            for eid in missing:
                prev = previous.get(eid) or known.get(eid) or {}
                spec = registry.get(eid, {})
                injected = {"id": eid, "kind": "box",
                            "label": prev.get("label") or eid,
                            "x": prev.get("x", 0), "y": prev.get("y", 0),
                            "width": prev.get("width", 2), "height": prev.get("height", 1),
                            "revealAt": 0, "drawDuration": 0.15, "opacity": 1}
                role = prev.get("semanticRole") or spec.get("role")
                if role:
                    injected["semanticRole"] = role
                raw["elements"] = [element for element in raw.get("elements", [])
                                   if not (isinstance(element, dict) and element.get("id") == eid)]
                raw.setdefault("elements", []).append(injected)
            cue_times = _enforce_effect_anchors(raw, entry, cue_times)
            single = compile_lesson(
                {"title": storyboard["driving_question"], "summary": storyboard["representation"],
                 "roleTable": role_table, "beats": [raw]}, cue_times)
            beat = single["compiled"]["beats"][0]
            beat["id"] = f"beat_{index}"
            ids = {element["id"] for element in beat["elements"]}
            missing = [eid for eid in retained_ids if eid not in ids]
        if missing:
            _capture({"beat": raw, "contract": entry, "roleTable": role_table,
                      "cueTimes": cue_times, "boundary": boundary,
                      "error": f"beat {intent['id']} lost retained ids {missing}"})
            raise PlanError(f"beat {intent['id']} lost retained ids {missing}")
        if boundary:
            previous = {element["id"]: element for element in boundary["elements"]}
            mutated = {_ids([item])[0] for item in entry.get("mutate", []) if _ids([item])}
            current = {element["id"]: element for element in beat["elements"]}
            for eid in retained_ids:
                if eid in mutated or eid not in previous:
                    continue
                for field in ("x", "y", "width", "height"):
                    before, after = previous[eid].get(field), current[eid].get(field)
                    if before is not None and after is not None and abs(before - after) > 1e-6:
                        raise PlanError(f"retained element '{eid}' moved without a declared mutation")
        beat["visualStart"] = round(cursor, 3)
        beat["visualEnd"] = round(cursor + beat["duration"], 3)
        beat["cueTimes"] = cue_times
        compiled_beats.append(beat)
        for element in beat["elements"]:
            known[element["id"]] = element
        cursor += beat["duration"]
        boundary = boundary_snapshot({"beats": compiled_beats}, len(compiled_beats) - 1)
        _save_checkpoint(checkpoint_path, {"question": request["question"], "mode": mode,
                                           "storyboard": storyboard, "contract": contract,
                                           "roleTable": role_table, "compiledBeats": compiled_beats,
                                           "known": known, "cursor": cursor,
                                           "boundary": boundary, "answer": answer})

    scene = {"title": storyboard["driving_question"], "summary": storyboard["representation"],
             "sources": [], "beats": compiled_beats, "roleTable": role_table}
    for beat in scene["beats"]:
        resolve_text_layout(beat.get("elements", []))
    gate = check_scene(scene)
    if not gate["approved"]:
        _capture({"scene": scene, "stage": "gate", "blockers": gate["blockers"]})
        raise PlanError("deterministic gate: " + json.dumps(gate["blockers"], ensure_ascii=False)[:1200])
    verdict = judge(scene, lambda system, user: _call_model(judge_llm or llm, system, user, 3500))
    if not verdict["approved"]:
        detail = json.dumps(verdict["blockers"], ensure_ascii=False)[:1200]
        raise PlanError("The external judge found blockers: " + detail)
    if rendered_review is not None:
        visual = rendered_review(scene, storyboard)
        if not visual["approved"]:
            raise PlanError("The rendered-frame review found blockers: "
                            + json.dumps(visual["findings"], ensure_ascii=False)[:1200])
        scene["teaching"] = {"method": "qweeps-visual-teaching", "version": 2,
                             "storyboard": storyboard, "review": verdict,
                             "frameReview": {"approved": True,
                                             "method": "native-frames-and-vision-model",
                                             "observations": visual["observations"]}}
    else:
        scene["teaching"] = {"method": "qweeps-visual-teaching", "version": 2,
                             "clock": "synthetic", "storyboard": storyboard, "review": verdict}
    if checkpoint_path and Path(checkpoint_path).exists():
        Path(checkpoint_path).unlink()
    return {"answer": answer, "scene": scene}


def _teach_v3_dsl(llm: Any, question: str, context: dict, history: list, mode: str,
                  rendered_review=None, judge_llm: Any = None, checkpoint: str | None = None) -> dict:
    """Per-beat Line DSL path: planner -> contract -> DSL director -> compile -> gate -> judge."""
    from .dsl_prompt import CUE_ADDENDUM, SYSTEM, director_prompt, ensure_cues, strip_cues
    from .line_dsl import lower, parse

    request = {"question": _text(question, "question", 4000), "mode": mode,
               "context": context, "history": history[-16:],
               "capabilities": {"primitives": ["circle", "box", "text", "arrow", "line", "path", "svg"]}}
    checkpoint_path = checkpoint or os.environ.get("QWEEPS_CHECKPOINT")
    saved = _load_checkpoint(checkpoint_path, request["question"], mode)
    base_raws = None
    if saved and saved.get("dslRaws"):
        storyboard = saved["storyboard"]
        contract = saved["contract"]
        role_table = saved["roleTable"]
        answer = saved["answer"]
        base_raws = {int(key): value for key, value in saved["dslRaws"].items()}
    else:
        plan = _model_json(
            llm,
            PLANNER + ROLE_ADDENDUM + CUE_ADDENDUM + "\n\n" + teaching_material("planner"),
            request, _validate_1a, tokens=6000)
        storyboard, role_table, answer = plan["storyboard"], plan["roleTable"], plan["answer"]
        contract = _model_json(
            llm, CONTRACT_PROMPT,
            {**request, "storyboard": storyboard, "roleTable": role_table},
            lambda raw: _validate_contract(raw, storyboard), tokens=3000)

    registry_all: dict[str, dict] = {}
    for entry in contract["beats"]:
        for item in entry.get("enter", []) or []:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                registry_all[item["id"]] = {"kind": item.get("kind") or "box",
                                            "role": item.get("role") or "",
                                            "label": item.get("label", "")}
    narrations: dict[int, str] = {}
    cue_maps: dict[int, dict[str, float]] = {}
    for index, intent in enumerate(storyboard["beats"]):
        narrations[index], cue_maps[index] = ensure_cues(intent["narration"])

    def _save(raws: dict[int, str], cursor: float, boundary: dict | None) -> None:
        _save_checkpoint(checkpoint_path, {
            "question": request["question"], "mode": mode, "storyboard": storyboard,
            "contract": contract, "roleTable": role_table, "answer": answer,
            "dslRaws": {str(key): value for key, value in raws.items()},
            "cursor": cursor, "boundary": boundary})

    scene, raws = _dsl_build(llm, storyboard, contract, registry_all, role_table,
                             narrations, cue_maps, base=base_raws, on_beat=_save)
    for beat in scene["beats"]:
        resolve_text_layout(beat.get("elements", []))
    gate = check_scene(scene)
    if not gate["approved"]:
        _capture({"scene": scene, "stage": "gate", "blockers": gate["blockers"]})
        raise PlanError("deterministic gate: " + json.dumps(gate["blockers"], ensure_ascii=False)[:1200])
    verdict = judge(scene, lambda system, user: _call_model(judge_llm or llm, system, user, 3500))

    if not verdict["approved"]:
        findings = _dsl_findings(verdict.get("blockers") or [], storyboard["beats"])
        if findings:
            scene, raws = _dsl_build(llm, storyboard, contract, registry_all, role_table,
                                     narrations, cue_maps, base=raws, rewrites=findings,
                                     on_beat=_save)
            for beat in scene["beats"]:
                resolve_text_layout(beat.get("elements", []))
            gate = check_scene(scene)
            if not gate["approved"]:
                _capture({"scene": scene, "stage": "gate-after-revision",
                          "blockers": gate["blockers"]})
                raise PlanError("deterministic gate after revision: "
                                + json.dumps(gate["blockers"], ensure_ascii=False)[:1200])
            verdict = judge(scene, lambda system, user: _call_model(judge_llm or llm, system, user, 3500))
    if not verdict["approved"]:
        _capture({"scene": scene, "stage": "judge", "verdict": verdict})
        raise PlanError("The external judge found blockers: "
                        + json.dumps(verdict["blockers"], ensure_ascii=False)[:1200])
    if rendered_review is not None:
        visual = rendered_review(scene, storyboard)
        if not visual["approved"]:
            raise PlanError("The rendered-frame review found blockers: "
                            + json.dumps(visual["findings"], ensure_ascii=False)[:1200])
        scene["teaching"] = {"method": "qweeps-visual-teaching", "version": 2,
                             "storyboard": storyboard, "review": verdict,
                             "frameReview": {"approved": True,
                                             "method": "native-frames-and-vision-model",
                                             "observations": visual["observations"]}}
    else:
        scene["teaching"] = {"method": "qweeps-visual-teaching", "version": 2,
                             "clock": "synthetic", "storyboard": storyboard, "review": verdict}
    if checkpoint_path and Path(checkpoint_path).exists():
        Path(checkpoint_path).unlink()
    return {"answer": answer, "scene": scene}


def _dsl_findings(blockers: list, beats: list) -> dict[int, str]:
    """Map judge blockers to per-beat revision notes.

    Judge labels are one-based numbers, compiled ids (`beat_2`), storyboard ids
    or the beat question the judge saw as the beat title.
    """
    findings: dict[int, list[str]] = {}
    for blocker in blockers:
        if not isinstance(blocker, dict):
            continue
        label = str(blocker.get("beat") or "").strip()
        index = _beat_index(label, beats)
        if index is None:
            continue
        text = str(blocker.get("problem") or "").strip()
        revision = str(blocker.get("revision") or "").strip()
        note = text + (f" REVISION: {revision}" if revision else "")
        findings.setdefault(index, []).append(note)
    return {index: "\n- ".join([""] + notes).strip() for index, notes in findings.items()}


def _beat_index(label: str, beats: list) -> int | None:
    number = re.search(r"(?:beat[ _]?)?(\d+)\s*$", label, re.I)
    if number and ("beat" in label.lower() or label.isdigit()):
        index = int(number.group(1)) - 1
        if 0 <= index < len(beats):
            return index
    for index, beat in enumerate(beats):
        title = str(beat.get("question") or "").strip()
        ident = str(beat.get("id") or "").strip()
        if not label:
            continue
        if label == ident or (title and (label == title or label.startswith(title[:40])
                                         or title.startswith(label[:40]))):
            return index
    return None


def _dsl_header_ids(raw: str, keyword: str) -> list[str]:
    found: list[str] = []
    for line in (raw or "").splitlines():
        if line.strip().lower().startswith(keyword + " "):
            for part in line.split(None, 1)[1].split(","):
                value = part.strip()
                if value and value not in found:
                    found.append(value)
    return found


def _dsl_exits(raw: str) -> set[str]:
    return set(_dsl_header_ids(raw, "exit"))


def _dsl_lower(raw: str, state: dict[str, dict], registry: dict[str, dict],
               registry_all: dict[str, dict], known: dict[str, dict], role_table: dict,
               entry: dict, narration: str, cue_times: dict[str, float],
               title: str) -> tuple[dict, dict[str, float]]:
    """Parse, lower and repair one DSL beat against the current boundary."""
    from .line_dsl import lower, parse

    parsed = parse(raw, list(cue_times))
    beat = lower(parsed, state, registry, narration, cue_times, title=title)
    # The director's explicit exit wins over a stale contract retain list.
    # The director's retain header is the authoring source of truth for the DSL
    # path; a stale contract list must not put every past object back on stage.
    retained_ids = list(parsed.get("retain") or [])
    _inject_retained(beat, retained_ids, state, known, registry_all)
    present = {element["id"] for element in beat["elements"]}
    for eid in retained_ids:
        if eid in present:
            continue
        spec = registry_all.get(eid, {})
        placeholder = {"id": eid, "kind": "box", "label": spec.get("label") or eid,
                       "x": 0, "y": 0, "width": 1.6, "height": 0.8,
                       "revealAt": 0, "drawDuration": 0.15, "opacity": 1}
        if spec.get("role"):
            placeholder["semanticRole"] = spec["role"]
        beat["elements"].append(placeholder)
        present.add(eid)
    cue_times = _enforce_effect_anchors(beat, entry, cue_times)
    _repair_roles(beat, role_table)
    return beat, cue_times


def _dsl_build(llm: Any, storyboard: dict, contract: dict, registry_all: dict[str, dict],
               role_table: dict, narrations: dict[int, str], cue_maps: dict[int, dict[str, float]],
               base: dict[int, str] | None = None,
               rewrites: dict[int, str] | None = None,
               on_beat=None) -> tuple[dict, dict[int, str]]:
    """Author every beat, reusing unchanged DSL and re-running only rewritten beats."""
    from .dsl_prompt import SYSTEM, director_prompt, strip_cues

    base = base or {}
    rewrites = rewrites or {}
    compiled_beats: list[dict] = []
    known: dict[str, dict] = {}
    raws: dict[int, str] = {}
    cursor = 0.0
    boundary = None
    for index, intent in enumerate(storyboard["beats"]):
        entry = contract["beats"][index]
        narration = narrations[index]
        cue_times = dict(cue_maps[index])
        state = {element["id"]: {**(known.get(element["id"]) or {}), **element}
                 for element in (boundary["elements"] if boundary else [])}
        registry = {eid: registry_all[eid] for eid in _ids(entry.get("enter")) if eid in registry_all}
        previous = storyboard["beats"][index - 1] if index else None
        prompt = director_prompt(intent, entry, state, registry, previous, narration)
        if index in rewrites:
            prompt += "\n\nJUDGE FINDINGS (fix these in this beat's DSL):\n" + rewrites[index]
        error = ""
        single = None
        raw = ""
        for attempt in range(2):
            try:
                # Reuse saved DSL once; if it no longer fits the rebuilt boundary,
                # re-author that beat rather than aborting the whole lesson.
                if attempt == 0 and index in base and index not in rewrites:
                    raw = base[index]
                else:
                    raw = _call_model(llm, SYSTEM,
                                      prompt + (f"\n\nPREVIOUS ERROR:\n{error}" if error else ""),
                                      1500)
                if not re.search(r"^\s*beat\b", raw or "", re.M):
                    raise PlanError(
                        "Your reply contained no DSL. Do not explain, plan or discuss modes; "
                        "emit only the DSL lines and start with `beat <id>`.")
                beat, beat_times = _dsl_lower(raw, state, registry, registry_all, known,
                                              role_table, entry, strip_cues(narration),
                                              cue_times, intent.get("question", "")[:60])
                single = compile_lesson(
                    {"title": storyboard["driving_question"], "summary": storyboard["representation"],
                     "roleTable": role_table, "beats": [beat]}, beat_times)
                cue_times = beat_times
                break
            except PlanError as exc:
                error = str(exc)[:600]
                if attempt == 1:
                    _capture({"beat": {"dsl": raw}, "contract": entry, "roleTable": role_table,
                              "cueTimes": cue_times, "boundary": boundary, "error": error})
                    raise
        beat = single["compiled"]["beats"][0]
        beat["id"] = f"beat_{index}"
        ids = {element["id"] for element in beat["elements"]}
        retained = _dsl_header_ids(raw, "retain")
        missing = [eid for eid in retained if eid not in ids]
        if missing:
            for eid in missing:
                if eid in state:
                    beat["elements"].append({**state[eid], "revealAt": 0})
            if any(eid in state for eid in missing):
                single = compile_lesson(
                    {"title": storyboard["driving_question"], "summary": storyboard["representation"],
                     "roleTable": role_table, "beats": [beat]}, cue_times)
                beat = single["compiled"]["beats"][0]
                beat["id"] = f"beat_{index}"
                ids = {element["id"] for element in beat["elements"]}
            missing = [eid for eid in retained if eid not in ids]
        if missing:
            raise PlanError(f"beat {intent['id']} lost retained ids {missing}")
        beat["visualStart"] = round(cursor, 3)
        beat["visualEnd"] = round(cursor + beat["duration"], 3)
        beat["cueTimes"] = cue_times
        compiled_beats.append(beat)
        raws[index] = raw
        for element in beat["elements"]:
            known[element["id"]] = element
        cursor += beat["duration"]
        boundary = boundary_snapshot({"beats": compiled_beats}, len(compiled_beats) - 1)
        if on_beat is not None:
            on_beat(raws, cursor, boundary)

    return ({"title": storyboard["driving_question"], "summary": storyboard["representation"],
             "sources": [], "beats": compiled_beats, "roleTable": role_table}, raws)
