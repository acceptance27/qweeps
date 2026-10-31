"""QWEEPS Line DSL parser and lowering to AuthoringBeat.

Grammar (locked for the P4.5 smoke):
  beat <n>
  retain <id>, ...
  exit <id>, ...
  group <id> contains=[...] zone=<...>
  camera frame=[...] min_zoom=...
  @start | @cue:<name> [loop=... passes=... pass_duration=... items=[...]]
    show <id> [label="..."] [zone=...] dock=<pos>:<target> [align=...] [z=...]
    chart <id> type=bars|line|scatter data=[k:v, ...] [zone=...] dock=<pos>:<target> [axis=...]
    plot <id> on=<chart> at=<data-key>   # exact data-point placement
    link <id> from=<src> to=<dst> [style=...] [sign=+|-]
    focus <id> [item=...]
    move <id> to=<pos>:<target> [duration=...]
"""
from __future__ import annotations

import re
from typing import Any

from .geometry import chart_fractions, intersection_ratio
from .plan import PlanError

ZONES = {
    "left_top": (-3.4, 1.8), "center_top": (0, 1.8), "right_top": (3.4, 1.8),
    "left_mid": (-3.4, 0), "center_mid": (0, 0), "right_mid": (3.4, 0),
    "left_bottom": (-3.4, -1.8), "center_bottom": (0, -1.8), "right_bottom": (3.4, -1.8),
}
DEFAULT_SIZE = {"chart": (3.2, 1.5), "chip": (0.9, 0.4), "text": (1.6, 0.4),
                "box": (2.0, 1.0), "arrow": (1.0, 0.2), "group": (3.0, 1.0)}
GUTTER = 0.25
KIND_MAP = {"chip": "box", "group": "box", "link": "arrow", "chart": "svg"}
SAFE_X, SAFE_Y = 5.8, 2.6
MARKER_ROLES = {"marker", "marker_dot", "dot", "point", "sampled_output"}
# One-anchor direction cues are glyphs, not graph edges.
INDICATOR_ROLES = {"shift", "indicator", "emphasis", "trend", "direction",
                   "delta", "movement"}
GUIDE_ROLES = {"axis", "guide", "reference", "baseline", "rule"}
GUIDE_COLOR = "#5a6b7a"
CONTAINER_ROLES = {"panel", "stage", "canvas", "region", "zone", "frame", "board", "group"}
GLYPH = {"up": "↑", "down": "↓", "left": "←", "right": "→"}
DIRECTION_BY_DOCK = {"above": "up", "below": "down",
                     "left-of": "left", "right-of": "right", "inside": "down"}
KEYWORDS = {"beat", "retain", "exit", "group", "camera", "show", "chart",
            "link", "focus", "move", "plot"}
NORMALIZATIONS = ["fences", "separators", "list_commas", "cue_alias", "keyword_case"]


def _strip_fences(text: str) -> tuple[str, bool]:
    lines = text.splitlines()
    fenced = any(line.strip().startswith("```") for line in lines)
    return "\n".join(line for line in lines if not line.strip().startswith("```")), fenced


def _case_fold(line: str) -> tuple[str, bool]:
    parts = line.split(None, 1)
    if parts and parts[0].lower() in KEYWORDS and parts[0] != parts[0].lower():
        parts[0] = parts[0].lower()
        return " ".join(parts), True
    return line, False


HEADER_KEYS = {"loop", "passes", "pass_duration", "items"}
COMMAND_KEYS = {"dock", "align", "z", "from", "to", "style", "duration",
                "type", "axis", "item", "sign", "zone", "on", "at", "direction"}


def _kv(text: str, allowed: set[str]) -> tuple[dict, bool]:
    """Parse allowed key=value options; normalize ':' separators."""
    changed = False
    pairs = {}
    for match in re.finditer(r'([a-z_]+)([=:])(?:"([^"]*)"|([^,\s\]]+))', text):
        key, sep, quoted, bare = match.groups()
        if key in allowed:
            pairs[key] = quoted if quoted is not None else bare
            changed = changed or sep == ":"
    return pairs, changed


def _list_value(text: str, key: str) -> tuple[list[str], bool]:
    match = re.search(rf"{key}=\[([^\]]*)\]", text)
    if not match:
        return [], False
    body = match.group(1).strip()
    changed = False
    if body and "," not in body and ":" in body:
        body = re.sub(r"\s+(?=[a-zA-Z0-9_.-]+:)", ", ", body)
        changed = True
    return [item.strip() for item in body.split(",") if item.strip()], changed


def _pair(item: str) -> tuple[str, float]:
    if ":" not in item:
        raise PlanError(f"data item needs key:value, got '{item}'")
    key, value = item.split(":", 1)
    try:
        return key.strip(), float(value)
    except ValueError as exc:
        raise PlanError(f"invalid numeric value in '{item}'") from exc


def parse(text: str, cues: list[str] | None = None) -> dict:
    cues = cues or []
    raw, fenced = _strip_fences(text)
    used = []
    if fenced:
        used.append("fences")
    beat = None
    retain, exit_ids, groups, camera = [], [], [], {}
    blocks: list[dict] = []
    current = None
    separators = list_commas = alias = case = False
    for source in raw.splitlines():
        line = source.strip()
        if not line:
            continue
        line, folded = _case_fold(line)
        case = case or folded
        if line.startswith("@"):
            header = line[1:]
            if header.startswith("cue:"):
                name = header[4:].split()[0]
            else:
                name = header.split()[0]
                if name in cues:
                    alias = True
            if name != "start" and name not in cues:
                raise PlanError(f"unknown cue '{name}'")
            options, changed = _kv(line.split(None, 1)[1] if " " in line else "", HEADER_KEYS)
            separators = separators or changed
            current = {"cue": name, "options": options, "commands": []}
            blocks.append(current)
            continue
        keyword, _, rest = line.partition(" ")
        keyword = keyword.lower()
        if keyword == "beat":
            beat = rest.strip() or None
        elif keyword in {"retain", "exit"}:
            values = [part.strip() for part in rest.split(",") if part.strip()]
            (retain if keyword == "retain" else exit_ids).extend(values)
        elif keyword == "group":
            values, changed = _list_value(rest, "contains")
            list_commas = list_commas or changed
            options, changed = _kv(rest, {"zone"})
            groups.append({"id": rest.split()[0], "contains": values, **options})
        elif keyword == "camera":
            values, changed = _list_value(rest, "frame")
            list_commas = list_commas or changed
            options, changed = _kv(rest, {"min_zoom"})
            camera = {"frame": values, **options}
        elif keyword in {"show", "chart", "link", "focus", "move", "plot"}:
            if current is None:
                current = {"cue": "start", "options": {}, "commands": []}
                blocks.append(current)
            command = {"kind": keyword, "id": rest.split()[0] if rest else ""}
            values, changed = _list_value(rest, "data")
            list_commas = list_commas or changed
            options, changed = _kv(rest, COMMAND_KEYS)
            separators = separators or changed
            label = re.search(r'label="([^"]*)"', rest)
            command.update(options)
            if values:
                command["data"] = values
            if label:
                command["label"] = label.group(1)
            current["commands"].append(command)
    if beat is None:
        raise PlanError("DSL is missing a beat header")
    if separators:
        used.append("separators")
    if list_commas:
        used.append("list_commas")
    if alias:
        used.append("cue_alias")
    if case:
        used.append("keyword_case")
    order = [block["cue"] for block in blocks if block["cue"] != "start"]
    filtered = [cue for cue in order if cue in cues]
    if cues and filtered != [cue for cue in cues if cue in filtered]:
        raise PlanError("DSL cue order does not match narration order")
    return {"beat": beat, "retain": retain, "exit": exit_ids, "groups": groups,
            "camera": camera, "blocks": blocks, "normalizations": used}


def _norm(element: dict) -> dict:
    item = dict(element)
    item["kind"] = KIND_MAP.get(item.get("kind"), item.get("kind") or "box")
    if item.get("semanticRole") is None and item.get("role"):
        item["semanticRole"] = item["role"]
    return item


def _size(kind: str) -> tuple[float, float]:
    return DEFAULT_SIZE.get(kind, (2.0, 1.0))


def _clamp(value: float, limit: float) -> float:
    return max(-limit, min(limit, value))


def _plot_number(text) -> float | None:
    """Read a data key such as -1, 0.7, 0p7, z_m1 or z=1.0 as a number."""
    raw = str(text or "").strip().lower()
    if "=" in raw:
        raw = raw.rsplit("=", 1)[1]
    if "_" in raw:
        raw = raw.rsplit("_", 1)[1]
    raw = raw.replace("m", "-").replace("p", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _free_spot(x: float, y: float, width: float, height: float,
               placed: dict[str, dict], eid: str,
               command_kind: str = "box") -> tuple[float, float]:
    """Find the nearest free slot instead of stacking on a sibling.

    Connectors are not obstacles here: a label above an arrow is anchored to the
    line, and the segment-aware pass handles any actual crossing later.
    """
    def box(px: float, py: float, pw: float, ph: float) -> tuple[float, float, float, float]:
        return px - pw / 2, py - ph / 2, px + pw / 2, py + ph / 2

    def blocked(cx: float, cy: float) -> bool:
        for other in placed.values():
            if other.get("id") == eid or other.get("kind") in {"group", "arrow", "line"}:
                continue
            ratio = intersection_ratio(box(cx, cy, width, height),
                                       box(other.get("x", 0), other.get("y", 0),
                                           other.get("width", 2), other.get("height", 1)))
            # A shape being placed must not cover a label; a label may sit on a field.
            if ratio >= (0.3 if command_kind != "text" else 0.9):
                return True
        return False

    if not blocked(x, y):
        return x, y
    candidates = []
    # Two grids: a fine one for labels and a size-aware one so a large chart can
    # jump over an occupied band instead of nudging into it in small steps.
    coarse_x = max(width + GUTTER, 1.0)
    coarse_y = max(height + GUTTER, 0.6)
    for step in range(1, 7):
        for dx, dy in ((0, step * coarse_y), (step * coarse_x, 0),
                       (step * coarse_x, step * coarse_y)):
            candidates.extend([(x, y - dy), (x, y + dy), (x - dx, y), (x + dx, y),
                               (x + dx, y - dy), (x - dx, y - dy),
                               (x + dx, y + dy), (x - dx, y + dy)])
        fine = step * 0.5
        candidates.extend([(x, y - fine), (x, y + fine), (x - fine, y), (x + fine, y)])
    free = [(cx, cy) for cx, cy in candidates
            if abs(cx) + width / 2 <= SAFE_X + 0.2
            and abs(cy) + height / 2 <= SAFE_Y + 0.2 and not blocked(cx, cy)]
    if not free:
        raise PlanError(f"no free slot for '{eid}' near ({x:g}, {y:g}); "
                        "move it, exit something, or use a different beat")
    return min(free, key=lambda spot: (spot[0] - x) ** 2 + (spot[1] - y) ** 2)


def _place(command: dict, placed: dict[str, dict], avoid: bool = True) -> dict:
    element = dict(command)
    avoid = element.pop("avoid", avoid)
    kind = element.get("kind") or ("svg" if command["kind"] == "chart" else "box")
    width, height = element.get("width") or _size(kind)[0], element.get("height") or _size(kind)[1]
    role = element.get("semanticRole") or element.get("role") or ""
    if role in MARKER_ROLES and kind == "circle":
        width = element.get("width") or 0.55
        height = element.get("height") or 0.55
    if command["kind"] == "chart" or (command.get("kind") == "svg" and command.get("bars")):
        (width, height), kind = _size("chart"), "svg"
    dock = command.get("dock") or command.get("to")
    if dock and ":" in dock:
        mode, target_id = dock.split(":", 1)
        target = placed.get(target_id)
        if target is None:
            raise PlanError(f"element '{command['id']}' docks to unknown '{target_id}'")
        tx, ty = target.get("x", 0), target.get("y", 0)
        tw, th = target.get("width", 2), target.get("height", 1)
        gap = GUTTER
        if mode == "right-of":
            x, y = tx + tw / 2 + gap + width / 2, ty
        elif mode == "left-of":
            x, y = tx - tw / 2 - gap - width / 2, ty
        elif mode == "above":
            x, y = tx, ty + th / 2 + gap + height / 2
        elif mode == "below":
            x, y = tx, ty - th / 2 - gap - height / 2
        elif mode == "inside":
            host_role = str(target.get("semanticRole") or target.get("role") or "").lower()
            container = target.get("scaffold") or host_role in CONTAINER_ROLES
            if not container and (
                    width > tw or height > th
                    or element.get("kind") not in {None, "", "text"}):
                # A field bigger than its host is not a label; keep it beside
                # and let the free-slot search keep it clear of other objects.
                mode = "right-of"
                dock = f"right-of:{target_id}"
                x, y = tx + tw / 2 + gap + width / 2, ty
            elif target.get("label") and element.get("label"):
                mode = "below"
                dock = f"below:{target_id}"
                x, y = tx, ty - th / 2 - gap - height / 2
            else:
                x, y = tx, ty
        else:
            raise PlanError(f"unknown dock '{mode}'")
        anchor = placed.get(target_id) or {}
        if anchor.get("kind") in {"arrow", "line"} and mode in {"above", "below"}:
            source = placed.get(anchor.get("from")) or {}
            target_node = placed.get(anchor.get("to")) or {}
            if source and target_node:
                sx, sy = source.get("x", 0), source.get("y", 0)
                # Anchor the label to the source object so weights pair
                # unambiguously with their own input, not with the other arrow.
                x = sx
                offset = source.get("height", 1) / 2 + height / 2 + 0.1
                y = sy + offset if mode == "above" else sy - offset
        align = (command.get("align") or "").split(":", 1)[0]
        if align == "top":
            y = ty + th / 2 - height / 2
        elif align == "bottom":
            y = ty - th / 2 + height / 2
    elif "zone" in command:
        x, y = ZONES.get(command["zone"], ZONES["center_mid"])
    else:
        x, y = element.get("x", 0), element.get("y", 0)
    x, y = _clamp(x, SAFE_X), _clamp(y, SAFE_Y)
    if avoid and str(dock or "").split(":", 1)[0] != "inside" and command["kind"] != "group":
        x, y = _free_spot(x, y, width, height, placed, command["id"],
                          "text" if element.get("kind") == "text" else "shape")
    element.update({"id": command["id"], "kind": kind,
                    "label": command.get("label") or element.get("label", ""),
                    "x": round(_clamp(x, SAFE_X), 3), "y": round(_clamp(y, SAFE_Y), 3),
                    "width": width, "height": height,
                    "semanticRole": element.get("semanticRole")})
    return {key: value for key, value in element.items() if value is not None}


def _deoverlap(elements: dict[str, dict]) -> None:
    """Separate text labels deterministically; never leave two labels stacked."""
    texts = [element for element in elements.values() if element.get("kind") == "text"]
    for _ in range(4):
        changed = False
        for index, first in enumerate(texts):
            for second in texts[index + 1:]:
                first_box = (first["x"] - first["width"] / 2, first["y"] - first["height"] / 2,
                             first["x"] + first["width"] / 2, first["y"] + first["height"] / 2)
                second_box = (second["x"] - second["width"] / 2, second["y"] - second["height"] / 2,
                              second["x"] + second["width"] / 2, second["y"] + second["height"] / 2)
                if intersection_ratio(first_box, second_box) < 0.5:
                    continue
                moved = first["y"] - first["height"] / 2 - second["height"] / 2 - 0.08
                if moved < -SAFE_Y:
                    moved = first["y"] + first["height"] / 2 + second["height"] / 2 + 0.08
                second["y"] = round(max(-SAFE_Y, min(SAFE_Y, moved)), 3)
                changed = True
        if not changed:
            break


def lower(parsed: dict, state: dict[str, dict], registry: dict[str, dict],
          narration: str, cue_times: dict[str, float],
          title: str = "") -> dict:
    placed = {eid: _norm(element) for eid, element in state.items()}
    for eid in parsed["exit"]:
        placed.pop(eid, None)
    for eid in parsed["retain"]:
        if eid in state:
            placed[eid] = _norm(state[eid])
    elements: dict[str, dict] = {}
    for eid in parsed["retain"]:
        if eid in placed:
            elements[eid] = _norm(placed[eid])
    links = []
    deferred_links: list[tuple[dict, Any]] = []
    guide_hints: dict[str, str] = {}
    for block in parsed.get("blocks", []):
        for command in block.get("commands", []):
            if command.get("kind") != "show" or not command.get("label"):
                continue
            mode, _, target = str(command.get("dock") or "").partition(":")
            if mode in {"above", "below"}:
                guide_hints[target] = "horizontal"
            elif mode in {"left-of", "right-of"}:
                guide_hints[target] = "vertical"
    shown_here: dict[str, str] = {}
    for group in parsed.get("groups", []):
        gid = group["id"]
        base = _norm({"id": gid, "kind": "group", "label": group.get("label", ""),
                      "width": 3.6, "height": 2.0, "scaffold": True})
        zone = group.get("zone") or "center_mid"
        element = _place({**base, "zone": zone}, placed)
        element["revealAt"] = 0.0
        # Groups are layout scaffolding unless explicitly shown; children carry the visuals.
        placed[gid] = element
    def add_link(command: dict, anchor) -> bool:
        eid = command["id"]
        source, target = command.get("from"), command.get("to")
        existing = placed.get(eid)
        if (existing and existing.get("kind") in {"arrow", "line"}
                and existing.get("from") and existing.get("to")
                and (existing["from"], existing["to"]) != (source, target)):
            raise PlanError(
                f"connector '{eid}' already connects "
                f"'{existing['from']}' to '{existing['to']}'; do not rewire a "
                "retained connector. Label it or add a distinct connector.")
        for other in [*elements.values(), *placed.values()]:
            if (other.get("id") != eid and other.get("kind") in {"arrow", "line"}
                    and other.get("from") == source and other.get("to") == target):
                raise PlanError(
                    f"link '{eid}' duplicates connector '{other.get('id')}' between "
                    f"'{source}' and '{target}'; two straight connectors overlap. "
                    f"Label or restyle the existing connector instead.")
        if source not in placed or target not in placed:
            return False
        link_id = eid
        if link_id in elements and elements[link_id].get("kind") not in {"arrow", "line"}:
            suffix = 1
            while f"{eid}_link{suffix}" in elements:
                suffix += 1
            link_id = f"{eid}_link{suffix}"
        sign = str(command.get("sign") or "").lower()
        colour = {"+": "#0072B2", "positive": "#0072B2",
                  "-": "#D55E00", "negative": "#D55E00"}.get(sign, "#FFFF00")
        elements[link_id] = {"id": link_id, "kind": "arrow", "from": source, "to": target,
                             "semanticRole": registry.get(eid, {}).get("role"),
                             "label": command.get("label", ""),
                             "description": registry.get(eid, {}).get("description", ""),
                             "color": colour, "revealAt": anchor,
                             "drawDuration": 0.4, "entrance": "draw", "opacity": 1}
        source_box, target_box = placed[source], placed[target]
        elements[link_id].update({
            "x": round((source_box.get("x", 0) + target_box.get("x", 0)) / 2, 3),
            "y": round((source_box.get("y", 0) + target_box.get("y", 0)) / 2, 3),
            "width": round(abs(source_box.get("x", 0) - target_box.get("x", 0)) or 0.2, 3),
            "height": round(abs(source_box.get("y", 0) - target_box.get("y", 0)) or 0.2, 3)})
        placed[link_id] = dict(elements[link_id])
        links.append(link_id)
        return True

    for block in parsed["blocks"]:
        anchor = 0.0 if block["cue"] == "start" else f"with:cue.{block['cue']}"
        at = 0.0 if block["cue"] == "start" else cue_times.get(block["cue"], 0.0)
        for command in block["commands"]:
            eid = command["id"]
            if command["kind"] in {"show", "chart"}:
                label = command.get("label")
                if (command["kind"] == "show" and label is not None
                        and eid in shown_here and shown_here[eid] != label):
                    raise PlanError(
                        f"element '{eid}' is shown twice in one beat with different labels "
                        f"('{shown_here[eid]}' then '{label}'); one beat shows one label. "
                        "Use distinct elements for the before/after values or move the "
                        "change to the next beat.")
                if command["kind"] == "show" and label is not None:
                    shown_here[eid] = label
                base = _norm(dict(placed.get(eid) or registry.get(eid) or {}))
                declared = (registry.get(eid) or {}).get("kind") or base.get("kind")
                if (command["kind"] == "show" and declared in {"arrow", "line"}
                        and eid not in placed):
                    role = str((registry.get(eid) or {}).get("role")
                               or base.get("semanticRole") or "").lower()
                    requested = str(command.get("direction") or "").lower()
                    dock_mode, _, dock_target = str(command.get("dock") or "").partition(":")
                    dock_dir = DIRECTION_BY_DOCK.get(dock_mode, "")
                    if role in GUIDE_ROLES and not command.get("label"):
                        if requested in {"up", "down", "vertical"}:
                            orientation = "vertical"
                        elif requested in {"left", "right", "horizontal"}:
                            orientation = "horizontal"
                        else:
                            # A label above/below marks a horizontal rule; beside
                            # it marks a vertical one. Unlabelled guides default
                            # to a horizontal level.
                            orientation = guide_hints.get(eid, "horizontal")
                        host = placed.get(dock_target) or {}
                        if orientation == "horizontal":
                            width, height = host.get("width", 3.2) * 0.9, 0.08
                            points = [[-1, 0], [1, 0]]
                        else:
                            width, height = 0.08, host.get("height", 1.5) * 0.9
                            points = [[0, -1], [0, 1]]
                        base.update({"kind": "path", "points": points,
                                     "width": width, "height": height,
                                     "color": GUIDE_COLOR, "avoid": False,
                                     "x": host.get("x", 0), "y": host.get("y", 0)})
                        command = dict(command)
                        command.pop("dock", None)
                    elif command.get("label"):
                        # A labelled show of a connector id is a caption, not geometry.
                        base["kind"] = "text"
                    elif requested or role in INDICATOR_ROLES:
                        # A short one-anchor arrow is a direction glyph, not an edge.
                        direction = requested if requested in GLYPH else (dock_dir or "down")
                        base["kind"] = "text"
                        base["label"] = GLYPH[direction]
                        base.setdefault("width", 0.5)
                        base.setdefault("height", 0.5)
                    else:
                        raise PlanError(
                            f"element '{eid}' is a connector; use "
                            f"`link {eid} from=<src> to=<dst>` instead of show, "
                            f"or set direction=up|down|left|right for an indicator")
                if (command["kind"] == "show" and declared in {"path", "svg"}
                        and eid not in placed):
                    raise PlanError(
                        f"element '{eid}' is declared {declared}; draw it with "
                        f"`chart {eid} type=line data=[...]` or give it points")
                base.update({k: v for k, v in command.items() if k not in {"kind", "data"}})
                if command["kind"] == "chart":
                    base["kind"] = "svg"
                    base["chartType"] = command.get("type") or "bars"
                    base["bars"] = [dict(zip(("label", "value"), _pair(item))) for item in command.get("data", [])]
                element = _place(base, placed)
                element["revealAt"] = anchor
                elements[eid] = element
                placed[eid] = dict(element)
            elif command["kind"] == "link":
                if not add_link(command, anchor):
                    deferred_links.append((command, anchor))
            elif command["kind"] == "plot":
                chart = placed.get(command.get("on"))
                if not chart or not chart.get("bars"):
                    raise PlanError(f"plot '{eid}' needs a drawn chart with data")
                bars = chart["bars"]
                key = str(command.get("at") or "").strip()
                index = next((i for i, bar in enumerate(bars)
                              if str(bar.get("label")) == key), None)
                if index is None and "=" in key:
                    # "z=1.0" names the data point z_1 / 1 in the chart.
                    trimmed = key.rsplit("=", 1)[1].strip()
                    index = next((i for i, bar in enumerate(bars)
                                  if str(bar.get("label")) == trimmed), None)
                    key = trimmed
                if index is None:
                    wanted = _plot_number(key)
                    if wanted is not None:
                        index = next((i for i, bar in enumerate(bars)
                                      if _plot_number(bar.get("label")) == wanted), None)
                        if index is None:
                            index = next((i for i, bar in enumerate(bars)
                                          if abs(float(bar.get("value", 0)) - wanted) < 1e-9), None)
                if index is None:
                    keys = ", ".join(str(bar.get("label")) for bar in bars)
                    raise PlanError(f"plot '{eid}' names data key '{key}', which is not in "
                                    f"the chart (available keys: {keys})")
                value = float(bars[index].get("value", 0))
                x_at, y_at = chart_fractions(bars)
                px = (6.0 + 90.0 * x_at(index)) / 100.0
                py = (56.0 - 52.0 * y_at(value)) / 60.0
                base = _norm(dict(placed.get(eid) or registry.get(eid) or {}))
                base.update({k: v for k, v in command.items()
                             if k not in {"kind", "on", "at", "data"}})
                base.update({"x": chart["x"] - chart["width"] / 2 + px * chart["width"],
                             "y": chart["y"] + chart["height"] / 2 - py * chart["height"]})
                element = _place({**base, "id": eid, "kind": base.get("kind") or "circle"},
                                 placed, avoid=False)
                # A plotted element is a marker on a chart, never a node-sized shape.
                element["width"] = min(element.get("width", 0.55), 0.55)
                element["height"] = min(element.get("height", 0.55), 0.55)
                element["revealAt"] = anchor
                elements[eid] = element
                placed[eid] = dict(element)
            elif command["kind"] == "move":
                current = _norm({**placed.get(eid, {}), **elements.get(eid, {})})
                target = command.get("to", "")
                moved = _place({**current, "id": eid, "dock": target, "kind": current.get("kind")},
                               placed)
                elements[eid] = {**elements.get(eid, {}), "x": moved["x"], "y": moved["y"]}
                elements[eid].setdefault("kind", current.get("kind") or "box")
                placed[eid] = dict(elements[eid])
            elif command["kind"] == "focus":
                element = elements.get(eid)
                if element is not None:
                    element["emphasizeAt"] = round(at, 3)
    for command, anchor in deferred_links:
        if not add_link(command, anchor):
            unknown = [name for name in (command.get("from"), command.get("to"))
                       if name not in placed]
            raise PlanError(f"link '{command.get('id')}' connects unknown {unknown}; "
                            "show those elements before linking them")

    _deoverlap(elements)
    for element in elements.values():
        element.setdefault("description", registry.get(element["id"], {}).get("description", ""))
        element.setdefault("drawDuration", 0.4)
        element.setdefault("entrance", "write" if element.get("kind") == "text" else "draw")
        element.setdefault("opacity", 1)
    numeric = [e["revealAt"] for e in elements.values()
               if isinstance(e.get("revealAt"), (int, float)) and not isinstance(e.get("revealAt"), bool)]
    last = max(numeric + list(cue_times.values()) + [0])
    return {"title": title or f"Beat {parsed['beat']}", "narration": narration,
            "duration": round(max(8.0, last + 2.0), 2), "elements": list(elements.values())}
