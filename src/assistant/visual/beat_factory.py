"""Streaming model-authored beat factory.

The model fills semantic slots; the compiler owns geometry. Each beat is
assembled, compiled, and emitted to the browser as soon as it passes.
"""
from __future__ import annotations

import copy
import json
import queue
import re
import subprocess
import threading
import time
import uuid
from pathlib import Path

from ..llm import ModelProviderError, OfflineLLM

BEAT_BRIEFS = [
    {
        "id": "comparison",
        "teaching": "comparison",
        "title": "Three activation choices",
        "question": "How do sigmoid, ReLU and linear activations differ?",
        "duration": 8,
        "context": "shared input z",
        "criteria": ["range", "curve", "use"],
        "facts": [
            "Sigmoid: sigma(z) = 1 / (1 + e^-z); range 0 to 1; S-curve; used for probabilities.",
            "ReLU: max(0, z); range 0 to infinity; hinge; used in hidden layers.",
            "Linear: y = z; range unbounded; straight line; used for regression.",
        ],
        "conclusion": "The activation decides the shape of the output, not the input.",
        "roles": ["blue", "green", "gold"],
    },
    {
        "id": "procedure",
        "teaching": "procedure",
        "title": "Compute one example",
        "question": "What are the exact steps for these numbers?",
        "duration": 9,
        "facts": [
            "Scale: 2 x 0.7 = 1.4.",
            "Add bias: 1.4 - 0.5 + 0.3 = 1.2.",
            "Squash: sigma(1.2) = 0.77.",
        ],
        "conclusion": "Scale, add the bias, squash: that is one forward pass.",
        "roles": ["blue", "gold", "green"],
    },
    {
        "id": "algorithm",
        "teaching": "algorithm",
        "title": "The forward pass",
        "question": "What does the neuron do as an algorithm?",
        "duration": 9,
        "facts": [
            "Read the inputs x, the weights w and the bias b.",
            "Compute z = 1.2 as the weighted sum plus bias.",
            "Return y = 0.77 after the activation.",
            "No weights change during a forward pass.",
        ],
        "conclusion": "One forward pass: no weights change.",
        "roles": ["purple", "gold", "green"],
    },
    {
        "id": "narrative",
        "teaching": "narrative",
        "title": "How the idea evolved",
        "question": "Where did this model come from?",
        "duration": 10,
        "facts": [
            "1958: the perceptron, the first trainable unit.",
            "1986: backpropagation made credit assignment practical.",
            "Today: scale, deep networks and hardware.",
        ],
        "conclusion": "The idea moved from one unit to a trainable network.",
        "roles": ["blue", "purple", "green"],
    },
    {
        "id": "recall",
        "teaching": "recall",
        "title": "Remember the three moves",
        "question": "How can I remember what a neuron does?",
        "duration": 9,
        "facts": [
            "Weight the input: W.",
            "Sum the evidence: S.",
            "Activate the result: A.",
        ],
        "conclusion": "Weight, sum, activate: the three moves of a neuron.",
        "roles": ["blue", "purple", "green"],
    },
]

BUDGETS = {
    "comparison": {"title": 28, "formula": 44, "value": 18, "detail": 160, "criteria_value": 18, "badge": 2},
    "procedure": {"title": 24, "formula": 44, "value": 18, "detail": 160},
    "algorithm": {"title": 28, "value": 22, "detail": 70, "badge": 2},
    "narrative": {"title": 18, "value": 12, "caption": 32},
    "recall": {"title": 18, "value": 12, "detail": 60, "badge": 2},
}

SYSTEM = """You author QWEEPS visual-beat content as JSON. Return one JSON object only.
No markdown, no code fences, no SVG, no x/y coordinates, no paths, no icons.
The compiler owns layout, badges and geometry. Fill every required field from
the brief. Be descriptive: include formulas and a detail line, not just labels.
Keep titles short; detail is 1-2 sentences. Do not invent facts outside the brief."""

SCHEMAS = {
    "comparison": {
        "cards": [
            {
                "title": "Sigmoid",
                "badge": "S",
                "formula": "σ(z) = 1 / (1 + e^-z)",
                "value": "0 to 1",
                "detail": "Smooth, bounded output used for probabilities.",
                "criteria": [
                    {"label": "range", "value": "0 → 1"},
                    {"label": "curve", "value": "S-curve"},
                    {"label": "use", "value": "probabilities"},
                ],
                "role": "blue",
            }
        ],
        "conclusion": "The activation decides the shape of the output, not the input.",
    },
    "procedure": {
        "steps": [
            {
                "title": "Scale",
                "formula": "2 × 0.7 = 1.4",
                "value": "1.4",
                "detail": "Multiply each input by its weight.",
                "role": "blue",
            }
        ],
        "conclusion": "Scale, add the bias, squash: that is one forward pass.",
    },
    "algorithm": {
        "rows": [
            {
                "title": "Read inputs",
                "value": "x, w, b",
                "badge": "1",
                "detail": "Inputs, weights and bias enter the pass.",
                "role": "purple",
            }
        ],
        "conclusion": "One forward pass: no weights change.",
    },
    "narrative": {
        "ticks": ["1958", "1986", "Today"],
        "stations": [
            {
                "title": "Perceptron",
                "value": "1958",
                "caption": "first trainable unit",
                "role": "blue",
            }
        ],
        "conclusion": "The idea moved from one unit to a trainable network.",
    },
    "recall": {
        "stations": [
            {
                "title": "Weight",
                "value": "1",
                "badge": "W",
                "detail": "w · x",
                "role": "blue",
            }
        ],
        "conclusion": "Weight, sum, activate: the three moves of a neuron.",
    },
}


def extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", (text or "").strip(), flags=re.I)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("The model returned no JSON object")
    value = json.loads(text[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("The model JSON must be an object")
    return value


def clip_words(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[: max(1, limit - 1)]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,.;:") + "…"


def prompt_for(brief: dict) -> str:
    shape = SCHEMAS[brief["teaching"]]
    unit = {"comparison": "cards", "procedure": "steps", "algorithm": "rows", "narrative": "stations", "recall": "stations"}[brief["teaching"]]
    return (
        f"Brief:\n{json.dumps(brief, ensure_ascii=False, indent=1)}\n\n"
        f"Return this shape with exactly {len(brief.get('roles', [])) or 'the required number of'} {unit}:\n"
        f"{json.dumps(shape, ensure_ascii=False, indent=1)}\n\n"
        "Rules:\n"
        "- Use the brief's facts; do not add new claims.\n"
        "- comparison: every card needs badge, formula, value, detail and the three shared criteria labels from the brief.\n"
        "- procedure: every step needs formula and detail.\n"
        "- algorithm: every row needs badge and detail.\n"
        "- narrative: ticks and station values must match; every station needs caption.\n"
        "- recall: every station needs badge and detail.\n"
        "- detail explains the meaning; do not restate the formula.\n"
        "- conclusion must be one sentence under 110 characters.\n"
        f"- Field budgets: {json.dumps(BUDGETS[brief['teaching']])}.\n"
        "- Return only the JSON object."
    )


def spec_findings(spec: dict, brief: dict) -> list[dict]:
    findings: list[dict] = []
    teaching = brief["teaching"]
    conclusion = spec.get("conclusion")
    if not isinstance(conclusion, str) or len(conclusion.strip()) < 10:
        findings.append({"code": "missing_conclusion", "message": "Write a one-sentence conclusion under 110 characters."})
    if isinstance(conclusion, str) and len(conclusion) > 110:
        findings.append({"code": "conclusion_budget", "message": "The conclusion exceeds 110 characters."})

    def need(value, code, message, minimum=1):
        if not isinstance(value, str) or len(value.strip()) < minimum:
            findings.append({"code": code, "message": message})

    if teaching == "comparison":
        cards = spec.get("cards")
        if not isinstance(cards, list) or not 2 <= len(cards) <= 4:
            findings.append({"code": "card_count", "message": "Return 2-4 comparison cards."})
            return findings
        labels = brief.get("criteria") or []
        for index, card in enumerate(cards):
            need(card.get("title"), "missing_title", f"Card {index+1} needs a title.")
            need(card.get("formula"), "missing_formula", f"Card {index+1} needs a formula.")
            need(card.get("detail"), "missing_detail", f"Card {index+1} needs a detail sentence.", 20)
            criteria = card.get("criteria")
            if not isinstance(criteria, list) or len(criteria) != len(labels):
                findings.append({"code": "criteria_count", "message": f"Card {index+1} needs exactly {len(labels)} criteria rows."})
            else:
                for row, label in zip(criteria, labels):
                    if row.get("label") != label:
                        findings.append({"code": "criteria_label", "message": f"Card {index+1} criteria labels must be {labels} in order."})
                        break
                    need(row.get("value"), "criteria_value", f"Card {index+1} criterion '{label}' needs a value.")
    elif teaching == "procedure":
        steps = spec.get("steps")
        if not isinstance(steps, list) or not 3 <= len(steps) <= 4:
            findings.append({"code": "step_count", "message": "Return 3-4 procedure steps."})
            return findings
        for index, step in enumerate(steps):
            need(step.get("title"), "missing_title", f"Step {index+1} needs a title.")
            need(step.get("formula"), "missing_formula", f"Step {index+1} needs its equation.")
            need(step.get("detail"), "missing_detail", f"Step {index+1} needs a detail sentence.", 12)
    elif teaching == "algorithm":
        rows = spec.get("rows")
        if not isinstance(rows, list) or not 3 <= len(rows) <= 5:
            findings.append({"code": "row_count", "message": "Return 3-5 algorithm rows."})
            return findings
        for index, row in enumerate(rows):
            need(row.get("title"), "missing_title", f"Row {index+1} needs a title.")
            need(row.get("value"), "missing_value", f"Row {index+1} needs a state value.")
            need(row.get("detail"), "missing_detail", f"Row {index+1} needs a detail line.", 10)
    elif teaching == "narrative":
        stations = spec.get("stations")
        ticks = spec.get("ticks")
        if not isinstance(stations, list) or not 3 <= len(stations) <= 5:
            findings.append({"code": "station_count", "message": "Return 3-5 narrative stations."})
            return findings
        if not isinstance(ticks, list) or len(ticks) < 3:
            findings.append({"code": "tick_count", "message": "Return at least three timeline ticks."})
        for index, station in enumerate(stations):
            need(station.get("title"), "missing_title", f"Station {index+1} needs a title.")
            need(station.get("value"), "missing_value", f"Station {index+1} needs a date.")
            need(station.get("caption"), "missing_caption", f"Station {index+1} needs a caption.", 8)
    elif teaching == "recall":
        stations = spec.get("stations")
        if not isinstance(stations, list) or not 3 <= len(stations) <= 4:
            findings.append({"code": "station_count", "message": "Return 3-4 recall stations."})
            return findings
        for index, station in enumerate(stations):
            need(station.get("title"), "missing_title", f"Station {index+1} needs a title.")
            need(station.get("value"), "missing_value", f"Station {index+1} needs a number.")
            need(station.get("badge"), "missing_badge", f"Station {index+1} needs a one-letter badge.")
            need(station.get("detail"), "missing_detail", f"Station {index+1} needs a detail line.", 4)
    return findings


def build_program(brief: dict, spec: dict) -> dict:
    teaching = brief["teaching"]
    roles = brief.get("roles") or ["blue", "green", "gold", "coral"]
    conclusion = spec["conclusion"]
    if teaching == "comparison":
        cards = []
        for index, card in enumerate(spec["cards"]):
            role = card.get("role") or roles[index % len(roles)]
            cards.append({
                "id": ["sigmoid", "relu", "linear"][index] if index < 3 else f"card-{index+1}",
                "kind": "comparison-card",
                "role": role,
                "slots": {
                    "title": card["title"], "value": card.get("value", ""), "detail": clip_words(card["detail"], 160),
                    "formula": card["formula"], "badge": card.get("badge") or card["title"][0],
                    "criteria": card["criteria"],
                },
            })
        objects = [
            {"id": "route", "kind": "line", "from": [260, 300], "to": [1180, 300], "role": "blue", "strokeWidth": 2, "opacity": 0},
            {"id": "ship", "kind": "circle", "cx": 340, "cy": 300, "r": 9, "stroke": "#8bd0df", "opacity": 0},
            *cards,
        ]
        actions = [
            {"at": .2, "duration": .4, "kind": "show", "id": "route"},
            {"at": .3, "duration": .4, "kind": "show", "id": "ship"},
            {"at": 1.0, "duration": 1.4, "kind": "morph", "id": "route", "to": cards[0]["id"], "mode": "replace"},
            *[{"at": 1.0, "duration": 1.4, "kind": "morph", "id": "route", "to": card["id"], "mode": "copy"} for card in cards[1:]],
            {"at": 2.8, "duration": .4, "kind": "fade", "id": "ship", "opacity": 0},
            {"at": 3.8, "duration": .8, "kind": "dock", "ids": [card["id"] for card in cards], "y": 60, "scale": .8},
        ]
        return {
            "title": brief["title"], "teaching": teaching, "duration": brief["duration"],
            "objects": objects, "actions": actions,
            "conclusion": {"text": conclusion, "x": 720, "y": 560},
            "context": {"label": brief.get("context") or "shared input"},
        }
    if teaching == "procedure":
        objects = [{
            "id": f"step-{index+1}", "kind": "step-card", "role": step.get("role") or roles[index % len(roles)],
            "slots": {"title": step["title"], "formula": step["formula"], "value": step.get("value", ""), "detail": clip_words(step["detail"], 160), "badge": str(index + 1)},
        } for index, step in enumerate(spec["steps"])]
        return {"title": brief["title"], "teaching": teaching, "duration": brief["duration"], "objects": objects, "actions": [], "conclusion": {"text": conclusion, "x": 720, "y": 470}}
    if teaching == "algorithm":
        objects = [{
            "id": f"row-{index+1}", "kind": "trace-row", "role": row.get("role") or roles[index % len(roles)],
            "slots": {"title": row["title"], "value": row["value"], "badge": row.get("badge") or str(index + 1), "detail": clip_words(row["detail"], 70)},
        } for index, row in enumerate(spec["rows"])]
        return {"title": brief["title"], "teaching": teaching, "duration": brief["duration"], "objects": objects, "actions": [], "conclusion": {"text": conclusion, "x": 720, "y": 555}}
    if teaching == "narrative":
        objects = [{"id": "axis", "kind": "axis", "role": "muted", "slots": {"ticks": [{"label": tick} for tick in spec["ticks"]]}}]
        objects += [{
            "id": f"station-{index+1}", "kind": "station", "role": station.get("role") or roles[index % len(roles)],
            "slots": {"title": station["title"], "value": station["value"], "caption": clip_words(station["caption"], 32)},
        } for index, station in enumerate(spec["stations"])]
        return {"title": brief["title"], "teaching": teaching, "duration": brief["duration"], "objects": objects, "actions": [], "conclusion": {"text": conclusion, "x": 720, "y": 470}}
    if teaching == "recall":
        objects = [{"id": "route", "kind": "line", "from": [180, 300], "to": [1260, 300], "role": "blue", "strokeWidth": 2, "opacity": 0}]
        objects += [{
            "id": f"station-{index+1}", "kind": "station", "role": station.get("role") or roles[index % len(roles)],
            "slots": {"title": station["title"], "value": station["value"], "badge": station.get("badge") or station["title"][0], "detail": clip_words(station["detail"], 60)},
        } for index, station in enumerate(spec["stations"])]
        return {"title": brief["title"], "teaching": teaching, "duration": brief["duration"], "objects": objects, "actions": [], "conclusion": {"text": conclusion, "x": 720, "y": 470}}
    raise ValueError(f"Unknown teaching method: {teaching}")


def compile_program(studio: Path, program: dict) -> dict:
    run = subprocess.run(
        ["npx", "tsx", "scripts/scene_compile.ts"], cwd=studio,
        input=json.dumps(program), text=True, capture_output=True, timeout=120,
    )
    if not run.stdout.strip():
        return {"ok": False, "findings": [{"code": "compiler", "severity": "error", "message": run.stderr[-500:]}]}
    try:
        return json.loads(run.stdout)
    except json.JSONDecodeError as exc:
        return {"ok": False, "findings": [{"code": "compiler_json", "severity": "error", "message": str(exc)}]}


class BeatFactory:
    def __init__(self, llm, studio: Path):
        self.llm = llm
        self.studio = Path(studio)
        self.jobs: dict[str, dict] = {}
        self.streams: dict[str, queue.Queue] = {}
        self.lock = threading.RLock()

    def start(self, payload: dict | None = None) -> dict:
        if isinstance(self.llm, OfflineLLM):
            raise ValueError("No AI model is configured.")
        job_id = uuid.uuid4().hex
        stream: queue.Queue = queue.Queue()
        with self.lock:
            self.jobs[job_id] = {"id": job_id, "status": "preparing", "stage": "Starting the beat factory"}
            self.streams[job_id] = stream
        threading.Thread(target=self._run, args=(job_id,), daemon=True).start()
        return {"id": job_id, "status": "preparing"}

    def events(self, job_id: str):
        stream = self.streams.get(job_id)
        if stream is None:
            raise ValueError("The beat stream expired. Start a new run.")
        while True:
            try:
                event = stream.get(timeout=15)
            except queue.Empty:
                yield {"type": "ping"}
                continue
            if event is None:
                break
            yield event

    def _run(self, job_id: str) -> None:
        stream = self.streams[job_id]
        job = self.jobs[job_id]
        started = time.monotonic()

        def emit(kind: str, **data):
            stream.put({"type": kind, **data})

        try:
            emit("start", model=getattr(self.llm, "visual_model", None) or getattr(self.llm, "model", None) or type(self.llm).__name__,
                 beats=[{"id": b["id"], "title": b["title"], "teaching": b["teaching"]} for b in BEAT_BRIEFS])
            for index, brief in enumerate(BEAT_BRIEFS):
                job["status"] = "generating"
                job["stage"] = f"Model writing {brief['teaching']} beat {index+1} of {len(BEAT_BRIEFS)}"
                emit("beat_start", index=index, id=brief["id"], title=brief["title"], teaching=brief["teaching"])
                beat_started = time.monotonic()
                try:
                    program, compiled, attempts = self._generate(brief, index, emit)
                    seconds = round(time.monotonic() - beat_started, 1)
                    emit("compiled", index=index, id=brief["id"], title=brief["title"], teaching=brief["teaching"],
                         program=program, compiled=compiled, attempts=attempts, seconds=seconds)
                except Exception as exc:
                    emit("beat_error", index=index, id=brief["id"], title=brief["title"], error=str(exc)[:600],
                         seconds=round(time.monotonic() - beat_started, 1))
            total = round(time.monotonic() - started, 1)
            job["status"] = "ready"
            job["stage"] = "All beats finished"
            emit("done", total=total, beats=len(BEAT_BRIEFS))
        except Exception as exc:
            job["status"] = "failed"
            job["stage"] = str(exc)[:300]
            emit("error", error=str(exc)[:600])
        finally:
            stream.put(None)

    def _generate(self, brief: dict, index: int, emit) -> tuple[dict, dict, int]:
        spec = self._ask(brief, emit)
        findings = spec_findings(spec, brief)
        program = build_program(brief, spec)
        compiled = compile_program(self.studio, program)
        if findings or not compiled.get("ok"):
            emit("repair", index=index, reason="slot or compiler gate", findings=findings + [f for f in compiled.get("findings", []) if f.get("severity") == "error"][:6])
            spec = self._ask(brief, emit, spec=spec, findings=findings + compiled.get("findings", []))
            program = build_program(brief, spec)
            compiled = compile_program(self.studio, program)
            if not compiled.get("ok"):
                raise ValueError("The beat still fails the compiler gate after one repair.")
            return program, compiled, 2
        return program, compiled, 1

    def _ask(self, brief: dict, emit, spec: dict | None = None, findings: list[dict] | None = None) -> dict:
        prompt = prompt_for(brief)
        if spec is not None:
            prompt += "\n\nYour previous JSON failed:\n" + json.dumps(findings or [], ensure_ascii=False, indent=1)
            prompt += "\n\nPrevious JSON:\n" + json.dumps(spec, ensure_ascii=False)
            prompt += "\n\nReturn the corrected complete JSON object only."
        text = self.llm.compose(prompt, system=SYSTEM)
        return extract_json(text)
