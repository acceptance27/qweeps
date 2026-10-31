#!/usr/bin/env python3
"""Run the HyperFrames browser gate on rendered QWEEPS chapter frames.

Each chapter is rendered at its finished state through the live player's
deterministic `?t=` parameter, serialized as a static HyperFrames composition,
and checked in headless Chrome. `check` supplies WCAG contrast, clipping,
overflow, occlusion, runtime and craft findings with selectors and boxes.

Usage:
    .venv/bin/python bench/hyperframes_check.py \
        --lesson 61792edc99e6f40f6f9d37bdcdc8fb8e \
        --out /tmp/opencode/hyperframes-check.json

The studio server must be running with the lesson published.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.request

from assistant.visual.browser_gate import check_svg


def get_json(url: str):
    with urllib.request.urlopen(url, timeout=60) as response:
        return json.load(response)


def extract_svg(html: str) -> str:
    """Return the outer live-stage SVG, including nested artwork SVGs."""
    match = re.search(r'<svg\b[^>]*class="[^"]*live-stage-svg[^"]*"[^>]*>', html)
    if not match:
        raise RuntimeError("The rendered page has no svg.live-stage-svg")
    start = match.start()
    depth = 0
    token = re.compile(r"<svg\b|</svg>")
    for tag in token.finditer(html, start):
        depth += 1 if tag.group(0) == "<svg" else -1
        if depth == 0:
            return html[start:tag.end()]
    raise RuntimeError("The live-stage SVG is not closed")


def snapshot_svg(base_url: str, lesson: str, at: float, chrome: str, timeout: int) -> str:
    url = f"{base_url.rstrip('/')}/?lesson={lesson}&t={at:.3f}&muted=1"
    command = [
        chrome, "--headless=new", "--no-sandbox", "--disable-gpu",
        "--hide-scrollbars", "--dump-dom", f"--virtual-time-budget={timeout * 1000}",
        url,
    ]
    run = subprocess.run(command, capture_output=True, text=True, timeout=timeout + 20)
    if run.returncode:
        raise RuntimeError(f"Chromium failed ({run.returncode}): {run.stderr[-500:]}")
    return extract_svg(run.stdout)


def chapter_times(lesson: dict, selected: set[int] | None, times: list[float] | None):
    if times:
        return [(None, value) for value in times]
    result = []
    for index, chapter in enumerate(lesson["chapters"]):
        if selected and index not in selected:
            continue
        at = chapter.get("finishedAt")
        if not isinstance(at, (int, float)):
            at = max(0, chapter["end"] - 0.3)
        result.append((index, max(0, at - 0.2)))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lesson", required=True, help="published lesson ID (32 hex)")
    parser.add_argument("--base-url", default="http://127.0.0.1:4174")
    parser.add_argument("--out", default="/tmp/opencode/hyperframes-check.json")
    parser.add_argument("--chapter", action="append", type=int, default=None,
                        help="zero-based chapter index; repeatable")
    parser.add_argument("--times", default="", help="comma-separated absolute seconds")
    parser.add_argument("--timeout", type=int, default=25, help="Chromium virtual-time budget")
    parser.add_argument("--chrome", default="chromium")
    parser.add_argument("--keep", action="store_true", help="keep serialized projects")
    parser.add_argument("--no-fail", action="store_true", help="exit 0 even with errors")
    args = parser.parse_args()

    lesson = get_json(f"{args.base_url.rstrip('/')}/api/visual/live/lessons/{args.lesson}")
    selected = set(args.chapter) if args.chapter else None
    times = [float(value) for value in args.times.split(",") if value.strip()] if args.times else None
    rows = []
    try:
        for index, at in chapter_times(lesson, selected, times):
            chapter = lesson["chapters"][index] if index is not None else None
            name = chapter["id"] if chapter else f"t{at:g}"
            started = time.monotonic()
            try:
                svg = snapshot_svg(args.base_url, args.lesson, at, args.chrome, args.timeout)
                gate = check_svg(svg, timeout=max(90, args.timeout * 4), keep=args.keep)
                rows.append({
                    "index": index,
                    "chapter": name,
                    "time": round(at, 3),
                    "ok": gate["ok"],
                    "findings": gate["findings"],
                    "seconds": round(time.monotonic() - started, 1),
                })
                found = rows[-1]["findings"]
                if args.keep:
                    print(f"  project: {gate['project']}", flush=True)
                print(f"{name:24s} t={at:7.2f} {'ok' if gate['ok'] else 'FAIL'}  "
                      f"{gate['errors']} errors  {gate['warnings']} warnings", flush=True)
                for finding in found:
                    print(f"  {finding['severity']:7s} {finding['code']:24s} {finding['message'][:140]}", flush=True)
            except Exception as exc:
                rows.append({"index": index, "chapter": name, "time": round(at, 3),
                             "ok": False, "error": str(exc), "findings": []})
                print(f"{name:24s} ERROR {exc}", flush=True)
        result = {"lesson": args.lesson, "baseUrl": args.base_url, "chapters": rows}
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(result, indent=1))
        errors = sum(1 for row in rows for f in row["findings"] if f["severity"] == "error")
        warnings = sum(1 for row in rows for f in row["findings"] if f["severity"] == "warning")
        failed = sum(1 for row in rows if not row.get("ok"))
        print(f"\n{len(rows)} frame(s) · {failed} failed · {errors} errors · {warnings} warnings")
        print(f"report: {args.out}")
        if failed and not args.no_fail:
            raise SystemExit(1)
    finally:
        pass


if __name__ == "__main__":
    main()
