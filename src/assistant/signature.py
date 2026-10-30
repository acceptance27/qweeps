from __future__ import annotations

import hashlib
import os
from pathlib import Path

from . import __version__
from .config import Config


def _file_hash(path: Path) -> bytes:
    try:
        return hashlib.sha256(path.read_bytes()).digest()
    except OSError:
        return b"\x00"


def world_signature(cfg: Config, epoch: str = "") -> str:
    """Hash of everything that can change an answer: version, config, code, epoch.

    Stored alongside cache entries. If it changes, cached answers are stale and
    are ignored - so "I updated the system" instantly invalidates the cache.
    """
    digest = hashlib.sha256()
    digest.update(__version__.encode())
    digest.update((epoch or os.environ.get("OMARCHY_ASSISTANT_EPOCH", "")).encode())
    digest.update(_file_hash(cfg.config_dir / "config.toml"))
    pkg = Path(__file__).resolve().parent
    for path in sorted(pkg.rglob("*.py")):
        digest.update(path.name.encode())
        digest.update(_file_hash(path))
    return digest.hexdigest()[:16]


def file_signature(path: str | Path) -> str:
    """Short content hash of a single file (for per-source invalidation)."""
    return _file_hash(Path(path)).hex()[:12]
