#!/usr/bin/env python3
"""Run the browser gate on the settled reference posters.

Each grammar is opened at `?posters=1&g=<grammar>`, the page seeks to the end
of its timeline, and the serialized SVG is checked by the same HyperFrames
contrast/layout/overflow gate used for live chapters.
"""
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

GRAMMARS = ["comparison", "procedure", "algorithm", "narrative", "recall", "quantitative", "construction", "mechanism"]


def extract_svg(html: str) -> str:
    match = re.search(r'<svg\b[^>]*class="[^"]*live-stage-svg[^"]*"[^>]*>', html)
    if not match:
        raise RuntimeError("The poster page has no svg.live-stage-svg")
    start = match.start()
    depth = 0
    token = re.compile(r"<svg\b|</svg>")
    for tag in token.finditer(html, start):
        depth += 1 if tag.group(0) == "<svg" else -1
        if depth == 0:
            return html[start:tag.end()]
    raise RuntimeError("The poster SVG is not closed")


def snapshot(url: str, chrome: str, timeout: int) -> str:
    command = [
        chrome, "--headless=new", "--no-sandbox", "--disable-gpu",
        "--hide-scrollbars", "--dump-dom", f"--virtual-time-budget={timeout * 1000}",
        url,
    ]
    run = subprocess.run(command, capture_output=True, text=True, timeout=timeout + 20)
    if run.returncode:
        raise RuntimeError(f"Chromium failed ({run.returncode}): {run.stderr[-500:]}")
    return extract_svg(run.stdout)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:4174")
    parser.add_argument("--out", default="/tmp/opencode/settled-poster-gate.json")
    parser.add_argument("--grammar", action="append", default=None)
    parser.add_argument("--timeout", type=int, default=8, help="virtual-time budget in seconds")
    parser.add_argument("--chrome", default="chromium")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--no-fail", action="store_true")
    args = parser.parse_args()

    selected = args.grammar or GRAMMARS
    rows = []
    for grammar in selected:
        started = time.monotonic()
        url = f"{args.base_url.rstrip('/')}/index.html?posters=1&g={grammar}&gate=1"
        try:
            svg = snapshot(url, args.chrome, args.timeout)
            gate = check_svg(svg, timeout=max(90, args.timeout * 12), keep=args.keep)
            row = {
                "grammar": grammar, "ok": gate["ok"], "errors": gate["errors"],
                "warnings": gate["warnings"], "findings": gate["findings"],
                "seconds": round(time.monotonic() - started, 1),
            }
            rows.append(row)
            print(f"{grammar:14s} {'ok' if row['ok'] else 'FAIL'}  {row['errors']} errors  {row['warnings']} warnings  {row['seconds']}s", flush=True)
            for finding in row["findings"]:
                print(f"  {finding['severity']:7s} {finding['code']:26s} {str(finding['message'])[:150]}", flush=True)
        except Exception as exc:
            rows.append({"grammar": grammar, "ok": False, "error": str(exc), "findings": []})
            print(f"{grammar:14s} ERROR {exc}", flush=True)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(rows, indent=1))
    print(f"results: {args.out}")
    if not args.no_fail and any(not row.get("ok") for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
