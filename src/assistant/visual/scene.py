"""QWEEPS Interactive ManimGL Base Scene.

Provides:
- 3Blue1Brown cadence with 1.5s absorption pauses
- Checkpoint scrubbing (forward/backward with Left/Right arrow keys)
- Right-click & drag canvas panning (1:1 camera navigation across the whole scene)
- Left-click & drag node selection and live dragging
- Left-click marquee box selection over nodes on empty canvas
- Interactive branching sub-scenes (press 'B' or voice trigger)
- Live IPC connection to QWEEPS voice daemon
- Hyprland-optimized dark canvas and borderless styling
"""
from __future__ import annotations

import os
import sys
import time
from typing import Any, Callable

try:
    from manimlib import *
    from manimlib.scene.interactive_scene import InteractiveScene
    HAS_MANIMGL = True
except ImportError:
    HAS_MANIMGL = False
    InteractiveScene = object  # type: ignore

from .beats import Beat, Timeline
from .ipc import VisualIPCServer


class QweepsInteractiveScene(InteractiveScene):
    """Interactive Scene supporting 3B1B pacing, scrubbing, panning, and drag inspection."""

    def __init__(self, **kwargs: Any) -> None:
        if not HAS_MANIMGL:
            raise RuntimeError("manimgl is required to run QweepsInteractiveScene.")
        super().__init__(**kwargs)
        self.timeline = Timeline()
        self.ipc: VisualIPCServer | None = None
        self.selected_mobject: Mobject | None = None
        self.highlight_ring: Mobject | None = None
        self.interactive_elements: dict[int, dict[str, Any]] = {}
        self.drag_target: Mobject | None = None

        # Panning & Box selection state
        self._is_panning = False
        self._is_box_selecting = False
        self._box_select_start: np.ndarray | None = None
        self._selection_box: Mobject | None = None

        # Playback & Branch state
        self._paused = False
        self._is_in_branch = False
        self.branch_handlers: dict[str, Callable[[], None]] = {}

    def setup(self) -> None:
        super().setup()
        sock_path = os.environ.get("QWEEPS_VISUAL_SOCK", "/tmp/qweeps-visual.sock")
        self.ipc = VisualIPCServer(socket_path=sock_path)
        self.ipc.on("command", self._on_remote_command)
        self.ipc.start()

        # Emit ready event
        self.ipc.emit("ready", scene=self.__class__.__name__)

    def register_interactive(self, mob: Mobject, meta: dict[str, Any], draggable: bool = True) -> None:
        """Tag a Mobject with semantic metadata for click/drag inspection."""
        mob.qweeps_meta = meta
        mob.qweeps_draggable = draggable
        self.interactive_elements[id(mob)] = meta
        for sub in mob.get_family():
            sub.qweeps_parent = mob

    def register_branch(self, branch_id: str, handler: Callable[[], None]) -> None:
        """Register a sub-scene transition function for branching questions."""
        self.branch_handlers[branch_id] = handler

    def _on_remote_command(self, msg: dict[str, Any]) -> None:
        cmd = msg.get("command")
        if cmd == "pause":
            self._paused = True
        elif cmd == "resume":
            self._paused = False
        elif cmd == "step_forward":
            self.step_forward()
        elif cmd == "step_backward":
            self.step_backward()
        elif cmd == "branch":
            self.trigger_branch()
        elif cmd == "close":
            if self.window:
                self.window.close()

    def on_key_press(self, symbol: int, modifiers: int) -> None:
        # Check for Escape (symbol 65307 or 27) or 'q' to close cleanly
        if symbol in (27, 65307, ord('q'), ord('Q')):
            if self.ipc:
                self.ipc.emit("closed")
                self.ipc.close()
            if self.window:
                self.window.close()
            return

        # Space toggles pause
        if symbol in (32, 65293):
            self._paused = not self._paused
            if self.ipc:
                self.ipc.emit("pause_toggled", paused=self._paused)
            return

        # 'b' or 'B' triggers branch animation for selected node
        if symbol in (ord('b'), ord('B')):
            self.trigger_branch()
            return

        # Left arrow (step back)
        if symbol in (65361, 276):
            self.step_backward()
            return

        # Right arrow (step forward)
        if symbol in (65363, 275):
            self.step_forward()
            return

        try:
            super().on_key_press(symbol, modifiers)
        except Exception:
            pass

    def get_interactive_at_point(self, point: np.ndarray, buff: float = 0.45) -> tuple[Mobject | None, dict[str, Any] | None]:
        """Spatial hit-testing specifically for registered interactive nodes."""
        for mob_id, meta in self.interactive_elements.items():
            for mob in self.mobjects:
                if id(mob) == mob_id:
                    c = mob.get_center()
                    radius = max(mob.get_width(), mob.get_height()) / 2.0 + buff
                    dist = float(np.linalg.norm(c[:2] - point[:2]))
                    if dist <= radius:
                        return mob, meta
        return None, None

    def on_mouse_press(self, point: np.ndarray, button: int, mods: int) -> None:
        # Right Click (button == 4 or button == 2) -> Start canvas panning
        if button in (4, 2):
            self._is_panning = True
            super().on_mouse_press(point, button, mods)
            return

        # Left Click (button == 1) -> Node selection or start drag-to-select box
        if button == 1:
            target, meta = self.get_interactive_at_point(point)
            if target is not None:
                self._select_mobject(target, meta)
                if getattr(target, "qweeps_draggable", False):
                    self.drag_target = target
            else:
                self._clear_selection()
                self._box_select_start = point.copy()
                self._is_box_selecting = True

        super().on_mouse_press(point, button, mods)

    def on_mouse_drag(self, point: np.ndarray, d_point: np.ndarray, buttons: int, mods: int) -> None:
        # 1. Right Click Drag -> Pan camera across the screen
        is_right_drag = (buttons & 4 != 0) or (buttons & 2 != 0) or self._is_panning
        if is_right_drag:
            if hasattr(self, "frame") and self.frame is not None:
                self.frame.shift(-d_point)
            super().on_mouse_drag(point, d_point, buttons, mods)
            return

        # 2. Left Click Drag -> Move dragged node
        if self.drag_target is not None:
            self.drag_target.shift(d_point)
            if self.highlight_ring is not None:
                self.highlight_ring.shift(d_point)
            if self.ipc:
                center = list(self.drag_target.get_center())
                meta = getattr(self.drag_target, "qweeps_meta", {})
                self.ipc.emit(
                    "drag",
                    id=meta.get("id"),
                    center=center,
                    label=meta.get("label"),
                )
            super().on_mouse_drag(point, d_point, buttons, mods)
            return

        # 3. Left Click Drag on canvas -> Marquee box selection
        if self._is_box_selecting and self._box_select_start is not None:
            self._update_selection_box(self._box_select_start, point)
            super().on_mouse_drag(point, d_point, buttons, mods)
            return

        super().on_mouse_drag(point, d_point, buttons, mods)

    def on_mouse_release(self, point: np.ndarray, button: int, mods: int) -> None:
        if button in (4, 2):
            self._is_panning = False

        if button == 1:
            self.drag_target = None
            if self._is_box_selecting:
                self._finalize_box_selection(point)

        super().on_mouse_release(point, button, mods)

    def _update_selection_box(self, start_pt: np.ndarray, current_pt: np.ndarray) -> None:
        min_x = min(start_pt[0], current_pt[0])
        max_x = max(start_pt[0], current_pt[0])
        min_y = min(start_pt[1], current_pt[1])
        max_y = max(start_pt[1], current_pt[1])

        width = max(max_x - min_x, 0.05)
        height = max(max_y - min_y, 0.05)
        center = np.array([(min_x + max_x) / 2.0, (min_y + max_y) / 2.0, 0.0])

        if self._selection_box is None:
            self._selection_box = Rectangle(
                width=width,
                height=height,
                stroke_color="#33BBFF",
                stroke_width=2.0,
                fill_color="#33BBFF",
                fill_opacity=0.15,
            )
            self._selection_box.move_to(center)
            self.add(self._selection_box)
        else:
            self._selection_box.set_width(width, stretch=True)
            self._selection_box.set_height(height, stretch=True)
            self._selection_box.move_to(center)

    def _finalize_box_selection(self, end_pt: np.ndarray) -> None:
        self._is_box_selecting = False
        start_pt = self._box_select_start
        self._box_select_start = None

        if self._selection_box is not None:
            self.remove(self._selection_box)
            self._selection_box = None

        if start_pt is None:
            return

        min_x = min(start_pt[0], end_pt[0])
        max_x = max(start_pt[0], end_pt[0])
        min_y = min(start_pt[1], end_pt[1])
        max_y = max(start_pt[1], end_pt[1])

        # Ignore tiny accidental clicks (< 0.15 units)
        if (max_x - min_x < 0.15) and (max_y - min_y < 0.15):
            return

        # Check which interactive node falls inside the bounding box
        for mob_id, meta in self.interactive_elements.items():
            for mob in self.mobjects:
                if id(mob) == mob_id:
                    c = mob.get_center()
                    if min_x <= c[0] <= max_x and min_y <= c[1] <= max_y:
                        self._select_mobject(mob, meta)
                        return

    def _select_mobject(self, mob: Mobject, meta: dict[str, Any]) -> None:
        self._clear_selection()
        self.selected_mobject = mob

        # Glowing halo ring around selected mobject
        radius = max(mob.get_width(), mob.get_height()) * 0.75
        halo = Circle(radius=max(radius, 0.45), color=YELLOW)
        halo.set_stroke(YELLOW, width=3.5, opacity=0.9)
        halo.move_to(mob.get_center())
        self.highlight_ring = halo
        self.add(halo)

        # Notify QWEEPS over IPC with detailed inspection payload
        if self.ipc:
            self.ipc.emit(
                "inspect",
                id=meta.get("id", "element"),
                label=meta.get("label", "Selected element"),
                description=meta.get("description", ""),
                heuristic=meta.get("heuristic"),
                cost=meta.get("cost"),
                why=meta.get("why"),
                branch_scene=meta.get("branch_scene"),
            )

    def _clear_selection(self) -> None:
        if self.highlight_ring is not None:
            self.remove(self.highlight_ring)
            self.highlight_ring = None
        self.selected_mobject = None

    def trigger_branch(self) -> None:
        """Branch the progression into a detailed sub-scene for the selected node."""
        branch_id = None
        if self.selected_mobject:
            meta = getattr(self.selected_mobject, "qweeps_meta", {})
            branch_id = meta.get("branch_scene") or meta.get("id")
        if not branch_id:
            branch_id = "default"

        handler = self.branch_handlers.get(branch_id) or self.branch_handlers.get("default")
        if handler:
            self._is_in_branch = True
            handler()

    def play_beat(self, beat: Beat, animation_fn: Callable[[], None]) -> None:
        """Executes a single Beat: checkpoint -> animation -> 1.5s pause."""
        self.timeline.record_checkpoint(self)

        # Emit beat start to IPC so QWEEPS can narrate
        if self.ipc:
            self.ipc.emit(
                "beat_start",
                name=beat.name,
                narration=beat.narration,
                pause=beat.absorption_pause,
            )

        # Run the visual animations
        animation_fn()

        # Hold for the absorption pause (~1.5s 3B1B pacing)
        pause_duration = beat.absorption_pause
        elapsed = 0.0
        step = 0.05
        while elapsed < pause_duration:
            while self._paused and not self.is_window_closing():
                self.update_frame(1 / self.camera.fps)
                time.sleep(0.02)
            self.wait(step)
            elapsed += step

        # Emit beat end
        if self.ipc:
            self.ipc.emit("beat_end", name=beat.name)

    def step_forward(self) -> None:
        self.timeline.step_forward()

    def step_backward(self) -> None:
        new_index = self.timeline.step_backward()
        self.timeline.restore_checkpoint(new_index, self)

    def tear_down(self) -> None:
        if self.ipc:
            self.ipc.emit("closed")
            self.ipc.close()
        super().tear_down()
