from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

MAX_TURNS = 12
MAX_CHARS = 6000


@dataclass
class Turn:
    role: str
    content: str
    ts: float = 0.0


class Conversation:
    def __init__(
        self,
        path: Path | str | None = None,
        max_turns: int = MAX_TURNS,
        max_chars: int = MAX_CHARS,
    ) -> None:
        self.path = Path(path) if path else None
        self.max_turns = max_turns
        self.max_chars = max_chars
        self.turns: list[Turn] = []
        if self.path is not None:
            self.load()

    def add(self, role: str, content: str) -> None:
        content = (content or "").strip()
        if not content:
            return
        self.turns.append(Turn(role=role, content=content, ts=time.time()))
        self._trim()
        self.save()

    def _trim(self) -> None:
        if self.max_turns and len(self.turns) > self.max_turns:
            self.turns = self.turns[-self.max_turns :]
        while (
            len(self.turns) > 1
            and self.max_chars
            and sum(len(t.content) for t in self.turns) > self.max_chars
        ):
            self.turns.pop(0)

    def messages(self, limit: int | None = None) -> list[dict[str, str]]:
        turns = self.turns if limit is None else self.turns[-limit:]
        return [{"role": t.role, "content": t.content} for t in turns]

    def clear(self) -> None:
        self.turns = []
        self.save()

    def load(self) -> None:
        if self.path is None or not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text() or "[]")
        except (json.JSONDecodeError, OSError):
            return
        turns: list[Turn] = []
        for item in data if isinstance(data, list) else []:
            if isinstance(item, dict) and item.get("role") and item.get("content"):
                turns.append(
                    Turn(
                        role=str(item["role"]),
                        content=str(item["content"]),
                        ts=float(item.get("ts", 0.0)),
                    )
                )
        self.turns = turns[-self.max_turns :] if self.max_turns else turns

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = [{"role": t.role, "content": t.content, "ts": t.ts} for t in self.turns]
        self.path.write_text(json.dumps(payload, indent=2))


class SessionStore:
    def __init__(self, base_dir: Path | str, max_turns: int = MAX_TURNS, max_chars: int = MAX_CHARS):
        self.base_dir = Path(base_dir)
        self.max_turns = max_turns
        self.max_chars = max_chars

    def get(self, name: str | None) -> Conversation | None:
        if not name:
            return None
        safe = "".join(c for c in name if c.isalnum() or c in "-_.") or "default"
        return Conversation(
            self.base_dir / f"{safe}.json",
            max_turns=self.max_turns,
            max_chars=self.max_chars,
        )

    def list_sessions(self) -> list[str]:
        if not self.base_dir.exists():
            return []
        return sorted(p.stem for p in self.base_dir.glob("*.json"))

    def clear(self, name: str | None) -> bool:
        conv = self.get(name)
        if conv is None or conv.path is None or not conv.path.exists():
            return False
        conv.path.unlink()
        return True
