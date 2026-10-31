"""Compile a hybrid slot plan into a live lesson for preview or review.

    .venv/bin/python bench/hybrid_lesson.py \
        --plan tests/fixtures/hybrid_neuron_plan.json \
        --out /tmp/opencode/hybrid/lesson.json

Add `--publish-dir ~/.cache/omarchy-assistant/browser-lessons` to write
`<lesson-id>/lesson.json` so the studio can open `/?lesson=<lesson-id>`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.visual.hybrid import check_lesson_geometry, compile_hybrid_lesson  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--plan", required=True)
parser.add_argument("--out", default="/tmp/opencode/hybrid/lesson.json")
parser.add_argument("--lesson-id", default="", help="32 hex chars; defaults to a plan hash")
parser.add_argument("--icons", default="visual-studio/public/live/catalog.json")
parser.add_argument("--publish-dir", default="")
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
plan = json.loads(Path(args.plan).read_text())
icons = json.loads((root / args.icons).read_text())["icons"]
lesson_id = args.lesson_id or hashlib.sha256(
    json.dumps(plan, sort_keys=True).encode()).hexdigest()[:32]
lesson = compile_hybrid_lesson(plan, icons, lesson_id=lesson_id)
gate = check_lesson_geometry(lesson)

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(lesson, ensure_ascii=False, indent=1))
print(json.dumps({
    "lesson": lesson["id"],
    "title": lesson["title"],
    "chapters": len(lesson["chapters"]),
    "duration": lesson["duration"],
    "nodes": [len(c["visual"]["nodes"]) for c in lesson["chapters"]],
    "geometry": gate,
    "out": str(out),
}, ensure_ascii=False))

if args.publish_dir:
    folder = Path(args.publish_dir).expanduser() / lesson["id"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "lesson.json").write_text(json.dumps(lesson, ensure_ascii=False))
    print(f"published {folder / 'lesson.json'}")
