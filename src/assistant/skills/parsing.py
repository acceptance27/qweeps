from __future__ import annotations

import re
from typing import Any


DURATION_UNITS = {
    "second": 1,
    "seconds": 1,
    "sec": 1,
    "secs": 1,
    "s": 1,
    "minute": 60,
    "minutes": 60,
    "min": 60,
    "mins": 60,
    "m": 60,
    "hour": 3600,
    "hours": 3600,
    "hr": 3600,
    "hrs": 3600,
    "h": 3600,
}

_NUM_WORDS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "ninety": 90,
}

_COMPONENT = re.compile(
    r"(\d+(?:\.\d+)?|[a-z]+)\s*"
    r"(seconds?|secs?|minutes?|mins?|hours?|hrs?|s|m|h)\b",
    re.IGNORECASE,
)


def _value(token: str) -> float | None:
    token = token.lower()
    if re.fullmatch(r"\d+(?:\.\d+)?", token):
        return float(token)
    return _NUM_WORDS.get(token)


def parse_duration(text: str) -> int | None:
    total = 0.0
    found = False
    for amount, unit in _COMPONENT.findall(text):
        value = _value(amount)
        if value is None:
            continue
        total += value * DURATION_UNITS.get(unit.lower(), 0)
        found = True
    if not found:
        return None
    return int(round(total))


def _drop_valid_component(match: re.Match[str]) -> str:
    if _value(match.group(1)) is None:
        return match.group(0)
    return " "


def strip_duration_phrase(text: str) -> str:
    cleaned = _COMPONENT.sub(_drop_valid_component, text)
    cleaned = re.sub(r"\b(in|for|at|about)\b", " ", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip(" ,.")


def parse_message(text: str, verbs: list[str]) -> str:
    lowered = text
    for verb in verbs:
        lowered = re.sub(rf"\b{verb}\b", " ", lowered, flags=re.IGNORECASE)
    return strip_duration_phrase(lowered).strip(" ,.")
