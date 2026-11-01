"""Bounded v3 lesson smoke: one real lesson through teach_v3, no server."""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.v3_pipeline import teach_v3  # noqa: E402

parser = argparse.ArgumentParser()
parser.add_argument("--model", default="opencode-go/muse-spark-1.3-contributor")
parser.add_argument("--judge", default="opencode-go/deepseek-v4.1-flash")
parser.add_argument("--question", default="How does a single artificial neuron compute its output?")
parser.add_argument("--label", default="")
parser.add_argument("--checkpoint", default="")
args = parser.parse_args()

cfg = load_config()
cfg.llm.visual_model = args.model
cfg.llm.visual_vision_model = cfg.llm.visual_model
cfg.llm.timeout = 600
llm = build_visual_llm(cfg)

judge_cfg = load_config()
judge_cfg.llm.visual_model = args.judge
judge_cfg.llm.visual_vision_model = judge_cfg.llm.visual_model
judge_cfg.llm.timeout = 600
judge_llm = build_visual_llm(judge_cfg) if args.judge != args.model else None

label = args.label or Path(args.model.split("/")[-1]).name
checkpoint = args.checkpoint or f"bench/checkpoints/{label}.json"
started = time.time()
try:
    result = teach_v3(llm, args.question, {"sceneId": "astar_heuristic"}, [], "lesson",
                      judge_llm=judge_llm, checkpoint=checkpoint)
except Exception as exc:
    payload = {"ok": False, "seconds": round(time.time() - started, 1),
               "model": args.model, "judge": args.judge,
               "error": str(exc)[:2000]}
else:
    payload = {"ok": True, "seconds": round(time.time() - started, 1),
               "model": args.model, "judge": args.judge,
               "answer": result["answer"],
               "beats": len(result["scene"]["beats"]),
               "approved": result["scene"].get("teaching", {}).get("review", {}).get("approved"),
               "scene": result["scene"]}
Path("bench/runs").mkdir(parents=True, exist_ok=True)
Path(f"bench/runs/{label}.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False))
print(json.dumps({k: payload[k] for k in payload if k != "scene"}, ensure_ascii=False))
