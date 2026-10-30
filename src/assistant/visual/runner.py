"""Visual Explainer Runner for QWEEPS.

Launches the ManimGL interactive window in Hyprland, connects over IPC,
and coordinates speech narration and click-to-inspect explanations.
"""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
import json
import re
import urllib.request
import urllib.error
from urllib.parse import urlencode
from pathlib import Path
from typing import Any, Callable

from .ipc import DEFAULT_SOCKET_PATH, VisualIPCClient

default_venv = Path.home() / ".local/share/qweeps/visual-venv" if not (Path.home() / ".local/share/omarchy-assistant/visual-venv").is_dir() else Path.home() / ".local/share/omarchy-assistant/visual-venv"
VISUAL_VENV_PYTHON = str(default_venv / "bin/python")
VISUAL_VENV_MANIM = str(default_venv / "bin/manimgl")


def studio_request(path: str, payload: dict | None = None, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:4174/api/visual/{path}", data=data,
                                 headers={"Content-Type": "application/json"} if data is not None else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read()).get("error", "Visual request failed")
        except (ValueError, AttributeError):
            message = "Visual request failed"
        raise RuntimeError(message) from exc


def ensure_studio_server() -> None:
    """Start the local model host, and verify readiness instead of sleeping blindly."""
    try:
        if studio_request("health", timeout=1).get("service") == "qweeps-visual":
            return
    except (OSError, ValueError, RuntimeError):
        pass
    from .server import STUDIO_DIR
    if not (STUDIO_DIR / "dist/index.html").is_file():
        raise RuntimeError(f"Build the visual studio first: cd {STUDIO_DIR} && npm run build")
    log_dir = Path.home() / ".cache/qweeps" if not (Path.home() / ".cache/omarchy-assistant").is_dir() else Path.home() / ".cache/omarchy-assistant"
    log_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[2]) + os.pathsep + env.get("PYTHONPATH", "")
    with (log_dir / "visual-server.log").open("ab") as log:
        process = subprocess.Popen([sys.executable, "-m", "assistant.visual.server"], env=env,
                                   stdout=log, stderr=log, start_new_session=True)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Visual server exited. See {log_dir / 'visual-server.log'}")
        try:
            if studio_request("health", timeout=1).get("service") == "qweeps-visual":
                return
        except (OSError, ValueError, RuntimeError):
            pass
        time.sleep(.1)
    raise RuntimeError("Visual server did not become ready within 20 seconds.")


class VisualRunner:
    """Manages the visual explanation lifecycle and bridges it with QWEEPS voice."""

    def __init__(
        self,
        tts: Any = None,
        socket_path: str = DEFAULT_SOCKET_PATH,
        on_inspect: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.tts = tts
        self.socket_path = socket_path
        self.ipc: VisualIPCClient | None = None
        self.process: subprocess.Popen | None = None
        self.on_inspect = on_inspect
        self.is_active = False
        self._lock = threading.RLock()
        self._studio = False

    def launch_studio(self, scene_id: str = "astar_heuristic") -> bool:
        """Launch the interactive studio with the QWEEPS model bridge attached."""
        import shutil
        ensure_studio_server()
        if re.fullmatch(r"(?:explain\s+)?(?:(?:jose|josé)\s+)?rizal(?:'s)?\s+(?:history|life|biography)(?:\s+(?:explanation|explaination|explainer))?[?.!]*",scene_id.strip(),re.I):
            scene_id='rizal_live'
        known = {"rizal_live", "manim_production", "jose_rizal", "alu", "astar_heuristic", "chapter2_pdf", "neural_net", "fourier", "linear_transform", "riemann_calculus"}
        query = {"scene": scene_id} if scene_id in known else {"topic": scene_id}
        if scene_id not in known:query['live']='1'
        query["desktop"] = "1"
        if self.tts is None:
            query["muted"] = "1"
        url = "http://127.0.0.1:4174/?" + urlencode(query)

        # Prefer omarchy-launch-webapp for borderless floating Hyprland window
        webapp_launcher = shutil.which("omarchy-launch-webapp")
        if webapp_launcher:
            subprocess.Popen([webapp_launcher, url, "--class=qweeps-visual"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            chromium = shutil.which("chromium") or shutil.which("google-chrome")
            if chromium:
                subprocess.Popen([chromium, f"--app={url}", "--class=qweeps-visual"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        self.is_active = True
        self._studio = True
        return True

    def _studio_command(self, command: str) -> bool:
        try:
            studio_request("control", {"command": command}, timeout=3)
            return True
        except (OSError, ValueError, RuntimeError):
            return False

    def ask(self, question: str) -> str:
        ensure_studio_server()
        state = studio_request("state", timeout=3)
        sid = state.get("sessionId")
        if state.get("closed"):
            sid = None
        if sid:
            studio_request("control", {"command": "pause", "sessionId": sid}, timeout=3)
        reply = studio_request("ask", {"sessionId": sid, "question": question})
        if sid:
            # Use the shared bus so voice questions also update the visible chat/branch.
            studio_request("reply", {"sessionId": sid, "question": question, "reply": reply, "speak": False}, timeout=3)
        return reply["answer"]

    def launch(self, scene_path: str, scene_name: str, wait_ready: bool = True) -> bool:
        """Launches the interactive scene window and connects IPC."""
        with self._lock:
            if self.is_active and self.process and self.process.poll() is None:
                self.close()

            # Clean up stale socket if present
            if os.path.exists(self.socket_path):
                try:
                    os.unlink(self.socket_path)
                except OSError:
                    pass

            env = os.environ.copy()
            env["QWEEPS_VISUAL_SOCK"] = self.socket_path
            # Ensure src is on PYTHONPATH
            src_dir = str(Path(__file__).resolve().parents[2])
            env["PYTHONPATH"] = f"{src_dir}:{env.get('PYTHONPATH', '')}"

            cmd = [
                VISUAL_VENV_MANIM if os.path.exists(VISUAL_VENV_MANIM) else sys.executable,
                scene_path,
                scene_name,
            ]

            self.process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            self.ipc = VisualIPCClient(socket_path=self.socket_path)
            if not self.ipc.connect(timeout=6.0):
                if self.process.poll() is None:
                    self.process.terminate()
                return False

            self.is_active = True
            self.ipc.on("beat_start", self._handle_beat_start)
            self.ipc.on("inspect", self._handle_inspect)
            self.ipc.on("closed", self._handle_closed)

            # Monitor process in background
            threading.Thread(target=self._monitor_process, daemon=True).start()
            return True

    def _monitor_process(self) -> None:
        if self.process:
            self.process.wait()
        with self._lock:
            self.is_active = False
            if self.ipc:
                self.ipc.close()
                self.ipc = None

    def _handle_beat_start(self, msg: dict[str, Any]) -> None:
        narration = msg.get("narration", "").strip()
        if narration and self.tts:
            threading.Thread(target=self._speak_narration, args=(narration,), daemon=True).start()

    def _speak_narration(self, text: str) -> None:
        if self.tts:
            try:
                self.tts.speak(text)
            except Exception:
                pass

    def _handle_inspect(self, msg: dict[str, Any]) -> None:
        if self.on_inspect:
            try:
                self.on_inspect(msg)
                return
            except Exception:
                pass

        # Default spoken explanation for inspected element
        why = msg.get("why") or msg.get("description")
        label = msg.get("label", "Element")
        cost = msg.get("cost")
        explanation = f"{label}. "
        if cost:
            explanation += f"{cost}. "
        if why:
            explanation += why

        if self.tts and explanation.strip():
            threading.Thread(target=self._speak_narration, args=(explanation,), daemon=True).start()

    def _handle_closed(self, msg: dict[str, Any]) -> None:
        with self._lock:
            self.is_active = False
            if self.ipc:
                self.ipc.close()
                self.ipc = None

    def step_forward(self) -> bool:
        if self.ipc and self.is_active:
            return self.ipc.send("command", command="step_forward")
        return self._studio_command("next")

    def step_backward(self) -> bool:
        if self.ipc and self.is_active:
            return self.ipc.send("command", command="step_backward")
        return self._studio_command("previous")

    def toggle_pause(self) -> bool:
        if self.ipc and self.is_active:
            return self.ipc.send("command", command="pause")
        return self._studio_command("pause")

    def resume(self) -> bool:
        if self.ipc and self.is_active:
            return self.ipc.send("command", command="resume")
        return self._studio_command("resume")

    def branch(self) -> bool:
        if self.ipc and self.is_active:
            return self.ipc.send("command", command="branch")
        return self._studio_command("branch")

    def close(self) -> None:
        with self._lock:
            self._studio_command("close")
            if self.ipc:
                try:
                    self.ipc.send("command", command="close")
                    self.ipc.close()
                except Exception:
                    pass
                self.ipc = None
            if self.process:
                try:
                    if self.process.poll() is None:
                        self.process.terminate()
                        self.process.wait(timeout=2.0)
                except Exception:
                    try:
                        self.process.kill()
                    except Exception:
                        pass
                self.process = None
            self.is_active = False
