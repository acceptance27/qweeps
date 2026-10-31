"""Revise a hybrid plan from frame-review findings, then recompile it."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.hybrid import (  # noqa: E402
    check_hybrid_plan,
    check_lesson_geometry,
    compile_hybrid_lesson,
)
from assistant.visual.hybrid_prompt import SYSTEM, request_body, revision_prompt  # noqa: E402
from assistant.visual.pedagogy import _model_json  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--plan", required=True)
parser.add_argument("--review", required=True)
parser.add_argument("--model", default="opencode-go/muse-spark-1.3-contributor")
parser.add_argument("--out-plan", default="/tmp/opencode/hybrid/revised-plan.json")
parser.add_argument("--out-lesson", default="/tmp/opencode/hybrid/revised-lesson.json")
parser.add_argument("--publish-dir", default="")
parser.add_argument("--icons", default="visual-studio/public/live/catalog.json")
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
icons = json.loads((root / args.icons).read_text())["icons"]
plan = json.loads(Path(args.plan).read_text())
review = json.loads(Path(args.review).read_text())
findings = (review.get("review") or {}).get("findings") or review.get("findings") or []
if not findings:
    print(json.dumps({"ok": True, "skipped": "no findings"}, ensure_ascii=False))
    raise SystemExit(0)

cfg = load_config()
cfg.llm.visual_model = args.model
cfg.llm.visual_vision_model = args.model
cfg.llm.timeout = 600
llm = build_visual_llm(cfg)
started = time.time()
try:
    revised = _model_json(llm, SYSTEM + "\n\n" + revision_prompt(plan, findings),
                          request_body(plan["question"]), check_hybrid_plan, tokens=7000)
except Exception as exc:
    print(json.dumps({"ok": False, "seconds": round(time.time() - started, 1),
                      "error": str(exc)[:1200]}, ensure_ascii=False))
    raise SystemExit(1)

lesson_id = hashlib.sha256(json.dumps(revised, sort_keys=True).encode()).hexdigest()[:32]
lesson = compile_hybrid_lesson(revised, icons, lesson_id=lesson_id)
gate = check_lesson_geometry(lesson)
Path(args.out_plan).write_text(json.dumps(revised, ensure_ascii=False, indent=1))
Path(args.out_lesson).write_text(json.dumps(lesson, ensure_ascii=False, indent=1))
if args.publish_dir:
    folder = Path(args.publish_dir).expanduser() / lesson["id"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "lesson.json").write_text(json.dumps(lesson, ensure_ascii=False))
    print(f"published {folder / 'lesson.json'}")
print(json.dumps({
    "ok": True, "seconds": round(time.time() - started, 1), "model": args.model,
    "lesson": lesson["id"], "title": lesson["title"],
    "chapters": [{"id": c["id"], "layout": c["visual"]["layout"],
                  "nodes": len(c["visual"]["nodes"])} for c in lesson["chapters"]],
    "geometry": gate, "plan": args.out_plan, "lessonFile": args.out_lesson,
}, ensure_ascii=False))
