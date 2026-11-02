"""Measure ManimCE Text boxes so the native ManimGL shim can match them.

ManimCE and ManimGL both use Pango, but they pass different point sizes to it
and normalize the resulting SVG differently.  The same ``Text("...", font_size=n)``
therefore has a different width and height in each renderer.  The compiler
measures the CE box once per (text, size, font, weight, slant) tuple and stores
it in a cache; ``recorded_scene`` stretches native text to that box.

Run this module with any Python that has ManimCE installed:

    manim-ce/bin/python -m assistant.visual.ce_text_metrics < specs.json

It reads a JSON list of specs from stdin and writes a JSON object keyed by the
same metric key used by the native shim.
"""
from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
from pathlib import Path

CACHE_PATH = Path.home() / ".cache" / "omarchy-assistant" / "ce-text-metrics.json"


def metric_key(text, font_size, font="", weight="", slant=""):
    return "|".join((str(text), str(float(font_size)), str(font or ""),
                     str(weight or ""), str(slant or "")))


def _literal(node):
    try:
        return ast.literal_eval(node)
    except (ValueError, SyntaxError):
        return None


def collect_text_specs(source: str) -> list[dict]:
    """Static ``Text("...", font_size=...)`` calls in a CE scene source."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    specs = []
    seen = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.id if isinstance(func, ast.Name) else (
            func.attr if isinstance(func, ast.Attribute) else None)
        if name != "Text" or not node.args:
            continue
        text = _literal(node.args[0])
        if not isinstance(text, str):
            continue
        kw = {item.arg: _literal(item.value) for item in node.keywords if item.arg}
        font_size = kw.get("font_size", 48)
        if not isinstance(font_size, (int, float)):
            continue
        spec = {
            "text": text,
            "font_size": float(font_size),
            "font": kw.get("font") or "",
            "weight": str(kw.get("weight") or ""),
            "slant": str(kw.get("slant") or ""),
        }
        key = metric_key(**spec)
        if key not in seen:
            seen.add(key)
            specs.append(spec)
    return specs


def ce_interpreter() -> str | None:
    # Match the documented ManimCE install paths and environment variable used
    # by manim_clips/render_backends.  Do not depend on a developer checkout
    # such as a sibling generative-manim repository.
    override = (os.environ.get("QWEEPS_MANIM_CE_PYTHON")
                or os.environ.get("QWEEPS_MANIM_PYTHON"))
    candidates = [
        override,
        str(Path.home() / ".local/share/qweeps/manim-ce/bin/python"),
        str(Path.home() / ".local/share/omarchy-assistant/manim-ce/bin/python"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def _load_cache() -> dict:
    try:
        data = json.loads(CACHE_PATH.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _save_cache(cache: dict) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    except OSError:
        pass


MEASURE_SCRIPT = r"""
import json, sys
from manim import Text
specs = json.load(sys.stdin)
out = {}
for spec in specs:
    kwargs = {"font_size": spec["font_size"]}
    for key in ("font", "weight", "slant"):
        value = spec.get(key)
        if value:
            kwargs[key] = value
    text = Text(spec["text"], **kwargs)
    out[spec["key"]] = [float(text.width), float(text.height)]
json.dump(out, sys.stdout)
"""


def measure(specs: list[dict], timeout: int = 90) -> dict:
    """Measure specs in a CE subprocess, using and updating the cache."""
    if not specs:
        return {}
    cache = _load_cache()
    keyed = [dict(spec, key=metric_key(**spec)) for spec in specs]
    missing = [spec for spec in keyed if spec["key"] not in cache]
    if missing:
        interpreter = ce_interpreter()
        if interpreter:
            try:
                result = subprocess.run(
                    [interpreter, "-c", MEASURE_SCRIPT],
                    input=json.dumps(missing), capture_output=True, text=True,
                    timeout=timeout,
                )
                if result.returncode == 0 and result.stdout.strip():
                    cache.update(json.loads(result.stdout))
                    _save_cache(cache)
            except (OSError, subprocess.SubprocessError, ValueError):
                pass
    return {spec["key"]: cache[spec["key"]] for spec in keyed
            if spec["key"] in cache}


def measure_source(source: str) -> dict:
    specs = collect_text_specs(source)
    return measure(specs)


def _main() -> None:
    specs = json.load(sys.stdin)
    if not isinstance(specs, list):
        raise SystemExit("expected a JSON list of text specs")
    from manim import Text as CEText

    out = {}
    for spec in specs:
        kwargs = {"font_size": spec["font_size"]}
        for key in ("font", "weight", "slant"):
            value = spec.get(key)
            if value:
                kwargs[key] = value
        text = CEText(spec["text"], **kwargs)
        out[metric_key(**spec)] = [float(text.width), float(text.height)]
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    _main()
