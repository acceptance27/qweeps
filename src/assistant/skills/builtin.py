from __future__ import annotations

import re
import shutil
from datetime import datetime
from typing import Any

from ..config import Config
from ..desktop import TOOLS, execute, load_learned, looks_like_desktop, normalize, save_learned
from ..timers import format_seconds
from ..types import Risk, SkillResult
from .base import SkillContext
from .parsing import parse_duration, parse_message

_LIVE_STT_URL = "http://127.0.0.1:5092/v1/audio/transcriptions"


def _live_stt() -> str | None:
    """Label the STT backend serving the always-listening mic path.

    The voice listener posts audio straight to a local Parakeet GPU service,
    bypassing cfg.stt (which only drives the CLI `listen` path). Report it only
    when that service actually answers, so status reflects reality.
    """
    import os
    import socket
    from urllib.parse import urlparse

    url = os.environ.get("QWEEPS_STT_URL", _LIVE_STT_URL)
    parsed = urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 5092
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return "local Parakeet GPU service"
    except OSError:
        return None


class TimeSkill:
    name = "time"
    description = "Tell the current time or date"
    kind = "query"
    order = 10
    patterns = ["what time", "what's the time", "what is the time", "what's the date",
                "what is the date", "what day is it", "current time", "current date"]

    _re = re.compile(
        r"\b(what(?:'s| is) the (time|date)|what time is it|what day is it|"
        r"current (time|date)|today'?s date)\b",
        re.IGNORECASE,
    )

    def match(self, text: str) -> dict[str, Any] | None:
        m = self._re.search(text)
        if not m:
            return None
        topic = (m.group(2) or m.group(3) or "").lower()
        return {"topic": topic}

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        now = datetime.now()
        topic = args.get("topic", "")
        if topic == "date":
            text = now.strftime("It's %A, %B %d, %Y.")
        elif topic == "time":
            text = now.strftime("It's %H:%M.")
        else:
            text = now.strftime("It's %H:%M on %A, %B %d.")
        return SkillResult(text=text)


class StopwatchSkill:
    name = "stopwatch"
    description = "Start, stop, or read a stopwatch"
    kind = "action"
    order = 20
    patterns = ["start a stopwatch", "stop the stopwatch", "stopwatch status"]

    _start = re.compile(r"\b(start|begin)\b.*\bstopwatch\b|\bstopwatch\b.*\bstart\b", re.IGNORECASE)
    _stop = re.compile(r"\b(stop|end)\b.*\bstopwatch\b", re.IGNORECASE)
    _status = re.compile(r"\b(stopwatch)\b.*\b(status|time|elapsed|duration)\b", re.IGNORECASE)

    def match(self, text: str) -> dict[str, Any] | None:
        if self._start.search(text):
            return {"action": "start"}
        if self._stop.search(text):
            return {"action": "stop"}
        if "stopwatch" in text.lower():
            return {"action": "status"}
        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        action = args["action"]
        timers = ctx.timers
        if timers is None:
            return SkillResult(text="Stopwatch isn't available.", action="stopwatch")
        if action == "start":
            timers.start_stopwatch()
            return SkillResult(text="Stopwatch started.", action="stopwatch")
        if action == "stop":
            elapsed = timers.stop_stopwatch()
            if elapsed is None:
                return SkillResult(text="No stopwatch running.", action="stopwatch")
            return SkillResult(text=f"Stopped at {format_seconds(elapsed)}.", action="stopwatch")
        elapsed = timers.stopwatch_elapsed()
        if elapsed is None:
            return SkillResult(text="No stopwatch running.", action="stopwatch")
        return SkillResult(text=f"Stopwatch: {format_seconds(elapsed)}.", action="stopwatch")


class TimerSkill:
    name = "timer"
    description = "Set a countdown timer"
    kind = "action"
    order = 30
    patterns = ["set a timer for 5 minutes", "timer for 30 seconds"]

    _re = re.compile(r"\b(timer|countdown)\b", re.IGNORECASE)

    def match(self, text: str) -> dict[str, Any] | None:
        if not self._re.search(text):
            return None
        seconds = parse_duration(text)
        if seconds is None or seconds <= 0:
            return {"seconds": None}
        label = parse_message(text, ["set", "start", "a", "timer", "for", "countdown"])
        return {"seconds": seconds, "label": label or "timer"}

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        seconds = args.get("seconds")
        if not seconds:
            return SkillResult(text="How long should the timer be?", action="timer")
        label = args.get("label") or "timer"
        if ctx.timers is not None:
            ctx.timers.start_timer(label, seconds, kind="timer")
        return SkillResult(
            text=f"Timer set for {format_seconds(seconds)}.",
            action="timer",
        )


class ReminderSkill:
    name = "reminder"
    description = "Remind you about something after a delay"
    kind = "action"
    order = 40
    patterns = ["remind me to call mom in 10 minutes"]

    _re = re.compile(r"\bremind\b", re.IGNORECASE)

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def match(self, text: str) -> dict[str, Any] | None:
        if not self._re.search(text):
            return None
        seconds = parse_duration(text)
        message = parse_message(
            text,
            ["remind", "me", "to", "that", "set", "a", "reminder", "for", "about"],
        )
        return {"seconds": seconds, "message": message or "reminder"}

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        seconds = args.get("seconds")
        message = args.get("message") or "reminder"
        if not seconds:
            return SkillResult(text=f"When should I remind you to {message}?", action="reminder")
        minutes = round(seconds / 60)
        if seconds >= 60 and shutil.which("omarchy"):
            code, _out, _err = ctx.run_command(
                ["omarchy", "reminder", str(minutes), message]
            )
            if code == 0:
                return SkillResult(
                    text=f"Reminder set for {minutes} minute{'s' if minutes != 1 else ''}: {message}.",
                    action="reminder",
                )
        if ctx.timers is not None:
            ctx.timers.start_timer(message, seconds, kind="reminder")
        return SkillResult(
            text=f"Reminder set for {format_seconds(seconds)}: {message}.",
            action="reminder",
        )


class RememberSkill:
    name = "remember"
    description = "Remember a fact for later"
    kind = "action"
    order = 50
    patterns = ["remember that I prefer dark mode"]

    _re = re.compile(r"^\s*(?:please\s+)?(?:remember)\b(?:\s+that)?\s+(.+)$", re.IGNORECASE)

    def match(self, text: str) -> dict[str, Any] | None:
        m = self._re.search(text.strip())
        if m:
            return {"fact": m.group(1).strip(" ,.")}
        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        fact = args.get("fact", "").strip()
        if not fact or ctx.memory is None:
            return SkillResult(text="What should I remember?", action="remember")
        added = ctx.memory.add_fact(fact)
        if added:
            return SkillResult(text=f"Got it, I'll remember: {fact}", action="remember")
        return SkillResult(text="I already had that one.", action="remember")


_LIST_Q = re.compile(r"\b(list|what|which|show|read)\b[^?]*\b(windows?|tiles?|open)\b", re.IGNORECASE)


class DesktopSkill:
    name = "desktop"
    description = "Control Omarchy windows, workspaces, and desktop settings by voice"
    kind = "action"
    order = 55
    patterns = ["move this window to workspace 3", "go to workspace 2",
                "make this fullscreen", "toggle floating", "close this window",
                "toggle the bar", "toggle night light", "toggle the scratchpad"]

    _WS_NUM = r"(\d+|one|two|too|tool|three|four|five|six|seven|eight|nine|ten|zero)"
    _WS_WORD = r"(?:work\s*space|4x\s*space|space|ws|desktop)"

    _WS_MOVE = re.compile(r"\b(?:move|send|throw|put)\s+(?:this|the|my)?\s*(?:window|it)\s+(?:over\s+)?to\s+(?:" + _WS_WORD + r"\s+)?" + _WS_NUM + r"\b", re.I)
    _WS_MOVE_DIR = re.compile(r"\b(?:move|send|throw|put)\s+(?:this|the|my)?\s*(?:window|it)\s+(?:over\s+)?to\s+(?:the\s+)?(next|previous|prev)\s+" + _WS_WORD + r"\b", re.I)
    _WS_GO = re.compile(r"\b(?:go|switch|jump|take me|move)\s+(?:over\s+)?to\s+(?:" + _WS_WORD + r"\s+)?" + _WS_NUM + r"\b", re.I)
    _WS_DIR = re.compile(r"\b(?:go\s+to\s+)?(next|previous|prev)\s+" + _WS_WORD + r"\b", re.I)
    _FULLSCREEN = re.compile(r"\b(?:full\s*screen|fullscreen|maximi[sz]e)\b", re.I)
    _FLOAT = re.compile(r"\b(?:toggle|make|set)\s+(?:this\s+|the\s+|my\s+)?(?:window\s+)?(?:float|floating)\b", re.I)
    _CLOSE = re.compile(r"\bclose\s+(?:this|the|my)?\s*(?:window|it)\b", re.I)
    _SCRATCH = re.compile(r"\b(?:toggle\s+)?(?:the\s+)?scratchpad\b", re.I)
    _BAR = re.compile(r"\b(?:show|hide|toggle)\s+(?:the\s+)?(?:top\s+)?bar\b", re.I)
    _NIGHT = re.compile(r"\b(?:toggle\s+)?(?:night\s*light|nightlight)\b", re.I)
    _TILE = re.compile(r"\b(?:select|focus|go\s+to|switch\s+to|open)?\s*tile\s+(\d+|one|two|too|tool|three|four|five|six|seven|eight|nine|ten)\b", re.I)
    _CLOSE_TILE = re.compile(r"\bclose\s+tile\s+(\d+|one|two|too|tool|three|four|five|six|seven|eight|nine|ten)\b", re.I)
    _VOLUME = re.compile(r"\b(?:set\s+)?volume\s+(up|down|mute|unmute|louder|quieter|max|full|(\d{1,3}))\b", re.I)
    _NEWWIN = re.compile(r"\b(?:open\s+)?(?:a\s+)?new\s+(?:browser\s+)?(?:window|tab)\b", re.I)
    _PRESS = re.compile(r"\bpress\s+((?:ctrl|control|alt|shift|super|meta)\s*[+-]\s*)?([a-z0-9]+|enter|return|escape|esc|tab|space|up|down|left|right)\b", re.I)
    _SEARCH = re.compile(r"\bsearch\s+(youtube\s+music|ytmusic|youtube|wikipedia|google|github|maps)\s+(?:for\s+)?(.+)$", re.I)
    _OPEN_SITE = re.compile(r"\b(?:open|go\s+to|browse|search|show\s+me)\s+(youtube\s+music|ytmusic|youtube|wikipedia|google|github|maps|gmail|reddit)\b\s*$", re.I)
    _MUSIC = re.compile(r"\b(?:search|play)\s+(?:some\s+|the\s+)?(.+?)\s+on\s+youtube\s+music\b", re.I)

    def match(self, text: str) -> dict[str, Any] | None:
        # Loose gate: anything desktop-ish is taken here. The fast regexes resolve
        # the obvious cases; the LLM planner handles the rest (phrasings, mishears).
        t = text.strip()
        # Desktop *queries* (list windows) are allowed even when phrased as a question.
        if _LIST_Q.search(t) and looks_like_desktop(t):
            return {"raw": t}
        # Otherwise never treat a question as a desktop command.
        if t.endswith("?"):
            return None
        if re.match(r"(?i)^(what|where|who|when|why|how|which|is|are|do|does|did|can|could|"
                    r"would|should|tell\s+me|show\s+me|what'?s)\b", t):
            return None
        if looks_like_desktop(t):
            return {"raw": t}
        return None

    def __init__(self, cfg: Config) -> None:
        self.learned_path = cfg.config_dir / "desktop_learned.json"

    def _fast(self, t: str) -> tuple[str, dict[str, Any]] | None:
        if (m := self._CLOSE_TILE.search(t)):
            return "close_tile", {"number": m.group(1)}
        if (m := self._WS_MOVE.search(t)):
            return "move_window_to_workspace", {"number": m.group(1)}
        if (m := self._WS_MOVE_DIR.search(t)):
            return ("next_workspace", {}) if m.group(1).lower().startswith("n") else ("prev_workspace", {})
        if (m := self._WS_GO.search(t)):
            return "focus_workspace", {"number": m.group(1)}
        if (m := self._WS_DIR.search(t)):
            return ("next_workspace", {}) if m.group(1).lower().startswith("n") else ("prev_workspace", {})
        if self._FULLSCREEN.search(t):
            return "toggle_fullscreen", {}
        if self._FLOAT.search(t):
            return "toggle_floating", {}
        if self._CLOSE.search(t):
            return "close_window", {}
        if self._SCRATCH.search(t):
            return "toggle_scratchpad", {}
        if self._BAR.search(t):
            return "toggle_bar", {}
        if self._NIGHT.search(t):
            return "toggle_nightlight", {}
        if (m := self._TILE.search(t)):
            return "select_tile", {"number": m.group(1)}
        if (m := self._VOLUME.search(t)):
            return "volume", {"action": m.group(1)}
        if self._NEWWIN.search(t):
            return "new_window", {}
        if (m := self._SEARCH.search(t)):
            return "web_search", {"site": m.group(1), "query": m.group(2)}
        if (m := self._OPEN_SITE.search(t)):
            return "open_site", {"site": m.group(1)}
        if (m := self._MUSIC.search(t)):
            return "web_search", {"site": "youtube music", "query": m.group(1)}
        if (m := self._PRESS.search(t)):
            keys = (m.group(1) or "") + m.group(2)
            return "press_key", {"keys": keys.replace(" ", "")}
        # Remembered phrasings (learned from earlier LLM resolutions).
        learned = load_learned(self.learned_path).get(normalize(t))
        if learned and len(learned) == 1:
            return learned[0]["tool"], learned[0].get("args", {})
        return None

    def _a11y_say(self, out: str) -> str:
        import json

        try:
            data = json.loads(out)
        except (ValueError, TypeError):
            return "Here are the app's elements."
        app = data.get("app") or "the app"
        names: list[str] = []
        for element in data.get("elements", []):
            name = str(element.get("name") or "").strip()
            if name and name not in names:
                names.append(name)
        if not names:
            return f"I couldn't read any controls in {app}."
        return f"{app} controls: " + "; ".join(names[:15]) + "."

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        t = args["raw"]
        picks: list[tuple[str, dict[str, Any]]] = []
        fast = self._fast(t)
        # A multi-step command ("focus the browser and fullscreen") needs the
        # planner, not the single-action fast path.
        if fast is not None and " and " not in t.lower():
            picks = [fast]
        elif ctx.llm is not None and hasattr(ctx.llm, "route_desktop"):
            try:
                chosen = ctx.llm.route_desktop(t, TOOLS)
            except Exception:  # noqa: BLE001 - planner failure just yields a message
                chosen = None
            if chosen:
                picks = [(c["tool"], c.get("args", {})) for c in chosen]
                # Learn this phrasing so next time it's a fast-path hit.
                save_learned(self.learned_path, t, chosen)
        if not picks:
            return SkillResult(
                text="I'm not sure which desktop action you meant.",
                action="desktop",
                data={"defer": True},
            )

        says: list[str] = []
        last_command: list[str] | None = None
        for tool, tool_args in picks:
            result = execute(tool, tool_args)
            if result is None:
                continue
            command, say = result
            last_command = command
            if not ctx.dry_run:
                code, out, err = ctx.run_command(command)
                if code != 0:
                    return SkillResult(
                        text=f"That didn't work: {(err.strip() or out.strip() or code)}",
                        action="desktop",
                    )
                if command and command[0].endswith("qweeps-windows") and out.strip():
                    lines = [ln.strip() for ln in out.strip().splitlines() if ln.strip()]
                    say = "Open windows: " + "; ".join(lines[:10]) + "."
                if command and command[0].endswith("qweeps-a11y") and out.strip():
                    say = self._a11y_say(out)
            says.append(say)
        return SkillResult(
            text=" ".join(says) if says else "Done.",
            action="desktop",
            command=last_command,
            risk=Risk.LOW,
        )


class DriveSkill:
    name = "drive"
    description = "Search and list files in Google Drive"
    kind = "query"
    order = 22
    patterns = ["find my report on drive", "search drive for budget", "what's in my drive",
                "list my drive files"]

    _DRIVE = re.compile(r"\b(google\s+drive|drive)\b", re.I)
    _SEARCH = re.compile(r"\b(find|search|look\s+for|locate|where\s+is|open)\b", re.I)
    _LIST = re.compile(r"\b(list|what'?s|what is|show|see)\b", re.I)
    _FOLDER = re.compile(r"\bcreate\b[^.]*\bfolder\b", re.I)
    _DELETE = re.compile(r"\b(delete|remove|trash|bin)\b", re.I)
    _RENAME = re.compile(r"\brename\b|\bchange\s+the\s+name\b", re.I)
    _RENAME_RE = re.compile(r"rename\s+(?:the\s+|my\s+)?(?:file\s+|folder\s+|doc(?:ument)?\s+)?(.+?)\s+to\s+(.+)$", re.I)
    _FOLDER_NAME = re.compile(r"folder\s+(?:called|named)\s+(.+)$", re.I)
    _STRIP = re.compile(
        r"^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?"
        r"(?:find|search|look\s+for|locate|open|where\s+is|show\s+me|get)\s+"
        r"(?:the\s+|my\s+|a\s+)?(?:file\s+|doc(?:ument)?\s+)?(.+?)"
        r"(?:\s+(?:on|in)\s+(?:google\s+)?drive|\s+in\s+my\s+drive)?\s*$",
        re.I,
    )

    def match(self, text: str) -> dict[str, Any] | None:
        t = text.strip()
        if not self._DRIVE.search(t):
            return None
        if self._FOLDER.search(t):
            return {"raw": t, "op": "folder", "add": True}
        if self._DELETE.search(t):
            return {"raw": t, "op": "delete"}
        if self._RENAME.search(t):
            return {"raw": t, "op": "rename"}
        if self._SEARCH.search(t) or self._LIST.search(t):
            return {"raw": t, "op": "read", "add": False}
        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        from ..gdrive import DriveUnavailable, build_drive

        drive = build_drive(ctx.cfg)
        if drive is None:
            return SkillResult(
                text="Google Drive isn't connected yet - run 'omarchy-assistant set-calendar'.",
                action="drive",
            )
        text = args["raw"]
        op = args.get("op") or ("folder" if args.get("add") else "read")
        try:
            if op == "folder":
                return self._create_folder(text, drive)
            if op == "delete":
                if not getattr(ctx.cfg.safety, "allow_deletion", False):
                    return SkillResult(
                        text="Deleting Drive files is turned off right now.",
                        action="drive",
                    )
                return self._delete(text, drive)
            if op == "rename":
                return self._rename(text, drive)
            term = self._search_term(text)
            files = drive.search(term) if term else drive.list_files(page_size=8)
        except DriveUnavailable as exc:
            return SkillResult(text=f"I couldn't reach Drive: {exc}", action="drive")
        if not files:
            return SkillResult(text="I couldn't find anything in Drive.", action="drive")
        names = [f.get("name", "(untitled)") for f in files[:8]]
        return SkillResult(text="In Drive: " + "; ".join(names) + ".", action="drive")

    def _create_folder(self, text: str, drive: Any) -> SkillResult:
        match = self._FOLDER_NAME.search(text)
        if not match:
            return SkillResult(text="What should I name the folder?", action="drive")
        name = re.sub(r"\s+(?:on|in)\s+(?:google\s+)?drive$", "", match.group(1), flags=re.I).strip().strip(".")
        folder = drive.create_folder(name)
        return SkillResult(text=f"Created the folder '{folder.get('name', name)}' in Drive.", action="drive")

    def _delete(self, text: str, drive: Any) -> SkillResult:
        term = self._search_term(text)
        files = drive.search(term) if term else []
        if not files:
            return SkillResult(text=f"I couldn't find '{term or 'that'}' in Drive.", action="drive")
        target = files[0]
        drive.delete(target["id"])
        return SkillResult(text=f"Deleted '{target.get('name')}' from Drive.", action="drive")

    def _rename(self, text: str, drive: Any) -> SkillResult:
        match = self._RENAME_RE.search(text)
        if not match:
            return SkillResult(text="What should I rename, and to what?", action="drive")
        old, new = match.group(1).strip(" ."), match.group(2).strip(" .")
        new = re.sub(r"\s+(?:on|in)\s+(?:google\s+)?drive$", "", new, flags=re.I).strip()
        files = drive.search(old)
        if not files:
            return SkillResult(text=f"I couldn't find '{old}' in Drive.", action="drive")
        drive.rename(files[0]["id"], new)
        return SkillResult(text=f"Renamed '{old}' to '{new}'.", action="drive")

    def _search_term(self, text: str) -> str:
        match = self._STRIP.search(text)
        if match:
            term = match.group(1).strip(" .?!")
            if term and term.lower() not in {"my drive", "drive", "files"}:
                return term
        return ""


class CalendarSkill:
    name = "calendar"
    description = "Read and add Google Calendar events"
    kind = "action"
    order = 23
    patterns = ["what's on my calendar", "my next meeting", "add lunch tomorrow at noon",
                "do I have anything on my calendar today"]

    _CAL = re.compile(
        r"\bmy\s+calendar\b|\bthe\s+calendar\b|"
        r"\bcalendar\s+(?:for|today|tomorrow|this|next|tonight)\b|"
        r"\b(agenda|schedule|meetings?|appointments?)\b|"
        r"\bnext\s+(?:meeting|event|appointment)\b|\bevents?\s+(?:today|tomorrow|on)\b",
        re.I,
    )
    _ADD = re.compile(r"\b(add|schedule|create|put|set\s+up|book|make)\b", re.I)
    _DELETE = re.compile(r"\b(cancel|delete|remove|drop|clear)\b", re.I)
    _RESCHED = re.compile(r"\b(reschedule|move|shift|push|change)\b", re.I)
    _WHEN = re.compile(
        r"\b(today|tonight|tomorrow|next\s+week|monday|tuesday|wednesday|thursday|friday|"
        r"saturday|sunday|january|february|march|april|may|june|july|august|september|"
        r"october|november|december|\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}st|\d{1,2}nd|\d{1,2}rd|\d{1,2}th)\b",
        re.I,
    )

    def match(self, text: str) -> dict[str, Any] | None:
        t = text.strip()
        has_cal = bool(self._CAL.search(t))
        op = None
        if has_cal and self._DELETE.search(t):
            op = "delete"
        elif has_cal and self._RESCHED.search(t):
            op = "reschedule"
        elif has_cal and not self._ADD.search(t):
            op = "read"
        elif self._ADD.search(t) and self._WHEN.search(t):
            op = "add"
        if op is None:
            return None
        return {"raw": t, "op": op, "add": op == "add"}

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        from ..gcal import CalendarUnavailable, build_calendar, day_bounds

        cal = build_calendar(ctx.cfg)
        if cal is None:
            return SkillResult(
                text="Google Calendar isn't connected yet - run 'omarchy-assistant set-calendar'.",
                action="calendar",
            )
        text = args["raw"]
        op = args.get("op") or ("add" if args.get("add") else "read")
        try:
            if op == "add":
                return self._add(text, ctx, cal)
            if op == "delete":
                if not getattr(ctx.cfg.safety, "allow_deletion", False):
                    return SkillResult(
                        text="Deleting calendar events is turned off right now.",
                        action="calendar",
                    )
                return self._delete(text, cal)
            if op == "reschedule":
                return self._reschedule(text, ctx, cal)
            return self._read(text, cal, day_bounds)
        except CalendarUnavailable as exc:
            return SkillResult(text=f"I couldn't reach your calendar: {exc}", action="calendar")

    @staticmethod
    def _event_query(text: str, cut_at_to: bool = False) -> str:
        name = re.sub(
            r"^(?:please\s+)?(?:can\s+you\s+)?(?:cancel|delete|remove|drop|clear|"
            r"reschedule|move|shift|push|change)\s+(?:my\s+|the\s+|a\s+)?",
            "",
            text.strip(),
            flags=re.I,
        )
        if cut_at_to:
            name = re.split(r"\s+to\s+", name, maxsplit=1, flags=re.I)[0]
        name = re.sub(r"\s+(?:on|from|in)\s+(?:my\s+|the\s+)?calendar.*$", "", name, flags=re.I)
        return name.strip(" .?!")

    def _find_event(self, cal: Any, query: str) -> dict[str, Any] | None:
        from datetime import datetime, timedelta

        now = datetime.now().astimezone()
        events = cal.list_events(now - timedelta(days=1), now + timedelta(days=60), max_results=100)
        words = {w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2}
        best, score = None, 0
        for event in events:
            hay = set(re.findall(r"[a-z0-9]+", str(event.get("summary", "")).lower()))
            n = len(words & hay) if words else 0
            if words and query.lower() in str(event.get("summary", "")).lower():
                n += 3
            if n > score:
                best, score = event, n
        return best if score > 0 else None

    def _delete(self, text: str, cal: Any) -> SkillResult:
        query = self._event_query(text)
        event = self._find_event(cal, query)
        if event is None or not event.get("id"):
            return SkillResult(text=f"I couldn't find '{query}' on your calendar.", action="calendar")
        cal.delete_event(event["id"])
        return SkillResult(text=f"Cancelled '{event['summary']}'.", action="calendar")

    def _reschedule(self, text: str, ctx: SkillContext, cal: Any) -> SkillResult:
        from datetime import datetime, timedelta

        query = self._event_query(text, cut_at_to=True)
        event = self._find_event(cal, query)
        if event is None:
            return SkillResult(text=f"I couldn't find '{query}' on your calendar.", action="calendar")
        parsed = self._parse(text, ctx)
        if not parsed:
            return SkillResult(text="I couldn't work out the new time.", action="calendar")
        try:
            start = datetime.fromisoformat(parsed["start"])
            end = (
                datetime.fromisoformat(parsed["end"])
                if parsed.get("end")
                else start + timedelta(hours=1)
            )
        except ValueError:
            return SkillResult(text="I couldn't parse the new time.", action="calendar")
        cal.update_event(event["id"], start=start, end=end)
        return SkillResult(
            text=f"Moved '{event['summary']}' to {self._fmt_start(parsed['start'])}.",
            action="calendar",
        )

    @staticmethod
    def _fmt_start(value: str) -> str:
        if not value:
            return ""
        try:
            from datetime import datetime

            if "T" in value:
                return datetime.fromisoformat(value).strftime("%-I:%M %p")
            return "all day"
        except ValueError:
            return value

    def _read(self, text: str, cal: Any, day_bounds: Any) -> SkillResult:
        low = text.lower()
        offset = 1 if "tomorrow" in low else 0
        start, end = day_bounds(offset)
        events = cal.list_events(start, end, max_results=10)
        when = "tomorrow" if offset else "today"
        if not events:
            return SkillResult(text=f"Nothing on your calendar {when}.", action="calendar")
        parts = []
        for event in events[:8]:
            time_word = self._fmt_start(event.get("start", ""))
            summary = event.get("summary", "(no title)")
            parts.append(f"{time_word} {summary}".strip())
        return SkillResult(
            text=f"On your calendar {when}: " + "; ".join(parts) + ".",
            action="calendar",
        )

    def _add(self, text: str, ctx: SkillContext, cal: Any) -> SkillResult:
        from datetime import datetime, timedelta

        parsed = self._parse(text, ctx)
        if not parsed:
            return SkillResult(
                text=f"I couldn't work out the time for that. Try 'add X to my calendar at 3pm'.",
                action="calendar",
            )
        try:
            start = datetime.fromisoformat(parsed["start"])
            end = datetime.fromisoformat(parsed.get("end") or "") if parsed.get("end") else start + timedelta(hours=1)
        except (KeyError, ValueError):
            return SkillResult(text="I couldn't parse that date and time.", action="calendar")
        created = cal.create_event(parsed.get("summary", text), start, end)
        summary = created.get("summary", parsed.get("summary", "the event"))
        when = self._fmt_start(parsed["start"])
        return SkillResult(text=f"Added '{summary}' at {when}.", action="calendar")

    def _parse(self, text: str, ctx: SkillContext) -> dict[str, Any] | None:
        import json
        import re as _re
        from datetime import datetime

        if ctx.llm is None:
            return None
        now = datetime.now().astimezone()
        prompt = (
            "Convert this calendar request into JSON. Now is "
            f"{now.isoformat()} ({now.strftime('%A')}). "
            'Reply with JSON only: {"summary": "...", "start": "YYYY-MM-DDTHH:MM:SS", '
            '"end": "YYYY-MM-DDTHH:MM:SS"}. Use local time, 24h clock, and a 1 hour '
            f"duration unless stated.\n\nRequest: {text}"
        )
        try:
            reply = ctx.llm.answer(prompt)
        except Exception:  # noqa: BLE001
            return None
        match = _re.search(r"\{.*\}", reply or "", _re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
        return data if data.get("start") else None


class WindowQuerySkill:
    name = "windows"
    description = "Report which app windows and coding agents are open on the desktop"
    kind = "query"
    order = 35
    patterns = ["can you see opencode", "is opencode open", "what windows are open",
                "list the windows", "are there any agents open"]

    _SEE = re.compile(
        r"\b(?:can|could|do|does|did|are|is|will)\s+(?:you|u)\s+(?:actually\s+|really\s+)?"
        r"(?:see|find|spot|detect|notice)\b\s*(.*)$",
        re.I,
    )
    _IS_OPEN = re.compile(
        r"\b(?:is|are|isn'?t|aren'?t)\s+(?P<name>.+?)\s+"
        r"(?:open|running|up|loaded|visible|on\s+screen|on\s+the\s+screen)\b",
        re.I,
    )
    _WHAT = re.compile(r"\b(?:what|which|how\s+many)\b[^?]*\b(?:windows?|agents?|apps?|programs?)\b", re.I)
    _LIST = re.compile(r"\b(?:list|show|tell\s+me)\b[^?]*\b(?:windows?|agents?|apps?|programs?)\b", re.I)

    _WINDOWISH = re.compile(
        r"\b(windows?|apps?|programs?|agents?|browser|terminal|editor|tiles?|screen|desktop|"
        r"opencode|antigravity|code)\b",
        re.I,
    )
    _AGENT_LABEL = {"opencode": "OpenCode", "antigravity": "Antigravity"}

    def match(self, text: str) -> dict[str, Any] | None:
        t = text.strip()
        if not t:
            return None
        m = self._SEE.search(t)
        if m:
            target = m.group(1)
            if self._agent_kind(target) or self._WINDOWISH.search(t):
                return {"target": target, "what": False}
            return None
        m = self._IS_OPEN.search(t)
        if m:
            target = m.group("name")
            if self._agent_kind(target) or self._WINDOWISH.search(t):
                return {"target": target, "what": False}
            return None
        if self._WHAT.search(t) or self._LIST.search(t):
            return {"target": "", "what": True}
        return None

    @staticmethod
    def _norm(text: str) -> str:
        words = re.findall(r"[a-z0-9]+", (text or "").lower())
        return " ".join(w for w in words if w not in {"the", "a", "an", "my", "our", "any"})

    def _agent_kind(self, target: str) -> str | None:
        compact = self._norm(target).replace(" ", "")
        if "opencode" in compact:
            return "opencode"
        if "antigravity" in compact or "antigravity" in self._norm(target):
            return "antigravity"
        return None

    def _find_window(self, target: str, windows: list[dict[str, Any]]) -> dict[str, Any] | None:
        norm = self._norm(target)
        if not norm:
            return None
        for window in windows:
            if norm in f"{window['title']} {window['class']}".lower():
                return window
        words = set(norm.split())
        best, score = None, 0
        for window in windows:
            hay = set(re.findall(r"[a-z0-9]+", f"{window['title']} {window['class']}".lower()))
            overlap = len(words & hay)
            if overlap > score:
                best, score = window, overlap
        return best if score > 0 else None

    @staticmethod
    def _where(item: dict[str, Any]) -> str:
        if item.get("on_active"):
            return "the current workspace"
        if item.get("workspace") is not None:
            return f"workspace {item['workspace']}"
        return "screen"

    def _summary(self, windows: list[dict[str, Any]], agents: list[dict[str, Any]]) -> str:
        if not windows and not agents:
            return "I can't see any open windows right now."
        parts = []
        for agent in agents:
            label = self._AGENT_LABEL.get(agent["kind"], agent["kind"])
            parts.append(f"{label} (agent, {self._where(agent)})")
        for window in windows[:8]:
            title = window["title"] or window["class"] or "a window"
            parts.append(f"\u201c{title}\u201d ({self._where(window)})")
        return "Open right now: " + "; ".join(parts) + "."

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        from .. import workspace

        try:
            windows = workspace.visible_windows()
        except Exception:  # noqa: BLE001 - never fail a query on hyprctl
            windows = []
        try:
            agents = workspace.agent_windows(ctx.cfg)
        except Exception:  # noqa: BLE001
            agents = []
        target = str(args.get("target") or "").strip()
        if args.get("what") or not target:
            return SkillResult(text=self._summary(windows, agents), action="windows")

        kind = self._agent_kind(target)
        if kind:
            label = self._AGENT_LABEL.get(kind, kind)
            found = next((a for a in agents if a["kind"] == kind), None)
            if found:
                return SkillResult(text=f"Yes \u2014 I can see {label} open on {self._where(found)}.", action="windows")
            return SkillResult(text=f"No, I don't see {label} open right now.", action="windows")

        found = self._find_window(target, windows)
        if found:
            title = found["title"] or found["class"] or target
            return SkillResult(text=f"Yes \u2014 \u201c{title}\u201d is open on {self._where(found)}.", action="windows")
        return SkillResult(text=f"No, I don't see {target.rstrip('?').strip()} open right now.", action="windows")


class OpenAppSkill:
    name = "open_app"
    description = "Open an application by name"
    kind = "action"
    order = 80
    patterns = ["open firefox", "launch terminal"]

    _re = re.compile(r"^\s*(?:please\s+)?(open|launch|start)\s+(?:the\s+|up\s+)?(.+)$", re.IGNORECASE)

    _known = {
        "browser": ["omarchy", "launch", "browser"],
        "terminal": ["omarchy", "launch", "terminal"],
        "files": ["xdg-open", "~"],
        "file manager": ["xdg-open", "~"],
        "editor": ["omarchy", "launch", "editor"],
    }

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def match(self, text: str) -> dict[str, Any] | None:
        trimmed = text.strip()
        # Never treat questions as application launch commands
        if re.match(r"^(?:what|why|how|who|when|where|whats|what's|is|are|tell)\b", trimmed, re.IGNORECASE):
            return None
        m = self._re.search(trimmed)
        if not m:
            return None
        name = m.group(2).strip(" .!?")
        name = re.sub(r"\s+app$", "", name, flags=re.IGNORECASE).strip()
        if not name:
            return None
        return {"app": name}

    def _command(self, name: str) -> list[str] | None:
        key = name.lower()
        if key in self.cfg.apps:
            return list(self.cfg.apps[key])
        if key in self._known:
            return list(self._known[key])
        if shutil.which(key):
            return [key]
        desktop = shutil.which("gtk-launch")
        if desktop:
            return [desktop, key]
        if shutil.which("xdg-open"):
            return ["xdg-open", key]
        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        name = args["app"]
        command = self._command(name)
        if command is None:
            return SkillResult(text=f"I don't know how to open {name}.", action="open_app")
        command = [part.replace("~", str(ctx.cfg.config_dir.home())) for part in command]
        risk = Risk.MEDIUM if command[0] in {"xdg-open"} else Risk.LOW
        if not ctx.dry_run:
            code, out, err = ctx.run_command(command)
            if code != 0:
                return SkillResult(
                    text=f"Failed to open {name}: {err.strip() or out.strip() or code}",
                    action="open_app",
                )
        return SkillResult(
            text=f"Opening {name}.",
            action="open_app",
            command=command,
            risk=risk,
        )


class OpenRouteSkill:
    name = "route"
    description = "Open a configured shortcut or deep link"
    kind = "action"
    order = 60
    patterns = ["open teams is434 architecture"]

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self._routes = {
            " ".join(phrase.lower().split()): command
            for phrase, command in cfg.routes.items()
        }

    def match(self, text: str) -> dict[str, Any] | None:
        normalized = " ".join(text.lower().split())
        best: tuple[int, str, list[str]] | None = None
        for phrase, command in self._routes.items():
            words = phrase.split()
            if all(word in normalized for word in words):
                score = len(words)
                if best is None or score > best[0]:
                    best = (score, phrase, command)
        if best is None:
            return None
        return {"phrase": best[1], "command": list(best[2])}

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        command = [part.replace("~", str(ctx.cfg.config_dir.home())) for part in args["command"]]
        if not ctx.dry_run:
            code, out, err = ctx.run_command(command)
            if code != 0:
                return SkillResult(
                    text=f"Couldn't open {args['phrase']}: {err.strip() or code}",
                    action="route",
                    command=command,
                )
        return SkillResult(
            text=f"Opening {args['phrase']}.",
            action="route",
            command=command,
            risk=Risk.LOW,
        )


class StatusSkill:
    name = "status"
    description = "Report whether the assistant's features (LLM, speech-to-text, text-to-speech, Interns) are enabled"
    kind = "query"
    order = 20
    patterns = ["is speech to text enabled", "is stt enabled", "is tts enabled",
                "assistant status", "check status", "is voice enabled", "is the llm enabled"]

    _status = re.compile(
        r"\b(is|are|enabled|disabled|working|available|ready|set\s*up|configured|on|off|status|check|running)\b",
        re.IGNORECASE,
    )
    _intern_logs = re.compile(
        r"\b(?:check|look\s+at|show|read|view|inspect|see)\s+(?:the\s+)?intern\s+(?:logs?|tasks?|activity|history)\b|"
        r"\b(?:intern\s+logs?|intern\s+tasks?|intern\s+activity)\b",
        re.IGNORECASE,
    )
    _feature = re.compile(
        r"(speech[\s-]?to[\s-]?text|\bstt\b|dictation|microphone|\bmic\b|"
        r"text[\s-]?to[\s-]?speech|\btts\b|\bvoice\b|\bllm\b|\bagent\b|interns?)",
        re.IGNORECASE,
    )
    _overall = re.compile(
        r"\b(assistant|qweeps)\b[^?]*\bstatus\b|\bstatus\b[^?]*\b(assistant|qweeps)\b",
        re.IGNORECASE,
    )

    _STT = {"speech to text", "speech-to-text", "stt", "dictation", "microphone", "mic", "voice"}
    _TTS = {"text to speech", "text-to-speech", "tts"}

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

    def match(self, text: str) -> dict[str, Any] | None:
        t = text.strip()
        if self._overall.search(t):
            return {"topic": "all"}
        if self._intern_logs.search(t):
            return {"topic": "intern_logs"}
        feature = self._feature.search(t)
        if feature and self._status.search(t):
            return {"topic": feature.group(1).lower()}
        return None

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        cfg = self.cfg
        topic = (args.get("topic") or "").lower()
        live_stt = _live_stt()
        stt_on = bool(live_stt) or (bool(cfg.stt.provider) and cfg.stt.provider != "none")
        tts_on = bool(cfg.tts.provider) and cfg.tts.provider != "none"
        llm_on = bool(cfg.llm.enabled) and bool(cfg.llm_key())
        agent_on = bool(cfg.agent.enabled)
        stt_backend = live_stt or f"{cfg.stt.provider}/{cfg.stt.engine}"
        if topic in self._STT:
            state = "enabled" if stt_on else "off"
            return SkillResult(text=f"Speech-to-text is {state} ({stt_backend}).")
        if topic in self._TTS:
            state = "enabled" if tts_on else "off"
            return SkillResult(text=f"Text-to-speech is {state} (provider: {cfg.tts.provider}).")
        if topic == "llm":
            state = "enabled" if llm_on else "off"
            return SkillResult(text=f"The language model is {state} ({cfg.llm.model}).")
        if topic in ("agent", "intern", "interns", "intern_logs"):
            from ..interns import InternRegistry

            registry = InternRegistry(cfg.interns_path)
            tasks = registry.list()
            active = [t for t in tasks if t.get("status") == "working"]
            if topic == "intern_logs":
                if not tasks:
                    return SkillResult(text="No intern tasks recorded yet.")
                latest = tasks[-5:]
                lines = [f"- [{t.get('status', '?')}] {t.get('title', '')}" for t in latest]
                return SkillResult(text="Recent Intern activity:\n" + "\n".join(lines))
            state = f"running ({len(active)} active task{'s' if len(active) != 1 else ''})" if active else "idle (ready)"
            return SkillResult(text=f"The Interns are {state}. Backend: {'enabled' if agent_on else 'off'}.")
        return SkillResult(
            text=(
                f"Speech-to-text: {'enabled' if stt_on else 'off'} ({stt_backend}). "
                f"Text-to-speech: {'enabled' if tts_on else 'off'} ({cfg.tts.provider}). "
                f"Language model: {'enabled' if llm_on else 'off'} ({cfg.llm.model}). "
                f"Interns: {'enabled' if agent_on else 'off'}."
            )
        )


class HelpSkill:
    name = "help"
    description = "List what the assistant can do"
    kind = "query"
    order = 90
    patterns = ["what can you do", "help", "list skills"]

    _re = re.compile(
        r"\b(what can you do|what can i say|help|list skills|list commands)\b",
        re.IGNORECASE,
    )

    def match(self, text: str) -> dict[str, Any] | None:
        if self._re.search(text.strip()):
            return {}
        return None

    def __init__(self, registry: list[Any] | None = None) -> None:
        self._registry = registry or []

    def set_registry(self, registry: list[Any]) -> None:
        self._registry = registry

    def run(self, args: dict[str, Any], ctx: SkillContext) -> SkillResult:
        lines = [f"- {s.name}: {s.description}" for s in self._registry if s.name != "help"]
        interns = (
            "And for anything else on this computer - files, apps, processes, system stats, installs, "
            "code, the web, your accounts - I put my Interns on it."
        )
        text = ("I can do these things instantly:\n" + "\n".join(lines) + "\n" + interns) if lines else interns
        return SkillResult(text=text)


def build_builtin_skills(cfg: Config) -> list[Any]:
    from .productivity import DocumentSkill, NotesSkill, ResearchSkill
    from .visual import VisualExplainerSkill

    help_skill = HelpSkill()
    skills: list[Any] = [
        TimeSkill(),
        StopwatchSkill(),
        TimerSkill(),
        ReminderSkill(cfg),
        NotesSkill(),
        DocumentSkill(),
        RememberSkill(),
        OpenRouteSkill(cfg),
        ResearchSkill(),
        DriveSkill(),
        CalendarSkill(),
        WindowQuerySkill(),
        OpenAppSkill(cfg),
        DesktopSkill(cfg),
        StatusSkill(cfg),
        VisualExplainerSkill(),
        help_skill,
    ]
    skills.sort(key=lambda s: getattr(s, "order", 100))
    help_skill.set_registry(skills)
    return skills
