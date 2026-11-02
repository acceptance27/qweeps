"""Content-addressed registry for generated native ManimGL scenes."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

BUILTIN = {"wbc", "blood3d", "neuron"}


def registry_root() -> Path:
    configured = os.environ.get("QWEEPS_NATIVE_SCENES")
    if configured:
        return Path(configured)
    base = Path.home() / ".cache/omarchy-assistant"
    if not (Path.home() / ".cache/omarchy-assistant").is_dir():
        base = Path.home() / ".cache/qweeps"
    return base / "native-scenes"


def scene_id(source: str) -> str:
    return "gen_" + hashlib.sha256(source.encode()).hexdigest()[:12]


def scene_dir(scene_id_value: str) -> Path:
    return registry_root() / scene_id_value


def write_scene(source: str, manifest: dict) -> dict:
    scene_id_value = manifest["sceneId"]
    folder = scene_dir(scene_id_value)
    folder.mkdir(parents=True, exist_ok=True)
    source_path = folder / "scene.py"
    source_path.write_text(source)
    manifest = {**manifest, "source": str(source_path)}
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def load_manifest(scene_id_value: str) -> dict | None:
    if not scene_id_value or scene_id_value in BUILTIN:
        return None
    path = scene_dir(scene_id_value) / "manifest.json"
    if not path.is_file():
        return None
    try:
        manifest = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    if manifest.get("sceneId") != scene_id_value:
        return None
    source = Path(manifest.get("source", ""))
    if not source.is_file():
        return None
    return manifest


def is_known(scene_id_value: str) -> bool:
    return scene_id_value in BUILTIN or load_manifest(scene_id_value) is not None
