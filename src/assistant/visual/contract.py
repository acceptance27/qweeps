"""Planner contract validation and per-beat director prompt assembly."""
from __future__ import annotations

import json
from typing import Any

from .plan import PlanError
from .timing import EFFECT_ROLES, PART_ROLES

DIGEST = (
    "Teach one new inference per beat. Show the whole before its parts, keep "
    "linked objects close, and let the visible change carry the claim. Reveal "
    "results only after the cue that selects them. Use one hue per semantic "
    "role; use focus, stroke and shape for emphasis. Prefer fewer, meaningful "
    "objects over many labels. Keep labels short and inside a gutter. Preserve "
    "retained IDs and positions across the boundary."
)

SCHEMA = """AuthoringBeat JSON:
{"beats":[{"title":"...","narration":"...","duration":12,
 "roleTable":{"role":"slot_0"},
 "loops":[{"id":"loop","t_start":"with:cue.x","passes":2,"passDuration":1.5}],
 "elements":[{"id":"stable_id","kind":"box|text|circle|arrow|line|path|svg",
   "label":"...","semanticRole":"role","focusState":"normal|highlight|muted|error",
   "x":0,"y":0,"width":2,"height":1,"revealAt":"with:cue.x","drawDuration":0.6,
   "bars":[{"label":"word","value":0.62}],"derivedFrom":"parent_id","parentId":"panel_id",
   "from":"id","to":"id"}],
 "links":[{"from":"id","to":"id"}]}]}
Use the contract's element IDs. Effect roles (sampled_output, prediction, result,
conclusion, transformed_state) MUST use "revealAt":"with:cue.<cue id>" or an
element anchor, never a number. Retained IDs keep their x/y/width/height."""


def validate_state_contract(contract: Any, beats: list[dict]) -> list[str]:
    """Return contract problems; empty means valid."""
    if not isinstance(contract, list) or len(contract) != len(beats):
        return ["stateContract must provide one entry per beat"]
    problems: list[str] = []
    prior_exit: set[str] = set()
    for index, (entry, beat) in enumerate(zip(contract, beats)):
        if not isinstance(entry, dict):
            problems.append(f"beat {index}: contract entry must be an object")
            continue
        if entry.get("beatId") != beat.get("id"):
            problems.append(f"beat {index}: beatId does not match the storyboard")
        extra = set(entry) - {"beatId", "retain", "mutate", "enter", "exit", "cameraIntent"}
        if extra:
            problems.append(f"beat {index}: unknown contract fields {sorted(extra)}")
        retain = entry.get("retain", [])
        mutate = entry.get("mutate", [])
        enter = entry.get("enter", [])
        exit_ids = entry.get("exit", [])
        for name, value in (("retain", retain), ("mutate", mutate), ("enter", enter), ("exit", exit_ids)):
            if not isinstance(value, list):
                problems.append(f"beat {index}: {name} must be a list")
        enter_ids = set()
        for item in enter:
            eid = item.get("id") if isinstance(item, dict) else item
            if not isinstance(eid, str):
                problems.append(f"beat {index}: enter entries need an id")
                continue
            if eid in enter_ids or eid in prior_exit:
                problems.append(f"beat {index}: duplicate entering id {eid}")
            enter_ids.add(eid)
            role = item.get("role") if isinstance(item, dict) else None
            if role in EFFECT_ROLES and not (isinstance(item, dict) and item.get("cue")):
                problems.append(f"beat {index}: effect role {role} needs a cue anchor")
            if role in PART_ROLES and not (isinstance(item, dict) and item.get("derivedFrom")):
                problems.append(f"beat {index}: part role {role} needs a derivedFrom parent")
        for item in mutate:
            eid = item.get("id") if isinstance(item, dict) else item
            if eid not in prior_exit:
                problems.append(f"beat {index}: mutate target {eid} was not present before")
            role = item.get("toRole") if isinstance(item, dict) else None
            if role in EFFECT_ROLES and not (isinstance(item, dict) and item.get("cue")):
                problems.append(f"beat {index}: effect mutation {eid} needs a cue anchor")
        for item in retain:
            eid = item.get("id") if isinstance(item, dict) else item
            if eid not in prior_exit:
                problems.append(f"beat {index}: retained id {eid} was not present before")
        prior_exit = (prior_exit - set(exit_ids)) | enter_ids
    return problems


def boundary_snapshot(scene: dict, index: int) -> dict:
    beat = scene["beats"][index]
    elements = [{"id": e.get("id"), "kind": e.get("kind"), "x": e.get("x"), "y": e.get("y"),
                 "width": e.get("width"), "height": e.get("height"),
                 "semanticRole": e.get("semanticRole"), "label": e.get("label"),
                 "from": e.get("from"), "to": e.get("to")}
                for e in beat.get("elements", [])]
    return {"beat": index, "camera": beat.get("camera"),
            "visualStart": beat.get("visualStart"), "visualEnd": beat.get("visualEnd"),
            "narrationAt": beat.get("narrationAt"), "cueTimes": beat.get("cueTimes", {}),
            "elements": elements}


def director_prompt(contract_entry: dict, boundary: dict) -> str:
    return "\n\n".join([
        DIGEST, SCHEMA,
        "Contract for this beat:\n" + json.dumps(contract_entry, ensure_ascii=False),
        "Boundary snapshot from the previous beat:\n" + json.dumps(boundary, ensure_ascii=False),
        "Return only one AuthoringBeat JSON object.",
    ])
