from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# Desktop tools the LLM planner can choose from. Each maps to a local command.
# This mirrors OMA's approach: understand the request, then call a tool - rather
# than pattern-matching every phrasing (and every speech-to-text mishear).
TOOLS: list[dict[str, Any]] = [
    {"name": "focus_workspace", "desc": "Switch to a numbered workspace", "params": ["number"]},
    {"name": "move_window_to_workspace", "desc": "Move the focused window to a numbered workspace", "params": ["number"]},
    {"name": "next_workspace", "desc": "Go to the next workspace"},
    {"name": "prev_workspace", "desc": "Go to the previous workspace"},
    {"name": "toggle_fullscreen", "desc": "Toggle fullscreen for the focused window"},
    {"name": "toggle_floating", "desc": "Toggle floating for the focused window"},
    {"name": "close_window", "desc": "Close the focused window"},
    {"name": "toggle_scratchpad", "desc": "Toggle the scratchpad (a special workspace)"},
    {"name": "toggle_bar", "desc": "Show or hide the top bar"},
    {"name": "toggle_nightlight", "desc": "Toggle night light"},
    {"name": "focus_window", "desc": "Focus a window by its title or app name. Use index when several match ('first', 'second', 'last' or a number).", "params": ["description", "index"]},
    {"name": "select_tile", "desc": "Focus the Nth tiled window on the current workspace, counting left-to-right then top-to-bottom ('tile 1', 'the second tile').", "params": ["number"]},
    {"name": "close_tile", "desc": "Close the Nth tiled window on the current workspace.", "params": ["number"]},
    {"name": "list_windows", "desc": "List the open windows on the current workspace, with their titles."},
    {"name": "type_text", "desc": "Type literal text into the focused window (the exact text to type)", "params": ["text"]},
    {"name": "read_app", "desc": "List the interactive elements (buttons, links, fields) of the focused app by their accessible name."},
    {"name": "invoke_element", "desc": "Press/click a control in the focused app by its accessible name (e.g. 'Save', 'Search', 'Next').", "params": ["name"]},
    {"name": "set_field", "desc": "Type text into a field in the focused app, identified by its accessible name.", "params": ["name", "text"]},
    {"name": "new_window", "desc": "Open a new window of the default browser"},
    {"name": "press_key", "desc": "Press a key or combination: 'enter', 'escape', 'tab', 'ctrl+t', 'ctrl+l', 'ctrl+w', 'alt+tab', 'ctrl+shift+t'", "params": ["keys"]},
    {"name": "open_url", "desc": "Open a full https URL in the browser.", "params": ["url"]},
    {"name": "web_search", "desc": "Search a site for a query. site: google, wikipedia, youtube, youtube music, github, maps.", "params": ["query", "site"]},
    {"name": "open_site", "desc": "Open a website's home page when no query is given. site: google, wikipedia, youtube, youtube music, github, maps, gmail, reddit, x.", "params": ["site"]},
    {"name": "volume", "desc": "Change system volume: 'up', 'down', 'mute', or a percent like '40'", "params": ["action"]},
    {"name": "media", "desc": "Control media playback: 'play', 'pause', 'play-pause', 'next', 'previous', 'stop'", "params": ["action"]},
]

_MEDIA = {"play": "play", "pause": "pause", "toggle": "play-pause", "play-pause": "play-pause",
          "next": "next", "skip": "next", "previous": "previous", "prev": "previous",
          "back": "previous", "stop": "stop"}

_SITES = {
    "google": "https://www.google.com/search?q={q}",
    "wikipedia": "https://en.wikipedia.org/wiki/Special:Search?search={q}",
    "youtube": "https://www.youtube.com/results?search_query={q}",
    "youtube music": "https://music.youtube.com/search?q={q}",
    "ytmusic": "https://music.youtube.com/search?q={q}",
    "github": "https://github.com/search?q={q}",
    "maps": "https://www.google.com/maps/search/{q}",
}

_SITE_HOME = {
    "google": "https://www.google.com",
    "wikipedia": "https://en.wikipedia.org",
    "youtube": "https://www.youtube.com",
    "youtube music": "https://music.youtube.com",
    "ytmusic": "https://music.youtube.com",
    "github": "https://github.com",
    "maps": "https://maps.google.com",
    "gmail": "https://mail.google.com",
    "reddit": "https://www.reddit.com",
    "x": "https://x.com",
}


def open_site_command(site: str) -> tuple[list[str], str] | None:
    key = (site or "").strip().lower()
    url = _SITE_HOME.get(key)
    if not url:
        return None
    return ["omarchy-launch-webapp", url], f"Opening {key}."

_KEYMAP = {"enter": "Return", "return": "Return", "escape": "Escape", "esc": "Escape",
           "tab": "Tab", "space": "space", "backspace": "BackSpace", "delete": "Delete",
           "up": "Up", "down": "Down", "left": "Left", "right": "Right",
           "home": "Home", "end": "End", "pageup": "Prior", "pagedown": "Next"}
_MODMAP = {"ctrl": "ctrl", "control": "ctrl", "alt": "alt", "shift": "shift",
           "super": "logo", "meta": "logo", "cmd": "logo", "win": "logo"}

# Loose gate: does the request even mention something desktop-ish? Used to decide
# whether it's worth asking the planner at all.
_GATE = re.compile(
    r"\b(work\s*space|4x\s*space|workspace|space|desktop|monitor|screen|view|window|"
    r"full\s*screen|fullscreen|maximi[sz]e|float|floating|scratchpad|"
    r"night\s*light|nightlight|top\s+bar|the\s+bar|type|focus|click|press|key|"
    r"volume|mute|louder|quieter|url|website|browser|search|google|wikipedia|youtube|"
    r"pause|play|next|previous|prev|skip|track|song|music|media|"
    r"tile|window|windows|select|list|new|element|elements|button|field|link|control)\b",
    re.IGNORECASE,
)

_NUMWORDS = {"one": "1", "two": "2", "too": "2", "tool": "2", "three": "3", "four": "4",
             "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
             "ten": "10", "zero": "10"}


def looks_like_desktop(text: str) -> bool:
    return bool(_GATE.search(text or ""))


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()


def load_learned(path: str | Path) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_learned(path: str | Path, phrase: str, tools: list) -> None:
    """Remember a phrasing the planner had to resolve, so it's a fast-path hit next time."""
    key = normalize(phrase)
    if not key:
        return
    try:
        data = load_learned(path)
        data[key] = tools
        Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError:
        pass


def normalise_number(value: Any) -> str:
    s = str(value).strip().lower()
    if s in _NUMWORDS:
        return _NUMWORDS[s]
    match = re.search(r"\d+", s)
    return match.group(0) if match else s


def _disp(expr: str) -> list[str]:
    return ["hyprctl", "dispatch", expr]


def key_command(spec: str) -> list[str] | None:
    parts = [p.strip().lower() for p in re.split(r"[+\-]", spec or "") if p.strip()]
    if not parts:
        return None
    key = parts[-1]
    mods = parts[:-1]
    cmd = ["wtype"]
    for mod in mods:
        cmd += ["-M", _MODMAP.get(mod, mod)]
    cmd += ["-k", _KEYMAP.get(key, key)]
    for mod in reversed(mods):
        cmd += ["-m", _MODMAP.get(mod, mod)]
    return cmd


def volume_command(action: str) -> tuple[list[str], str] | None:
    a = (action or "").strip().lower()
    if a in ("up", "raise", "louder", "increase"):
        return ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%+"], "Turning it up."
    if a in ("down", "lower", "quieter", "decrease"):
        return ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", "5%-"], "Turning it down."
    if a in ("mute", "unmute", "toggle"):
        return ["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"], "Toggling mute."
    match = re.search(r"\d{1,3}", a)
    if match:
        level = min(int(match.group(0)), 150)
        return ["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{level}%"], f"Setting volume to {level}%."
    return None


def execute(tool: str, args: dict[str, Any] | None = None) -> tuple[list[str], str] | None:
    """Map a (tool, args) pair to a command and a spoken reply, or None."""
    args = args or {}
    if tool == "focus_workspace":
        n = normalise_number(args.get("number"))
        return _disp(f'hl.dsp.focus({{ workspace = "{n}" }})'), f"Switching to workspace {n}."
    if tool == "move_window_to_workspace":
        n = normalise_number(args.get("number"))
        return _disp(f'hl.dsp.window.move({{ workspace = "{n}" }})'), f"Moving this window to workspace {n}."
    if tool == "next_workspace":
        return _disp('hl.dsp.focus({ workspace = "e+1" })'), "Next workspace."
    if tool == "prev_workspace":
        return _disp('hl.dsp.focus({ workspace = "e-1" })'), "Previous workspace."
    if tool == "toggle_fullscreen":
        return _disp('hl.dsp.window.fullscreen({ mode = "fullscreen" })'), "Toggling fullscreen."
    if tool == "toggle_floating":
        return _disp('hl.dsp.window.float({ action = "toggle" })'), "Toggling floating."
    if tool == "close_window":
        return _disp("hl.dsp.window.close()"), "Closing the window."
    if tool == "toggle_scratchpad":
        return _disp('hl.dsp.workspace.toggle_special("scratchpad")'), "Toggling the scratchpad."
    if tool == "toggle_bar":
        return ["omarchy", "toggle", "bar"], "Toggling the bar."
    if tool == "toggle_nightlight":
        return ["omarchy", "toggle", "nightlight"], "Toggling night light."
    if tool == "new_window":
        return ["qweeps-newwindow"], "Opening a new browser window."
    if tool == "focus_window":
        desc = str(args.get("description") or args.get("window") or "").strip()
        if not desc:
            return None
        index = str(args.get("index") or "1").strip().lower()
        if index in ("last", "second", "third", "fourth", "fifth", "first"):
            index = {"last": "last", "second": "2", "third": "3", "fourth": "4", "fifth": "5", "first": "1"}[index]
        return ["qweeps-focus", desc, index], f"Focusing {desc}."
    if tool == "select_tile":
        n = normalise_number(args.get("number"))
        return ["qweeps-tile", n], f"Selecting tile {n}."
    if tool == "close_tile":
        n = normalise_number(args.get("number"))
        return ["qweeps-tile", "close", n], f"Closing tile {n}."
    if tool == "list_windows":
        return ["qweeps-windows"], "Listing your windows."
    if tool == "type_text":
        text = str(args.get("text") or args.get("content") or "")
        if not text:
            return None
        # Type the text, then submit it (the user expects Enter). Use $1 so the
        # text is never interpreted as shell.
        return [
            "sh",
            "-c",
            'wtype -- "$1"; wtype -k Return',
            "_",
            text,
        ], "Typing it."
    if tool == "read_app":
        return ["qweeps-a11y", "list"], "Reading the app."
    if tool == "invoke_element":
        name = str(args.get("name") or args.get("element") or args.get("text") or "").strip()
        if not name:
            return None
        return ["qweeps-a11y", "click", name], f"Pressing {name}."
    if tool == "set_field":
        name = str(args.get("name") or args.get("field") or "").strip()
        text = str(args.get("text") or args.get("value") or args.get("content") or "")
        if not name:
            return None
        return ["qweeps-a11y", "type", name, text], f"Typing into {name}."
    if tool == "press_key":
        keys = str(args.get("keys") or args.get("key") or "").strip()
        cmd = key_command(keys)
        return (cmd, f"Pressing {keys}.") if cmd else None
    if tool == "open_url":
        url = str(args.get("url") or "").strip()
        if not url:
            return None
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        return ["omarchy-launch-webapp", url], "Opening it."
    if tool == "web_search":
        from urllib.parse import quote_plus

        query = str(args.get("query") or args.get("text") or "").strip()
        if not query:
            return None
        site = str(args.get("site") or "google").strip().lower()
        template = _SITES.get(site, _SITES["google"])
        return ["omarchy-launch-webapp", template.format(q=quote_plus(query))], f"Searching {site} for {query}."
    if tool == "open_site":
        return open_site_command(str(args.get("site") or args.get("name") or ""))
    if tool == "volume":
        return volume_command(str(args.get("action") or args.get("value") or ""))
    if tool == "media":
        action = _MEDIA.get(str(args.get("action") or "").strip().lower())
        return (["playerctl", action], f"{action.replace('-', ' ').capitalize()}.") if action else None
    return None
