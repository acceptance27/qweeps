#!/usr/bin/env python3
"""Repeated model test for the route -> comparison scene IR.

One task, one compiler, no hand edits. The model writes the program; the
compiler expands hulls/slots and runs the settled-poster gate.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402

SYSTEM = """You author QWEEPS scene programs as JSON. Return one JSON object only.
No markdown, no code fences, no Python, no SVG path data. Use the compound
comparison-card template; the compiler owns hulls, inner slots and settle timing.
The model supplies semantic slots and actions only."""

REFERENCE = {
    "title": "Same route, changed rule",
    "teaching": "comparison",
    "duration": 8,
    "objects": [
        {"id": "route", "kind": "line", "from": [260, 300], "to": [1180, 300], "role": "blue", "strokeWidth": 2, "opacity": 0},
        {"id": "ship", "kind": "circle", "cx": 340, "cy": 300, "r": 9, "stroke": "#8bd0df", "opacity": 0},
        {"id": "left", "kind": "comparison-card", "role": "blue",
         "slots": {"title": "1916: restrictions", "value": "warning / safety", "caption": "restricted submarine attacks", "icon": "shield",
                   "criteria": [{"label": "warning required", "value": "yes"},
                                {"label": "crew safety", "value": "protected"},
                                {"label": "risk to ships", "value": "lower"}]}},
        {"id": "right", "kind": "comparison-card", "role": "coral",
         "slots": {"title": "Feb 1917: unrestricted", "value": "no warning", "caption": "the same route, a changed rule", "icon": "warning",
                   "criteria": [{"label": "warning required", "value": "no"},
                                {"label": "crew safety", "value": "at risk"},
                                {"label": "risk to ships", "value": "higher"}]}}
    ],
    "actions": [
        {"at": 0.2, "duration": 0.4, "kind": "show", "id": "route"},
        {"at": 0.3, "duration": 0.4, "kind": "show", "id": "ship"},
        {"at": 1.0, "duration": 1.4, "kind": "morph", "id": "route", "to": "left", "mode": "replace"},
        {"at": 1.0, "duration": 1.4, "kind": "morph", "id": "route", "to": "right", "mode": "copy"},
        {"at": 2.7, "duration": 0.4, "kind": "fade", "id": "ship", "opacity": 0},
        {"at": 3.8, "duration": 0.8, "kind": "dock", "ids": ["left", "right"], "y": 60, "scale": 0.8}
    ],
    "conclusion": {"text": "The changed rule changed the risk; it did not declare war.", "x": 720, "y": 545},
}
TASK = """Author the comparison beat for this brief:

Facts:
- The same neutral route is shown before and after a rule change.
- 1916: restrictions required warning and crew safety.
- February 1917: unrestricted attacks without warning.
- The route is the same; the rule changed the risk, but this did not declare war.

Use exactly two comparison-card compounds, a route line, a ship circle, a replace
morph to the left card, a copy morph to the right card, a fade of the ship after
the split, and one dock action at scale 0.8 for the retained route context.
Each card must fill title, value, caption and icon, plus 2-3 criteria rows.
Both cards must share the same criteria labels in the same order.
End with one conclusion. Keep title <= 28 chars, value <= 18, caption <= 65,
criteria label <= 24, criteria value <= 18. Fill all slots with evidence from
the brief; no paragraphs.

Reference structure (same schema, different wording is expected):
""" + json.dumps(REFERENCE, ensure_ascii=False, indent=1)


def compile_program(program: dict, cwd: Path) -> dict:
    run = subprocess.run(
        ["npx", "tsx", "scripts/scene_compile.ts"],
        cwd=cwd, input=json.dumps(program), text=True, capture_output=True, timeout=120,
    )
    if not run.stdout.strip():
        return {"ok": False, "findings": [{"code": "compiler", "severity": "error", "message": run.stderr[-500:]}]}
    try:
        return json.loads(run.stdout)
    except json.JSONDecodeError as exc:
        return {"ok": False, "findings": [{"code": "compiler_json", "severity": "error", "message": str(exc)}]}


def extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("No JSON object in the model response")
    return json.loads(text[start:end + 1])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="opencode-go/muse-spark-1.3-contributor")
    parser.add_argument("--attempts", type=int, default=6)
    parser.add_argument("--out", default="/tmp/opencode/model-scene-results.json")
    args = parser.parse_args()

    cfg = load_config()
    cfg.llm.visual_model = args.model
    cfg.llm.visual_vision_model = args.model
    cfg.llm.timeout = 600
    llm = build_visual_llm(cfg)
    studio = ROOT / "visual-studio"
    results = []
    consecutive = 0

    for attempt in range(1, args.attempts + 1):
        started = time.monotonic()
        row = {"attempt": attempt, "model": args.model}
        try:
            text = llm.compose(TASK, system=SYSTEM)
            row["seconds"] = round(time.monotonic() - started, 1)
            row["raw"] = text[:4000]
            program = extract_json(text)
            row["json"] = True
            compiled = compile_program(program, studio)
            findings = compiled.get("findings", [])
            errors = [f for f in findings if f.get("severity") == "error"]
            row.update({
                "ok": bool(compiled.get("ok")) and not errors,
                "compounds": compiled.get("stats", {}).get("compounds"),
                "slots": compiled.get("stats", {}).get("slots"),
                "actions": compiled.get("stats", {}).get("actions"),
                "findings": findings,
                "program": program,
            })
        except Exception as exc:
            row.update({"seconds": round(time.monotonic() - started, 1), "ok": False, "error": str(exc)[:800]})
        results.append(row)
        print(json.dumps({k: row.get(k) for k in ("attempt", "seconds", "ok", "compounds", "actions", "error")}, ensure_ascii=False), flush=True)
        if row.get("findings"):
            print("  findings:", ", ".join(f"{f.get('code')}:{f.get('message')[:80]}" for f in row["findings"][:4]), flush=True)
        consecutive = consecutive + 1 if row.get("ok") else 0
        if consecutive >= 3:
            print("3 consecutive passes; stopping", flush=True)
            break

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(f"results: {args.out}")


if __name__ == "__main__":
    main()
