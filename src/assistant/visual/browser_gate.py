"""Deterministic browser gate for rendered lesson SVGs.

The gate writes a static HyperFrames composition around a rendered SVG and runs
`hyperframes check --json` in headless Chrome. It is intentionally independent
of the React player: the client sends the exact SVG it rendered.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from .plan import PlanError

ROOT = Path(__file__).resolve().parents[3]
STUDIO = ROOT / "visual-studio"
FONT = STUDIO / "public/live/teaching-serif.ttf"
GSAP = STUDIO / "node_modules/gsap/dist/gsap.min.js"
HYPERFRAMES = "hyperframes@0.8.223"
MAX_SVG = 2_000_000
SECTIONS = ("lint", "runtime", "layout", "contrast", "motion", "craft", "audio")
PROJECT = {
    "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
    "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    "paths": {"blocks": "compositions", "components": "compositions/components", "assets": "assets"},
    "media": {"autoProxy": True},
}


def validate_svg(svg) -> str:
    if not isinstance(svg, str) or not svg.lstrip().startswith("<svg"):
        raise PlanError("The browser gate needs the rendered SVG document")
    if len(svg) > MAX_SVG:
        raise PlanError("The rendered SVG is too large for the browser gate")
    low = svg.lower()
    if "<script" in low or "javascript:" in low or "<foreignobject" in low:
        raise PlanError("The browser gate accepts rendered SVG only, not executable markup")
    if re.search(r"\son[a-z]+\s*=", low):
        raise PlanError("The browser gate accepts rendered SVG only, without event handlers")
    if not re.search(r'class="[^"]*\blive-stage-svg\b', svg):
        raise PlanError("The browser gate needs the live-stage SVG")
    return svg


def composition(svg: str) -> str:
    svg = validate_svg(svg)
    if not FONT.is_file() or not GSAP.is_file():
        raise PlanError("The browser gate is missing its font or GSAP runtime")
    font = base64.b64encode(FONT.read_bytes()).decode()
    svg = svg.replace('src:url("/live/teaching-serif.ttf")', f'src:url("data:font/ttf;base64,{font}")')
    opening = re.match(r"<svg\b[^>]*>", svg)
    if not opening:
        raise PlanError("The rendered SVG has no opening tag")
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


def run_check(project: Path, timeout: int = 120) -> dict:
    command = ["npx", "--yes", HYPERFRAMES, "check", str(project), "--json"]
    run = subprocess.run(command, cwd=project, capture_output=True, text=True, timeout=timeout)
    output = run.stdout.strip()
    start = output.find("{")
    if start < 0:
        raise PlanError(f"hyperframes check returned no JSON: {(run.stderr or output)[-400:]}")
    try:
        report = json.loads(output[start:])
    except ValueError as exc:
        raise PlanError(f"hyperframes check returned invalid JSON: {exc}") from exc
    if not report.get("ok") and run.returncode not in (0, 1):
        raise PlanError(f"hyperframes check failed ({run.returncode}): {run.stderr[-400:]}")
    return report


def findings(report: dict) -> list[dict]:
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


def check_svg(svg: str, timeout: int = 120, keep: bool = False) -> dict:
    project = Path(tempfile.mkdtemp(prefix="qweeps-hf-gate-"))
    try:
        (project / "index.html").write_text(composition(svg))
        (project / "hyperframes.json").write_text(json.dumps(PROJECT))
        report = run_check(project, timeout)
        rows = findings(report)
        errors = sum(1 for row in rows if row["severity"] == "error")
        warnings = sum(1 for row in rows if row["severity"] == "warning")
        return {
            "ok": bool(report.get("ok")) and not errors,
            "errors": errors,
            "warnings": warnings,
            "findings": rows,
            "project": str(project) if keep else None,
        }
    finally:
        if not keep:
            shutil.rmtree(project, ignore_errors=True)
