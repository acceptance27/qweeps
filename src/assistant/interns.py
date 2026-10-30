from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any


class InternRegistry:
    """Tracks what the Interns (coding agents) are doing, for the GUI to read.

    A small JSON file, written atomically, holding the most recent tasks:
    id, title, status, timestamps, and a rolling list of progress events.
    """

    def __init__(self, path: Path, keep: int = 40) -> None:
        self.path = Path(path)
        self.keep = keep

    def _read(self) -> list[dict[str, Any]]:
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, list) else []
        except (OSError, json.JSONDecodeError):
            return []

    def _write(self, tasks: list[dict[str, Any]]) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            with tmp.open("w", encoding="utf-8") as fh:
                json.dump(tasks[-self.keep:], fh, indent=2)
            os.replace(tmp, self.path)
        except OSError:
            pass

    def start(self, title: str) -> str:
        tid = uuid.uuid4().hex[:8]
        tasks = self._read()
        tasks.append(
            {
                "id": tid,
                "title": (title or "").strip()[:200],
                "status": "working",
                "started": time.time(),
                "updated": time.time(),
                "events": [],
            }
        )
        self._write(tasks)
        return tid

    def event(self, tid: str, text: str) -> None:
        text = (text or "").strip()
        if not text:
            return
        tasks = self._read()
        for t in tasks:
            if t.get("id") == tid:
                events = t.setdefault("events", [])
                events.append(text)
                t["events"] = events[-12:]
                t["updated"] = time.time()
        self._write(tasks)

    def finish(self, tid: str, status: str = "done", detail: str = "") -> None:
        tasks = self._read()
        for t in tasks:
            if t.get("id") == tid:
                t["status"] = status
                if detail:
                    events = t.setdefault("events", [])
                    events.append(detail.strip()[:300])
                    t["events"] = events[-12:]
                t["updated"] = time.time()
        self._write(tasks)

    def list(self) -> list[dict[str, Any]]:
        self.sweep()
        return self._read()

    def sweep(self, max_age: float = 900.0) -> None:
        """Mark tasks stuck in 'working' (agent died, process killed) as stalled."""
        now = time.time()
        tasks = self._read()
        changed = False
        for task in tasks:
            if task.get("status") == "working" and now - float(task.get("updated", now)) > max_age:
                task["status"] = "stalled"
                task["updated"] = now
                changed = True
        if changed:
            self._write(tasks)

    def clear(self) -> None:
        self._write([])
