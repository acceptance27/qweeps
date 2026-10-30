from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Risk(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class SkillResult:
    text: str
    action: str | None = None
    command: list[str] | None = None
    risk: Risk = Risk.LOW
    speak: bool = True
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Response:
    text: str
    source: str
    spoke: bool = False
    action: str | None = None
    promoted: str | None = None
    confirmed: bool | None = None
    data: dict[str, Any] = field(default_factory=dict)
