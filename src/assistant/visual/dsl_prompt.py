"""Cue extraction and per-beat prompt assembly for the Line DSL director."""
from __future__ import annotations

import re
from typing import Any

CUE = re.compile(r"\[cue:([a-z0-9_]+)\]")

SYSTEM = ("You are QWEEPS' per-beat visual director. This is a non-interactive text "
          "completion: there is no plan mode, no build mode and no permission to ask for. "
          "Never explain, never propose a plan, never mention agents or modes. Return only "
          "raw QWEEPS Line DSL lines: no Markdown fences, no prose, no coordinates, no "
          "colours, no roles. Your first line must start with `beat `.")

CUE_ADDENDUM = """
In every beat's narration, insert [cue:id] tags immediately before the word where
a visual change should happen. Cue ids match [a-z0-9_]+ and must be unique within
the beat. Use 2–4 cues per beat; each visual command must be grouped under one of
them. Do not promise colours, line styles or thickness in the narration unless the
role table declares distinct roles for them; when the sign of a weight matters,
say so plainly (the director encodes it with sign=+/-).
"""

GRAMMAR = """GRAMMAR:
  beat <n>
  retain <id>, ...
  exit <id>, ...
  group <id> contains=[...] zone=<left|center|right>_<top|mid|bottom>
  camera frame=[...] min_zoom=0.80
  @start | @cue:<name> [loop=<id> passes=<n> pass_duration=<s> items=[...]]
    show <id> [label="<text>"] [zone=<left|center|right>_<top|mid|bottom>] dock=<right-of|left-of|above|below|inside>:<target> [align=<top|mid|bottom|baseline>:<target>] [direction=<up|down|left|right|horizontal|vertical>] [z=<back|base|front|overlay>]
    chart <id> type=<bars|line|scatter> data=[<key>:<val>, ...] [zone=<left|center|right>_<top|mid|bottom>] dock=<pos>:<target> [axis=<id>]
      # use plain numeric keys (-1:0.27, 0:0.5, 0.7:0.7); plot at=<key> must be one of them
    plot <id> on=<chart-id> at=<data-key> [label="<text>"]
    link <id> from=<src> to=<dst> [style=solid|dashed|arc_top|flow] [sign=+|-]
    focus <id> [item=<sub_key>]
    move <id> to=<pos>:<target> [duration=<sec>]
RULES:
  1. Prefer IDs from ACTIVE ON CANVAS or REGISTRY. If the narration names an
     object the registry does not list, introduce a new stable ID and show it.
  2. Emit @cue headers in the exact order of the narration tags.
  3. Never emit coordinates, hex colours or role declarations.
  4. Use sign=+/- on a weight arrow when the narration says sign matters;
     the compiler assigns a colourblind-safe positive/negative colour.
  5. Never duplicate an existing object as `_case2`/`_v2` in the same beat.
     Change the existing object with move or a new label, or leave the new case
     for the next beat.
  6. When the narration changes a value, relabel every retained readout that
     still shows the old value (input, product, sum, output) in the same cue.
     Put markers and tick labels on the curve with `plot <id> on=<chart> at=<key>`.
  7. Never draw a second connector between the same two elements; two straight
     connectors overlap. Label or restyle the existing connector instead
     (`link flow_x1 from=a to=b label="w1=+0.8" sign=+`).
  8. An arrow/line is an edge and must be created with `link` (two endpoints).
     A one-anchor direction cue (the bar drops, a trend) is `show <id>
     dock=... direction=down`; it renders as a short glyph, not an edge.
     Axes and reference guides are `show <id> dock=inside:<panel>
     direction=horizontal|vertical`; they render as guide lines.
  9. Never show the same id twice in one beat with different labels: one beat
     renders one label per element. Describe a change with a new annotation
     element (e.g. `show note_x2 label="x2 larger"`) and keep numeric readouts
     stable; put a true before/after value swap in separate beats."""


def ensure_cues(narration: str) -> tuple[str, dict[str, float]]:
    """Return narration with at least one cue, plus synthetic cue times."""
    text = narration or ""
    if not CUE.search(text):
        text = "[cue:start] " + text
    times: dict[str, float] = {}
    index = 0
    for token in text.split():
        for match in CUE.finditer(token):
            times.setdefault(match.group(1), round(0.4 + index * 0.38, 2))
        if not CUE.fullmatch(token):
            index += 1
    return text, times


def strip_cues(narration: str) -> str:
    return " ".join(CUE.sub("", narration or "").split())


def state_card(intent: dict, entry: dict, state: dict[str, dict], registry: dict[str, dict],
               previous: dict | None, narration: str) -> str:
    lines = ["PEDAGOGICAL ARC:"]
    if previous:
        lines.append(f'  prev_claim: "{previous.get("insight", "")}"')
        lines.append(f'  bridge: "{intent.get("reasoning", "")}"')
    lines.append(f'  target_claim: "{intent.get("insight", "")}"')
    lines.append(f'  open_question: "{intent.get("question", "")}"')
    lines.append("")
    lines.append("NARRATION (FIXED, bind visuals to these [cue:*] tags in order):")
    lines.append(f'  "{narration}"')
    lines.append("")
    lines.append("ACTIVE ON CANVAS (locked positions):")
    for eid, element in state.items():
        role = element.get("semanticRole") or ""
        kind = element.get("kind") or "box"
        lines.append(f"  {eid} (kind={kind}, role={role})")
    lines.append("")
    lines.append("REGISTRY AVAILABLE TO ENTER:")
    for eid, item in registry.items():
        role = item.get("role") or ""
        kind = item.get("kind") or "box"
        label = f', label="{item["label"]}"' if item.get("label") else ""
        lines.append(f"  {eid} (kind={kind}, role={role}{label})")
    return "\n".join(lines)


def director_prompt(intent: dict, entry: dict, state: dict[str, dict],
                    registry: dict[str, dict], previous: dict | None,
                    narration: str) -> str:
    card = state_card(intent, entry, state, registry, previous, narration)
    return "\n".join([
        f"Emit QWEEPS Line DSL for Beat {intent.get('id', '')}.",
        "Output ONLY the raw DSL lines—no Markdown fences, no explanation.",
        "", GRAMMAR, "", "--- STATE CARD ---", card,
        "--------------------------------",
        f"Beat number: {intent.get('id', '')}",
        "Every object named in the narration must appear in the DSL. If it is missing",
        "from the registry, introduce a new stable ID.",
        "Begin with `beat <number>`.",
    ])
