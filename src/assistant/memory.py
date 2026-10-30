from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Memory:
    path: Path
    facts: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.load()

    def load(self) -> None:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text() or "{}")
            except (json.JSONDecodeError, OSError):
                data = {}
            self.facts = list(data.get("facts", []))

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"facts": self.facts}, indent=2))

    def add_fact(self, fact: str) -> bool:
        fact = fact.strip()
        if not fact or fact in self.facts:
            return False
        self.facts.append(fact)
        self.save()
        return True

    def forget_fact(self, fact: str) -> bool:
        if fact in self.facts:
            self.facts.remove(fact)
            self.save()
            return True
        return False

    def as_context(self, limit: int = 20) -> str:
        if not self.facts:
            return ""
        return "\n".join(f"- {fact}" for fact in self.facts[-limit:])
