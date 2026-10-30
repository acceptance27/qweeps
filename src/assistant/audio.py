from __future__ import annotations

import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

_PLAYBACK_LOCK = threading.Lock()

_PLAYERS: list[list[str]] = [
    ["pw-play"],
    ["paplay"],
    ["mpv", "--no-video", "--really-quiet"],
    ["aplay", "-q"],
]


def _pidfile() -> Path:
    from .log import state_dir

    return state_dir() / "tts.pid"


def announce_pid(pid: int) -> None:
    """Record the PID of the player currently speaking (for barge-in)."""
    try:
        path = _pidfile()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(pid), encoding="utf-8")
    except OSError:
        pass


def clear_pid(pid: int | None = None) -> None:
    """Forget the speaking PID (only if it still matches, to avoid races)."""
    path = _pidfile()
    try:
        if pid is not None and path.exists() and path.read_text(encoding="utf-8").strip() != str(pid):
            return
        path.unlink(missing_ok=True)
    except OSError:
        pass


def stop_playback() -> bool:
    """Stop the player announced via announce_pid (used for barge-in or preemption)."""
    import os
    import signal

    path = _pidfile()
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return False
    try:
        os.kill(pid, signal.SIGTERM)
        clear_pid(pid)
        return True
    except OSError:
        clear_pid(pid)
        return False


def _player_for(path: Path) -> list[str] | None:
    suffix = path.suffix.lower()
    for candidate in _PLAYERS:
        if shutil.which(candidate[0]) is None:
            continue
        if candidate[0] == "aplay" and suffix not in {".wav"}:
            continue
        if candidate[0] in {"pw-play", "paplay", "mpv"}:
            return candidate
    return None


def play(path: str | Path, timeout: int = 120) -> bool:
    path = Path(path)
    if not path.exists():
        return False
    player = _player_for(path)
    if player is None:
        return False
    stop_playback()
    with _PLAYBACK_LOCK:
        try:
            proc = subprocess.Popen([*player, str(path)])
        except OSError:
            return False
        announce_pid(proc.pid)
        try:
            proc.wait(timeout=timeout)
            return True
        except subprocess.TimeoutExpired:
            proc.kill()
            return False
        finally:
            clear_pid(proc.pid)


def record_wav(
    seconds: float,
    sample_rate: int = 16000,
    path: str | Path | None = None,
) -> Path | None:
    stop_playback()
    if path is None:
        fd, name = tempfile.mkstemp(suffix=".wav", prefix="omarchy-assistant-")
        import os

        os.close(fd)
        path = Path(name)
    path = Path(path)

    if shutil.which("pw-record"):
        proc = subprocess.Popen(
            ["pw-record", "--rate", str(sample_rate), "--channels", "1",
             "--format", "s16", str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(max(0.5, seconds))
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        return path if path.exists() and path.stat().st_size > 44 else None

    if shutil.which("arecord"):
        try:
            subprocess.run(
                ["arecord", "-f", "S16_LE", "-r", str(sample_rate), "-c", "1",
                 "-d", str(int(round(seconds))), str(path)],
                check=False,
                timeout=seconds + 10,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        return path if path.exists() and path.stat().st_size > 44 else None

    return None
