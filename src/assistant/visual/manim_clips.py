"""Per-beat Manim clips for QWEEPS, rendered through the render backends.

The split-render plan renders one clip per graphical teaching beat instead of a
single lesson video. A clip is a ManimCE source file plus a scene class; it is
rendered either with the local ManimCE install (reference render) or with
Generative Manim's ManimGL path (``renderer="gl"``), and cached by source hash.

    python -m assistant.visual.manim_clips list
    python -m assistant.visual.manim_clips render pair_production --renderer gl

Chapter entries for the lesson clock:

    chapter = clip_chapter("pair_production", start=0.0, renderer="gl")
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from .render_backends import GenerativeManimBackend, LocalCEBackend, RenderResult

SCENES_DIR = Path(__file__).with_name("scenes")
CACHE_ROOT = Path.home() / ".cache/qweeps/visual-clips"


@dataclass(frozen=True)
class ClipSpec:
    name: str
    title: str
    source: Path
    scene: str = "GenScene"
    duration: float = 0.0
    beats: tuple[str, ...] = ()


CLIPS: dict[str, ClipSpec] = {
    "pair_production": ClipSpec(
        name="pair_production",
        title="How massless energy becomes mass (pair production)",
        source=SCENES_DIR / "pair_production.py",
        scene="GenScene",
        duration=23.2,
        beats=("photon", "impact", "pair", "ledger"),
    ),
    "pair_production_photon": ClipSpec(
        name="pair_production_photon",
        title="Beat 1 - the photon approaches the nucleus",
        source=SCENES_DIR / "pair_production_beats.py",
        scene="PairPhoton",
        duration=8.7,
    ),
    "pair_production_creation": ClipSpec(
        name="pair_production_creation",
        title="Beat 2 - the pair appears",
        source=SCENES_DIR / "pair_production_beats.py",
        scene="PairCreation",
        duration=8.0,
    ),
    "white_blood_cell": ClipSpec(
        name="white_blood_cell",
        title="How a white blood cell decides what is a threat",
        source=SCENES_DIR / "white_blood_cell.py",
        scene="GenScene",
        duration=27.1,
    ),
    "pair_production_ledger": ClipSpec(
        name="pair_production_ledger",
        title="Beat 3 - energy becomes mass",
        source=SCENES_DIR / "pair_production_beats.py",
        scene="PairLedger",
        duration=8.1,
    ),
}


def source_sha(spec: ClipSpec) -> str:
    return hashlib.sha256(spec.source.read_bytes()).hexdigest()[:16]


def _local_ce_python() -> str | None:
    candidates = [
        os.environ.get("QWEEPS_MANIM_PYTHON"),
        str(Path.home() / ".local/share/qweeps/manim-ce/bin/python"),
        str(Path.home() / ".local/share/omarchy-assistant/manim-ce/bin/python"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            probe = subprocess.run([candidate, "-c", "import manim"],
                                   capture_output=True, timeout=20)
            if probe.returncode == 0:
                return candidate
    return None


def _backend(renderer: str):
    if renderer == "gl":
        return GenerativeManimBackend(
            url=os.environ.get("QWEEPS_GM_URL", "http://127.0.0.1:8080"),
            renderer="gl",
            api_key=os.environ.get("QWEEPS_GM_API_KEY"),
            timeout=int(os.environ.get("QWEEPS_GM_TIMEOUT", "900")),
        )
    python = _local_ce_python()
    if not python:
        raise RuntimeError(
            "Local ManimCE is unavailable; set QWEEPS_MANIM_PYTHON to a venv containing manim."
        )
    return LocalCEBackend(python)


def clip_path(name: str, renderer: str) -> Path:
    spec = CLIPS[name]
    return CACHE_ROOT / name / source_sha(spec) / renderer / "lesson.mp4"


def render_clip(name: str, renderer: str = "gl", force: bool = False) -> RenderResult:
    """Render (or reuse) one clip. Returns the result with a stable path."""
    if name not in CLIPS:
        raise KeyError(f"unknown clip: {name}")
    if renderer not in {"gl", "ce"}:
        raise ValueError("renderer must be 'gl' or 'ce'")
    spec = CLIPS[name]
    target = clip_path(name, renderer)
    if target.is_file() and not force:
        return RenderResult(target, f"cache-{renderer}", {"cached": True})

    folder = target.parent
    folder.mkdir(parents=True, exist_ok=True)
    result = _backend(renderer).render(spec.source.read_text(), spec.scene, folder)
    if Path(result.video).resolve() != target.resolve():
        shutil.copyfile(result.video, target)

    receipt = {
        "clip": name,
        "renderer": renderer,
        "backend": result.backend,
        "scene": spec.scene,
        "sourceSha": source_sha(spec),
        "bytes": target.stat().st_size,
        "detail": result.detail,
    }
    (folder / "receipt.json").write_text(json.dumps(receipt, indent=2))
    return RenderResult(target, result.backend, receipt)


def clip_chapter(name: str, start: float = 0.0, renderer: str = "gl",
                 engine: str = "manim") -> dict:
    """Chapter entry for the shared lesson clock (engine/renderer/video/offset)."""
    spec = CLIPS[name]
    return {
        "engine": engine,
        "renderer": renderer,
        "clip": name,
        "title": spec.title,
        "video": f"/api/visual/clips/{name}-{renderer}-{source_sha(spec)}.mp4",
        "offset": 0.0,
        "duration": spec.duration,
        "start": round(start, 2),
        "end": round(start + spec.duration, 2),
        "sourceSha": source_sha(spec),
    }


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] not in {"list", "render"}:
        print(__doc__)
        return 1
    if argv[0] == "list":
        for spec in CLIPS.values():
            print(f"{spec.name:20} {spec.duration:5.1f}s  {spec.source.name}  {spec.title}")
        return 0

    name = argv[1]
    renderer = "gl"
    force = "--force" in argv
    if "--renderer" in argv:
        renderer = argv[argv.index("--renderer") + 1]
    result = render_clip(name, renderer, force=force)
    print(json.dumps({"video": str(result.video), "backend": result.backend, **result.detail},
                     indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
