#!/usr/bin/env python3
"""Model test for the motif layer, using the massless-matter reference facts."""
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
from assistant.visual.motifs import MOTIFS, PALETTE, expand_motif, validate_motif  # noqa: E402
from assistant.visual.visual_beat_factory import extract_json  # noqa: E402

SYSTEM = """You design QWEEPS diagram beats as JSON. Return one JSON object only.
No markdown, no SVG, no paths, no pixel coordinates. Choose one semantic motif
per node; the compiler draws it. Be physically clear and descriptive."""

PROMPT = """Chapter: {title}
Question: {question}
Reference facts:
{facts}

Choose exactly {count} nodes. Return:
{{
 "nodes": [
  {{"id":"...", "title":"...", "body":"80-180 characters explaining the mechanism", "tag":"short fact/formula", "icon":"one catalog icon", "color":"blue|gold|green|coral|purple", "motif":{{"type":"wave|vector|box|ring|pair|axis|collision|field|equation", ...parameters}}}}
 ],
 "connections": [{{"from":"id","to":"id","label":"short relation","at":4}}],
 "takeaway": "one sentence"
}}

Motif vocabulary:
- wave: {{"type":"wave","direction":"right|left","amplitude":8-20,"frequency":1-4,"label":"..."}}
- vector: {{"type":"vector","angle":0|45|90|135|180,"length":20-60,"label":"..."}}
- box: {{"type":"box","filled":true|false,"symbol":"m","label":"..."}}
- ring: {{"type":"ring","rings":2-4,"label":"..."}}
- pair: {{"type":"pair","labels":["e-","e+"],"label":"..."}}
- axis: {{"type":"axis","endpoints":["-p","+p"]}}
- collision: {{"type":"collision","burst":4-10,"label":"..."}}
- field: {{"type":"field","rings":2-4,"label":"..."}}
- equation: {{"type":"equation","formula":"E = mc^2","label":"..."}}

Rules:
- Use the reference facts; do not invent new claims.
- Body is 80-180 characters and explains what the diagram shows.
- Do not supply drawing coordinates or SVG.
- Return only the JSON object."""


def prompt_for(chapter: dict) -> str:
    visual = chapter.get("visual") or {}
    facts = [{k: node.get(k) for k in ("title", "tag", "body") if node.get(k)} for node in visual.get("nodes", [])]
    return PROMPT.format(title=chapter.get("title"), question=chapter.get("question"), facts=json.dumps(facts, ensure_ascii=False, indent=1), count=len(facts), icons=", ".join(sorted(ASSETS)))


def findings_for(spec: dict, chapter: dict) -> list[str]:
    nodes = spec.get("nodes")
    expected = len((chapter.get("visual") or {}).get("nodes", []))
    findings = []
    if not isinstance(nodes, list) or len(nodes) != expected:
        return [f"Return exactly {expected} nodes."]
    ids = set()
    for index, node in enumerate(nodes):
        if not isinstance(node.get("title"), str) or not node["title"].strip():
            findings.append(f"Node {index+1} needs a title.")
        body = node.get("body")
        if not isinstance(body, str) or len(body.strip()) < 40:
            findings.append(f"Node {index+1} body must be at least 40 characters.")
        if len(body or "") > 190:
            findings.append(f"Node {index+1} body must be under 190 characters.")
        if not isinstance(node.get("tag"), str) or not node["tag"].strip():
            findings.append(f"Node {index+1} needs a tag.")
        if node.get("icon") not in ASSETS:
            findings.append(f"Node {index+1} needs a catalog icon.")
        if node.get("color") not in PALETTE:
            findings.append(f"Node {index+1} needs a palette color.")
        error = validate_motif(node.get("motif"))
        if error:
            findings.append(f"Node {index+1}: {error}")
        node_id = node.get("id")
        if not isinstance(node_id, str) or not node_id.strip() or node_id in ids:
            findings.append(f"Node {index+1} needs a unique id.")
        else:
            ids.add(node_id)
    for link in spec.get("connections") or []:
        if link.get("from") not in ids or link.get("to") not in ids:
            findings.append("Every connection must reference existing node ids.")
    if not isinstance(spec.get("takeaway"), str) or len(spec["takeaway"].strip()) < 10:
        findings.append("Write one takeaway sentence.")
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
        node.setdefault("body", "")
    return spec


def build_chapter(chapter: dict, spec: dict, index: int, duration: int) -> dict:
    visual = chapter.get("visual") or {}
    nodes = []
    for node in spec["nodes"]:
        artwork = expand_motif(node["motif"], node["color"])
        nodes.append({
            "id": node["id"], "title": node["title"], "body": node["body"], "tag": node["tag"],
            "icon": node["icon"], "color": node["color"], "at": nodes.__len__() * 3, "artwork": artwork,
        })
    out = {
        "layout": "diagram",
        "presentation": visual.get("presentation", {}),
        "nodes": nodes,
        "connections": spec.get("connections", []),
        "columns": [],
        "takeaway": spec["takeaway"],
    }
    start = index * duration
    end = start + duration
    return {
        "id": chapter.get("id") or f"chapter-{index+1}",
        "title": chapter.get("title") or f"Chapter {index+1}",
        "teaching": "construction" if index == 0 else "mechanism",
        "years": "diagram",
        "question": chapter.get("question", ""),
        "roles": {node["id"]: node["title"] for node in nodes},
        "sources": reference.get("sources", []),
        "safeguard": "",
        "narration": spec["takeaway"],
        "narrationAt": 0,
        "audio": "",
        "start": start, "end": end, "finishedAt": end - 1.5, "transitionOut": .4,
        "visualStart": start, "visualEnd": end,
        "continuity": {"from": None, "bridge": "The same case, a different visual relation."},
        "cues": [],
        "visual": out,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="opencode-go/muse-spark-1.3-contributor")
    parser.add_argument("--out", default=str(ROOT / "visual-studio/public/lessons/motif-model.json"))
    parser.add_argument("--reference", default=str(ROOT / "bundled-lessons/browser-lessons/61d56323819e14949204a5e95f1214fc/lesson.json"))
    args = parser.parse_args()
    global reference
    reference = json.loads(Path(args.reference).read_text())
    cfg = load_config(); cfg.llm.visual_model = args.model; cfg.llm.visual_vision_model = args.model; cfg.llm.timeout = 900
    llm = build_visual_llm(cfg)
    chapters = []
    duration = 20
    started = time.monotonic()
    for index, chapter in enumerate(reference["chapters"][:4]):
        beat_started = time.monotonic()
        print(f"[{index+1}/4] {chapter.get('title')}", flush=True)
        spec = None; findings = []
        for attempt in range(2):
            prompt = prompt_for(chapter)
            if spec is not None:
                prompt += "\n\nPrevious JSON failed:\n" + json.dumps(findings, ensure_ascii=False)
                prompt += "\n\nPrevious JSON:\n" + json.dumps(spec, ensure_ascii=False)
                prompt += "\n\nReturn the corrected complete JSON object only."
            spec = fill(extract_json(llm.compose(prompt, system=SYSTEM)))
            findings = findings_for(spec, chapter)
            if not findings:
                break
        if findings:
            raise SystemExit(f"{chapter.get('title')} failed: {findings}")
        chapters.append(build_chapter(chapter, spec, index, duration))
        print(f"  pass in {time.monotonic()-beat_started:.1f}s, {len(spec['nodes'])} nodes", flush=True)
    lesson = {
        "id": "motif_model", "kind": "live_generated",
        "title": "Massless matter · model motif test",
        "question": reference.get("question", ""),
        "duration": len(chapters) * duration,
        "documentTitle": reference.get("documentTitle"),
        "example": reference.get("example"),
        "chapters": chapters,
        "sources": reference.get("sources", []),
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(lesson, ensure_ascii=False, indent=1))
    print(f"wrote {args.out} in {time.monotonic()-started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
