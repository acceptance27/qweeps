"""Run one QWEEPS lesson request and save a benchmark row plus raw artifacts."""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from assistant.telemetry import call_record  # noqa: E402


def post(base: str, path: str, payload: dict, timeout: int = 3600):
    request = urllib.request.Request(
        base + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, json.loads(response.read())


def count_lines(path: Path | None) -> int:
    if path is None or not path.exists():
        return 0
    return sum(1 for line in path.read_text().splitlines() if line.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("label")
    parser.add_argument("question")
    parser.add_argument("--base", default=os.environ.get("QWEEPS_BASE", "http://127.0.0.1:4174/api/visual"))
    parser.add_argument("--out", default="bench/runs")
    parser.add_argument("--mode", default="ask", choices=["ask", "browser_lessons"])
    parser.add_argument("--clock", default="synthetic", choices=["synthetic", "single_performance"])
    parser.add_argument("--model", default="")
    parser.add_argument("--route", default="opencode-go")
    parser.add_argument("--judge-model", default="opencode-go/deepseek-v4.1-flash")
    parser.add_argument("--calls-log", default=os.environ.get("QWEEPS_CALL_LOG", ""))
    args = parser.parse_args()

    calls_log = Path(args.calls_log) if args.calls_log else None
    before = count_lines(calls_log)
    output = Path(args.out) / args.label
    output.mkdir(parents=True, exist_ok=True)

    _, session = post(args.base, "/session", {})
    session_id = session["sessionId"]
    context = {"focused": True, "title": args.question[:60], "sceneId": "astar_heuristic",
               "time": 0.0, "selection": [], "region": None,
               "sourceContext": "", "branchDepth": 0}
    payload = {"sessionId": session_id, "question": args.question,
               "mode": "lesson", "context": context}
    started = time.time()
    http = 200
    try:
        http, result = post(args.base, "/ask", payload)
    except urllib.error.HTTPError as exc:
        http = exc.code
        result = json.loads(exc.read())
    wall = time.time() - started
    calls = count_lines(calls_log) - before

    (output / "result.json").write_text(json.dumps(
        {"label": args.label, "question": args.question, "http": http,
         "wallSeconds": round(wall, 2), "sessionId": session_id,
         "result": result}, indent=1, ensure_ascii=False))
    row = call_record(
        mode=args.mode, clock=args.clock, route=args.route,
        model=args.model or "unknown", wall=wall, calls=calls,
        outcome="approved" if http == 200 and result.get("scene") else "failed",
        prompt=json.dumps(payload, ensure_ascii=False),
        response=json.dumps(result, ensure_ascii=False),
        judge_model=args.judge_model,
        extra={"label": args.label, "http": http,
               "error": result.get("error", "")[:600]})
    (output / "benchmark.json").write_text(json.dumps(row, indent=1, ensure_ascii=False))
    print(json.dumps({k: row[k] for k in ("label", "outcome", "wall_s", "calls", "http")}))
    return 0 if http == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
