"""Authoring/compiled ID namespace helpers.

Compiler-expanded nodes use ``b{beat}__gen__{parent}__{slot}``. The format is
strictly ``[A-Za-z0-9_]+`` so it is safe in unescaped CSS/GSAP selectors and
cannot collide across beats.
"""
from __future__ import annotations

import re

GENERATED = re.compile(r"^b(\d+)__gen__(.+)$")
AUTHORING = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
POOL = re.compile(r"[^A-Za-z0-9_]")


def generated_id(beat: int, parent: str, slot: str) -> str:
    parent, slot = POOL.sub("_", parent or ""), POOL.sub("_", slot or "")
    if beat < 0 or not parent or not slot:
        raise ValueError("generated IDs require a beat index and parent/slot")
    return f"b{beat}__gen__{parent}__{slot}"


def is_generated(value: str | None) -> bool:
    return bool(value and GENERATED.fullmatch(value))


def generated_for(beat: int, parent: str, value: str | None) -> bool:
    return bool(value and value.startswith(f"b{beat}__gen__{sanitize(parent)}__"))


def authoring_id(value: str | None) -> bool:
    """Model-authored IDs use this syntax and may not impersonate generated nodes."""
    return bool(value and AUTHORING.fullmatch(value) and not is_generated(value))


def sanitize(value: str) -> str:
    """Make an arbitrary string safe for an ID slot."""
    cleaned = POOL.sub("_", value or "")
    if not cleaned or cleaned[0].isdigit():
        cleaned = f"_{cleaned}"
    return cleaned


def provenance(compiled_id: str) -> dict | None:
    match = GENERATED.fullmatch(compiled_id or "")
    if not match:
        return None
    parent = match.group(2).rsplit("__", 1)[0]
    return {"beat": int(match.group(1)), "authoringId": parent}
