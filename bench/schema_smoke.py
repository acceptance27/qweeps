"""P0.7: can a model emit one AuthoringBeat in the frozen DSL?

Bounded smoke test: one director call per attempt, no review, no lesson.
Exit code 0 when at least one attempt is schema-valid for the model.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from assistant.config import load_config  # noqa: E402
from assistant.llm import build_visual_llm  # noqa: E402
from assistant.visual.contract import director_prompt  # noqa: E402
from assistant.visual.pedagogy import _call_model, _extract_json  # noqa: E402

CONTRACT = {"beatId": "distribution", "retain": [], "mutate": [],
            "enter": [{"id": "chart", "kind": "svg", "role": "probability_dist", "cue": "draw"},
                      {"id": "context", "kind": "box", "role": "context"}],
            "exit": [], "cameraIntent": "wide"}
BOUNDARY = {"beat": 0, "camera": {"x": 0, "y": 0, "zoom": 1},
            "elements": [{"id": "context", "x": 0, "y": 1, "width": 3, "height": 0.6,
                          "semanticRole": "context", "label": "The cat sat on the"}]}
STORY = {"id": "distribution",
         "question": "Which token is most likely next?",
         "insight": "The model scores candidates; one leads.",
         "before": "The prompt is visible.", "change": "A probability chart appears.",
         "after": "The leading bar is the prediction.", "reasoning": "Bar length is probability.",
         "retain": [], "camera": "static",
         "narration": "The context is fixed. The model scores each candidate and one leads.",
         "visual_test": "The viewer can compare candidate probabilities."}
ROLES = {"probability_dist": "slot_3", "context": "slot_5"}


def valid(beat: dict) -> tuple[bool, str]:
    if isinstance(beat, dict) and isinstance(beat.get("beats"), list) and beat["beats"]:
        beat = beat["beats"][0]
    if not isinstance(beat, dict) or not isinstance(beat.get("elements"), list) or not beat["elements"]:
        return False, "no elements"
    ids = [e.get("id") for e in beat["elements"] if isinstance(e, dict)]
    if len(ids) != len(set(ids)):
        return False, "duplicate ids"
    charts = [e for e in beat["elements"] if isinstance(e, dict) and e.get("bars")]
    if not charts:
        return False, "no bars chart"
    for element in beat["elements"]:
        if not isinstance(element, dict):
            return False, "element is not an object"
        if element.get("bars"):
            for bar in element["bars"]:
                if not isinstance(bar, dict) or "label" not in bar or "value" not in bar:
                    return False, "invalid bar"
    return True, "ok"


def run(model: str, attempts: int) -> dict:
    cfg = load_config()
    cfg.llm.visual_model = model
    cfg.llm.visual_vision_model = model
    cfg.llm.timeout = 300
    llm = build_visual_llm(cfg)
    system = director_prompt(CONTRACT, BOUNDARY)
    request = {"question": "How do LLMs choose the next token?",
               "storyboardBeat": STORY, "roleTable": ROLES,
               "contract": CONTRACT, "boundary": BOUNDARY}
    results = []
    for index in range(attempts):
        started = time.time()
        try:
            raw = _call_model(llm, system, json.dumps(request, ensure_ascii=False), 5000)
            beat = _extract_json(raw or "")
            ok, reason = valid(beat or {})
            if isinstance(beat, dict) and isinstance(beat.get("beats"), list) and beat["beats"]:
                beat = beat["beats"][0]
        except Exception as exc:  # provider or parse failure
            raw, ok, reason = "", False, str(exc)[:160]
        results.append({"attempt": index + 1, "seconds": round(time.time() - started, 1),
                        "ok": ok, "reason": reason,
                        "bars": bool(isinstance(beat, dict) and
                                     any(isinstance(e, dict) and e.get("bars")
                                         for e in beat.get("elements", [])))})
    return {"model": model, "attempts": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", action="append", required=True)
    parser.add_argument("--attempts", type=int, default=2)
    args = parser.parse_args()
    report = {"contract": CONTRACT, "results": [run(m, args.attempts) for m in args.model]}
    print(json.dumps(report, indent=1, ensure_ascii=False))
    return 0 if all(any(a["ok"] for a in r["attempts"]) for r in report["results"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
