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
import base64
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STUDIO = ROOT / "visual-studio"
FONT = STUDIO / "public/live/teaching-serif.ttf"
GSAP = STUDIO / "node_modules/gsap/dist/gsap.min.js"
HYPERFRAMES = "hyperframes@0.8.223"
SECTIONS = ("lint", "runtime", "layout", "contrast", "motion", "craft", "audio")


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


def composition(svg: str) -> str:
    font = base64.b64encode(FONT.read_bytes()).decode()
    svg = svg.replace('src:url("/live/teaching-serif.ttf")', f'src:url("data:font/ttf;base64,{font}")')
    opening = re.match(r"<svg\b[^>]*>", svg)
    if not opening:
        raise RuntimeError("Invalid SVG snapshot")
    tag = re.sub(r'\s(?:width|height)="[^"]*"', "", opening.group(0))
    tag = tag.replace("<svg", '<svg width="1440" height="600"', 1)
    svg = tag + svg[opening.end():]
    gsap = GSAP.read_text()
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>
html,body{{margin:0;width:1440px;height:600px;overflow:hidden;background:#071117}}
#root{{width:1440px;height:600px;overflow:hidden}}
svg{{display:block;width:1440px;height:600px}}
</style></head>
<body><div id="root" data-composition-id="lesson-check" data-start="0"
 data-duration="10" data-width="1440" data-height="600" data-no-timeline data-hold="true">
{svg}
</div>
<script>{gsap}</script>
<script>
const tl=gsap.timeline({{paused:true}});
window.__timelines['lesson-check']=tl;
tl.seek(0);
</script></body></html>
"""


def run_check(project: Path, timeout: int) -> dict:
    command = ["npx", "--yes", HYPERFRAMES, "check", str(project), "--json"]
    run = subprocess.run(command, cwd=project, capture_output=True, text=True, timeout=timeout)
    output = run.stdout.strip()
    start = output.find("{")
    if start < 0:
        raise RuntimeError(f"hyperframes check returned no JSON: {(run.stderr or output)[-500:]}")
    report = json.loads(output[start:])
    if not report.get("ok") and run.returncode not in (0, 1):
        raise RuntimeError(f"hyperframes check failed ({run.returncode}): {run.stderr[-500:]}")
    return report


def findings(report: dict):
    rows = []
    for section in SECTIONS:
        block = report.get(section) or {}
        for finding in block.get("findings", []) or []:
            if finding.get("code") in {"audio_none", "audio_check_unavailable"}:
                continue
            rows.append({
                "section": section,
                "code": finding.get("code"),
                "severity": finding.get("severity"),
                "message": finding.get("message"),
                "selector": finding.get("selector"),
                "bbox": finding.get("bbox"),
                "time": finding.get("time"),
            })
    return rows


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
    work = Path(tempfile.mkdtemp(prefix="qweeps-hf-check-"))
    rows = []
    try:
        for index, at in chapter_times(lesson, selected, times):
            chapter = lesson["chapters"][index] if index is not None else None
            name = chapter["id"] if chapter else f"t{at:g}"
            started = time.monotonic()
            try:
                svg = snapshot_svg(args.base_url, args.lesson, at, args.chrome, args.timeout)
                project = work / f"{index if index is not None else 'time'}-{name}"
                project.mkdir()
                (project / "index.html").write_text(composition(svg))
                (project / "hyperframes.json").write_text(json.dumps({
                    "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
                    "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
                    "paths": {"blocks": "compositions",
                              "components": "compositions/components", "assets": "assets"},
                    "media": {"autoProxy": True},
                }))
                report = run_check(project, max(90, args.timeout * 4))
                rows.append({
                    "index": index,
                    "chapter": name,
                    "time": round(at, 3),
                    "ok": report.get("ok"),
                    "browserSkipped": report.get("browserSkipped"),
                    "findings": findings(report),
                    "seconds": round(time.monotonic() - started, 1),
                })
                found = rows[-1]["findings"]
                print(f"{name:24s} t={at:7.2f} {'ok' if report.get('ok') else 'FAIL'}  "
                      f"{sum(1 for f in found if f['severity']=='error')} errors  "
                      f"{sum(1 for f in found if f['severity']=='warning')} warnings", flush=True)
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
        if args.keep:
            print(f"projects: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
