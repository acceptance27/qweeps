#!/usr/bin/env python3
"""Generate matched browser-only and native-hybrid lessons and record wall times.

Example:
  .venv/bin/python bench/generate_pair.py \
    --question "Create exactly 20 beats..." \
    --beats 20 \
    --out bench/runs/20beat-transformers
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:4174/api/visual"


def post(path: str, payload: dict, timeout: int = 60) -> dict:
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def get(path: str, timeout: int = 120) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=timeout) as response:
        return json.loads(response.read())


def timing_files(lesson_id: str) -> dict:
    out = {}
    for root in (Path.home() / ".cache/qweeps/browser-lessons",
                 Path.home() / ".cache/omarchy-assistant/browser-lessons"):
        folder = root / lesson_id
        for name in ("generation-timings.json", "native-generation-timings.json"):
            path = folder / name
            if path.is_file():
                try:
                    out[name] = json.loads(path.read_text())
                except ValueError:
                    out[name] = {"error": "unreadable"}
    return out


def generate(label: str, *, question: str, native: bool, native_mode: str,
             beats: int, poll_seconds: float) -> dict:
    payload = {
        "question": question,
        "native": native,
        "nativeMode": native_mode,
        "beats": beats,
        "regenerate": True,
        "generateQuiz": False,
    }
    print(f"\n=== {label} ===", flush=True)
    print(json.dumps({k: v for k, v in payload.items() if k != "question"}, indent=2), flush=True)
    started = time.monotonic()
    started_at = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    job = post("/live/jobs", payload)
    job_id = job["id"]
    lesson_id = job.get("lessonId")
    print(f"job {job_id} · lesson {lesson_id} · started {started_at}", flush=True)
    last_stage = None
    last_timings = {}
    while True:
        time.sleep(poll_seconds)
        status = get(f"/live/jobs/{job_id}", timeout=60)
        elapsed = time.monotonic() - started
        stage = status.get("stage") or status.get("status")
        if stage != last_stage:
            print(f"[{elapsed:7.1f}s] {status.get('status'):<12} {stage}", flush=True)
            last_stage = stage
        timings = status.get("timings") or {}
        if timings != last_timings:
            print(f"[{elapsed:7.1f}s] timings {json.dumps(timings, sort_keys=True)}", flush=True)
            last_timings = timings
        if status.get("status") in {"ready", "failed"}:
            wall = round(time.monotonic() - started, 3)
            finished_at = dt.datetime.now().astimezone().isoformat(timespec="seconds")
            lesson = None
            try:
                lesson = get(f"/live/lessons/{status.get('lessonId') or lesson_id}", timeout=120)
            except (urllib.error.HTTPError, urllib.error.URLError):
                pass
            chapters = lesson.get("chapters") if lesson else []
            native_chapters = [
                c for c in chapters or []
                if c.get("renderer") == "manimgl" or c.get("clip")
            ]
            result = {
                "label": label,
                "native": native,
                "nativeMode": native_mode,
                "targetBeats": beats,
                "jobId": job_id,
                "status": status.get("status"),
                "stage": status.get("stage"),
                "error": status.get("error"),
                "lessonId": status.get("lessonId") or lesson_id,
                "startedAt": started_at,
                "finishedAt": finished_at,
                "wallSeconds": wall,
                "jobTimings": status.get("timings") or {},
                "timingFiles": timing_files(status.get("lessonId") or lesson_id or ""),
                "lesson": {
                    "title": lesson.get("title"),
                    "duration": lesson.get("duration"),
                    "chapters": len(chapters),
                    "nativeChapters": len(native_chapters),
                    "hasNativeScene": bool(lesson.get("nativeScenes")),
                    "audioTrack": bool(lesson.get("audioTrack")),
                    "quizCount": len(lesson.get("quiz") or []),
                    "representation": (lesson.get("representation") or "")[:500],
                } if lesson else None,
            }
            print(f"[{wall:7.1f}s] {result['status'].upper()}"
                  + (f" · {result['error']}" if result.get("error") else ""), flush=True)
            if result.get("lesson"):
                print(json.dumps(result["lesson"], indent=2), flush=True)
            print(f"[{wall:7.1f}s] job timings {json.dumps(result['jobTimings'], sort_keys=True)}", flush=True)
            return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--question", required=True)
    parser.add_argument("--beats", type=int, default=20)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--poll", type=float, default=5.0)
    parser.add_argument("--skip-browser", action="store_true")
    parser.add_argument("--skip-native", action="store_true")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    results = {
        "question": args.question,
        "targetBeats": args.beats,
        "createdAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "runs": [],
    }
    started = time.monotonic()
    try:
        if not args.skip_browser:
            results["runs"].append(generate(
                "browser-only", question=args.question, native=False,
                native_mode="per_beat", beats=args.beats, poll_seconds=args.poll))
        if not args.skip_native:
            results["runs"].append(generate(
                "native-hybrid", question=args.question, native=True,
                native_mode="continuous", beats=args.beats, poll_seconds=args.poll))
    finally:
        results["totalWallSeconds"] = round(time.monotonic() - started, 3)
        (args.out / "results.json").write_text(json.dumps(results, indent=2) + "\n")
        lines = [
            "# 20-beat generation benchmark",
            "",
            f"- Question: {args.question}",
            f"- Target beats: {args.beats}",
            f"- Total wall time: {results['totalWallSeconds']:.1f}s",
            "",
            "| Run | Status | Chapters | Native chapters | Wall time | Lesson |",
            "|---|---:|---:|---:|---:|---|",
        ]
        for run in results["runs"]:
            lesson = run.get("lesson") or {}
            lines.append(
                f"| {run['label']} | {run['status']} | {lesson.get('chapters', '?')} | "
                f"{lesson.get('nativeChapters', '?')} | {run['wallSeconds']:.1f}s | "
                f"`{run.get('lessonId', '')}` |"
            )
        lines += ["", "## Phase timings", ""]
        for run in results["runs"]:
            lines.append(f"### {run['label']}")
            lines.append("")
            lines.append("```json")
            lines.append(json.dumps(run.get("jobTimings") or {}, indent=2, sort_keys=True))
            lines.append("```")
            lines.append("")
        (args.out / "summary.md").write_text("\n".join(lines) + "\n")
    return 0 if all(run["status"] == "ready" for run in results["runs"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
