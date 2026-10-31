#!/usr/bin/env python3
"""Run the browser gate on a live scene chapter at a chosen time."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from assistant.visual.browser_gate import check_svg  # noqa: E402


def extract_svg(html: str) -> str:
    match = re.search(r'<svg\b[^>]*class="[^"]*live-stage-svg[^"]*"[^>]*>', html)
    if not match:
        raise RuntimeError("The live page has no svg.live-stage-svg")
    start = match.start(); depth = 0; token = re.compile(r"<svg\b|</svg>")
    for tag in token.finditer(html, start):
        depth += 1 if tag.group(0) == "<svg" else -1
        if depth == 0:
            return html[start:tag.end()]
    raise RuntimeError("The live-stage SVG is not closed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", default="/tmp/opencode/live-scene-gate.json")
    parser.add_argument("--timeout", type=int, default=10)
    parser.add_argument("--chrome", default="chromium")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--no-fail", action="store_true")
    args = parser.parse_args()
    started = time.monotonic()
    command = [args.chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
               "--dump-dom", f"--virtual-time-budget={args.timeout * 1000}", args.url]
    run = subprocess.run(command, capture_output=True, text=True, timeout=args.timeout + 20)
    if run.returncode:
        raise SystemExit(f"Chromium failed ({run.returncode}): {run.stderr[-500:]}")
    svg = extract_svg(run.stdout)
    gate = check_svg(svg, timeout=max(90, args.timeout * 12), keep=args.keep)
    row = {"url": args.url, "ok": gate["ok"], "errors": gate["errors"], "warnings": gate["warnings"],
           "findings": gate["findings"], "seconds": round(time.monotonic() - started, 1)}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(row, indent=1))
    print(f"live scene {'ok' if row['ok'] else 'FAIL'}  {row['errors']} errors  {row['warnings']} warnings  {row['seconds']}s")
    for finding in row["findings"]:
        print(f"  {finding['severity']:7s} {finding['code']:26s} {str(finding['message'])[:150]}")
    print(f"results: {args.out}")
    if not args.no_fail and not row["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
