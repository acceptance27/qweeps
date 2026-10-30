from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..safety import HIGH_PATTERNS, classify_command, max_risk
from ..types import Risk, SkillResult
from .base import SkillContext

REQUIRED_FIELDS = {"name", "patterns", "command"}
VALID_RISK = {r.value for r in Risk}

# Denylists guarding against promoting destructive, transient, or session-specific commands
_DESTRUCTIVE_CMDS = re.compile(
    r"\b(rm|dd|mkfs|wipefs|fdisk|parted|truncate|format|shutdown|reboot|poweroff|halt|"
    r"sudo|pkexec|su|doas)\b",
    re.IGNORECASE,
)
_DESTRUCTIVE_GIT = re.compile(
    r"\bgit\s+(?:clean|reset\s+--hard|checkout\s+--|push\s+.*--force)\b",
    re.IGNORECASE,
)
_TEMP_PATHS = re.compile(
    r"(?:^|[\s\"'=])(?:/tmp/|/var/tmp/|/dev/shm/|/proc/|/sys/|/run/user/|~?/\.cache/|[^\s]+\.(?:tmp|bak|swp)\b|scratch\.)",
    re.IGNORECASE,
)
_KILL_PID = re.compile(
    r"\b(?:kill|pkill)\s+(?:-[a-z0-9]+\s+)?\d{2,7}\b",
    re.IGNORECASE,
)


def is_promotable_recipe(data: dict[str, Any] | RecipeSkill) -> tuple[bool, str]:
    """Validate that a candidate skill recipe is safe and general enough to persist.

    Rejects hardcoded PIDs, destructive file operations, temporary /tmp paths,
    and dangerous system commands.
    """
    if isinstance(data, RecipeSkill):
        command = data.command
    elif isinstance(data, dict):
        command = data.get("command", [])
        if isinstance(command, str):
            import shlex

            command = shlex.split(command)
    else:
        return False, "invalid recipe structure"

    if not command:
        return False, "empty command"

    cmd_str = " ".join(str(c) for c in command)

    # 1. Reject high risk commands from safety patterns
    for pattern in HIGH_PATTERNS:
        if pattern.search(cmd_str):
            return False, f"matches high-risk pattern: {pattern.pattern}"

    # 2. Reject destructive operations
    if _DESTRUCTIVE_CMDS.search(cmd_str):
        return False, f"destructive executable in command: {cmd_str}"

    if _DESTRUCTIVE_GIT.search(cmd_str):
        return False, f"destructive git operation: {cmd_str}"

    # 3. Reject hardcoded PIDs
    if _KILL_PID.search(cmd_str):
        return False, f"hardcoded process ID in kill command: {cmd_str}"

    head = str(command[0]).lower() if command else ""
    if head in ("kill", "pkill"):
        for arg in command[1:]:
            arg_str = str(arg).strip()
            # Standalone numeric argument without curly braces (i.e. not a template parameter {pid})
            if re.match(r"^\d{2,7}$", arg_str):
                return False, f"hardcoded PID {arg_str} in {head}"

    # 4. Reject temporary / ephemeral paths
    for arg in command:
        arg_str = str(arg)
        if _TEMP_PATHS.search(arg_str):
            return False, f"hardcoded temporary or ephemeral path: {arg_str}"

    return True, "ok"


@dataclass
class RecipeSkill:
    name: str
    description: str
    patterns: list[str]
    command: list[str]
    kind: str = "action"
    risk: Risk = Risk.MEDIUM
    response: str = ""
    params: list[str] = field(default_factory=list)
    source: str = "promoted"
    order: int = 70
    _compiled: list[re.Pattern[str]] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self._compiled = [re.compile(p, re.IGNORECASE) for p in self.patterns]

    def match(self, text: str) -> dict[str, Any] | None:
        for regex in self._compiled:
            m = regex.search(text)
            if m:
                return {"groups": m.groupdict(), "group": m.groups()}
        return None

    def _command(self, values: dict[str, Any]) -> list[str]:
        command = [part.replace("~", str(Path.home())) for part in self.command]
        if values:
            command = [_substitute(part, values) for part in command]
        return command

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        values = args.get("params") if isinstance(args, dict) else None
        command = self._command(values or {})
        effective = max_risk(self.risk, classify_command(command))
        if not ctx.dry_run:
            code, out, err = ctx.run_command(command, timeout=60)
            if code != 0:
                return SkillResult(
                    text=err.strip() or f"Command failed ({code}).",
                    action=self.name,
                    command=command,
                    risk=effective,
                )
            if not self.response and out.strip():
                self.response = out.strip()
        return SkillResult(
            text=self.response or f"Ran {self.name}.",
            action=self.name,
            command=command,
            risk=effective,
        )


def _substitute(part: str, values: dict[str, Any]) -> str:
    out = part
    for key, value in values.items():
        out = out.replace("{" + str(key) + "}", str(value))
    return out


def recipe_from_dict(data: dict[str, Any]) -> RecipeSkill | None:
    if not REQUIRED_FIELDS.issubset(data):
        return None
    patterns = data.get("patterns")
    command = data.get("command")
    if not isinstance(patterns, list) or not patterns:
        return None
    if not isinstance(command, (list, str)):
        return None
    if isinstance(command, str):
        import shlex

        command = shlex.split(command)
    risk_value = str(data.get("risk", "medium")).lower()
    risk = Risk(risk_value) if risk_value in VALID_RISK else Risk.MEDIUM
    params = data.get("params", [])
    if not isinstance(params, list):
        params = []
    try:
        return RecipeSkill(
            name=str(data["name"]),
            description=str(data.get("description", data["name"])),
            patterns=[str(p) for p in patterns],
            command=[str(c) for c in command],
            kind=str(data.get("kind", "action")),
            risk=risk,
            response=str(data.get("response", "")),
            params=[str(p) for p in params],
        )
    except (re.error, ValueError):
        return None


def load_recipes(skills_dir: Path) -> list[RecipeSkill]:
    skills: list[RecipeSkill] = []
    if not skills_dir.exists():
        return skills
    for path in sorted(skills_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        skill = recipe_from_dict(data)
        if skill is not None:
            skills.append(skill)
    return skills


def save_recipe(skills_dir: Path, data: dict[str, Any]) -> Path | None:
    valid, _reason = is_promotable_recipe(data)
    if not valid:
        return None
    skill = recipe_from_dict(data)
    if skill is None:
        return None
    skills_dir.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-z0-9_-]+", "-", skill.name.lower()).strip("-") or "skill"
    path = skills_dir / f"{safe}.json"
    payload = {
        "name": skill.name,
        "description": skill.description,
        "patterns": skill.patterns,
        "command": skill.command,
        "kind": skill.kind,
        "risk": skill.risk.value,
        "response": skill.response,
        "params": skill.params,
    }
    path.write_text(json.dumps(payload, indent=2))
    return path
