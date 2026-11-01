#!/usr/bin/env python3
"""Author a Module 6 lesson with the model, using the reference facts.

The model rewrites the visual nodes/cells; the existing GeneratedStage renderer
owns the layout, icons, typography and pacing.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.visual_beat_factory import ASSETS, PALETTE, extract_json  # noqa: E402

SYSTEM = """You author QWEEPS LiveVisual lesson beats as JSON. Return one JSON object only.
No markdown, no code fences, no SVG, no x/y coordinates. The existing renderer
owns the cards, table columns, icons, typography and motion. Rewrite the facts
into your own clear visual beat; do not copy the reference wording verbatim.
Be descriptive: body text explains the mechanism, not just a label."""

REFERENCE = json.loads((ROOT / "bench/module6-reference.json").read_text()) if (ROOT / "bench/module6-reference.json").is_file() else None

PROMPT = """Chapter: {title}
Question: {question}
Layout: {layout}
Columns: {columns}
Facts:
{facts}

Return this JSON shape:
{{
 "nodes": [
  {{"id":"...", "title":"...", "body":"...", "tag":"...", "icon":"...", "color":"...", "at":0 {cells}}}
 ],
 "connections": [{{"from":"...","to":"...","label":"...","at":4}}],
 "takeaway": "..."
}}

Rules:
- Keep the reference layout and the same number of nodes.
- {layout_rule}
- icon must be one of: {icons}.
- color must be blue, gold, green, coral or purple.
- Rewrite the facts; do not copy the reference sentences.
- Return only the JSON object.
"""


def facts_for(chapter: dict) -> list[dict]:
    visual = chapter.get("visual") or {}
    facts = []
    for node in visual.get("nodes", []):
        facts.append({key: node.get(key) for key in ("title", "tag", "body", "cells", "icon") if node.get(key) is not None})
    return facts


def prompt_for(chapter: dict) -> str:
    visual = chapter.get("visual") or {}
    layout = visual.get("layout", "concept")
    columns = visual.get("columns", [])
    cells = ", \"cells\": [\"...\"]" if layout == "matrix" else ""
    layout_rule = (
        f"Return exactly {len(visual.get('nodes', []))} matrix rows and {len(columns)} columns; each row needs {max(0, len(columns)-1)} cells."
        if layout == "matrix"
        else f"Return exactly {len(visual.get('nodes', []))} cards with body and tag; connections are allowed."
    )
    return PROMPT.format(
        title=chapter.get("title", ""), question=chapter.get("question", ""), layout=layout,
        columns=json.dumps(columns, ensure_ascii=False), facts=json.dumps(facts_for(chapter), ensure_ascii=False, indent=1),
        cells=cells, layout_rule=layout_rule, icons=", ".join(sorted(ASSETS)),
    )


def findings_for(spec: dict, chapter: dict) -> list[str]:
    visual = chapter.get("visual") or {}
    expected = len(visual.get("nodes", []))
    nodes = spec.get("nodes")
    findings = []
    if not isinstance(nodes, list) or len(nodes) != expected:
        findings.append(f"Return exactly {expected} nodes.")
        return findings
    if visual.get("layout") == "matrix":
        columns = spec.get("columns") or visual.get("columns", [])
        if len(columns) != len(visual.get("columns", [])):
            findings.append(f"Return exactly {len(visual.get('columns', []))} columns.")
        for index, node in enumerate(nodes):
            if not isinstance(node.get("title"), str) or not node["title"].strip():
                findings.append(f"Row {index+1} needs a title.")
            cells = node.get("cells")
            if not isinstance(cells, list) or len(cells) != max(0, len(columns)-1):
                findings.append(f"Row {index+1} needs {max(0, len(columns)-1)} cells.")
            if node.get("icon") not in ASSETS:
                findings.append(f"Row {index+1} needs a catalog icon.")
            if node.get("color") not in PALETTE:
                findings.append(f"Row {index+1} needs a palette color.")
    else:
        for index, node in enumerate(nodes):
            if not isinstance(node.get("title"), str) or not node["title"].strip():
                findings.append(f"Node {index+1} needs a title.")
            body = node.get("body")
            if not isinstance(body, str) or len(body.strip()) < 40:
                findings.append(f"Node {index+1} body must be at least 40 characters.")
            if node.get("icon") not in ASSETS:
                findings.append(f"Node {index+1} needs a catalog icon.")
            if node.get("color") not in PALETTE:
                findings.append(f"Node {index+1} needs a palette color.")
    if not isinstance(spec.get("takeaway"), str) or len(spec["takeaway"].strip()) < 10:
        findings.append("Write one takeaway sentence.")
    return findings


def fill(spec: dict, chapter: dict) -> dict:
    palette = ["blue", "gold", "green", "coral", "purple"]
    icons = ["zap", "scale", "route", "cpu", "eye", "lock", "document", "package", "key", "shield", "warning"]
    visual = chapter.get("visual") or {}
    spec.setdefault("columns", visual.get("columns", []))
    for index, node in enumerate(spec.get("nodes", [])):
        if node.get("color") not in PALETTE:
            node["color"] = palette[index % len(palette)]
        if node.get("icon") not in ASSETS:
            node["icon"] = icons[index % len(icons)]
        node.setdefault("id", f"node-{index+1}")
        node.setdefault("tag", "")
        node.setdefault("body", "")
        node.setdefault("at", index * 3)
    return spec


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="opencode-go/deepseek-v4.1-flash")
    parser.add_argument("--out", default=str(ROOT / "visual-studio/public/lessons/module6-model.json"))
    parser.add_argument("--reference", default=str(ROOT / "bench/module6-reference.json"))
    args = parser.parse_args()
    reference = json.loads(Path(args.reference).read_text())
    cfg = load_config(); cfg.llm.visual_model = args.model; cfg.llm.visual_vision_model = args.model; cfg.llm.timeout = 900
    llm = build_visual_llm(cfg)

    chapters = []
    duration = 20
    for index, chapter in enumerate(reference["chapters"]):
        visual = chapter.get("visual") or {}
        print(f"[{index+1}/{len(reference['chapters'])}] {chapter.get('title')} ({visual.get('layout')})", flush=True)
        spec = None
        findings = []
        for attempt in range(2):
            prompt = prompt_for(chapter)
            if spec is not None:
                prompt += "\n\nPrevious JSON failed:\n" + json.dumps(findings, ensure_ascii=False)
                prompt += "\n\nPrevious JSON:\n" + json.dumps(spec, ensure_ascii=False)
                prompt += "\n\nReturn the corrected complete JSON object only."
            spec = fill(extract_json(llm.compose(prompt, system=SYSTEM)), chapter)
            findings = findings_for(spec, chapter)
            if not findings:
                break
        if findings:
            raise SystemExit(f"{chapter.get('title')} failed: {findings}")
        start = index * duration
        end = start + duration
        visual_out = {
            "layout": visual.get("layout", "concept"),
            "presentation": visual.get("presentation", {}),
            "nodes": [{**node, "at": idx * 3} for idx, node in enumerate(spec["nodes"])],
            "connections": spec.get("connections", []),
            "columns": spec.get("columns", visual.get("columns", [])),
            "takeaway": spec["takeaway"],
        }
        chapters.append({
            "id": chapter.get("id") or f"chapter-{index+1}",
            "title": chapter.get("title") or f"Chapter {index+1}",
            "years": chapter.get("years", "Module 6"),
            "question": chapter.get("question", ""),
            "roles": {node["id"]: node["title"] for node in visual_out["nodes"]},
            "sources": reference.get("sources", []),
            "safeguard": "",
            "narration": spec["takeaway"],
            "narrationAt": 0,
            "audio": "",
            "start": start, "end": end, "finishedAt": end - 1.5, "transitionOut": .4,
            "visualStart": start, "visualEnd": end,
            "continuity": {"from": None, "bridge": "The same case, a different teaching move."},
            "cues": [],
            "visual": visual_out,
        })
    lesson = {
        "id": "module6_model", "kind": "live_generated",
        "title": "Module 6: Intellectual Property and Software Licensing · model visual",
        "question": reference.get("question", ""),
        "duration": len(chapters) * duration,
        "documentTitle": reference.get("documentTitle"),
        "example": reference.get("example"),
        "chapters": chapters,
        "sources": reference.get("sources", []),
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(lesson, ensure_ascii=False, indent=1))
    print(f"wrote {args.out} with {len(chapters)} chapters", flush=True)


if __name__ == "__main__":
    main()
