from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

AVAILABLE = "available"
LEARNING = "learning"
PLANNED = "planned"

# What the Interns (the coding agents) can do. Without this the Talker only sees
# the handful of built-in skills and concludes everything else is impossible.
INTERNS_CAPABILITIES = (
    "Everything else on this computer, your Interns do: run shell commands; read, write, move, search "
    "and organise files; open, close and control apps and windows; inspect and kill processes and "
    "ports; check system stats (CPU, GPU, memory, disk, battery, temperatures, network); install, "
    "update and configure software; write, run and fix code; browse and research the web; and use the "
    "person's signed-in accounts."
)


@dataclass
class Capability:
    name: str
    description: str
    status: str = AVAILABLE
    source: str = "skill"
    patterns: list[str] = field(default_factory=list)
    command: list[str] = field(default_factory=list)
    params: list[str] = field(default_factory=list)

    @property
    def available(self) -> bool:
        return self.status == AVAILABLE


class CapabilityStore:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path else None
        self.entries: dict[str, Capability] = {}
        if self.path is not None:
            self.load()

    def add(self, capability: Capability) -> None:
        self.entries[capability.name] = capability
        self.save()

    def add_many(self, capabilities: list[Capability]) -> None:
        for capability in capabilities:
            self.entries[capability.name] = capability
        self.save()

    def get(self, name: str) -> Capability | None:
        return self.entries.get(name)

    def remove(self, name: str) -> bool:
        if name in self.entries:
            del self.entries[name]
            self.save()
            return True
        return False

    def mark(self, name: str, status: str) -> None:
        entry = self.entries.get(name)
        if entry is not None:
            entry.status = status
            self.save()

    def sync_from_skills(self, skills: list) -> None:
        changed = False
        for skill in skills:
            name = getattr(skill, "name", None)
            if not name:
                continue
            entry = self.entries.get(name)
            description = getattr(skill, "description", "") or name
            source = "learned" if getattr(skill, "source", "") == "promoted" else "skill"
            if entry is None:
                self.entries[name] = Capability(
                    name=name, description=description, status=AVAILABLE, source=source,
                )
                changed = True
            else:
                if entry.status == PLANNED:
                    entry.status = AVAILABLE
                    changed = True
                entry.description = description
        if changed:
            self.save()

    def list(self) -> list[Capability]:
        return sorted(self.entries.values(), key=lambda c: (c.status, c.name))

    def available(self) -> list[Capability]:
        return [c for c in self.list() if c.status == AVAILABLE]

    def unavailable(self) -> list[Capability]:
        return [c for c in self.list() if c.status != AVAILABLE]

    def context(self, limit: int = 40) -> str:
        available = self.available()[:limit]
        missing = self.unavailable()[:limit]
        lines: list[str] = [
            "What you can do - this list is accurate; trust it over any instinct that you are only a "
            "text model."
        ]
        if available:
            lines.append("Things you can already do instantly:")
            lines.extend(f"- {c.name}: {c.description}" for c in available)
        lines.append(INTERNS_CAPABILITIES)
        if missing:
            lines.append("Skills still being learned (send these to your Interns for now):")
            lines.extend(f"- {c.name}: {c.description} ({c.status})" for c in missing)
        return "\n".join(lines)

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = [asdict(c) for c in self.entries.values()]
        self.path.write_text(json.dumps(payload, indent=2))

    def load(self) -> None:
        if self.path is None or not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text() or "[]")
        except (json.JSONDecodeError, OSError):
            return
        for item in data if isinstance(data, list) else []:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            self.entries[str(item["name"])] = Capability(
                name=str(item["name"]),
                description=str(item.get("description", "")),
                status=str(item.get("status", AVAILABLE)),
                source=str(item.get("source", "skill")),
                patterns=[str(p) for p in item.get("patterns", [])],
                command=[str(c) for c in item.get("command", [])],
                params=[str(p) for p in item.get("params", [])],
            )
