"""Diagnostic SVG preview of a compiled v3 scene.

This is NOT the production player. It renders the compiled scene's elements
(box/circle/text/arrow/line/path/svg) at chosen times so a human or vision model
can see what the gate and judge are reasoning about.

    .venv/bin/python bench/preview_scene.py --checkpoint bench/checkpoints/deepseek-dsl-neuron.json
    .venv/bin/python bench/preview_scene.py --scene bench/runs/lesson.json --out /tmp/opencode/preview
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

W, H = 1440, 800
HALF_W, HALF_H = 6.0, 2.8
BG = "#0d1a21"
FONT = "DejaVu Sans, Noto Sans, sans-serif"


def load_scene(path: Path) -> dict:
    data = json.loads(path.read_text())
    if "beats" in data and isinstance(data["beats"], list):
        return data  # already a scene
    if "scene" in data:
        return data["scene"]
    raise SystemExit(f"{path} is not a compiled scene")


def replay_checkpoint(path: Path) -> dict:
    from unittest.mock import Mock

    from assistant.visual.dsl_prompt import ensure_cues
    from assistant.visual.geometry import resolve_text_layout
    from assistant.visual.v3_pipeline import _dsl_build

    data = json.loads(path.read_text())
    raw = data.get("dslRaws")
    if not raw:
        raise SystemExit("checkpoint has no dslRaws; run a lesson first")
    storyboard, contract = data["storyboard"], data["contract"]
    role_table = data["roleTable"]
    registry = {}
    for entry in contract["beats"]:
        for item in entry.get("enter", []) or []:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                registry[item["id"]] = {"kind": item.get("kind") or "box",
                                        "role": item.get("role") or "",
                                        "label": item.get("label", "")}
    narrations, cues = {}, {}
    for index, beat in enumerate(storyboard["beats"]):
        narrations[index], cues[index] = ensure_cues(beat["narration"])
    model = Mock(spec=["compose"])
    model.compose.side_effect = [[], []]
    scene, _ = _dsl_build(model, storyboard, contract, registry, role_table,
                          narrations, cues, base={int(k): v for k, v in raw.items()})
    for beat in scene["beats"]:
        resolve_text_layout(beat["elements"])
    return scene


def color(element: dict, default: str = "#58C4DD") -> str:
    value = element.get("color") or default
    return value if re.fullmatch(r"#[0-9A-Fa-f]{6}", str(value)) else default


def text_lines(element: dict) -> list[str]:
    lines = element.get("lines")
    if isinstance(lines, list) and lines:
        return [str(line) for line in lines]
    label = str(element.get("label") or "")
    return label.split("\n") if label else []


def render_beat(beat: dict, at: float) -> str:
    camera = beat.get("camera") or {}
    zoom = float(camera.get("zoom", 1) or 1)
    cx, cy = float(camera.get("x", 0) or 0), float(camera.get("y", 0) or 0)
    sx, sy = zoom * W / (2 * HALF_W), zoom * H / (2 * HALF_H)

    def screen(x: float, y: float) -> tuple[float, float]:
        return W / 2 + (x - cx) * sx, H / 2 - (y - cy) * sy

    by_id = {e.get("id"): e for e in beat.get("elements", [])}
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{BG}"/>',
             '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" '
             'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
             '<path d="M 0 0 L 10 5 L 0 10 z" fill="#d8e2e6"/></marker></defs>']

    for element in beat.get("elements", []):
        kind = element.get("kind") or "box"
        x, y = float(element.get("x", 0) or 0), float(element.get("y", 0) or 0)
        width = float(element.get("width", 2) or 2)
        height = float(element.get("height", 1) or 1)
        px, py = screen(x, y)
        pw, ph = width * sx, height * sy
        reveal = element.get("revealAt", 0)
        if not isinstance(reveal, (int, float)) or isinstance(reveal, bool):
            reveal = 0.0
        draw = float(element.get("drawDuration", 0.4) or 0.4)
        progress = max(0.0, min(1.0, (at - reveal) / max(0.01, draw)))
        if progress <= 0:
            continue
        opacity = float(element.get("opacity", 1) or 1) * min(1.0, progress * 1.6)
        paint = color(element)
        if kind == "text":
            lines = text_lines(element)
            if not lines:
                continue
            size = float(element.get("fontSize", height * 0.7) or height * 0.7) * sy
            line_height = size * 1.25
            top = py - (len(lines) - 1) * line_height / 2
            for index, line in enumerate(lines):
                parts.append(
                    f'<text x="{px:.1f}" y="{top + index * line_height:.1f}" '
                    f'font-family="{FONT}" font-size="{size:.1f}" fill="{paint}" '
                    f'fill-opacity="{opacity:.2f}" text-anchor="middle" '
                    f'dominant-baseline="middle">{escape(line)}</text>')
        elif kind == "circle":
            parts.append(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="{pw / 2:.1f}" '
                         f'ry="{ph / 2:.1f}" fill="{paint}" fill-opacity="{0.08 * opacity:.2f}" '
                         f'stroke="{paint}" stroke-opacity="{opacity:.2f}" stroke-width="3"/>')
            label = str(element.get("label") or "")
            if label:
                size = max(12.0, min(ph * 0.45, 40.0))
                parts.append(f'<text x="{px:.1f}" y="{py:.1f}" font-family="{FONT}" '
                             f'font-size="{size:.1f}" fill="#e8f1f4" fill-opacity="{opacity:.2f}" '
                             f'text-anchor="middle" dominant-baseline="middle">{escape(label)}</text>')
        elif kind == "box":
            parts.append(f'<rect x="{px - pw / 2:.1f}" y="{py - ph / 2:.1f}" '
                         f'width="{pw:.1f}" height="{ph:.1f}" rx="{min(pw, ph) * 0.08:.1f}" '
                         f'fill="{paint}" fill-opacity="{0.08 * opacity:.2f}" '
                         f'stroke="{paint}" stroke-opacity="{opacity:.2f}" stroke-width="2.2"/>')
            label = str(element.get("label") or "")
            if label:
                size = max(11.0, min(ph * 0.35, 26.0))
                parts.append(f'<text x="{px:.1f}" y="{py:.1f}" font-family="{FONT}" '
                             f'font-size="{size:.1f}" fill="#e8f1f4" fill-opacity="{opacity:.2f}" '
                             f'text-anchor="middle" dominant-baseline="middle">{escape(label)}</text>')
        elif kind in {"arrow", "line"}:
            start, end = by_id.get(element.get("from")), by_id.get(element.get("to"))
            if not start or not end:
                continue
            x1, y1 = screen(float(start.get("x", 0)), float(start.get("y", 0)))
            x2, y2 = screen(float(end.get("x", 0)), float(end.get("y", 0)))
            marker = ' marker-end="url(#arrow)"' if kind == "arrow" else ""
            parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                         f'stroke="{paint}" stroke-opacity="{opacity:.2f}" stroke-width="2.4"{marker}/>')
        elif kind == "path":
            points = element.get("points") or []
            if len(points) >= 2:
                mapped = [f"{px + float(p[0]) * pw / 2:.1f},{py - float(p[1]) * ph / 2:.1f}"
                          for p in points]
                parts.append(f'<polyline points="{" ".join(mapped)}" fill="none" '
                             f'stroke="{paint}" stroke-opacity="{opacity:.2f}" stroke-width="2.4"/>')
        elif kind == "svg":
            markup = element.get("svg")
            if not isinstance(markup, str) or not markup.strip():
                continue
            inner = re.sub(r"^\s*<svg[^>]*>", "", markup.strip())
            inner = re.sub(r"</svg>\s*$", "", inner)
            parts.append(f'<svg x="{px - pw / 2:.1f}" y="{py - ph / 2:.1f}" '
                         f'width="{pw:.1f}" height="{ph:.1f}" viewBox="0 0 100 60" '
                         f'opacity="{opacity:.2f}">{inner}</svg>')

    parts.append("</svg>")
    return "".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint")
    parser.add_argument("--scene")
    parser.add_argument("--out", default="/tmp/opencode/preview")
    parser.add_argument("--frames", default="end", help="comma list: early,mid,end")
    args = parser.parse_args()
    if args.scene:
        scene = load_scene(Path(args.scene))
    elif args.checkpoint:
        scene = replay_checkpoint(Path(args.checkpoint))
    else:
        raise SystemExit("pass --checkpoint or --scene")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    positions = {"early": 0.25, "mid": 0.55, "end": 0.98}
    wanted = [name.strip() for name in args.frames.split(",") if name.strip()]
    for index, beat in enumerate(scene.get("beats", [])):
        duration = float(beat.get("duration", 8) or 8)
        for name in wanted:
            at = duration * positions.get(name, 0.98)
            svg = render_beat(beat, at)
            target = out / f"beat_{index}_{name}.svg"
            target.write_text(svg)
            print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
