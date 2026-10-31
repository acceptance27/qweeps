"""Re-check a captured compiled scene: deterministic gate, then the external judge.

Useful after a compiler/layout fix: it answers "would this lesson have passed?"
without paying for another authoring run.

    .venv/bin/python bench/rejudge.py /tmp/opencode/qweeps-capture/failure-*.json
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.gate import check_scene  # noqa: E402
from assistant.visual.geometry import resolve_text_layout  # noqa: E402
from assistant.visual.judge import judge  # noqa: E402
from assistant.visual.v3_pipeline import _call_model  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("capture", nargs="?", default="/tmp/opencode/qweeps-capture/*.json")
parser.add_argument("--judge", default="opencode-go/deepseek-v4.1-flash")
parser.add_argument("--layout", action="store_true",
                    help="re-run the deterministic text layout before gating")
parser.add_argument("--no-judge", action="store_true")
args = parser.parse_args()

paths = [path for path in sorted(glob.glob(args.capture)) if path.endswith(".json")]
if not paths:
    print("no captures")
    raise SystemExit(2)
data = json.loads(Path(paths[-1]).read_text())
scene = data.get("scene")
if not scene:
    print(f"capture {paths[-1]} has no compiled scene (stage={data.get('stage')})")
    raise SystemExit(2)

if args.layout:
    for beat in scene.get("beats", []):
        resolve_text_layout(beat.get("elements", []))
gate = check_scene(scene)
print(json.dumps({"capture": paths[-1], "stage": data.get("stage"),
                  "gate": {"approved": gate["approved"],
                           "blockers": gate["blockers"][:6]}}, ensure_ascii=False))

if args.no_judge:
    raise SystemExit(0 if gate["approved"] else 1)

cfg = load_config()
cfg.llm.visual_model = args.judge
cfg.llm.visual_vision_model = cfg.llm.visual_model
cfg.llm.timeout = 600
llm = build_visual_llm(cfg)
verdict = judge(scene, lambda system, user: _call_model(llm, system, user, 3500))
print(json.dumps({"judge": {"approved": verdict["approved"],
                            "blockers": verdict.get("blockers", [])[:6]}},
                 ensure_ascii=False))
raise SystemExit(0 if (gate["approved"] and verdict["approved"]) else 1)
