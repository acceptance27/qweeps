"""Beat and Timeline Coordinator for 3Blue1Brown-style visual explanations.

Every visual explanation is sequenced into atomic 'Beats'.
A Beat combines:
1. Visual animation / transformations (ManimGL actions)
2. Audio narration (spoken calmly by QWEEPS)
3. Absorption pause (default 1.5 seconds) to allow visual registration
4. Checkpoints for instant backward/forward temporal scrubbing
5. Interactive element hooks for click-and-drag inspection and branching
"""
from __future__ import annotations

import copy
import time
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class Beat:
    name: str
    narration: str
    duration: float = 1.0
    absorption_pause: float = 1.5
    branch_scenes: dict[str, str] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Checkpoint:
    beat_index: int
    timestamp: float
    mobject_states: dict[int, Any] = field(default_factory=dict)
    camera_state: dict[str, Any] = field(default_factory=dict)


class Timeline:
    """Coordinates stepping forward/backward through Beats with state checkpoints."""

    def __init__(self, beats: list[Beat] | None = None) -> None:
        self.beats: list[Beat] = beats or []
        self.current_index: int = 0
        self.checkpoints: dict[int, Checkpoint] = {}
        self.is_paused: bool = False
        self.is_branching: bool = False
        self.history: list[int] = []

    def current_beat(self) -> Beat | None:
        if 0 <= self.current_index < len(self.beats):
            return self.beats[self.current_index]
        return None

    def has_next(self) -> bool:
        return self.current_index + 1 < len(self.beats)

    def has_prev(self) -> bool:
        return self.current_index > 0

    def step_forward(self) -> int:
        if self.has_next():
            self.history.append(self.current_index)
            self.current_index += 1
        return self.current_index

    def step_backward(self) -> int:
        if self.has_prev():
            self.current_index -= 1
        elif self.history:
            self.current_index = self.history.pop()
        return self.current_index

    def record_checkpoint(self, scene: Any) -> Checkpoint:
        """Captures a lightweight snapshot of mobjects and camera frame."""
        camera_state = {}
        if hasattr(scene, "camera") and hasattr(scene.camera, "frame"):
            frame = scene.camera.frame
            camera_state = {
                "center": list(frame.get_center()),
                "width": float(frame.get_width()),
                "height": float(frame.get_height()),
            }

        mstates = {}
        for mob in getattr(scene, "mobjects", []):
            mid = id(mob)
            mstates[mid] = {
                "center": list(mob.get_center()) if hasattr(mob, "get_center") else None,
                "color": getattr(mob, "color", None),
                "opacity": getattr(mob, "fill_opacity", 1.0),
            }

        cp = Checkpoint(
            beat_index=self.current_index,
            timestamp=time.time(),
            mobject_states=mstates,
            camera_state=camera_state,
        )
        self.checkpoints[self.current_index] = cp
        return cp

    def restore_checkpoint(self, beat_index: int, scene: Any) -> bool:
        """Restores camera frame and mobject positions if checkpoint exists."""
        cp = self.checkpoints.get(beat_index)
        if not cp:
            return False

        if hasattr(scene, "camera") and hasattr(scene.camera, "frame") and cp.camera_state:
            frame = scene.camera.frame
            if "center" in cp.camera_state and cp.camera_state["center"] is not None:
                frame.move_to(cp.camera_state["center"])
            if "width" in cp.camera_state and cp.camera_state["width"]:
                frame.set_width(cp.camera_state["width"])

        return True
