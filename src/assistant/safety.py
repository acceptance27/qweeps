from __future__ import annotations

import re
import shlex
from typing import Callable, Iterable

from .config import SafetyConfig
from .types import Risk

HIGH_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\brm\s+(-[a-z]*[rf][a-z]*\s+)+"),
    re.compile(r"\bmkfs(\.\w+)?\b"),
    re.compile(r"\bdd\s+.*\bof=/dev/"),
    re.compile(r"\bsudo\b"),
    re.compile(r"\bpkexec\b"),
    re.compile(r"\b(pacman|yay|paru)\b.*\s-[a-z]*[RS][a-z]*\b"),
    re.compile(r"\bsystemctl\b"),
    re.compile(r"\b(shutdown|reboot|poweroff|halt)\b"),
    re.compile(r">\s*/dev/[ns]d"),
    re.compile(r":\(\)\s*\{.*\}\s*;"),
    re.compile(r"\bchmod\s+(-R\s+)?777\b"),
    re.compile(r"\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b"),
    re.compile(r"\bgit\s+push\b.*--force"),
    re.compile(r"\b(truncate|wipefs|fdisk|parted)\b"),
]

MEDIUM_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(mv|cp|rm|chmod|chown|ln|tee)\b"),
    re.compile(r"\b(mkdir|touch|install|git\s+(commit|push|checkout|reset))\b"),
    re.compile(r"\b(npm|pip|pipx|cargo|go)\s+(install|add|remove)\b"),
    re.compile(r"\bsystemctl\s+--user\b"),
]

ACTION_VERBS = re.compile(
    r"\b(open|launch|start|run|set|create|make|build|compile|delete|remove|install|"
    r"uninstall|add|move|copy|rename|edit|write|send|play|pause|stop|kill|"
    r"check|inspect|search|find|remind|timer|schedule|change|configure|enable|disable|update|upgrade|"
    r"generate|animate|illustrate|diagram|render|draw|fix|solve|repair)\b",
    re.IGNORECASE,
)

# Dispatch words that mean "have the Interns do this", plus research-style tasks.
# These don't end in "?" and aren't covered by ACTION_VERBS, but they clearly
# ask for work to be done rather than a question answered.
INTERN_HINT = re.compile(r"\b(interns?|agents?|hands|opencode|antigravity|\bagy\b)\b", re.IGNORECASE)
RESEARCH_HINT = re.compile(
    r"\b(research|investigate|look\s*up|find\s*out|search|study|compare|"
    r"summari[sz]e|draft|write\s+up|report\s+on|dig\s+into)\b",
    re.IGNORECASE,
)


def classify_command(command: Iterable[str] | str) -> Risk:
    text = command if isinstance(command, str) else " ".join(command)
    for pattern in HIGH_PATTERNS:
        if pattern.search(text):
            return Risk.HIGH
    for pattern in MEDIUM_PATTERNS:
        if pattern.search(text):
            return Risk.MEDIUM
    return Risk.LOW


def classify_text(text: str) -> Risk:
    return classify_command(text)


_RISK_ORDER = {Risk.LOW: 0, Risk.MEDIUM: 1, Risk.HIGH: 2}


def max_risk(*risks: Risk) -> Risk:
    return max(risks, key=lambda r: _RISK_ORDER.get(r, 0))


# A polite spoken command phrased as a question ("can you close firefox?").
# Only OS-style verbs count, so "can you write a poem?" stays a question.
POLITE_COMMAND = re.compile(
    r"^\s*(?:hey\s+\w+[,\s]+)?(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?"
    r"(?:go\s+(?:and\s+)?)?"
    r"(open|launch|start|run|close|quit|kill|install|uninstall|delete|remove|move|copy|rename|set|"
    r"turn|toggle|enable|disable|restart|update|upgrade|play|pause|stop|mute|unmute|check|download|"
    r"clean|clear|organi[sz]e|empty|free\s+up|take\s+a\s+screenshot|screenshot|"
    r"generate|create|make|build|animate|illustrate|diagram|render|draw|fix|solve|repair)\b",
    re.IGNORECASE,
)


def looks_like_action(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if POLITE_COMMAND.search(stripped):
        return True
    if stripped.endswith("?"):
        return False
    if ACTION_VERBS.search(stripped):
        return True
    if INTERN_HINT.search(stripped):
        return True
    return bool(RESEARCH_HINT.search(stripped))


def is_allowlisted(command: Iterable[str] | str, allowlist: Iterable[str]) -> bool:
    if not allowlist:
        return False
    tokens = shlex.split(command) if isinstance(command, str) else list(command)
    if not tokens:
        return False
    head = tokens[0]
    for entry in allowlist:
        entry_head = shlex.split(entry)[0] if entry.strip() else entry
        if head == entry or head == entry_head:
            return True
    return False


def requires_confirmation(
    risk: Risk,
    cfg: SafetyConfig,
    command: Iterable[str] | str | None = None,
) -> bool:
    if risk.value not in cfg.confirm_risk:
        return False
    if command is not None and is_allowlisted(command, cfg.allowlist):
        return False
    return True


Confirmer = Callable[[str], bool]


def auto_confirmer(answer: bool) -> Confirmer:
    return lambda _prompt: answer


def stdin_confirmer(prompt: str) -> bool:
    try:
        reply = input(f"{prompt} [y/N] ").strip().lower()
    except EOFError:
        return False
    return reply in {"y", "yes"}
