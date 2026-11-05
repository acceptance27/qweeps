"""Generate, compile and register a native ManimGL scene from a QWEEPS storyboard."""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

from .alignment import phrase_range
from .manim_code_prompt import manim_code_generation_prompt, lesson_manim_code_generation_prompt
from .native_scenes import scene_id as make_scene_id, write_scene
from .plan import PlanError
from .visual_contract import contract_prompt


def choose_native_beats(story: dict, limit: int = 5) -> list[str]:
    """Mechanism/construction/procedure beats carry a continuous animation best."""
    beats = story.get("beats") or []
    preferred = [
        beat["id"] for beat in beats
        if beat.get("layout") in {"diagram", "process"}
        and beat.get("teaching") in {"construction", "mechanism"}
    ]
    if len(preferred) < 2:
        preferred = [beat["id"] for beat in beats][:2]
    if len(preferred) >= len(beats):
        preferred = preferred[:-1]  # always leave at least one layout beat
    return preferred[:limit]


def native_beats_for(story: dict, mode: str = "per_beat") -> list[str]:
    """Choose one continuous native run or the hybrid per-beat native slices."""
    if mode == "continuous":
        beats = story.get("beats") or []
        selected = choose_native_beats(story)
        if not selected:
            return []
        ids = [beat["id"] for beat in beats]
        positions = [ids.index(beat_id) for beat_id in selected if beat_id in ids]
        if not positions:
            return []
        # Fill the gap between the first and last native beat so layout chapters
        # cannot interrupt the continuous run. Layout may remain before/after.
        return ids[min(positions):max(positions) + 1]
    return choose_native_beats(story)


def native_cue_contract(beat: dict) -> list[dict]:
    """Semantic markers connect real native actions to later measured speech."""
    return [
        {'id': f"{beat['id']}-setup", 'phase': 'setup', 'title': beat.get('title') or beat['id'],
         'body': beat.get('question') or beat.get('title') or beat['id']},
        {'id': f"{beat['id']}-operation", 'phase': 'operation', 'title': 'Visible reasoning',
         'body': beat.get('visibleOperation') or beat.get('question') or ''},
        {'id': f"{beat['id']}-result", 'phase': 'result', 'title': 'Result',
         'body': beat.get('insight') or ''},
    ]


def native_cue_findings(story: dict, compiled: dict) -> list[dict]:
    windows = {b['id']: b for b in compiled.get('beats') or []}
    cues = compiled.get('cues') or []
    findings = []
    for beat in story.get('beats') or []:
        window = windows.get(beat['id'])
        budget = minimum_native_seconds(beat)
        if window and window['end'] - window['start'] < budget - .1:
            findings.append({'code': 'native-reading-time', 'beat': beat['id'],
                'detail': f"Native beat '{beat['id']}' is too fast to teach; extend it to at least {budget} seconds."})
    for beat_id, contract in (story.get('nativeCuePlan') or {}).items():
        window = windows.get(beat_id)
        if not window:
            continue
        positions = []
        for cue in contract:
            matches = [c for c in cues if c.get('id') == cue['id']]
            if len(matches) != 1 or not window['start'] <= matches[0]['time'] < window['end']:
                findings.append({'code': 'native-cue-coverage', 'beat': beat_id,
                    'detail': f"Call self.cue({cue['id']!r}, relevant_mobject) exactly once inside its beat."})
            else:
                positions.append(matches[0]['time'])
        if len(positions) == len(contract):
            if positions[0] - window['start'] > .1:
                findings.append({'code': 'native-setup-cue', 'beat': beat_id,
                    'detail': 'Call the setup cue immediately at the beat boundary, before its transition/construction.'})
            if any(b - a < .25 for a, b in zip(positions, positions[1:])):
                findings.append({'code': 'native-cue-order', 'beat': beat_id,
                    'detail': 'Place setup, operation and result cues at their actual distinct scene moments, in order.'})
            if window['end'] - positions[-1] < 1.5:
                findings.append({'code': 'native-result-hold', 'beat': beat_id,
                    'detail': 'Leave at least 1.5 seconds of settled reading after the result cue.'})
    return findings


def minimum_native_seconds(beat: dict) -> float:
    """Time to follow the explanation and inspect its settled result."""
    narration = str(beat.get('narration') or beat.get('insight') or '')
    bridge = str((beat.get('continuity') or {}).get('bridge') or '')
    words = len(narration.split())
    bridge_words = 0 if narration.startswith(bridge) else len(bridge.split())
    return round(max(8.0, min(45.0, (words + bridge_words) / 2.4 + 2)), 1)


def build_prompt(story: dict, nodes_by_beat: dict | None = None,
                 contract: dict | None = None) -> str:
    lines = [
        "Create one continuous ManimCE scene that teaches the QWEEPS lesson below.",
        "Follow the lesson's teaching order exactly, beat by beat.",
        'At the exact start of each beat call self.beat("<id>", "<title>").',
        "The QWEEPS runtime supplies beat(); do not define it.",
        "",
        f"Lesson: {story.get('title')}",
        f"Question: {story.get('question')}",
        f"Shared representation and encodings: {story.get('representation')}",
        f"Worked example (preserve its values): {json.dumps(story.get('example'), ensure_ascii=False)}",
        f"Established neighboring layouts (context only; do not animate these): {json.dumps(story.get('layoutContext', []), ensure_ascii=False)}",
    ]
    if contract:
        lines += contract_prompt(contract)
    lines += ["", "Beats:"]
    nodes_by_beat = nodes_by_beat or {}
    for beat in story.get("beats") or []:
        lines += [
            f'- id "{beat["id"]}" — {beat.get("title")}',
            f'  learner question: {beat.get("question")}',
            f'  insight to make visible: {beat.get("insight")}',
            f'  visible operation: {beat.get("visibleOperation")}',
            f'  teaching evidence: {json.dumps(beat.get("presentation"), ensure_ascii=False)}',
            f'  misconception to prevent: {beat.get("safeguard")}',
            f'  explanation: {beat.get("narration") or beat.get("insight")}',
            f'  minimum duration: {minimum_native_seconds(beat)} seconds, including >=2 seconds settled reading time',
        ]
        cue_plan = (story.get('nativeCuePlan') or {}).get(beat['id']) or []
        if cue_plan:
            lines.append('  REQUIRED speech synchronization cues: ' + json.dumps(cue_plan, ensure_ascii=False))
            lines.append('  Call self.cue(id, relevant_mobject_or_group) at setup just before its construction, '
                         'immediately at the beat boundary before any transition, at operation just before the meaningful change, and at result once the result is visible. '
                         'Keep their order and at least 1.5 seconds settled reading after the result cue. '
                         'These names must be exact; they are later anchored to actual spoken words.')
        nodes = nodes_by_beat.get(beat["id"]) or []
        if nodes:
            lines.append("  semantic objects (call self.cue(id) when each first matters): "
                         + ", ".join(nodes))
    lines += [
        "",
        "Make the mechanism legible without narration: label the parts and the change. "
        "Do not draw a beat title, chapter banner or bottom caption inside the scene; "
        "the player supplies the question header and the spoken caption. "
        "Each beat needs a visible change that demonstrates its inference, followed by settled reading time. "
        "Keep every beat's promised visible operation. Do not add, remove or reorder beats. "
        "The total runtime is the sum of the per-beat budgets above, not a fixed short-video limit. "
        "Call the next self.beat before beginning that next beat's transition; retain anchors "
        "rather than spending a reading hold fading the entire diagram out.",
    ]
    return "\n".join(lines)


_TEXT_ASSIGN = re.compile(r"^\s*(\w+)\s*=\s*Text\(", re.M)


def _hide_scene_title(code: str) -> str:
    text_vars = set(_TEXT_ASSIGN.findall(code))
    names = ("top_title", "scene_title", "title", "heading")
    name = next((candidate for candidate in names if candidate in text_vars), None)
    if name is None:
        return code
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return code
    assignment = next(
        (node for node in ast.walk(tree)
         if isinstance(node, ast.Assign)
         and any(isinstance(target, ast.Name) and target.id == name
                 for target in node.targets)),
        None,
    )
    if assignment is None or assignment.end_lineno is None:
        return code
    lines = code.splitlines(keepends=True)
    indent = re.match(r"^\s*", lines[assignment.lineno - 1]).group(0)
    lines.insert(assignment.end_lineno, f"{indent}{name}.set_opacity(0)\n")
    return "".join(lines)


def clean_code(code: str) -> str:
    code = re.sub(r"^```(?:python)?\s*", "", code.strip())
    code = re.sub(r"```\s*$", "", code).strip() + "\n"
    # Ensure accidental `.copy` without parentheses inside transforms becomes `.copy()`
    code = re.sub(r"(\.\s*copy)\b(?!\s*\()", r"\1()", code)
    # Transform lowering, group `.animate` lowering, per-dot motion and text
    # crossfades all live in the native shim now (recorded_scene).  The CE
    # source keeps the model's own animation choices; only the duplicate scene
    # title is handled here because the lesson header already supplies one.
    # Hide it immediately after its assignment, not before the first beat:
    # models do not always construct the title first.
    return _hide_scene_title(code)


def compile_source(interpreter: str, source: Path, folder: Path) -> dict:
    target = folder / "windows.json"
    env = {**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[2])}
    result = subprocess.run(
        [interpreter, "-m", "assistant.visual.native_compile", str(source), str(target)],
        capture_output=True, text=True, timeout=600, env=env,
    )
    if result.returncode or not target.is_file():
        raise PlanError("Native scene did not compile: "
                        + (result.stderr or result.stdout)[-1500:])
    try:
        return json.loads(target.read_text())
    except ValueError as exc:
        raise PlanError("Native compile returned invalid beat windows") from exc


def _audit_summary(audit: list[dict]) -> str:
    lines = []
    for item in audit[:8]:
        code = item.get("code")
        field = item.get("field")
        zone = item.get("zone")
        meta = []
        if field:
            meta.append(f"field={field}")
        if zone:
            meta.append(f"zone={zone}")
        if item.get("time") is not None:
            meta.append(f"t={item.get('time')}s")
        prefix = f"{code} ({', '.join(meta)})" if meta else str(code)
        lines.append(f"- {prefix}: {item.get('detail', '')}")
    return "\n".join(lines)


def _repair_prompt(prompt: str, source: str, audit: list[dict]) -> str:
    return (
        prompt
        + "\n\nYour previous scene compiled but failed the native visual audit:\n"
        + _audit_summary(audit)
        + "\n\nReturn the complete corrected Python file. Preserve the same beat IDs and order. "
          "Extend beat duration when reading-time findings require it. Move, shorten, fade or remove the colliding labels; do not "
          "add new beats. Do not leave text on top of another label. Here is the previous file:\n\n"
        + source
    )


def _contract_repair_prompt(prompt: str, model_code: str, audit: list[dict]) -> str:
    return (
        prompt
        + "\n\nYour previous builder/animator slots failed the Scene Direction Contract audit:\n"
        + _audit_summary(audit)
        + "\n\nFix the exact failing field and zone reported above. Keep every object inside "
          "its assigned zone with >= 0.35 buff, keep all Text font_size >= 24 (titles >= 32), "
          "return CardParts(frame=RoundedRectangle(...), text=VGroup(...), extras=VGroup(...)) "
          "for card objects, and return ONLY the corrected build_* and animate_* methods:\n\n"
        + model_code
    )


def generate_contract_scene(
    llm,
    contract: dict,
    interpreter: str,
    folder: Path,
    story: dict | None = None,
    reasoning_effort: str = "high",
    parallel_acts: bool = True,
    act_chunk_size: int = 5,
) -> dict:
    """Compile a Scene Direction Contract via parallel Act slot fills and surgical slot repair."""
    from concurrent.futures import ThreadPoolExecutor
    from .scene_contract import (
        act_chunk_prompt,
        assemble_contract_scene,
        chunk_contract_by_act,
        low_reasoning_contract_prompt,
        merge_slot_methods,
        surgical_repair_prompt,
        validate_filled_ast,
        validate_scene_contract,
    )

    pre_errors = validate_scene_contract(contract)
    if pre_errors:
        raise PlanError("Scene Direction Contract failed pre-TTS validation: "
                        + "; ".join(e["detail"] for e in pre_errors[:4]))

    prompt = low_reasoning_contract_prompt(contract, story=story)
    system = (
        "You fill geometry and label builders inside a compiler-owned ManimCE Scene Direction Contract. "
        "Return Python code defining ONLY the requested build_* and animate_* methods."
    )

    def _call_llm(user_prompt: str, effort: str, max_tok: int = 24000) -> str:
        try:
            return llm.compose(user_prompt, system, max_tokens=max_tok, reasoning_effort=effort)
        except TypeError:
            return llm.compose(user_prompt, system)

    beats = list(contract.get("beats") or [])
    if parallel_acts and len(beats) > act_chunk_size:
        chunks = chunk_contract_by_act(contract, chunk_size=act_chunk_size)
        with ThreadPoolExecutor(max_workers=min(4, len(chunks))) as pool:
            futures = [
                pool.submit(_call_llm, act_chunk_prompt(contract, chunk, story=story), reasoning_effort, 20000)
                for chunk in chunks
            ]
            act_outputs = [f.result() for f in futures]
        raw_code = ""
        for part in act_outputs:
            raw_code = merge_slot_methods(raw_code, part, contract=contract)
    else:
        raw_code = _call_llm(prompt, reasoning_effort, 24000)

    source_path = folder / "generated_contract_scene.py"
    repairs_used = 0
    last_codes: set[tuple] = set()

    for attempt in range(3):
        ast_findings = validate_filled_ast(raw_code, contract)
        if ast_findings:
            audit = ast_findings
            compiled = {}
        else:
            try:
                assembled = assemble_contract_scene(raw_code, contract)
                source_path.write_text(assembled)
                compiled = compile_source(interpreter, source_path, folder)
                audit = compiled.get("audit") or []
            except PlanError as exc:
                audit = [{"code": "compile-or-ast-error", "field": "construct", "zone": "global", "detail": str(exc)}]
                compiled = {}

        if not audit or os.environ.get("QWEEPS_NATIVE_AUDIT", "1") == "0":
            break
        if os.environ.get("QWEEPS_NATIVE_REPAIR", "1") == "0" or attempt == 2:
            break

        current_codes = {(a.get("code"), a.get("field"), a.get("zone")) for a in audit}
        repair_effort = "high" if (current_codes & last_codes) else reasoning_effort
        last_codes = current_codes
        repairs_used += 1
        repair_prompt = surgical_repair_prompt(contract, raw_code, audit)
        patch_code = _call_llm(repair_prompt, repair_effort, 16000)
        raw_code = merge_slot_methods(raw_code, patch_code, contract=contract)

    if audit and os.environ.get("QWEEPS_NATIVE_AUDIT", "1") != "0":
        details = "; ".join(
            f"{item.get('code')}[field={item.get('field')},zone={item.get('zone')}] {item.get('detail', '')}".strip()
            for item in audit[:4]
        )
        raise PlanError("Contract scene audit failed after repair: " + details)

    source = source_path.read_text()
    scene = make_scene_id(source)
    manifest = {
        "sceneId": scene,
        "title": contract.get("title") or (story or {}).get("title"),
        "sceneClass": "GenScene",
        "sourceHash": scene[4:],
        "duration": round(float(compiled.get("duration") or contract.get("duration") or 0.0), 3),
        "beats": compiled.get("beats") or [],
        "cues": compiled.get("cues") or [],
        "roles": compiled.get("roles") or [],
        "boundIds": compiled.get("boundIds") or [],
        "tracks": compiled.get("tracks"),
        "repairsUsed": repairs_used,
        "reasoningEffort": reasoning_effort,
    }
    return write_scene(source, manifest)


def generate_scene(llm, story: dict, interpreter: str, folder: Path,
                   nodes_by_beat: dict | None = None,
                   contract: dict | None = None, *, reuse: bool = True,
                 reasoning_effort: str | None = None) -> dict:
    effort = reasoning_effort or os.environ.get('QWEEPS_NATIVE_REASONING_EFFORT', 'medium')
    if effort not in {'none', 'low', 'medium', 'high'}:
        raise PlanError('Native code reasoning effort must be none, low, medium, or high.')
    prompt = build_prompt(story, nodes_by_beat, contract=contract)
    system = lesson_manim_code_generation_prompt()
    fingerprint = hashlib.sha256(json.dumps({
        "prompt": prompt, "system": system, "reasoningEffort": effort,
        "provider": getattr(llm, "provider", type(llm).__name__),
        "model": getattr(llm, "visual_model", None) or getattr(llm, "model", None),
    }, sort_keys=True).encode()).hexdigest()
    checkpoint = folder / f"native-source-{fingerprint}.py"
    timings = {"cacheHit": bool(reuse and checkpoint.is_file()), "codeReasoningEffort": effort,
               "repairReasoningEffort": "high", "seconds": {}}

    def measured(phase, operation):
        started = time.monotonic()
        try:
            return operation()
        finally:
            timings["seconds"][phase] = round(
                timings["seconds"].get(phase, 0) + time.monotonic() - started, 3)
            try:
                (folder / "native-generation-timings.json").write_text(json.dumps(timings))
            except OSError:
                pass

    def compose(instruction, reasoning=effort):
        try:
            return llm.compose(instruction, system, max_tokens=40000, reasoning_effort=reasoning)
        except TypeError:
            return llm.compose(instruction, system)
    # Only successful scenes are checkpointed. Recompile and audit on every retry
    # so runtime/compiler updates cannot bypass validation of reused model output.
    if reuse and checkpoint.is_file():
        source = checkpoint.read_text()
    else:
        source = clean_code(measured('code_generation', lambda: compose(prompt)))
    source_path = folder / "generated_neuron.py"
    source_path.write_text(source)
    try:
        compiled = measured('compile_and_audit', lambda: compile_source(interpreter, source_path, folder))
    except (PlanError, subprocess.TimeoutExpired):
        if not timings['cacheHit']:
            raise
        # A runtime change or damaged checkpoint must not trap every retry on
        # the same unusable source. Generate fresh code and validate normally.
        source = clean_code(measured('code_generation', lambda: compose(prompt)))
        source_path.write_text(source)
        compiled = measured('compile_and_audit', lambda: compile_source(interpreter, source_path, folder))
    audit = list(compiled.get("audit") or []) + native_cue_findings(story, compiled)
    repairs_used = 0
    if audit and os.environ.get("QWEEPS_NATIVE_AUDIT", "1") != "0" \
            and os.environ.get("QWEEPS_NATIVE_REPAIR", "1") != "0":
        repairs_used += 1
        repair = _repair_prompt(prompt, source, audit)
        source = clean_code(measured('code_repair', lambda: compose(repair, 'high')))
        source_path.write_text(source)
        compiled = measured('compile_and_audit', lambda: compile_source(interpreter, source_path, folder))
        audit = list(compiled.get("audit") or []) + native_cue_findings(story, compiled)
    if audit and os.environ.get("QWEEPS_NATIVE_AUDIT", "1") != "0":
        details = "; ".join(
            f"{item.get('code')} {item.get('detail', '')}".strip()
            for item in audit[:4])
        stage = "after one repair" if repairs_used else "before publication"
        raise PlanError(f"Native scene audit failed {stage}: " + details)
    cues = compiled.get("cues") or []
    if cues and nodes_by_beat:
        def normalise(value):
            return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")

        cue_names = [normalise(cue.get("id")) for cue in cues]
        missing = []
        for beat_id, nodes in nodes_by_beat.items():
            for node in nodes or []:
                token = normalise(node)
                if not any(token in cue or cue in token for cue in cue_names if cue):
                    missing.append(f"{beat_id}:{node}")
        if missing:
            raise PlanError("Native scene cues do not cover the storyboard objects: "
                            + ", ".join(missing[:8]))
    expected = [beat["id"] for beat in story.get("beats") or []]
    found = [beat["id"] for beat in compiled.get("beats") or []]
    if found != expected:
        raise PlanError(f"Native scene beats do not match the lesson: expected {expected}, got {found}")
    duration = float(compiled.get("duration") or 0)
    if not 8 <= duration <= max(120, 60 * len(expected)):
        raise PlanError("Native scene duration is outside the per-beat usable range")
    budgets = {beat['id']: minimum_native_seconds(beat) for beat in story.get('beats') or []}
    for window in compiled['beats']:
        if window['end'] - window['start'] < budgets[window['id']] - .1:
            raise PlanError(f"Native beat '{window['id']}' is too fast to teach: "
                            f"needs at least {budgets[window['id']]} seconds")
    for beat in compiled["beats"]:
        if beat["end"] <= beat["start"]:
            raise PlanError(f"Native beat '{beat['id']}' has no time window")
    scene = make_scene_id(source)
    manifest = {
        "sceneId": scene,
        "title": story.get("title"),
        "sceneClass": "GenScene",
        "sourceHash": scene[4:],
        "duration": round(duration, 3),
        "beats": compiled["beats"],
        "cues": compiled.get("cues") or [],
        "tracks": compiled.get("tracks"),
        "nativeCuePlan": story.get('nativeCuePlan') or {},
    }
    published = write_scene(source, manifest)
    temporary = folder / f".native-source-{fingerprint}.tmp"
    temporary.write_text(source)
    temporary.replace(checkpoint)
    return published



def condense_narration(llm, lesson: dict, manifest: dict, native_ids: list[str]) -> dict:
    """Write all beat narration to one voice and a consistent time budget.

    Native beats are bounded by their animation window. Layout beats used to
    default to 30 seconds, which produced long monologues next to 7-second
    native clips. Layout targets now come from the visible material, and the
    same rewrite request covers both kinds of beat.
    """
    windows = {beat["id"]: beat for beat in manifest.get("beats") or []}
    requests = []
    targets = {}
    for chapter in lesson.get("chapters") or []:
        cid = chapter.get("id")
        window = windows.get(cid)
        nodes = (chapter.get("visual") or {}).get("nodes") or []
        if cid in native_ids and window:
            seconds = max(2.0, window["end"] - window["start"])
        else:
            seconds = max(8.0, min(14.0, 6.0 + 2.0 * len(nodes)))
        targets[cid] = seconds
        bridge = (chapter.get("continuity") or {}).get("bridge", "")
        budget = max(8, round(seconds * 2.4))
        if bridge:
            budget = max(budget, len(str(bridge).split()) + 6)
        narration = str(chapter.get("narration") or "").strip()
        words = len(narration.split())
        at_start = False
        if bridge:
            try:
                at_start = phrase_range(narration, bridge)[0] == 0
            except PlanError:
                at_start = False
        if words > budget * 1.15 or words < budget * 0.55 or (bridge and not at_start):
            requests.append({
                "id": cid,
                "maxWords": budget,
                "bridge": bridge,
                "insight": chapter.get("insight", ""),
                "narration": narration,
            })
    if requests:
        prompt = (
            "Rewrite each narration to one consistent teaching voice and a strict "
            'word budget. Return JSON only as {"chapters":[{"id":"...","narration":"..."}]}. '
            "When a bridge is supplied, begin the narration with that bridge verbatim. "
            "Teaching the user about the topic is the #1 priority: explain the core concepts, mechanisms, and practical "
            "distinctions clearly and intuitively so the learner gains real understanding. "
            "Do NOT describe what is visually happening on the screen (never say 'card lights up', 'blue card', 'box glows', "
            "'on the left card', or describe UI graphics/layout). Instead, explain what the domain concepts and mechanisms mean. "
            "Do not revert to abstract textbook prose. Keep the mechanism and the specific insight; remove secondary detail. "
            "Do not add facts, do not mention the runtime, and stay within maxWords."
        )
        payload = json.dumps({"chapters": requests})
        try:
            raw = llm.compose(prompt + "\n\n" + payload, max_tokens=4000, reasoning_effort="minimal")
        except TypeError:
            raw = llm.compose(prompt + "\n\n" + payload)

        def parse(response):
            response = re.sub(r"^```(?:json)?\s*|\s*```$", "", response.strip())
            try:
                parsed = json.JSONDecoder().raw_decode(response)[0]
                return {row["id"]: row["narration"] for row in parsed.get("chapters") or []}
            except (ValueError, KeyError, TypeError):
                return {}

        rewritten = parse(raw)
        for chapter in lesson.get("chapters") or []:
            text = rewritten.get(chapter.get("id"))
            if isinstance(text, str) and text.strip():
                chapter["narration"] = text.strip()

    # The bridge is part of the spoken chain. A rewrite that drops it would
    # later fail speech anchoring, so enforce it after the rewrite.
    for chapter in lesson.get("chapters") or []:
        bridge = (chapter.get("continuity") or {}).get("bridge", "")
        narration = str(chapter.get("narration") or "").strip()
        if bridge:
            try:
                at_start = phrase_range(narration, bridge)[0] == 0
            except PlanError:
                at_start = False
            if not at_start:
                chapter["narration"] = (bridge + " " + narration).strip()
        chapter["targetDuration"] = round(targets.get(chapter.get("id"), 10.0), 2)
    return lesson

def assemble(lesson: dict, story: dict, manifest: dict, native_ids: list[str],
             contract: dict | None = None) -> dict:
    by_id = {chapter["id"]: chapter for chapter in lesson.get("chapters") or []}
    windows = {beat["id"]: beat for beat in manifest["beats"]}
    transitions = {(row.get("from"), row.get("to")): row
                   for row in (contract or {}).get("transitions") or []}
    native = set(native_ids)
    clock = 0.0
    chapters = []
    previous = None
    for beat in story.get("beats") or []:
        chapter = by_id.get(beat["id"])
        if chapter is None:
            raise PlanError(f"Layout direction omitted beat '{beat['id']}'")
        if beat["id"] in native:
            window = windows[beat["id"]]
            # A cue marks when a concept matters, not a disposable pre-roll.
            # Preserve construction and reading time before the first cue.
            offset = window["start"]
            duration = round(window["end"] - offset, 2)
            chapter.update(renderer="manimgl", nativeScene=manifest["sceneId"],
                           nativeOffset=round(offset, 3),
                           nativeDuration=round(duration, 3))
            cue_plan = (manifest.get('nativeCuePlan') or {}).get(beat['id']) or []
            if cue_plan:
                times = {cue['id']: cue['time'] for cue in manifest.get('cues') or []}
                chapter['nativeCueObjects'] = [{**cue, 'nativeTime': times[cue['id']]} for cue in cue_plan]
                chapter['roles'] = {**chapter.get('roles', {}),
                    **{cue['id']: f"{cue['title']}: {cue['body']}" for cue in cue_plan}}
        else:
            duration = round(float(chapter.get("targetDuration")
                                   or (chapter.get("end", 10.0) - chapter.get("start", 0.0))), 2)
        chapter["start"] = round(clock, 2)
        chapter["end"] = round(clock + duration, 2)
        chapter["finishedAt"] = round(max(chapter["start"], chapter["end"] - 2), 2)
        chapter.pop("visualStart", None)
        chapter.pop("visualEnd", None)
        if previous is None:
            chapter["transition"] = {"type": "fade", "duration": 0.4,
                                     "shared": list((contract or {}).get("persistent") or [])}
        else:
            chapter["transition"] = transitions.get(
                (previous, chapter["id"]),
                {"type": "fade", "duration": 0.35,
                 "shared": list((contract or {}).get("persistent") or [])},
            )
            chapter["continuity"] = {**(chapter.get("continuity") or {}), "from": previous}
        previous = chapter["id"]
        chapters.append(chapter)
        clock += duration
    lesson = {**lesson, "chapters": chapters, "duration": round(clock, 2),
              "nativeScenes": {manifest["sceneId"]: manifest}}
    return lesson
