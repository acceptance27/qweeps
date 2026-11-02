"""Generate, compile and register a native ManimGL scene from a QWEEPS storyboard."""
from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from .manim_code_prompt import manim_code_generation_prompt
from .native_scenes import scene_id as make_scene_id, write_scene
from .plan import PlanError
from .visual_contract import contract_prompt


def choose_native_beats(story: dict, limit: int = 5) -> list[str]:
    """Mechanism/construction/procedure beats carry a continuous animation best."""
    beats = story.get("beats") or []
    preferred = [
        beat["id"] for beat in beats
        if beat.get("layout") in {"diagram", "process"}
        and beat.get("teaching") in {"construction", "mechanism", "procedure"}
    ]
    if len(preferred) < 2:
        preferred = [beat["id"] for beat in beats][:2]
    if len(preferred) >= len(beats):
        preferred = preferred[:-1]  # always leave at least one layout beat
    return preferred[:limit]


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
        ]
        nodes = nodes_by_beat.get(beat["id"]) or []
        if nodes:
            lines.append("  semantic objects (call self.cue(id) when each first matters): "
                         + ", ".join(nodes))
    lines += [
        "",
        "Make the mechanism legible without narration: label the parts and the change. "
        "Every beat must show continuous motion, not a static diagram with labels appearing. "
        "Keep every beat's promised visible operation. Do not add, remove or reorder beats. "
        "The whole scene should run roughly 30-55 seconds.",
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


def generate_scene(llm, story: dict, interpreter: str, folder: Path,
                   nodes_by_beat: dict | None = None,
                   contract: dict | None = None) -> dict:
    prompt = build_prompt(story, nodes_by_beat, contract=contract)
    system = manim_code_generation_prompt("high")
    try:
        code = llm.compose(prompt, system, max_tokens=40000, reasoning_effort="high")
    except TypeError:
        code = llm.compose(prompt, system)
    source = clean_code(code)
    source_path = folder / "generated_neuron.py"
    source_path.write_text(source)
    compiled = compile_source(interpreter, source_path, folder)
    audit = compiled.get("audit") or []
    if audit and os.environ.get("QWEEPS_NATIVE_AUDIT", "1") != "0":
        details = "; ".join(
            f"{item.get('code')} {item.get('detail', '')}".strip()
            for item in audit[:4])
        raise PlanError("Native scene audit failed: " + details)
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
    if not 12 <= duration <= 120:
        raise PlanError("Native scene duration is outside the usable range")
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
    }
    return write_scene(source, manifest)



def condense_narration(llm, lesson: dict, manifest: dict, native_ids: list[str]) -> dict:
    """Fit native-beat narration to the scene window; layout beats keep the detail."""
    windows = {beat["id"]: beat for beat in manifest.get("beats") or []}
    requests = []
    for chapter in lesson.get("chapters") or []:
        if chapter.get("id") not in native_ids:
            continue
        window = windows.get(chapter["id"])
        if not window:
            continue
        seconds = max(2.0, window["end"] - window["start"])
        budget = max(10, round(seconds * 2.6))
        words = len(str(chapter.get("narration") or "").split())
        if words <= budget * 1.2:
            continue
        requests.append({
            "id": chapter["id"],
            "maxWords": budget,
            "bridge": (chapter.get("continuity") or {}).get("bridge", ""),
            "insight": chapter.get("insight", ""),
            "narration": chapter.get("narration", ""),
        })
    if not requests:
        return lesson
    prompt = (
        "Shorten each narration for a native animation beat. Return JSON only as "
        '{"chapters":[{"id":"...","narration":"..."}]}. '
        "Keep the continuity bridge at the start verbatim when supplied. Keep the "
        "mechanism and the specific insight; remove secondary detail. Do not add "
        "facts, do not mention the runtime, and stay within maxWords."
    )
    payload = json.dumps({"chapters": requests})
    try:
        raw = llm.compose(prompt + "\n\n" + payload, max_tokens=2500, reasoning_effort="minimal")
    except TypeError:
        raw = llm.compose(prompt + "\n\n" + payload)
    def parse(response):
        response = re.sub(r"^```(?:json)?\s*|\s*```$", "", response.strip())
        try:
            parsed = json.JSONDecoder().raw_decode(response)[0]
            return {row["id"]: row["narration"] for row in parsed.get("chapters") or []}
        except (ValueError, KeyError, TypeError):
            return {}

    shortened = parse(raw)
    for chapter in lesson.get("chapters") or []:
        text = shortened.get(chapter.get("id"))
        if isinstance(text, str) and text.strip():
            chapter["narration"] = text.strip()
    # The model often lands a few words over. One explicit enforcement pass.
    over = []
    budgets = {row["id"]: row["maxWords"] for row in requests}
    for chapter in lesson.get("chapters") or []:
        budget = budgets.get(chapter.get("id"))
        if budget and len(str(chapter.get("narration") or "").split()) > budget * 1.1:
            over.append({"id": chapter["id"], "maxWords": budget,
                         "narration": chapter.get("narration", "")})
    if over:
        retry = ("Rewrite each narration to at most maxWords words. Keep the mechanism "
                 "and specific insight; remove secondary detail. Return JSON only as "
                 '{"chapters":[{"id":"...","narration":"..."}]}.\n\n'
                 + json.dumps({"chapters": over}))
        try:
            raw = llm.compose(retry, max_tokens=2000, reasoning_effort="minimal")
        except TypeError:
            raw = llm.compose(retry)
        for chapter in lesson.get("chapters") or []:
            text = parse(raw).get(chapter.get("id"))
            if isinstance(text, str) and text.strip():
                chapter["narration"] = text.strip()
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
            duration = round(window["end"] - window["start"], 2)
            chapter.update(renderer="manimgl", nativeScene=manifest["sceneId"],
                           nativeOffset=round(window["start"], 3),
                           nativeDuration=round(duration, 3))
        else:
            duration = round(chapter["end"] - chapter["start"], 2)
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
