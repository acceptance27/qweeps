"""Compile a ManimCE source into native beat windows (runs in the visual venv).

Usage:
    visual-venv/bin/python -m assistant.visual.native_compile <source.py> <out.json>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: native_compile <source.py> <out.json>")
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    from .ce_native import load_native_scene

    scene = load_native_scene(source)
    windows = []
    for index, beat in enumerate(scene.beats):
        end = scene.beats[index + 1]["time"] if index + 1 < len(scene.beats) else scene.duration
        windows.append({"id": beat["id"], "title": beat["title"],
                        "start": round(float(beat["time"]), 3), "end": round(float(end), 3)})
    target.write_text(json.dumps({"duration": round(float(scene.duration), 3),
                                  "beats": windows, "tracks": len(scene.tracks)}, indent=1))


if __name__ == "__main__":
    main()
