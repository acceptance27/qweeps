"""Review captured hybrid frames with a vision model.

    .venv/bin/python bench/hybrid_review.py \
        --lesson /tmp/opencode/hybrid/voice-lesson.json \
        --frames '.playwright-mcp/hybrid-voice-ch*.png' \
        --model opencode-go/muse-spark-1.3-contributor
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.hybrid_review import review_frames  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--lesson", required=True)
parser.add_argument("--frames", required=True)
parser.add_argument("--model", default="opencode-go/muse-spark-1.3-contributor")
args = parser.parse_args()

lesson = json.loads(Path(args.lesson).read_text())
paths = sorted(glob.glob(args.frames))
if not paths:
    raise SystemExit(f"no frames match {args.frames}")
frames = [Path(path).read_bytes() for path in paths]
labels = []
for index, path in enumerate(paths):
    name = Path(path).stem
    match = re.search(r"ch(?:apter)?[_-]?(\d+)", name, re.I)
    position = "finished"
    for candidate in ("early", "middle", "finished"):
        if candidate in name.lower():
            position = candidate
    labels.append({"chapter": (int(match.group(1)) - 1) if match else index,
                   "position": position})

cfg = load_config()
cfg.llm.visual_model = args.model
cfg.llm.visual_vision_model = args.model
cfg.llm.timeout = 600
llm = build_visual_llm(cfg)
result = review_frames(llm, lesson, frames, labels)
print(json.dumps({"model": args.model, "frames": labels, "review": result}, ensure_ascii=False, indent=1))
