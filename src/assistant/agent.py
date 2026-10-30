from __future__ import annotations

import json
import re
import subprocess
import threading
import time
from pathlib import Path

from .config import Config

_RECIPE_MARKER = re.compile(r"SKILL_RECIPE:\s*(\{.*\})", re.DOTALL)
_CAPABILITY_MARKER = re.compile(r"CAPABILITY:\s*(\{.*\})", re.DOTALL)


RECIPE_INSTRUCTION = (
    "When you are done, report what you built so it can be reused. End your reply with EXACTLY ONE "
    "of the following lines, on its own line, with no markdown around it:\n"
    "- If the task reduces to a single repeatable command:\n"
    'SKILL_RECIPE: {"name": "short-kebab-name", "description": "one line", '
    '"patterns": ["a regex matching how the user would ask for this", "..."], '
    '"command": ["executable", "arg", "..."], "kind": "action", "risk": "low"}\n'
    "(If you built a script or tool, save it somewhere stable - for example under "
    "~/.local/share/omarchy-assistant/tools/ - and put its invocation in \"command\".)\n"
    "- Otherwise, if you built something reusable that is not a single command:\n"
    'CAPABILITY: {"name": "short-kebab-name", "description": "one line"}\n'
    "State risk honestly as low, medium, or high. If nothing reusable was done, omit the line."
)


class AgentUnavailable(RuntimeError):
    pass


class Agent:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.command_template = list(cfg.agent.command)
        self.fallback_template = list(getattr(cfg.agent, "fallback_command", []) or ["agy", "--continue", "--print", "{prompt}"])
        self.start_dir = Path(cfg.agent.start_dir).expanduser()
        self.timeout = cfg.agent.timeout
        self.format_args = list(cfg.agent.format_args)

    def _command_from(self, template: list[str], prompt: str, extra_args: list[str] | None = None) -> list[str]:
        out: list[str] = []
        for part in template:
            if "{prompt}" in part:
                if extra_args:
                    out.extend(extra_args)
                out.append(part.replace("{prompt}", prompt))
            else:
                out.append(part)
        return out

    def _command(self, prompt: str, extra_args: list[str] | None = None) -> list[str]:
        return self._command_from(self.command_template, prompt, extra_args)

    def _primary_available(self) -> bool:
        if not self.command_template:
            return False
        import shutil
        return shutil.which(self.command_template[0]) is not None

    def _fallback_available(self) -> bool:
        if not self.fallback_template:
            return False
        import shutil
        return shutil.which(self.fallback_template[0]) is not None

    def available(self) -> bool:
        return self._primary_available() or self._fallback_available()

    def run(self, task: str) -> str:
        if not self.available():
            cmd_name = self.command_template[0] if self.command_template else "agent"
            raise AgentUnavailable(f"{cmd_name!r} not found on PATH")
        cwd = self.start_dir if self.start_dir.is_dir() else Path.home()
        last_error: Exception | None = None

        if self._primary_available():
            try:
                proc = subprocess.run(
                    self._command(task),
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                )
                output = (proc.stdout or "").strip()
                if proc.returncode == 0 or output:
                    return output
                last_error = RuntimeError(proc.stderr.strip() or f"agent exited {proc.returncode}")
            except Exception as exc:
                last_error = exc

        if self._fallback_available():
            try:
                cmd = self._command_from(self.fallback_template, task)
                proc = subprocess.run(
                    cmd,
                    cwd=cwd,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                )
                output = (proc.stdout or "").strip()
                if proc.returncode == 0 or output:
                    return output
                raise RuntimeError(proc.stderr.strip() or f"fallback agent exited {proc.returncode}")
            except Exception as exc:
                if last_error is None:
                    raise
                raise RuntimeError(f"primary agent failed ({last_error}); fallback also failed ({exc})") from exc

        if last_error is not None:
            raise last_error
        raise AgentUnavailable("no agent available")

    def stream(self, task: str):
        """Run the agent and yield its progress events (parsed from --format json)."""
        if not self.available():
            cmd_name = self.command_template[0] if self.command_template else "agent"
            raise AgentUnavailable(f"{cmd_name!r} not found on PATH")
        cwd = self.start_dir if self.start_dir.is_dir() else Path.home()

        if self._primary_available():
            is_primary_agy = bool(self.command_template and self.command_template[0] == "agy")
            extra = (
                ["--output-format", "stream-json", "--dangerously-skip-permissions", "--disable-slash-commands"]
                if is_primary_agy
                else self.format_args
            )
            command = self._command(task, extra_args=extra)
            proc = subprocess.Popen(
                command,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            watchdog = threading.Timer(self.timeout, proc.kill)
            watchdog.daemon = True
            watchdog.start()
            yielded_any = False
            try:
                assert proc.stdout is not None
                for line in proc.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if is_primary_agy:
                            if obj.get("event") == "step_update":
                                delta = obj.get("step_update", {}).get("text_delta")
                                if delta:
                                    yielded_any = True
                                    yield {"part": {"type": "text", "text": delta}}
                        else:
                            yielded_any = True
                            yield obj
                    except json.JSONDecodeError:
                        continue
            finally:
                watchdog.cancel()
                if proc.stdout is not None:
                    proc.stdout.close()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            if yielded_any:
                return

        if self._fallback_available():
            is_agy = self.fallback_template and self.fallback_template[0] == "agy"
            extra = ["--output-format", "stream-json", "--dangerously-skip-permissions", "--disable-slash-commands"] if is_agy else self.format_args
            command = self._command_from(self.fallback_template, task, extra_args=extra)
            proc = subprocess.Popen(
                command,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            watchdog = threading.Timer(self.timeout, proc.kill)
            watchdog.daemon = True
            watchdog.start()
            try:
                assert proc.stdout is not None
                for line in proc.stdout:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        if is_agy:
                            if obj.get("event") == "step_update":
                                delta = obj.get("step_update", {}).get("text_delta")
                                if delta:
                                    yield {"part": {"type": "text", "text": delta}}
                        else:
                            yield obj
                    except json.JSONDecodeError:
                        continue
            finally:
                watchdog.cancel()
                if proc.stdout is not None:
                    proc.stdout.close()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()



class WorkspaceAgent:
    """Delegate to a coding agent that is visibly open on the desktop.

    Unlike :class:`Agent`, this never spawns a hidden headless run: it finds an
    open agent window (opencode, Antigravity, ...), continues that window's
    session, and returns the reply so QWEEPS can speak it.
    """

    def __init__(self, cfg: Config, llm: object | None = None) -> None:
        self.cfg = cfg
        self.llm = llm

    def available(self) -> bool:
        from . import workspace

        return bool(workspace.agent_windows(self.cfg))

    def run(self, task: str) -> str:
        from . import workspace

        windows = workspace.agent_windows(self.cfg)
        ordered = workspace.candidates(task, windows, self.llm)
        if not ordered:
            raise AgentUnavailable("no agent window is open on the desktop")
        busy: Exception | None = None
        for window in ordered:
            try:
                return workspace.delegate(window, task, self.cfg)
            except (workspace.AgentBusy, RuntimeError, Exception) as exc:
                busy = exc
                continue
        if busy is not None:
            raise AgentUnavailable(str(busy))
        raise AgentUnavailable("no agent window is open on the desktop")


def strip_recipe(output: str) -> str:
    cuts = []
    for marker in ("SKILL_RECIPE:", "CAPABILITY:"):
        index = output.find(marker)
        if index != -1:
            cuts.append(index)
    return (output[: min(cuts)] if cuts else output).strip()


def extract_recipe(output: str) -> dict | None:
    match = _RECIPE_MARKER.search(output)
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict) and {"name", "patterns", "command"} <= set(data):
        return data
    return None


def extract_capability(output: str) -> dict | None:
    match = _CAPABILITY_MARKER.search(output)
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict) and data.get("name"):
        return data
    return None
