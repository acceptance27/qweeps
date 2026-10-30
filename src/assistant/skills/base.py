from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..config import Config
from ..types import SkillResult


@dataclass
class SkillContext:
    cfg: Config
    memory: Any = None
    notifier: Any = None
    runner: Any = None
    timers: Any = None
    llm: Any = None
    agent: Any = None
    dry_run: bool = False

    def run_command(self, command: list[str], timeout: int = 30) -> tuple[int, str, str]:
        if self.runner is not None:
            return self.runner(command, timeout)
        import subprocess

        proc = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, proc.stdout, proc.stderr


class Skill(Protocol):
    name: str
    description: str
    kind: str

    def match(self, text: str) -> dict[str, Any] | None: ...

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult: ...


@dataclass
class RegexSkill:
    name: str
    description: str
    patterns: list[str]
    kind: str = "query"
    flags: int = re.IGNORECASE
    order: int = 100

    def __post_init__(self) -> None:
        self._compiled = [re.compile(p, self.flags) for p in self.patterns]

    def match(self, text: str) -> dict[str, Any] | None:
        for regex in self._compiled:
            m = regex.search(text)
            if m:
                return {"match": m, "groups": m.groupdict(), "group": m.groups()}
        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        raise NotImplementedError


@dataclass
class Rule:
    pattern: re.Pattern[str]
    builder: Any
