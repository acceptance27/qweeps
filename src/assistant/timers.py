from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class _Timer:
    id: str
    label: str
    kind: str
    fire_at: float
    handle: threading.Timer | None = None


@dataclass
class TimerService:
    notifier: object | None = None
    path: Path | str | None = None
    _timers: dict[str, _Timer] = field(default_factory=dict)
    _stops: dict[str, float] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self.path = Path(self.path) if self.path else None
        if self.path is not None:
            self._load()

    def _notify(self, label: str, kind: str) -> None:
        if self.notifier is not None and hasattr(self.notifier, "send"):
            title = "Reminder" if kind == "reminder" else "Timer"
            self.notifier.send(title, f"{label}")

    def _schedule(self, timer: _Timer) -> None:
        delay = max(0.0, timer.fire_at - time.time())
        handle = threading.Timer(delay, self._fire, args=(timer.id,))
        handle.daemon = True
        timer.handle = handle
        handle.start()

    def start_timer(self, label: str, seconds: float, kind: str = "timer") -> str:
        tid = uuid.uuid4().hex[:12]
        timer = _Timer(id=tid, label=label, kind=kind, fire_at=time.time() + seconds)
        with self._lock:
            self._timers[tid] = timer
            self._schedule(timer)
            self._persist()
        return tid

    def _fire(self, tid: str) -> None:
        with self._lock:
            timer = self._timers.pop(tid, None)
        if timer is None:
            return
        if self._still_pending(tid) is False:
            return
        self._remove_from_file(tid)
        self._notify(timer.label, timer.kind)

    def _still_pending(self, tid: str) -> bool:
        if self.path is None:
            return True
        data = self._read_file()
        return any(item.get("id") == tid for item in data)

    def start_stopwatch(self, label: str = "default") -> None:
        with self._lock:
            self._stops[label] = time.monotonic()

    def stop_stopwatch(self, label: str = "default") -> float | None:
        with self._lock:
            start = self._stops.pop(label, None)
        if start is None:
            return None
        return time.monotonic() - start

    def stopwatch_elapsed(self, label: str = "default") -> float | None:
        with self._lock:
            start = self._stops.get(label)
        if start is None:
            return None
        return time.monotonic() - start

    def active(self) -> list[dict[str, float | str]]:
        with self._lock:
            now = time.time()
            return [
                {"id": t.id, "label": t.label, "kind": t.kind,
                 "remaining": max(0.0, t.fire_at - now)}
                for t in self._timers.values()
            ]

    def cancel(self, label: str | None = None) -> int:
        with self._lock:
            ids = [tid for tid, t in self._timers.items() if label is None or t.label == label]
            for tid in ids:
                timer = self._timers.pop(tid)
                if timer.handle is not None:
                    timer.handle.cancel()
            self._persist()
            return len(ids)

    def adopt_external(self) -> int:
        """Schedule timers written to the file by another process. Returns how many were adopted."""
        if self.path is None:
            return 0
        adopted = 0
        with self._lock:
            for item in self._read_file():
                tid = item.get("id")
                if not tid or tid in self._timers:
                    continue
                try:
                    fire_at = float(item["fire_at"])
                except (KeyError, TypeError, ValueError):
                    continue
                timer = _Timer(id=tid, label=str(item.get("label", "timer")),
                               kind=str(item.get("kind", "timer")), fire_at=fire_at)
                self._timers[tid] = timer
                self._schedule(timer)
                adopted += 1
        return adopted

    def _read_file(self) -> list[dict]:
        if self.path is None or not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text() or "[]")
        except (json.JSONDecodeError, OSError):
            return []
        return data if isinstance(data, list) else []

    def _persist(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = [
            {"id": t.id, "label": t.label, "kind": t.kind, "fire_at": t.fire_at}
            for t in self._timers.values()
        ]
        self.path.write_text(json.dumps(payload, indent=2))

    def _remove_from_file(self, tid: str) -> None:
        if self.path is None:
            return
        with self._lock:
            remaining = [item for item in self._read_file() if item.get("id") != tid]
            self.path.write_text(json.dumps(remaining, indent=2))

    def _load(self) -> None:
        for item in self._read_file():
            tid = item.get("id")
            if not tid:
                continue
            try:
                fire_at = float(item["fire_at"])
            except (KeyError, TypeError, ValueError):
                continue
            timer = _Timer(id=tid, label=str(item.get("label", "timer")),
                           kind=str(item.get("kind", "timer")), fire_at=fire_at)
            self._timers[tid] = timer
            self._schedule(timer)


def format_seconds(seconds: float) -> str:
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    minutes, sec = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''}" + (f" {sec} sec" if sec else "")
    hours, minutes = divmod(minutes, 60)
    return f"{hours} hour{'s' if hours != 1 else ''}" + (f" {minutes} min" if minutes else "")
