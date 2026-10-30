"""Find and drive the coding agent that is *visible* on the desktop.

QWEEPS used to spawn a hidden headless agent (`opencode run ...`) for every
task. Instead we look for an agent window already open in the Hyprland session
(e.g. a foot window running `opencode` or the Antigravity CLI), pick the one
whose session best matches the request, continue that same session, and speak
the reply back. That keeps the work in a window the user can actually see.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from typing import Any

DEFAULT_WINDOW_CLASSES: dict[str, str] = {
    "org.omarchy.agent": "opencode",
    "org.omarchy.opencode": "opencode",
    "org.omarchy.agy": "antigravity",
}


class AgentBusy(RuntimeError):
    """The chosen agent session already has a turn in flight."""


def _session_running(session_id: str) -> bool:
    """True if an `opencode run --session <id>` is already in progress."""
    if not session_id:
        return False
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as fh:
                cmd = fh.read().replace(b"\0", b" ").decode("utf-8", "replace")
        except OSError:
            continue
        if "opencode" in cmd and "run" in cmd and session_id in cmd:
            return True
    return False


_STOP = {
    "the", "a", "an", "and", "or", "to", "of", "for", "with", "on", "in", "at",
    "is", "are", "it", "this", "that", "my", "me", "you", "your", "i", "we",
    "please", "can", "could", "would", "about", "into", "from", "as", "be",
}


def _hyprctl(*args: str) -> Any:
    try:
        proc = subprocess.run(
            ["hyprctl", *args, "-j"], capture_output=True, text=True, timeout=5
        )
    except (OSError, subprocess.SubprocessError):
        return None
    try:
        return json.loads(proc.stdout or "null")
    except json.JSONDecodeError:
        return None


def _clean_title(kind: str, title: str) -> str:
    text = (title or "").strip()
    if kind == "opencode":
        text = re.sub(r"^OC\s*\|\s*", "", text)
    return text


def agent_windows(cfg) -> list[dict[str, Any]]:
    """Visible agent windows across all workspaces, in Hyprland's client order."""
    classes = getattr(cfg.agent, "window_classes", None) or DEFAULT_WINDOW_CLASSES
    clients = _hyprctl("clients")
    if not isinstance(clients, list):
        return []
    active_ws = _hyprctl("activeworkspace")
    active_id = active_ws.get("id") if isinstance(active_ws, dict) else None
    active_win = _hyprctl("activewindow")
    focused_addr = active_win.get("address") if isinstance(active_win, dict) else None

    windows: list[dict[str, Any]] = []
    for client in clients:
        if not isinstance(client, dict):
            continue
        cls = str(client.get("class") or "")
        kind = classes.get(cls)
        if not kind:
            continue
        workspace = client.get("workspace") or {}
        ws_id = workspace.get("id") if isinstance(workspace, dict) else None
        address = client.get("address")
        windows.append(
            {
                "kind": kind,
                "class": cls,
                "title": _clean_title(kind, str(client.get("title") or "")),
                "workspace": ws_id,
                "on_active": ws_id == active_id,
                "focused": bool(focused_addr) and address == focused_addr,
                "pid": client.get("pid"),
                "address": address,
            }
        )
    return windows


def visible_windows() -> list[dict[str, Any]]:
    """All open windows (title, class, workspace) for awareness questions."""
    clients = _hyprctl("clients")
    if not isinstance(clients, list):
        return []
    active_ws = _hyprctl("activeworkspace")
    active_id = active_ws.get("id") if isinstance(active_ws, dict) else None
    windows: list[dict[str, Any]] = []
    for client in clients:
        if not isinstance(client, dict):
            continue
        workspace = client.get("workspace") or {}
        ws_id = workspace.get("id") if isinstance(workspace, dict) else None
        windows.append(
            {
                "title": str(client.get("title") or ""),
                "class": str(client.get("class") or ""),
                "workspace": ws_id,
                "on_active": ws_id == active_id,
            }
        )
    return windows


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if w not in _STOP}


def _overlap(a: str, b: str) -> int:
    return len(_tokens(a) & _tokens(b))


def _llm_pick(task: str, windows: list[dict[str, Any]], llm: Any) -> int | None:
    listing = "\n".join(
        f"{i + 1}. [{w['kind']}] {w['title'] or '(untitled session)'}"
        for i, w in enumerate(windows)
    )
    prompt = (
        "A coding-agent window is open for each session below. A new request just "
        "came in. Reply with ONLY the number of the session that is the closest "
        f"match for the request (or 0 if none fit).\n\nRequest: {task}\n\nSessions:\n{listing}"
    )
    try:
        reply = llm.answer(prompt)
    except Exception:  # noqa: BLE001 - selection must never break delegation
        return None
    match = re.search(r"\d+", reply or "")
    if not match:
        return None
    index = int(match.group(0)) - 1
    return index if 0 <= index < len(windows) else None


def candidates(task: str, windows: list[dict[str, Any]], llm: Any = None) -> list[dict[str, Any]]:
    """All agent windows in preference order (current workspace, then others)."""
    if not windows:
        return []
    here = [w for w in windows if w.get("on_active")]
    other = [w for w in windows if not w.get("on_active")]
    ordered: list[dict[str, Any]] = []
    for pool in (here, other):
        if not pool:
            continue
        remaining = list(pool)
        if len(remaining) > 1 and llm is not None:
            index = _llm_pick(task, remaining, llm)
            if index is not None:
                ordered.append(remaining.pop(index))
        remaining.sort(key=lambda w: (-_overlap(task, w["title"]), not w.get("focused")))
        ordered.extend(remaining)
    return ordered


def pick_window(task: str, windows: list[dict[str, Any]], llm: Any = None) -> dict[str, Any] | None:
    """Choose the best visible agent: current workspace first, then by session title."""
    ordered = candidates(task, windows, llm)
    return ordered[0] if ordered else None


def opencode_sessions(directory: str, timeout: int = 30) -> list[dict[str, Any]]:
    try:
        proc = subprocess.run(
            ["opencode", "session", "list", "--format", "json"],
            cwd=directory,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    try:
        data = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return [s for s in data if isinstance(s, dict)] if isinstance(data, list) else []


def _match_session(title: str, sessions: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not title:
        return None
    exact = [s for s in sessions if str(s.get("title") or "").strip() == title]
    if exact:
        return exact[0]
    scored = [(s, _overlap(title, str(s.get("title") or ""))) for s in sessions]
    scored = [(s, n) for s, n in scored if n > 0]
    if not scored:
        return None
    return max(scored, key=lambda pair: pair[1])[0]


def _fill(template: list[str], values: dict[str, str]) -> list[str]:
    out: list[str] = []
    for part in template:
        text = part
        for key, value in values.items():
            text = text.replace("{" + key + "}", value)
        out.append(text)
    return out


def _run(command: list[str], cwd: str, timeout: int) -> str:
    # Launch through a shell with stdin from /dev/null. `opencode run` finishes
    # its turn but does not exit when it is exec'd directly (it lingers holding
    # the session), which makes subprocess.run hang forever; going through `sh`
    # (as a terminal would) makes it exit. Arguments are shell-quoted, so this
    # is not an injection vector.
    import shlex
    import signal

    line = " ".join(shlex.quote(part) for part in command) + " </dev/null"
    proc = subprocess.Popen(
        line,
        shell=True,
        cwd=cwd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except OSError:
            proc.kill()
        proc.communicate()
        raise RuntimeError("the agent is busy or took too long to answer")
    output = (out or "").strip()
    if proc.returncode != 0 and not output:
        raise RuntimeError((err or "").strip() or f"agent exited {proc.returncode}")
    return output


def delegate(window: dict[str, Any], task: str, cfg) -> str:
    """Continue the chosen agent's session with `task` and return its reply."""
    kind = window.get("kind")
    templates = getattr(cfg.agent, "delegate_commands", None) or {}
    template = templates.get(kind)
    if not template:
        raise RuntimeError(f"no delegate command configured for {kind!r}")

    values = {"prompt": task}
    start = str(getattr(cfg.agent, "start_dir", "") or ".")
    directory = os.path.expanduser(start)
    if kind == "opencode":
        sessions = opencode_sessions(directory, timeout=cfg.agent.timeout)
        session = _match_session(window.get("title", ""), sessions)
        if session is None:
            raise RuntimeError(
                f"could not find the opencode session for {window.get('title')!r}"
            )
        session_id = str(session.get("id") or "")
        if _session_running(session_id):
            raise AgentBusy(f"the agent {window.get('title')!r} is already working")
        values["session"] = session_id
        directory = str(session.get("directory") or directory)

    command = _fill(template, values)
    timeout = int(getattr(cfg.agent, "delegate_timeout", 0) or cfg.agent.timeout)
    return _run(command, directory, timeout)
