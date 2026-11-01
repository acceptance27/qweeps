"""Streaming factory for the existing LiveVisual card renderer.

The model fills nodes/tags/bodies/connections only; GeneratedStage owns the
layout, icons, typography and pacing. This is the Module 6 / massless-lesson
design path, not the compound SceneProgram path.
"""
from __future__ import annotations

import json
import queue
import re
import threading
import time
import uuid
from pathlib import Path

from ..llm import OfflineLLM
from .beat_factory import ASSETS, BEAT_BRIEFS, extract_json

PALETTE = {"blue", "gold", "green", "coral", "purple"}
LAYOUTS = {"comparison", "process", "timeline", "loci", "concept", "diagram", "fanin"}

SYSTEM = """You author QWEEPS LiveVisual beats as JSON. Return one JSON object only.
No markdown, no code fences, no SVG, no x/y coordinates, no layout geometry.
The existing renderer owns the cards, icons, typography and motion. Fill the
nodes, tags, bodies, connections and takeaway from the brief. Be descriptive:
body text is 80-180 characters and explains the mechanism, not a label."""

SCHEMAS = {
    "comparison": {
        "columns": ["Activation", "Range", "Formula", "Behavior"],
        "nodes": [
            {"id": "sigmoid", "title": "Sigmoid", "cells": ["0 to 1", "σ(z) = 1/(1+e^-z)", "Smooth, bounded; probabilities"], "icon": "scale", "color": "blue", "at": 0, "body": "Compresses any score into a smooth S-curve, making outputs readable as probabilities."},
            {"id": "relu", "title": "ReLU", "cells": ["0 to ∞", "max(0, z)", "Hinge; hidden layers"], "icon": "zap", "color": "green", "at": 4, "body": "Clips negative scores to zero and passes positives unchanged, creating a hinge."},
            {"id": "linear", "title": "Linear", "cells": ["unbounded", "y = z", "Straight line; regression"], "icon": "route", "color": "gold", "at": 8, "body": "Returns the score unchanged, so outputs grow without limit along a straight line."},
        ],
        "connections": [],
        "takeaway": "The activation decides the shape of the output, not the input.",
    },
    "procedure": {
        "nodes": [
            {"id": "scale", "title": "1. Scale", "body": "Multiply the input by its weight: 2 × 0.7 = 1.4. The product is the first quantity carried into the sum.", "tag": "2 × 0.7 = 1.4", "icon": "scale", "color": "blue", "at": 0},
            {"id": "add", "title": "2. Add bias", "body": "Add the remaining weighted input and the bias: 1.4 − 0.5 + 0.3 = 1.2. This is the score before activation.", "tag": "= 1.2", "icon": "zap", "color": "gold", "at": 4},
            {"id": "squash", "title": "3. Squash", "body": "Pass the score through sigma: σ(1.2) = 0.77. The bounded result is the output for this forward pass.", "tag": "= 0.77", "icon": "eye", "color": "green", "at": 8},
        ],
        "connections": [
            {"from": "scale", "to": "add", "label": "then", "at": 4},
            {"from": "add", "to": "squash", "label": "then", "at": 9},
        ],
        "takeaway": "Scale, add the bias, squash: that is one forward pass.",
    },
    "algorithm": {
        "columns": ["Step", "Operation", "State / value"],
        "nodes": [
            {"id": "read", "title": "Read inputs", "cells": ["Load x, w, b", "x, w, b"], "icon": "search", "color": "purple", "at": 0, "body": "Load the input vector, every weight and the bias so the pass starts from a known state."},
            {"id": "compute", "title": "Compute z", "cells": ["Weighted sum + bias", "z = 1.2"], "icon": "cpu", "color": "gold", "at": 4, "body": "Multiply each input by its weight, sum the products and add the bias."},
            {"id": "return", "title": "Return y", "cells": ["Activation", "y = 0.77"], "icon": "check", "color": "green", "at": 8, "body": "Send z through the activation to produce the output. No weights change."},
        ],
        "connections": [],
        "takeaway": "One forward pass: no weights change.",
    },
    "narrative": {
        "nodes": [
            {"id": "perceptron", "title": "Perceptron", "body": "1958: the first trainable unit. It could learn a linear boundary from labelled examples.", "tag": "1958", "icon": "book", "color": "blue", "at": 0},
            {"id": "backprop", "title": "Backpropagation", "body": "1986: credit assignment became practical, so multi-layer networks could learn from error.", "tag": "1986", "icon": "route", "color": "purple", "at": 4},
            {"id": "scale", "title": "Scale", "body": "Today: deep networks, larger datasets and hardware make the same idea practical at scale.", "tag": "Today", "icon": "cpu", "color": "green", "at": 8},
        ],
        "connections": [],
        "takeaway": "The idea moved from one unit to a trainable network.",
    },
    "recall": {
        "nodes": [
            {"id": "weight", "title": "Weight", "body": "Each input is scaled by its connection weight, so stronger signals count for more.", "tag": "W", "icon": "scale", "color": "blue", "at": 0},
            {"id": "sum", "title": "Sum", "body": "The weighted inputs are added into one score, pooling the evidence before activation.", "tag": "S", "icon": "cpu", "color": "purple", "at": 4},
            {"id": "activate", "title": "Activate", "body": "The score is transformed into the output, turning the weighted evidence into a result.", "tag": "A", "icon": "eye", "color": "green", "at": 8},
        ],
        "connections": [
            {"from": "weight", "to": "sum", "label": "then", "at": 5},
            {"from": "sum", "to": "activate", "label": "then", "at": 10},
        ],
        "takeaway": "Weight, sum, activate: the three moves of a neuron.",
    },
}


def prompt_for(brief: dict) -> str:
    teaching = brief["teaching"]
    return (
        f"Brief:\n{json.dumps(brief, ensure_ascii=False, indent=1)}\n\n"
        f"Return this shape:\n{json.dumps(SCHEMAS[teaching], ensure_ascii=False, indent=1)}\n\n"
        "Rules:\n"
        "- Use the brief's facts; do not add new claims.\n"
        "- Keep the node count and order shown in the shape.\n"
        "- comparison and algorithm are matrix tables: use columns and one cells array per row;\n  procedure, narrative and recall use title, body, tag, icon and color.\n"
        f"- icon must be one of: {', '.join(sorted(ASSETS))}.\n"
        "- color must be blue, gold, green, coral or purple.\n"
        "- body is 80-180 characters and explains the mechanism.\n"
        "- tag is a short fact, formula or date.\n"
        "- Return only the JSON object."
    )


def fill_defaults(spec: dict) -> dict:
    colors = ["blue", "gold", "green", "coral", "purple"]
    icons = ["zap", "scale", "route", "cpu", "eye"]
    for index, node in enumerate(spec.get("nodes", [])):
        if node.get("color") not in PALETTE:
            node["color"] = colors[index % len(colors)]
        if node.get("icon") not in ASSETS:
            node["icon"] = icons[index % len(icons)]
        if not node.get("tag"):
            node["tag"] = ""
    return spec


def spec_findings(spec: dict, brief: dict) -> list[dict]:
    findings: list[dict] = []
    teaching = brief["teaching"]
    nodes = spec.get("nodes")
    expected = {"comparison": 3, "procedure": 3, "algorithm": 3, "narrative": 3, "recall": 3}[teaching]
    if not isinstance(nodes, list) or len(nodes) != expected:
        findings.append({"code": "node_count", "message": f"Return exactly {expected} nodes."})
        return findings
    columns = spec.get("columns")
    if teaching in {"comparison", "algorithm"}:
        expected_columns = 4 if teaching == "comparison" else 3
        if not isinstance(columns, list) or len(columns) != expected_columns:
            findings.append({"code": "column_count", "message": f"Return exactly {expected_columns} matrix columns."})
        for index, node in enumerate(nodes):
            if not isinstance(node.get("title"), str) or not node["title"].strip():
                findings.append({"code": "missing_title", "message": f"Row {index+1} needs a title."})
            cells = node.get("cells")
            if not isinstance(cells, list) or len(cells) != expected_columns - 1:
                findings.append({"code": "cell_count", "message": f"Row {index+1} needs {expected_columns-1} cells."})
            elif any(not isinstance(cell, str) or not cell.strip() for cell in cells):
                findings.append({"code": "empty_cell", "message": f"Row {index+1} has an empty cell."})
            if node.get("icon") not in ASSETS:
                findings.append({"code": "missing_asset", "message": f"Row {index+1} needs a catalog icon."})
            if node.get("color") not in PALETTE:
                findings.append({"code": "missing_color", "message": f"Row {index+1} needs a palette color."})
    else:
        for index, node in enumerate(nodes):
            if not isinstance(node.get("title"), str) or not node["title"].strip():
                findings.append({"code": "missing_title", "message": f"Node {index+1} needs a title."})
            body = node.get("body")
            if not isinstance(body, str) or len(body.strip()) < 50:
                findings.append({"code": "short_body", "message": f"Node {index+1} body must be at least 50 characters."})
            if len(body or "") > 190:
                findings.append({"code": "body_budget", "message": f"Node {index+1} body must be under 190 characters."})
            if not isinstance(node.get("tag"), str):
                findings.append({"code": "missing_tag", "message": f"Node {index+1} needs a tag."})
            if node.get("icon") not in ASSETS:
                findings.append({"code": "missing_asset", "message": f"Node {index+1} needs a catalog icon."})
            if node.get("color") not in PALETTE:
                findings.append({"code": "missing_color", "message": f"Node {index+1} needs a palette color."})
    takeaway = spec.get("takeaway")
    if not isinstance(takeaway, str) or len(takeaway.strip()) < 10:
        findings.append({"code": "missing_takeaway", "message": "Write one takeaway sentence."})
    if isinstance(takeaway, str) and len(takeaway) > 120:
        findings.append({"code": "takeaway_budget", "message": "Keep the takeaway under 120 characters."})
    return findings


def build_chapter(brief: dict, spec: dict) -> dict:
    teaching = brief["teaching"]
    layout = {"comparison": "matrix", "procedure": "process", "algorithm": "matrix", "narrative": "timeline", "recall": "loci"}[teaching]
    chapter_teaching = "process" if teaching == "procedure" else teaching
    visual = {
        "layout": layout,
        "presentation": {
            "method": brief.get("method", teaching.title()),
            "why": brief.get("why", "The existing card renderer owns the layout and motion."),
            "visualEvidence": brief.get("evidence", "Nodes, tags, bodies and connections."),
            "textMode": "descriptive",
        },
        "nodes": [{
            "id": str(node.get("id") or f"node-{index+1}"),
            "title": node["title"],
            "body": node.get("body", ""),
            "icon": node["icon"],
            "color": node["color"],
            "at": index * 4,
            "tag": node.get("tag", ""),
            **({"cells": node["cells"]} if "cells" in node else {}),
        } for index, node in enumerate(spec["nodes"])],
        "connections": spec.get("connections", []),
        "columns": spec.get("columns", []),
        "takeaway": spec["takeaway"],
    }
    duration = 10
    return {
        "id": f"visual-{brief['id']}",
        "title": brief["title"],
        "teaching": chapter_teaching,
        "years": brief.get("years", "one model"),
        "question": brief["question"],
        "roles": {node["id"]: node["title"] for node in visual["nodes"]},
        "sources": [],
        "safeguard": "",
        "narration": brief.get("narration", spec["takeaway"]),
        "narrationAt": 0,
        "audio": "",
        "start": 0,
        "end": duration,
        "finishedAt": duration - 1,
        "transitionOut": .3,
        "visualStart": 0,
        "visualEnd": duration,
        "continuity": {"from": None, "bridge": "The same case, a different teaching move."},
        "cues": [],
        "visual": visual,
    }


class VisualBeatFactory:
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
            self.jobs[job_id] = {"id": job_id, "status": "preparing", "stage": "Starting the visual beat factory"}
            self.streams[job_id] = stream
        threading.Thread(target=self._run, args=(job_id,), daemon=True).start()
        return {"id": job_id, "status": "preparing"}

    def events(self, job_id: str):
        stream = self.streams.get(job_id)
        if stream is None:
            raise ValueError("The visual beat stream expired. Start a new run.")
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
                started_beat = time.monotonic()
                try:
                    spec, attempts = self._generate(brief, emit)
                    chapter = build_chapter(brief, spec)
                    emit("visual", index=index, id=brief["id"], title=brief["title"], teaching=brief["teaching"],
                         chapter=chapter, attempts=attempts, seconds=round(time.monotonic() - started_beat, 1))
                except Exception as exc:
                    emit("beat_error", index=index, id=brief["id"], title=brief["title"], error=str(exc)[:600],
                         seconds=round(time.monotonic() - started_beat, 1))
            total = round(time.monotonic() - started, 1)
            job["status"] = "ready"
            job["stage"] = "All visual beats finished"
            emit("done", total=total, beats=len(BEAT_BRIEFS))
        except Exception as exc:
            job["status"] = "failed"
            job["stage"] = str(exc)[:300]
            emit("error", error=str(exc)[:600])
        finally:
            stream.put(None)

    def _generate(self, brief: dict, emit) -> tuple[dict, int]:
        spec = fill_defaults(self._ask(brief))
        findings = spec_findings(spec, brief)
        if findings:
            emit("repair", index=BEAT_BRIEFS.index(brief), reason="visual schema", findings=findings[:6])
            spec = fill_defaults(self._ask(brief, spec=spec, findings=findings))
            findings = spec_findings(spec, brief)
            if findings:
                raise ValueError("The visual beat still fails schema validation after one repair.")
            return spec, 2
        return spec, 1

    def _ask(self, brief: dict, spec: dict | None = None, findings: list[dict] | None = None) -> dict:
        prompt = prompt_for(brief)
        if spec is not None:
            prompt += "\n\nYour previous JSON failed:\n" + json.dumps(findings or [], ensure_ascii=False, indent=1)
            prompt += "\n\nPrevious JSON:\n" + json.dumps(spec, ensure_ascii=False)
            prompt += "\n\nReturn the corrected complete JSON object only."
        return extract_json(self.llm.compose(prompt, system=SYSTEM))
