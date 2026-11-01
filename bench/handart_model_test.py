#!/usr/bin/env python3
"""Model-authored direct-art test for one massless-matter scene."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.beat_factory import ASSETS  # noqa: E402
from assistant.visual.handart import validate_artwork  # noqa: E402
from assistant.visual.motifs import PALETTE  # noqa: E402
from assistant.visual.visual_beat_factory import extract_json  # noqa: E402

SYSTEM = """You are a visual designer authoring a QWEEPS diagram as JSON.
Return one JSON object only. You write the artwork directly as safe SVG
primitives in a normalized 0-100 box. No markdown, no HTML, no external assets,
no executable code, no arbitrary coordinates outside the box."""

PROMPT = """Chapter: Light Carries Energy and Momentum
Question: If photons have zero rest mass, what physical ingredients do they carry to form matter?
Reference facts:
{facts}

Use the 3brown1blue design contract:
- Geometry before algebra: draw the wave, vectors and mass box before the equation.
- Persistent context: keep all three atoms visible.
- Annotations on objects: attach labels to the shape they describe.
- Color as semantic data: one color per entity, consistent.
- Concrete values: 511 keV, 1.022 MeV, m0 = 0.
- Density ramp: start with 3 atoms, end with the equation and mass relation visible.
- Text fit: labels under 40 characters; the node body carries the explanation.

Each node has 3-10 handcrafted primitives in a 0-100 box.
Allowed primitive shapes:
- path: {{"type":"path","d":"M8 50 Q18 30 28 50 T48 50 T68 50 T88 50","stroke":"gold","fill":"none","strokeWidth":2.4}}
- line: {{"type":"line","x1":64,"y1":78,"x2":88,"y2":78,"stroke":"gold","fill":"none","strokeWidth":2}}
- circle: {{"type":"circle","cx":50,"cy":50,"r":8,"stroke":"blue","fill":"none","strokeWidth":1.5}}
- rect: {{"type":"rect","x":30,"y":30,"width":40,"height":40,"rx":4,"stroke":"coral","fill":"none","strokeWidth":1.8}}
- text: {{"type":"text","x":50,"y":92,"size":8,"text":"E = hν","stroke":"none","fill":"muted","strokeWidth":1}}

Rules:
- Path commands: M, L, C, Q, T, Z only; uppercase; all numbers 0-100.
- Colors: blue, gold, green, coral, purple, white, muted, none.
- strokeWidth 0.3-4; text size 5-14; 3-10 primitives per node.
- icon must be one of: {icons}.
- node body 50-190 characters; tag under 40.
- Return only the JSON object:
{{
 "nodes": [
  {{"id":"photon","title":"Propagating Photon","body":"...","tag":"m0 = 0","icon":"zap","color":"gold",
    "artwork":[...]}}
 ],
 "links":[{{"from":"photon","to":"invariant","label":"energy-momentum","at":4}}],
 "takeaway":"one sentence under 120 characters"
}}
"""


def prompt_for(facts: list[dict]) -> str:
    return PROMPT.format(facts=json.dumps(facts, ensure_ascii=False, indent=1), icons=", ".join(sorted(ASSETS)))


def findings_for(spec: dict) -> list[str]:
    findings: list[str] = []
    nodes = spec.get("nodes")
    if not isinstance(nodes, list) or not 2 <= len(nodes) <= 4:
        return ["Return 2-4 nodes."]
    ids = set()
    for index, node in enumerate(nodes):
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip() or node_id in ids:
            findings.append(f"Node {index+1} needs a unique id.")
        else:
            ids.add(node_id)
        if not isinstance(node.get("title"), str) or not node["title"].strip():
            findings.append(f"Node {index+1} needs a title.")
        body = node.get("body")
        if not isinstance(body, str) or not 50 <= len(body) <= 190:
            findings.append(f"Node {index+1} body must be 50-190 characters.")
        if node.get("icon") not in ASSETS:
            findings.append(f"Node {index+1} needs a catalog icon.")
        if node.get("color") not in PALETTE:
            findings.append(f"Node {index+1} needs a palette color.")
        findings.extend(f"Node {index+1}: {error}" for error in validate_artwork(node.get("artwork")))
    for link in spec.get("links") or []:
        if link.get("from") not in ids or link.get("to") not in ids:
            findings.append("Every link must reference existing node ids.")
    takeaway = spec.get("takeaway")
    if not isinstance(takeaway, str) or not 10 <= len(takeaway) <= 120:
        findings.append("Write one takeaway sentence under 120 characters.")
    return findings


def fill(spec: dict) -> dict:
    palette = ["blue", "gold", "green", "coral", "purple"]
    icons = ["zap", "scale", "route", "cpu", "eye", "atom", "package", "lock", "key", "shield", "warning"]
    for index, node in enumerate(spec.get("nodes", [])):
        node.setdefault("id", f"node-{index+1}")
        if node.get("color") not in PALETTE:
            node["color"] = palette[index % len(palette)]
        if node.get("icon") not in ASSETS:
            node["icon"] = icons[index % len(icons)]
        node.setdefault("tag", "")
    return spec


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="opencode-go/muse-spark-1.3-contributor")
    parser.add_argument("--out", default=str(ROOT / "visual-studio/public/lessons/handart-model.json"))
    parser.add_argument("--reference", default=str(ROOT / "bundled-lessons/browser-lessons/61d56323819e14949204a5e95f1214fc/lesson.json"))
    args = parser.parse_args()
    reference = json.loads(Path(args.reference).read_text())
    chapter = reference["chapters"][0]
    facts = [{k: node.get(k) for k in ("title", "tag", "body") if node.get(k)} for node in chapter["visual"]["nodes"]]
    cfg = load_config(); cfg.llm.visual_model = args.model; cfg.llm.visual_vision_model = args.model; cfg.llm.timeout = 900
    llm = build_visual_llm(cfg)
    spec = None; findings = []; started = time.monotonic()
    for attempt in range(2):
        prompt = prompt_for(facts)
        if spec is not None:
            prompt += "\n\nPrevious JSON failed:\n" + json.dumps(findings, ensure_ascii=False)
            prompt += "\n\nPrevious JSON:\n" + json.dumps(spec, ensure_ascii=False)
            prompt += "\n\nReturn the corrected complete JSON object only."
        spec = fill(extract_json(llm.compose(prompt, system=SYSTEM)))
        findings = findings_for(spec)
        print(f"attempt {attempt+1}: {len(findings)} findings", flush=True)
        if not findings:
            break
    if findings:
        raise SystemExit(f"Hand-authored artwork failed: {findings}")
    nodes = [{
        "id": node["id"], "title": node["title"], "body": node["body"], "tag": node.get("tag", ""),
        "icon": node["icon"], "color": node["color"], "at": index * 3, "artwork": node["artwork"],
    } for index, node in enumerate(spec["nodes"])]
    visual = {
        "layout": "diagram",
        "presentation": {
            "method": "Handcrafted diagram",
            "why": "The model authored the primitives directly under the 3brown1blue design contract.",
            "visualEvidence": "Geometry before algebra, annotations on objects, semantic color, concrete values.",
            "textMode": "descriptive",
        },
        "nodes": nodes, "connections": spec.get("links", []), "columns": [],
        "takeaway": spec["takeaway"],
    }
    duration = 20
    lesson = {
        "id": "handart_model", "kind": "live_generated",
        "title": "Massless matter · model handcrafted art",
        "question": chapter.get("question", ""), "duration": duration,
        "documentTitle": reference.get("documentTitle"), "example": reference.get("example"),
        "chapters": [{
            "id": "handart", "title": "Light Carries Energy and Momentum",
            "teaching": "construction", "years": "diagram", "question": chapter.get("question", ""),
            "roles": {node["id"]: node["title"] for node in nodes},
            "sources": reference.get("sources", []), "safeguard": "",
            "narration": spec["takeaway"], "narrationAt": 0, "audio": "",
            "start": 0, "end": duration, "finishedAt": duration - 1.5, "transitionOut": .4,
            "visualStart": 0, "visualEnd": duration,
            "continuity": {"from": None, "bridge": "The model authored the primitives directly."},
            "cues": [], "visual": visual,
        }],
        "sources": reference.get("sources", []),
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(lesson, ensure_ascii=False, indent=1))
    print(f"wrote {args.out} in {time.monotonic()-started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
