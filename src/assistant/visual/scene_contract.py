"""Scene Direction Contract: ASCII blueprint -> JSON contract -> ManimCE skeleton -> audits.

The compiler owns composition, zone placement, cue emission and object lifecycle.
The model only fills `build_*` and `animate_*` bodies inside declared slots.
"""
from __future__ import annotations

import ast
import copy
from dataclasses import dataclass, field
import json
import re
import textwrap
from typing import Any

from .plan import PlanError

CONTRACT_ZONES: dict[str, dict[str, list[float]]] = {
    "timeline_zone": {"x": [-6.6, 6.6], "y": [-3.65, -3.15]},
    "left_zone": {"x": [-6.6, -0.7], "y": [-2.8, 2.6]},
    "right_zone": {"x": [0.4, 6.6], "y": [-2.8, 2.6]},
    "right_top": {"x": [0.4, 6.6], "y": [0.2, 2.6]},
    "right_bottom": {"x": [0.4, 6.6], "y": [-2.8, -0.2]},
}

DEFAULT_MIN_FONT_SIZE = {"label": 24, "title": 32}
AABB_MIN_BUFF = 0.35
MAX_ELASTIC_STRETCH = 1.20


@dataclass
class CardParts:
    """Typed card return replacing brittle VGroup index conventions."""

    frame: Any
    text: Any
    extras: Any = None

    def __post_init__(self) -> None:
        if self.extras is None:
            try:
                from .recorded_scene import VGroup

                self.extras = VGroup()
            except Exception:
                self.extras = []

    def as_group(self):
        """Return a VGroup containing frame, text, and non-empty extras."""
        from .recorded_scene import VGroup

        parts = [self.frame, self.text]
        extras_sub = getattr(self.extras, "submobjects", None)
        if extras_sub:
            parts.append(self.extras)
        return VGroup(*parts)

    def _all_parts(self) -> list[Any]:
        parts = [self.frame, self.text]
        if self.extras is not None and getattr(self.extras, "submobjects", None):
            parts.append(self.extras)
        return parts

    def get_family(self) -> list[Any]:
        out = []
        seen = set()
        for part in (self.frame, self.text, self.extras):
            if part is None:
                continue
            fam = part.get_family() if hasattr(part, "get_family") else [part]
            for item in fam:
                if id(item) not in seen:
                    seen.add(id(item))
                    out.append(item)
        return out

    def get_bounding_box(self):
        return self.as_group().get_bounding_box()

    def get_center(self):
        return self.as_group().get_center()

    def get_width(self) -> float:
        return float(self.as_group().get_width())

    def get_height(self) -> float:
        return float(self.as_group().get_height())

    def move_to(self, point):
        grp = self.as_group()
        grp.move_to(point)
        return self

    def shift(self, vector):
        grp = self.as_group()
        grp.shift(vector)
        return self

    def scale(self, factor, **kwargs):
        grp = self.as_group()
        grp.scale(factor, **kwargs)
        return self

    def set_opacity(self, opacity: float, recurse: bool = True):
        for part in self._all_parts():
            if hasattr(part, "set_opacity"):
                part.set_opacity(opacity, recurse=recurse)
        return self

    def refresh_bounding_box(self, recurse_down: bool = True):
        for part in self._all_parts():
            if hasattr(part, "refresh_bounding_box"):
                part.refresh_bounding_box(recurse_down=recurse_down)
        return self


def _is_rounded_rectangle(obj: Any) -> bool:
    if obj is None:
        return False
    cls_names = [cls.__name__ for cls in type(obj).__mro__]
    return "RoundedRectangle" in cls_names


def _is_vgroup(obj: Any) -> bool:
    if obj is None:
        return False
    cls_names = [cls.__name__ for cls in type(obj).__mro__]
    return "VGroup" in cls_names


def _is_glow_frame(frame: Any) -> bool:
    if getattr(frame, "is_glow", False) or getattr(frame, "role_kind", "") == "glow":
        return True
    name = str(getattr(frame, "name", "")).lower()
    if "glow" in name or "shadow" in name or "halo" in name:
        return True
    try:
        stroke_w = float(frame.get_stroke_width())
        stroke_op = float(frame.get_stroke_opacity())
        fill_op = float(frame.get_fill_opacity())
        if stroke_w <= 0.05 and fill_op > 0:
            return True
        if stroke_op < 0.2 and fill_op < 0.5:
            return True
    except Exception:
        pass
    return False


def validate_card_parts(card: Any, object_id: str = "card", zone: str = "") -> CardParts:
    """Validate that `card` is a typed CardParts with a real RoundedRectangle frame and non-empty Text VGroup."""
    loc = f" (field='{object_id}', zone='{zone}')" if zone else f" (field='{object_id}')"
    if not isinstance(card, CardParts):
        # Explicitly reject VGroup index conventions such as a glow-at-index-0 VGroup.
        sub_desc = ""
        if hasattr(card, "submobjects") and card.submobjects:
            first = card.submobjects[0]
            sub_desc = f"; got {type(card).__name__} with index-0 {type(first).__name__}"
        raise ValueError(
            f"Card '{object_id}'{loc} must return CardParts(frame, text, extras), not {type(card).__name__}{sub_desc}"
        )
    if not _is_rounded_rectangle(card.frame):
        raise ValueError(
            f"CardParts.frame on '{object_id}'{loc} must be a RoundedRectangle, got {type(card.frame).__name__}"
        )
    if _is_glow_frame(card.frame):
        raise ValueError(
            f"CardParts.frame on '{object_id}'{loc} looks like a glow/shadow; put glow/shadow in CardParts.extras"
        )
    if not _is_vgroup(card.text):
        raise ValueError(
            f"CardParts.text on '{object_id}'{loc} must be a VGroup, got {type(card.text).__name__}"
        )
    submobs = list(getattr(card.text, "submobjects", []) or [])
    if not submobs:
        raise ValueError(f"CardParts.text on '{object_id}'{loc} must be a non-empty VGroup")
    texts = [
        m for m in card.text.get_family()
        if isinstance(getattr(m, "text", None), str) and getattr(m, "text", "").strip()
    ]
    if not texts:
        raise ValueError(
            f"CardParts.text on '{object_id}'{loc} must contain at least one non-empty Text mobject"
        )
    if not _is_vgroup(card.extras):
        raise ValueError(
            f"CardParts.extras on '{object_id}'{loc} must be a VGroup, got {type(card.extras).__name__}"
        )
    return card


def composite_card_transform(src: CardParts, dst: CardParts):
    """Morph card frames from copy, cross-fade text copies, and swap extras."""
    validate_card_parts(src, "src_card")
    validate_card_parts(dst, "dst_card")
    from .recorded_scene import AnimationGroup, FadeIn, FadeOut, FadeTransform, TransformFromCopy

    return AnimationGroup(
        TransformFromCopy(src.frame, dst.frame),
        FadeTransform(src.text.copy(), dst.text),
        FadeOut(src.extras),
        FadeIn(dst.extras),
    )


CompositeCardTransform = composite_card_transform


# ============================================================================
# Canonical ASCII Blueprints & Contract Builders
# ============================================================================

ACT1_ASCII_BLUEPRINT = """\
# SCENE DIRECTION BLUEPRINT: José Rizal Act I — Roots & Awakening in Colonial Luzon (1861–1882)
# RENDERER: manimgl | DURATION: 52.0s | FOCAL_CAP: 3 | MIN_FONT_SIZE: label=24, title=32
# PERSISTENT: timeline_anchor (zone=timeline_zone, enter=0.0s@b1, exit=50.5s@b4)
# ZONES:
#   timeline_zone: x=[-6.6, 6.6], y=[-3.65, -3.15]
#   left_zone:     x=[-6.6, -0.7], y=[-2.8, 2.6]
#   right_zone:    x=[0.4, 6.6],   y=[-2.8, 2.6]
#   right_top:     x=[0.4, 6.6],   y=[0.2, 2.6]
#   right_bottom:  x=[0.4, 6.6],   y=[-2.8, -0.2]

[BEAT b1 | 0.0s..13.0s | hold=2.0s | max_words=28] "1861 — Calamba Roots on Luzon"
  carried_in: []
  enter: luzon_locator@left_zone(mobject), calamba_card@right_zone(card)
  transforms: []
  cues: timeline_anchor@0.4s, luzon_locator@1.2s, calamba_card@2.4s
  exit: [calamba_card]
  carried_out: [luzon_locator]
  narration: "José Rizal is born in 1861 in Calamba, Laguna on Luzon, where family learning shapes his earliest view of colonial rule."

[BEAT b2 | 13.0s..26.0s | hold=2.0s | max_words=28] "1872 — Gomburza Martyrdom & Paciano's Link"
  carried_in: [luzon_locator]
  enter: gomburza_triad@right_top(mobject), paciano_link@right_bottom(card)
  transforms: []
  cues: gomburza_triad@14.2s, paciano_link@15.6s
  exit: [luzon_locator, gomburza_triad, paciano_link]
  carried_out: []
  narration: "In 1872 the execution of Fathers Gómez, Burgos, and Zamora shakes Manila, and Paciano brings that warning directly into the family."

[BEAT b3 | 26.0s..39.0s | hold=2.0s | max_words=28] "1872–1877 — From Mercado to the Surname Rizal"
  carried_in: []
  enter: mercado_badge@right_zone(card)
  transform_targets: rizal_badge@left_zone(card)
  transforms: CompositeCardTransform(mercado_badge -> rizal_badge, text_different=true, at=28.5s)
  cues: mercado_badge@27.0s, rizal_badge@29.0s
  exit: [mercado_badge]
  carried_out: [rizal_badge]
  narration: "Because the Mercado name is tied to Paciano and Burgos, young José enrolls in Manila under a protective new surname: Rizal."

[BEAT b4 | 39.0s..52.0s | hold=2.0s | max_words=28] "1877–1882 — Ophthalmology for His Mother & Patriotic Verse"
  carried_in: [rizal_badge]
  enter: med_branch@right_top(card), poetry_branch@right_bottom(card)
  transforms: []
  cues: med_branch@40.2s, poetry_branch@41.6s
  exit: [rizal_badge, med_branch, poetry_branch]
  carried_out: []
  narration: "Carrying the Rizal name, he pursues medicine to restore his mother's failing sight and poetry that calls Filipino youth forward."
"""

EV_ASCII_BLUEPRINT = """\
# SCENE DIRECTION BLUEPRINT: Electric Vehicle Battery & Motor Mechanism
# RENDERER: manimgl | DURATION: 24.0s | FOCAL_CAP: 3 | MIN_FONT_SIZE: label=24, title=32
# PERSISTENT: drivetrain_hud (zone=timeline_zone, enter=0.0s@battery_flow, exit=22.8s@motor_drive)
# ZONES:
#   timeline_zone: x=[-6.6, 6.6], y=[-3.65, -3.15]
#   left_zone:     x=[-6.6, -0.7], y=[-2.8, 2.6]
#   right_zone:    x=[0.4, 6.6],   y=[-2.8, 2.6]
#   right_top:     x=[0.4, 6.6],   y=[0.2, 2.6]
#   right_bottom:  x=[0.4, 6.6],   y=[-2.8, -0.2]

[BEAT battery_flow | 0.0s..12.0s | hold=2.0s | max_words=28] "Battery Cell Releases Direct Current"
  carried_in: []
  enter: dc_inverter_card@left_zone(card), cell_diagram@right_zone(mobject)
  transforms: []
  cues: drivetrain_hud@0.4s, dc_inverter_card@1.2s, cell_diagram@2.2s
  exit: [cell_diagram]
  carried_out: [dc_inverter_card]
  narration: "Lithium ions cross the separator inside each cell while electrons travel the outer circuit as direct current into the inverter."

[BEAT motor_drive | 12.0s..24.0s | hold=2.0s | max_words=28] "Three-Phase AC Spins the Rotor"
  carried_in: [dc_inverter_card]
  enter: stator_rotor@right_top(mobject), wheel_torque_card@right_bottom(card)
  transforms: []
  cues: stator_rotor@13.2s, wheel_torque_card@14.6s
  exit: [dc_inverter_card, stator_rotor, wheel_torque_card]
  carried_out: []
  narration: "The inverter switches direct current into three-phase alternating current, creating a rotating magnetic field that pulls the rotor and turns the wheels."
"""


def rizal_act1_contract() -> dict[str, Any]:
    """Return the canonical Scene Direction Contract for José Rizal Act I (4 beats, 52s)."""
    return {
        "id": "rizal_act1",
        "title": "José Rizal Act I: Roots & Awakening in Colonial Luzon (1861–1882)",
        "renderer": "manimgl",
        "duration": 52.0,
        "focal_cap": 3,
        "min_font_size": {"label": 24, "title": 32},
        "zones": copy.deepcopy(CONTRACT_ZONES),
        "persistent": ["timeline_anchor"],
        "persistent_enter": {
            "timeline_anchor": {"beat": "b1", "at": 0.0, "zone": "timeline_zone"}
        },
        "persistent_exit": {
            "timeline_anchor": {"beat": "b4", "at": 50.5, "zone": "timeline_zone"}
        },
        "beats": [
            {
                "id": "b1",
                "title": "1861 — Calamba Roots on Luzon",
                "duration": 13.0,
                "narration": (
                    "José Rizal is born in 1861 in Calamba, Laguna on Luzon, "
                    "where family learning shapes his earliest view of colonial rule."
                ),
                "narration_words": 21,
                "max_words": 28,
                "on_screen_words": 8,
                "visual_hold": 2.0,
                "exit_duration": 0.8,
                "carried_in": [],
                "enter": ["luzon_locator", "calamba_card"],
                "transform_targets": [],
                "exit": ["calamba_card"],
                "carried_out": ["luzon_locator"],
                "zone_bindings": {
                    "luzon_locator": "left_zone",
                    "calamba_card": "right_zone",
                },
                "object_kinds": {
                    "luzon_locator": "mobject",
                    "calamba_card": "card",
                },
                "cues": [
                    {"target": "timeline_anchor", "at": 0.4},
                    {"target": "luzon_locator", "at": 1.2},
                    {"target": "calamba_card", "at": 2.4},
                ],
                "transforms": [],
            },
            {
                "id": "b2",
                "title": "1872 — Gomburza Martyrdom & Paciano's Link",
                "duration": 13.0,
                "narration": (
                    "In 1872 the execution of Fathers Gómez, Burgos, and Zamora shakes Manila, "
                    "and Paciano brings that warning directly into the family."
                ),
                "narration_words": 21,
                "max_words": 28,
                "on_screen_words": 10,
                "visual_hold": 2.0,
                "exit_duration": 0.8,
                "carried_in": ["luzon_locator"],
                "enter": ["gomburza_triad", "paciano_link"],
                "transform_targets": [],
                "exit": ["luzon_locator", "gomburza_triad", "paciano_link"],
                "carried_out": [],
                "zone_bindings": {
                    "luzon_locator": "left_zone",
                    "gomburza_triad": "right_top",
                    "paciano_link": "right_bottom",
                },
                "object_kinds": {
                    "luzon_locator": "mobject",
                    "gomburza_triad": "mobject",
                    "paciano_link": "card",
                },
                "cues": [
                    {"target": "gomburza_triad", "at": 14.2},
                    {"target": "paciano_link", "at": 15.6},
                ],
                "transforms": [],
            },
            {
                "id": "b3",
                "title": "1872–1877 — From Mercado to the Surname Rizal",
                "duration": 13.0,
                "narration": (
                    "Because the Mercado name is tied to Paciano and Burgos, "
                    "young José enrolls in Manila under a protective new surname: Rizal."
                ),
                "narration_words": 21,
                "max_words": 28,
                "on_screen_words": 8,
                "visual_hold": 2.0,
                "exit_duration": 0.8,
                "carried_in": [],
                "enter": ["mercado_badge"],
                "transform_targets": ["rizal_badge"],
                "exit": ["mercado_badge"],
                "carried_out": ["rizal_badge"],
                "zone_bindings": {
                    "mercado_badge": "right_zone",
                    "rizal_badge": "left_zone",
                },
                "object_kinds": {
                    "mercado_badge": "card",
                    "rizal_badge": "card",
                },
                "cues": [
                    {"target": "mercado_badge", "at": 27.0},
                    {"target": "rizal_badge", "at": 29.0},
                ],
                "transforms": [
                    {
                        "source": "mercado_badge",
                        "target": "rizal_badge",
                        "type": "CompositeCardTransform",
                        "text_different": True,
                        "at": 28.5,
                    }
                ],
            },
            {
                "id": "b4",
                "title": "1877–1882 — Ophthalmology for His Mother & Patriotic Verse",
                "duration": 13.0,
                "narration": (
                    "Carrying the Rizal name, he pursues medicine to restore his mother's "
                    "failing sight and poetry that calls Filipino youth forward."
                ),
                "narration_words": 20,
                "max_words": 28,
                "on_screen_words": 10,
                "visual_hold": 2.0,
                "exit_duration": 1.5,
                "carried_in": ["rizal_badge"],
                "enter": ["med_branch", "poetry_branch"],
                "transform_targets": [],
                "exit": ["rizal_badge", "med_branch", "poetry_branch"],
                "carried_out": [],
                "zone_bindings": {
                    "rizal_badge": "left_zone",
                    "med_branch": "right_top",
                    "poetry_branch": "right_bottom",
                },
                "object_kinds": {
                    "rizal_badge": "card",
                    "med_branch": "card",
                    "poetry_branch": "card",
                },
                "cues": [
                    {"target": "med_branch", "at": 40.2},
                    {"target": "poetry_branch", "at": 41.6},
                ],
                "transforms": [],
            },
        ],
    }


def ev_scene_contract() -> dict[str, Any]:
    """Return the Scene Direction Contract for the EV native battery + motor scene."""
    return {
        "id": "ev_drivetrain_native",
        "title": "How an Electric Vehicle Turns Stored Charge into Wheel Motion",
        "renderer": "manimgl",
        "duration": 24.0,
        "focal_cap": 3,
        "min_font_size": {"label": 24, "title": 32},
        "zones": copy.deepcopy(CONTRACT_ZONES),
        "persistent": ["drivetrain_hud"],
        "persistent_enter": {
            "drivetrain_hud": {"beat": "battery_flow", "at": 0.0, "zone": "timeline_zone"}
        },
        "persistent_exit": {
            "drivetrain_hud": {"beat": "motor_drive", "at": 22.8, "zone": "timeline_zone"}
        },
        "beats": [
            {
                "id": "battery_flow",
                "title": "Battery Cell Releases Direct Current",
                "duration": 12.0,
                "narration": (
                    "Lithium ions cross the separator inside each cell while electrons "
                    "travel the outer circuit as direct current into the inverter."
                ),
                "narration_words": 20,
                "max_words": 28,
                "on_screen_words": 8,
                "visual_hold": 2.0,
                "exit_duration": 0.8,
                "carried_in": [],
                "enter": ["dc_inverter_card", "cell_diagram"],
                "transform_targets": [],
                "exit": ["cell_diagram"],
                "carried_out": ["dc_inverter_card"],
                "zone_bindings": {
                    "dc_inverter_card": "left_zone",
                    "cell_diagram": "right_zone",
                },
                "object_kinds": {
                    "dc_inverter_card": "card",
                    "cell_diagram": "mobject",
                },
                "cues": [
                    {"target": "drivetrain_hud", "at": 0.4},
                    {"target": "dc_inverter_card", "at": 1.2},
                    {"target": "cell_diagram", "at": 2.2},
                ],
                "transforms": [],
            },
            {
                "id": "motor_drive",
                "title": "Three-Phase AC Spins the Rotor",
                "duration": 12.0,
                "narration": (
                    "The inverter switches direct current into three-phase alternating current, "
                    "creating a rotating magnetic field that pulls the rotor and turns the wheels."
                ),
                "narration_words": 22,
                "max_words": 28,
                "on_screen_words": 10,
                "visual_hold": 2.0,
                "exit_duration": 1.2,
                "carried_in": ["dc_inverter_card"],
                "enter": ["stator_rotor", "wheel_torque_card"],
                "transform_targets": [],
                "exit": ["dc_inverter_card", "stator_rotor", "wheel_torque_card"],
                "carried_out": [],
                "zone_bindings": {
                    "dc_inverter_card": "left_zone",
                    "stator_rotor": "right_top",
                    "wheel_torque_card": "right_bottom",
                },
                "object_kinds": {
                    "dc_inverter_card": "card",
                    "stator_rotor": "mobject",
                    "wheel_torque_card": "card",
                },
                "cues": [
                    {"target": "stator_rotor", "at": 13.2},
                    {"target": "wheel_torque_card", "at": 14.6},
                ],
                "transforms": [],
            },
        ],
    }


def ev_hybrid_lesson_plan() -> dict[str, Any]:
    """Return the 6-beat EV hybrid lesson storyboard (native battery/motor + layout intro/regen/charging/recall)."""
    return {
        "id": "ev_hybrid_lesson",
        "title": "How an Electric Vehicle Uses, Recovers, and Refills Energy",
        "question": "How does an electric car turn battery charge into wheel motion and recover energy when braking?",
        "representation": "Shared drivetrain loop: layout intro -> native battery/motor mechanism -> layout regen, charging, and loci recall.",
        "native_beats": ["battery_flow", "motor_drive"],
        "layout_beats": ["power_intro", "regen_braking", "charging_steps", "efficiency_recall"],
        "native_contract": ev_scene_contract(),
        "beats": [
            {
                "id": "power_intro",
                "title": "Electric Drivetrain Overview",
                "renderer": "layout",
                "layout": "comparison",
                "teaching": "comparison",
                "duration": 10.0,
                "narration": "Unlike a fuel engine, an electric drivetrain moves energy cleanly between three main stages: battery pack, power inverter, and reversible electric motor.",
            },
            {
                "id": "battery_flow",
                "title": "Battery Cell Releases Direct Current",
                "renderer": "manimgl",
                "layout": "diagram",
                "teaching": "mechanism",
                "duration": 12.0,
                "narration": "Lithium ions cross the separator inside each cell while electrons travel the outer circuit as direct current into the inverter.",
            },
            {
                "id": "motor_drive",
                "title": "Three-Phase AC Spins the Rotor",
                "renderer": "manimgl",
                "layout": "diagram",
                "teaching": "mechanism",
                "duration": 12.0,
                "narration": "The inverter switches direct current into three-phase alternating current, creating a rotating magnetic field that pulls the rotor and turns the wheels.",
            },
            {
                "id": "regen_braking",
                "title": "Regenerative Braking Runs the Motor in Reverse",
                "renderer": "layout",
                "layout": "diagram",
                "teaching": "mechanism",
                "duration": 10.0,
                "narration": "When slowing down, wheel momentum drives the rotor as a generator, sending current back through the inverter to recover battery charge.",
            },
            {
                "id": "charging_steps",
                "title": "Charging Converts Grid AC Back into Cell Storage",
                "renderer": "layout",
                "layout": "process",
                "teaching": "procedure",
                "duration": 10.0,
                "narration": "At a charging station, the onboard charger rectifies grid power into regulated direct current while the battery management system balances each cell.",
            },
            {
                "id": "efficiency_recall",
                "title": "Recall the Four-Stop EV Energy Loop",
                "renderer": "layout",
                "layout": "loci",
                "teaching": "recall",
                "duration": 10.0,
                "narration": "Walk the four landmarks in order: cell discharge, rotating stator field, regenerative braking recovery, and managed plug-in recharge.",
            },
        ],
    }


def _parse_list_tokens(raw: str) -> list[str]:
    raw = raw.strip().strip("[]")
    if not raw:
        return []
    return [tok.strip() for tok in raw.split(",") if tok.strip()]


def ascii_to_scene_contract(ascii_blueprint: str) -> dict[str, Any]:
    """Convert an ASCII blueprint into a structured Scene Direction Contract."""
    text = (ascii_blueprint or "").strip()
    if not text:
        raise ValueError("ASCII blueprint is empty")

    renderer = "manimgl"
    total_duration = 52.0
    focal_cap = 3
    min_font_size = dict(DEFAULT_MIN_FONT_SIZE)
    zones = copy.deepcopy(CONTRACT_ZONES)
    persistent: list[str] = []
    persistent_enter: dict[str, dict[str, Any]] = {}
    persistent_exit: dict[str, dict[str, Any]] = {}
    title = "Scene Direction Contract"

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# SCENE DIRECTION BLUEPRINT:"):
            title = stripped.split(":", 1)[1].strip()
        elif stripped.startswith("# RENDERER:"):
            m_rend = re.search(r"RENDERER:\s*(\w+)", stripped)
            if m_rend:
                renderer = m_rend.group(1).lower()
            m_dur = re.search(r"DURATION:\s*([0-9.]+)s?", stripped)
            if m_dur:
                total_duration = float(m_dur.group(1))
            m_cap = re.search(r"FOCAL_CAP:\s*(\d+)", stripped)
            if m_cap:
                focal_cap = int(m_cap.group(1))
            m_lbl = re.search(r"label=(\d+)", stripped)
            m_ttl = re.search(r"title=(\d+)", stripped)
            if m_lbl:
                min_font_size["label"] = int(m_lbl.group(1))
            if m_ttl:
                min_font_size["title"] = int(m_ttl.group(1))
        elif stripped.startswith("# PERSISTENT:"):
            m_p = re.search(
                r"PERSISTENT:\s*(\w+)\s*\(zone=(\w+),\s*enter=([0-9.]+)s@(\w+),\s*exit=([0-9.]+)s@(\w+)\)",
                stripped,
            )
            if m_p:
                pid, pzone, enter_t, enter_b, exit_t, exit_b = m_p.groups()
                persistent.append(pid)
                persistent_enter[pid] = {"beat": enter_b, "at": float(enter_t), "zone": pzone}
                persistent_exit[pid] = {"beat": exit_b, "at": float(exit_t), "zone": pzone}

    beat_header_re = re.compile(
        r'^\[BEAT\s+(\w+)\s*\|\s*([0-9.]+)s\.\.([0-9.]+)s\s*\|\s*hold=([0-9.]+)s\s*\|\s*max_words=(\d+)\]\s*"([^"]+)"'
    )
    beats: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    last_zone_by_obj: dict[str, str] = {}
    last_kind_by_obj: dict[str, str] = {}

    for line in text.splitlines():
        stripped = line.strip()
        m_beat = beat_header_re.match(stripped)
        if m_beat:
            if current is not None:
                beats.append(current)
            bid, start_s, end_s, hold_s, max_w, btitle = m_beat.groups()
            dur = round(float(end_s) - float(start_s), 3)
            current = {
                "id": bid,
                "title": btitle,
                "duration": dur,
                "narration": "",
                "narration_words": 0,
                "max_words": int(max_w),
                "on_screen_words": 8,
                "visual_hold": float(hold_s),
                "exit_duration": 0.8,
                "carried_in": [],
                "enter": [],
                "transform_targets": [],
                "exit": [],
                "carried_out": [],
                "zone_bindings": {},
                "object_kinds": {},
                "cues": [],
                "transforms": [],
            }
            continue
        if current is None or not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("carried_in:"):
            items = _parse_list_tokens(stripped.split(":", 1)[1])
            current["carried_in"] = items
            for item in items:
                if item in last_zone_by_obj:
                    current["zone_bindings"][item] = last_zone_by_obj[item]
                if item in last_kind_by_obj:
                    current["object_kinds"][item] = last_kind_by_obj[item]
        elif stripped.startswith("enter:"):
            raw_items = _parse_list_tokens(stripped.split(":", 1)[1])
            for raw_item in raw_items:
                m_obj = re.match(r"(\w+)@(\w+)(?:\((\w+)\))?", raw_item)
                if m_obj:
                    oid, zname, okind = m_obj.groups()
                    okind = okind or ("card" if ("card" in oid or "badge" in oid) else "mobject")
                    current["enter"].append(oid)
                    current["zone_bindings"][oid] = zname
                    current["object_kinds"][oid] = okind
                    last_zone_by_obj[oid] = zname
                    last_kind_by_obj[oid] = okind
        elif stripped.startswith("transform_targets:"):
            raw_items = _parse_list_tokens(stripped.split(":", 1)[1])
            for raw_item in raw_items:
                m_obj = re.match(r"(\w+)@(\w+)(?:\((\w+)\))?", raw_item)
                if m_obj:
                    oid, zname, okind = m_obj.groups()
                    okind = okind or ("card" if ("card" in oid or "badge" in oid) else "mobject")
                    current["transform_targets"].append(oid)
                    current["zone_bindings"][oid] = zname
                    current["object_kinds"][oid] = okind
                    last_zone_by_obj[oid] = zname
                    last_kind_by_obj[oid] = okind
        elif stripped.startswith("transforms:"):
            val = stripped.split(":", 1)[1].strip()
            if val and val != "[]":
                m_tr = re.search(
                    r"(\w+)\((\w+)\s*->\s*(\w+),\s*text_different=(true|false),\s*at=([0-9.]+)s\)",
                    val,
                    re.I,
                )
                if m_tr:
                    ttype, src, dst, tdiff, at_s = m_tr.groups()
                    current["transforms"].append(
                        {
                            "source": src,
                            "target": dst,
                            "type": ttype,
                            "text_different": tdiff.lower() == "true",
                            "at": float(at_s),
                        }
                    )
        elif stripped.startswith("cues:"):
            raw_items = _parse_list_tokens(stripped.split(":", 1)[1])
            for raw_item in raw_items:
                m_cue = re.match(r"(\w+)@([0-9.]+)s?", raw_item)
                if m_cue:
                    target, at_s = m_cue.groups()
                    current["cues"].append({"target": target, "at": float(at_s)})
        elif stripped.startswith("exit:"):
            current["exit"] = _parse_list_tokens(stripped.split(":", 1)[1])
        elif stripped.startswith("carried_out:"):
            current["carried_out"] = _parse_list_tokens(stripped.split(":", 1)[1])
        elif stripped.startswith("narration:"):
            narr = stripped.split(":", 1)[1].strip().strip('"')
            current["narration"] = narr
            current["narration_words"] = len(narr.split())

    if current is not None:
        beats.append(current)

    # Adjust final beat exit_duration if persistent exits before end
    if beats and persistent_exit:
        last_beat = beats[-1]
        for pinfo in persistent_exit.values():
            if pinfo.get("beat") == last_beat["id"]:
                rem = round(total_duration - float(pinfo.get("at", total_duration)), 3)
                if rem > 0:
                    last_beat["exit_duration"] = rem

    return {
        "id": "rizal_act1" if "Rizal" in title else "blueprint_scene",
        "title": title,
        "renderer": renderer,
        "duration": total_duration,
        "focal_cap": focal_cap,
        "min_font_size": min_font_size,
        "zones": zones,
        "persistent": persistent,
        "persistent_enter": persistent_enter,
        "persistent_exit": persistent_exit,
        "beats": beats,
    }


# ============================================================================
# Phase 1 & Phase 5 — Contract Validator & Elastic Post-Sync Remapping
# ============================================================================

def _normalize_zone_bounds(zone: dict[str, Any]) -> tuple[float, float, float, float]:
    """Return (x_min, x_max, y_min, y_max) for a zone definition."""
    if isinstance(zone.get("x"), (list, tuple)) and isinstance(zone.get("y"), (list, tuple)):
        return (
            float(zone["x"][0]),
            float(zone["x"][1]),
            float(zone["y"][0]),
            float(zone["y"][1]),
        )
    x = float(zone.get("x", 0.0))
    y = float(zone.get("y", 0.0))
    w = float(zone.get("width", 0.0))
    h = float(zone.get("height", 0.0))
    return (x, x + w, y, y + h)


def aabb_metrics(box_a: list[float] | tuple[float, float, float, float],
                 box_b: list[float] | tuple[float, float, float, float]) -> dict[str, float]:
    """Compute intersection area and axis gaps between two 2D AABBs [x1, y1, x2, y2]."""
    ax1, ay1, ax2, ay2 = [float(v) for v in box_a]
    bx1, by1, bx2, by2 = [float(v) for v in box_b]
    overlap_x = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    overlap_y = max(0.0, min(ay2, by2) - max(ay1, by1))
    intersection = overlap_x * overlap_y
    gap_x = max(0.0, max(ax1, bx1) - min(ax2, bx2))
    gap_y = max(0.0, max(ay1, by1) - min(ay2, by2))
    return {
        "intersection": intersection,
        "gap_x": gap_x,
        "gap_y": gap_y,
        "collides": float(intersection > 0.0 or (gap_x < AABB_MIN_BUFF - 1e-6 and gap_y < AABB_MIN_BUFF - 1e-6)),
    }


def _min_font_floors(contract: dict[str, Any]) -> tuple[float, float]:
    raw = contract.get("min_font_size")
    if isinstance(raw, dict):
        return float(raw.get("label", 24)), float(raw.get("title", 32))
    if isinstance(raw, (int, float)):
        return float(raw), float(contract.get("min_title_font_size", 32))
    return 24.0, 32.0


def validate_scene_contract(
    contract: dict[str, Any],
    post_sync: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Validate a Scene Direction Contract before TTS and (optionally) after TTS sync.

    Returns a list of error dicts (empty list means valid with zero errors).
    """
    errors: list[dict[str, Any]] = []
    if not isinstance(contract, dict):
        return [{"code": "invalid-contract", "detail": "contract must be a dict"}]

    renderer = contract.get("renderer")
    if renderer not in {"manimgl", "manimce", "layout"}:
        errors.append({
            "code": "invalid-renderer",
            "field": "renderer",
            "detail": f"Unsupported renderer {renderer!r}",
        })

    total_duration = float(contract.get("duration") or 0.0)
    if total_duration <= 0:
        errors.append({
            "code": "invalid-duration",
            "field": "duration",
            "detail": "Contract duration must be positive",
        })

    focal_cap = int(contract.get("focal_cap") or 0)
    if focal_cap < 1:
        errors.append({
            "code": "invalid-focal-cap",
            "field": "focal_cap",
            "detail": "focal_cap must be >= 1",
        })

    label_floor, title_floor = _min_font_floors(contract)
    if label_floor < 24 or title_floor < 32:
        errors.append({
            "code": "font-floor-violation",
            "field": "min_font_size",
            "detail": f"min_font_size requires label >= 24 and title >= 32 (got label={label_floor}, title={title_floor})",
        })

    zones = contract.get("zones") or {}
    if not isinstance(zones, dict) or not zones:
        errors.append({
            "code": "missing-zones",
            "field": "zones",
            "detail": "Contract must define stage zones",
        })
    zone_boxes: dict[str, tuple[float, float, float, float]] = {}
    for zname, zspec in (zones.items() if isinstance(zones, dict) else []):
        try:
            x1, x2, y1, y2 = _normalize_zone_bounds(zspec)
            if x2 <= x1 or y2 <= y1:
                errors.append({
                    "code": "invalid-zone-bounds",
                    "field": zname,
                    "zone": zname,
                    "detail": f"Zone '{zname}' has non-positive extent ({x1}..{x2}, {y1}..{y2})",
                })
            else:
                zone_boxes[zname] = (x1, x2, y1, y2)
        except Exception as exc:
            errors.append({
                "code": "invalid-zone-bounds",
                "field": zname,
                "zone": zname,
                "detail": str(exc),
            })

    beats = list(contract.get("beats") or [])
    if not beats:
        errors.append({
            "code": "empty-beats",
            "field": "beats",
            "detail": "Contract must contain at least one beat",
        })
        return errors

    beat_ids = [b.get("id") for b in beats]
    persistent = list(contract.get("persistent") or [])
    p_enter = contract.get("persistent_enter") or {}
    p_exit = contract.get("persistent_exit") or {}
    for pid in persistent:
        if pid not in p_enter:
            errors.append({
                "code": "persistent-enter-missing",
                "field": pid,
                "detail": f"Persistent object '{pid}' has no persistent_enter declaration",
            })
        else:
            eb = p_enter[pid].get("beat") if isinstance(p_enter[pid], dict) else p_enter[pid]
            if eb != beats[0].get("id"):
                errors.append({
                    "code": "persistent-enter-beat",
                    "field": pid,
                    "detail": f"Persistent object '{pid}' must enter at Beat 1 ({beats[0].get('id')}), got {eb!r}",
                })
        if pid not in p_exit:
            errors.append({
                "code": "persistent-leak",
                "field": pid,
                "detail": f"Persistent object '{pid}' never exits (missing persistent_exit)",
            })
        else:
            ex = p_exit[pid]
            ex_beat = ex.get("beat") if isinstance(ex, dict) else ex
            ex_at = float(ex.get("at", total_duration)) if isinstance(ex, dict) else 0.0
            if ex_beat not in beat_ids:
                errors.append({
                    "code": "persistent-leak",
                    "field": pid,
                    "detail": f"Persistent object '{pid}' exits on unknown beat {ex_beat!r}",
                })
            if isinstance(ex, dict) and (ex_at <= 0.0 or ex_at >= total_duration):
                errors.append({
                    "code": "persistent-leak",
                    "field": pid,
                    "detail": f"Persistent object '{pid}' exit time {ex_at}s must be before scene end ({total_duration}s)",
                })

    clock = 0.0
    prev_carried_out: list[str] = []

    for index, beat in enumerate(beats):
        bid = str(beat.get("id") or f"beat_{index + 1}")
        bdur = float(beat.get("duration") or 0.0)
        b_start = clock
        b_end = round(clock + bdur, 6)
        clock = b_end

        if bdur <= 0:
            errors.append({
                "code": "invalid-beat-duration",
                "beat": bid,
                "field": "duration",
                "detail": f"Beat '{bid}' duration must be > 0",
            })

        carried_in = list(beat.get("carried_in") or [])
        enter = list(beat.get("enter") or [])
        transform_targets = list(beat.get("transform_targets") or [])
        exit_ids = list(beat.get("exit") or [])
        carried_out = list(beat.get("carried_out") or [])
        transforms = list(beat.get("transforms") or [])
        cues = list(beat.get("cues") or [])
        zone_bindings = dict(beat.get("zone_bindings") or {})
        kinds = dict(beat.get("object_kinds") or {})

        # 1. Carry mismatch check
        if index == 0 and carried_in:
            errors.append({
                "code": "carry-mismatch",
                "beat": bid,
                "field": "carried_in",
                "detail": f"First beat '{bid}' cannot have carried_in={carried_in}",
            })
        elif index > 0 and carried_in != prev_carried_out:
            errors.append({
                "code": "carry-mismatch",
                "beat": bid,
                "field": "carried_in",
                "detail": f"Beat '{bid}' carried_in={carried_in} does not match previous carried_out={prev_carried_out}",
            })

        overlap_enter = set(carried_in).intersection(enter)
        if overlap_enter:
            errors.append({
                "code": "duplicate-enter",
                "beat": bid,
                "field": sorted(overlap_enter)[0],
                "detail": f"Object(s) {sorted(overlap_enter)} are already in carried_in and cannot re-enter",
            })

        active_focal = list(dict.fromkeys(carried_in + enter + transform_targets))

        # 2. Focal cap check
        if len(active_focal) > focal_cap:
            errors.append({
                "code": "focal-cap-breach",
                "beat": bid,
                "field": "focal_cap",
                "detail": f"Beat '{bid}' has {len(active_focal)} active focal objects ({active_focal}) > focal_cap={focal_cap}",
            })

        # 3. Transform source/target activation & text-different TransformFromCopy ban
        produced_targets: set[str] = set()
        replaced_sources: set[str] = set()
        for tr in transforms:
            src = tr.get("source")
            dst = tr.get("target")
            ttype = tr.get("type") or ""
            text_diff = bool(tr.get("text_different", False))
            if src not in carried_in and src not in enter:
                errors.append({
                    "code": "inactive-transform-source",
                    "beat": bid,
                    "field": str(src),
                    "detail": f"Transform source '{src}' is not active in beat '{bid}'",
                })
            if dst not in transform_targets:
                errors.append({
                    "code": "undeclared-transform-target",
                    "beat": bid,
                    "field": str(dst),
                    "detail": f"Transform target '{dst}' is not declared in transform_targets of beat '{bid}'",
                })
            produced_targets.add(str(dst))
            src_is_card = kinds.get(src) == "card" or any(tok in str(src) for tok in ("card", "badge"))
            dst_is_card = kinds.get(dst) == "card" or any(tok in str(dst) for tok in ("card", "badge"))
            if ttype in {"TransformFromCopy", "Transform"} and (text_diff or (src_is_card and dst_is_card and src != dst)):
                errors.append({
                    "code": "text-transform-ban",
                    "beat": bid,
                    "field": f"{src}->{dst}",
                    "detail": f"Banned {ttype} on text-different cards '{src}' -> '{dst}'; use CompositeCardTransform",
                })
            if ttype == "ReplacementTransform":
                replaced_sources.add(str(src))

        for t_id in transform_targets:
            if t_id not in produced_targets:
                errors.append({
                    "code": "orphan-transform-target",
                    "beat": bid,
                    "field": t_id,
                    "detail": f"transform_target '{t_id}' has no matching transform in beat '{bid}'",
                })

        # 4. Lifecycle leaks & exits
        for ex_id in exit_ids:
            if ex_id not in active_focal:
                errors.append({
                    "code": "invalid-exit",
                    "beat": bid,
                    "field": ex_id,
                    "detail": f"Exit object '{ex_id}' is not active in beat '{bid}'",
                })

        surviving = [
            oid for oid in active_focal
            if oid not in set(exit_ids) and oid not in replaced_sources
        ]
        leaked = [oid for oid in surviving if oid not in set(carried_out)]
        for lid in leaked:
            errors.append({
                "code": "lifecycle-leak",
                "beat": bid,
                "field": lid,
                "detail": f"Object '{lid}' neither exits nor is carried_out in beat '{bid}'",
            })
        missing_carry = [oid for oid in carried_out if oid not in set(surviving)]
        for mid in missing_carry:
            errors.append({
                "code": "carry-mismatch",
                "beat": bid,
                "field": mid,
                "detail": f"Object '{mid}' in carried_out was already exited or not active in beat '{bid}'",
            })

        if index == len(beats) - 1 and carried_out:
            errors.append({
                "code": "lifecycle-leak",
                "beat": bid,
                "field": "carried_out",
                "detail": f"Final beat '{bid}' must leave canvas empty, but carried_out={carried_out}",
            })

        # 5. Zone bindings & intra-zone slot checks
        for oid in active_focal:
            zname = zone_bindings.get(oid)
            if not zname:
                errors.append({
                    "code": "missing-zone-binding",
                    "beat": bid,
                    "field": oid,
                    "detail": f"Active object '{oid}' has no zone binding in beat '{bid}'",
                })
            elif zname not in zone_boxes:
                errors.append({
                    "code": "unknown-zone",
                    "beat": bid,
                    "field": oid,
                    "zone": zname,
                    "detail": f"Object '{oid}' bound to unknown zone '{zname}' in beat '{bid}'",
                })

        for i_a, id_a in enumerate(active_focal):
            za = zone_bindings.get(id_a)
            if not za or za not in zone_boxes:
                continue
            for id_b in active_focal[i_a + 1:]:
                zb = zone_bindings.get(id_b)
                if not zb or zb not in zone_boxes:
                    continue
                if za == zb:
                    errors.append({
                        "code": "zone-slot-collision",
                        "beat": bid,
                        "field": f"{id_a},{id_b}",
                        "zone": za,
                        "detail": f"Simultaneously active objects '{id_a}' and '{id_b}' share zone '{za}'; split into slots",
                    })
                else:
                    metrics = aabb_metrics(zone_boxes[za], zone_boxes[zb])
                    if metrics["collides"]:
                        errors.append({
                            "code": "zone-slot-collision",
                            "beat": bid,
                            "field": f"{id_a},{id_b}",
                            "zone": f"{za},{zb}",
                            "detail": (
                                f"Zones '{za}' and '{zb}' for '{id_a}' and '{id_b}' violate {AABB_MIN_BUFF} buff "
                                f"(gap_x={metrics['gap_x']:.2f}, gap_y={metrics['gap_y']:.2f})"
                            ),
                        })

        # 6. Cue target & timing checks
        valid_cue_targets = set(active_focal) | set(persistent)
        for cue in cues:
            target = cue.get("target") or cue.get("id")
            at = float(cue.get("at", -1.0))
            if target not in valid_cue_targets:
                errors.append({
                    "code": "invalid-cue-target",
                    "beat": bid,
                    "field": str(target),
                    "detail": f"Cue target '{target}' is not active in beat '{bid}'",
                })
            # Accept either absolute scene time [b_start, b_end] or beat-relative [0, bdur]
            in_abs = b_start - 1e-6 <= at <= b_end + 1e-6
            in_rel = 0.0 <= at <= bdur + 1e-6 and b_start == 0.0
            if not (in_abs or in_rel):
                errors.append({
                    "code": "cue-timing-violation",
                    "beat": bid,
                    "field": str(target),
                    "detail": f"Cue '{target}' at {at}s is outside beat '{bid}' window [{b_start:.2f}, {b_end:.2f}]",
                })

        # 7. Word, duration, and visual hold budgets
        narration = str(beat.get("narration") or "").strip()
        words = int(beat.get("narration_words") or (len(narration.split()) if narration else 0))
        max_words = int(beat.get("max_words") or 30)
        visual_hold = float(beat.get("visual_hold") or 0.0)
        exit_dur = float(beat.get("exit_duration") or 0.8)

        if words > max_words:
            errors.append({
                "code": "word-budget-exceeded",
                "beat": bid,
                "field": "narration_words",
                "detail": f"Beat '{bid}' has {words} narration_words > max_words={max_words}",
            })
        if visual_hold < 1.0:
            errors.append({
                "code": "reading-hold-violation",
                "beat": bid,
                "field": "visual_hold",
                "detail": f"Beat '{bid}' visual_hold={visual_hold}s is below the 1.0s minimum reading hold",
            })
        est_speech = words / 2.5
        if est_speech + visual_hold + exit_dur > bdur + 1e-6 and post_sync is None:
            errors.append({
                "code": "beat-budget-exceeded",
                "beat": bid,
                "field": "duration",
                "detail": (
                    f"Beat '{bid}' estimated speech ({est_speech:.2f}s) + hold ({visual_hold:.2f}s) "
                    f"+ exit ({exit_dur:.2f}s) exceeds duration ({bdur:.2f}s)"
                ),
            })

        prev_carried_out = carried_out

    if abs(clock - total_duration) > 0.05:
        errors.append({
            "code": "duration-mismatch",
            "field": "duration",
            "detail": f"Sum of beat durations ({clock:.2f}s) != contract duration ({total_duration:.2f}s)",
        })

    # 8. Post-sync validation (when post_sync measurements/remapping are supplied)
    if post_sync is not None:
        errors.extend(_validate_post_sync(contract, post_sync))

    return errors


def _validate_post_sync(contract: dict[str, Any], post_sync: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    max_stretch = float(post_sync.get("max_stretch", MAX_ELASTIC_STRETCH))
    sync_beats = {b["id"]: b for b in (post_sync.get("beats") or []) if isinstance(b, dict) and "id" in b}
    speech_map = post_sync.get("speech_durations") or {}

    clock = 0.0
    for beat in contract.get("beats") or []:
        bid = beat["id"]
        target_dur = float(beat["duration"])
        visual_hold = float(beat.get("visual_hold", 2.0))
        exit_dur = float(beat.get("exit_duration", 0.8))

        sb = sync_beats.get(bid) or {}
        speech_dur = float(sb.get("speech_duration", speech_map.get(bid, 0.0)))
        actual_dur = float(sb.get("actual_duration", beat.get("actual_duration", target_dur)))
        b_start = float(sb.get("start", clock))
        b_end = float(sb.get("end", b_start + actual_dur))
        exit_start = float(sb.get("exit_start", b_end - exit_dur))
        clock = b_end

        if actual_dur < visual_hold - 1e-6:
            errors.append({
                "code": "post-sync-hold-short",
                "beat": bid,
                "field": "actual_duration",
                "detail": f"Beat '{bid}' actual_duration ({actual_dur:.2f}s) < visual_hold ({visual_hold:.2f}s)",
            })
        if speech_dur + visual_hold > actual_dur + 1e-6:
            errors.append({
                "code": "post-sync-speech-hold-exceeded",
                "beat": bid,
                "field": "speech_duration",
                "detail": (
                    f"Beat '{bid}' speech ({speech_dur:.2f}s) + hold ({visual_hold:.2f}s) "
                    f"> actual_duration ({actual_dur:.2f}s)"
                ),
            })
        if actual_dur > target_dur * max_stretch + 1e-6:
            errors.append({
                "code": "post-sync-stretch-exceeded",
                "beat": bid,
                "field": "actual_duration",
                "detail": (
                    f"Beat '{bid}' actual_duration ({actual_dur:.2f}s) exceeds max_stretch cap "
                    f"({target_dur * max_stretch:.2f}s)"
                ),
            })
        if exit_start < b_start + speech_dur - 1e-6:
            errors.append({
                "code": "post-sync-early-exit",
                "beat": bid,
                "field": "exit_start",
                "detail": (
                    f"Beat '{bid}' exit starts at {exit_start:.2f}s before speech ends at "
                    f"{b_start + speech_dur:.2f}s"
                ),
            })

        cues = sb.get("cues") if "cues" in sb else beat.get("actual_cues") or beat.get("cues") or []
        for cue in cues:
            target = cue.get("target") or cue.get("id")
            at = float(cue.get("at", -1.0))
            if not (b_start - 1e-6 <= at <= b_end + 1e-6):
                errors.append({
                    "code": "post-sync-cue-outside-window",
                    "beat": bid,
                    "field": str(target),
                    "detail": f"Post-sync cue '{target}' at {at:.2f}s is outside [{b_start:.2f}, {b_end:.2f}]",
                })

    return errors


def stretch_and_remap_contract(
    contract: dict[str, Any],
    speech_durations: dict[str, float],
    *,
    max_stretch: float = MAX_ELASTIC_STRETCH,
    condense_fn=None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Apply elastic duration stretching (capped at `max_stretch`), shift cues/offsets, and build nativeMaps.

    If `actual_duration > target_duration * max_stretch`:
    - If `condense_fn` is provided, runs one narration-condense pass (`condense_fn(beat_id, target_speech_max)`).
    - Otherwise raises `PlanError` (and records the violation in `post_sync`).
    """
    updated = copy.deepcopy(contract)
    speech_map = dict(speech_durations or {})
    cumulative_delta = 0.0
    clock = 0.0
    sync_beats: list[dict[str, Any]] = []
    condensed_beats: list[str] = []

    orig_clock = 0.0
    for beat in updated.get("beats") or []:
        bid = beat["id"]
        target_dur = float(beat["duration"])
        visual_hold = float(beat.get("visual_hold", 2.0))
        exit_dur = float(beat.get("exit_duration", 0.8))
        orig_start = orig_clock
        orig_end = orig_start + target_dur
        orig_clock = orig_end

        speech_dur = float(speech_map.get(bid, beat.get("narration_words", 0) / 2.5))
        actual_dur = max(target_dur, round(speech_dur + visual_hold + exit_dur, 4))
        ceiling = round(target_dur * max_stretch, 4)

        if actual_dur > ceiling + 1e-6 and condense_fn is not None:
            max_speech = max(1.0, round(ceiling - visual_hold - exit_dur, 2))
            condensed = condense_fn(bid, max_speech, beat)
            if isinstance(condensed, dict):
                if "narration" in condensed:
                    beat["narration"] = str(condensed["narration"])
                    beat["narration_words"] = len(beat["narration"].split())
                speech_dur = float(condensed.get("speech_duration", max_speech))
            elif isinstance(condensed, (int, float)):
                speech_dur = float(condensed)
            speech_map[bid] = speech_dur
            actual_dur = max(target_dur, round(speech_dur + visual_hold + exit_dur, 4))
            condensed_beats.append(bid)

        if actual_dur > ceiling + 1e-6:
            raise PlanError(
                f"Beat '{bid}' requires {actual_dur:.2f}s (speech={speech_dur:.2f}s + hold={visual_hold:.2f}s "
                f"+ exit={exit_dur:.2f}s), exceeding max_stretch ceiling {ceiling:.2f}s"
            )

        beat_start = round(clock, 4)
        beat_end = round(beat_start + actual_dur, 4)
        clock = beat_end
        exit_start = round(beat_end - exit_dur, 4)

        # Shift cues by cumulative_delta from prior beats and clamp before exit_start
        remapped_cues = []
        for cue in beat.get("cues") or []:
            orig_at = float(cue["at"])
            rel_at = max(0.0, orig_at - orig_start)
            new_at = round(min(exit_start - 0.1, beat_start + rel_at), 4)
            remapped_cues.append({**cue, "at": new_at, "scene_at": round(orig_at, 4)})

        # Native scene map: play authored [orig_start, orig_end] over target_dur, then hold final frame
        native_map = [
            {"at": 0.0, "scene": round(orig_start, 4)},
            {"at": round(target_dur, 4), "scene": round(orig_end, 4)},
        ]
        if actual_dur > target_dur + 1e-6:
            native_map.append({"at": round(actual_dur, 4), "scene": round(orig_end, 4)})

        beat["actual_duration"] = round(actual_dur, 4)
        beat["actual_start"] = beat_start
        beat["actual_end"] = beat_end
        beat["actual_cues"] = remapped_cues
        beat["native_map"] = native_map

        sync_beats.append({
            "id": bid,
            "target_duration": target_dur,
            "speech_duration": round(speech_dur, 4),
            "visual_hold": visual_hold,
            "exit_duration": exit_dur,
            "actual_duration": round(actual_dur, 4),
            "start": beat_start,
            "end": beat_end,
            "exit_start": exit_start,
            "scene_start": round(orig_start, 4),
            "scene_end": round(orig_end, 4),
            "cues": remapped_cues,
            "nativeMap": native_map,
        })
        cumulative_delta = round(cumulative_delta + (actual_dur - target_dur), 4)

    updated["actual_duration"] = round(clock, 4)
    if updated.get("persistent_exit"):
        for pid, pinfo in updated["persistent_exit"].items():
            if isinstance(pinfo, dict) and "at" in pinfo:
                pinfo["actual_at"] = round(float(pinfo["at"]) + cumulative_delta, 4)

    post_sync = {
        "max_stretch": max_stretch,
        "speech_durations": speech_map,
        "total_delta": cumulative_delta,
        "actual_duration": round(clock, 4),
        "condensed_beats": condensed_beats,
        "beats": sync_beats,
    }
    errors = validate_scene_contract(updated, post_sync=post_sync)
    if errors:
        raise PlanError(
            "Post-sync contract validation failed: "
            + "; ".join(f"{e['code']} ({e.get('beat', '')}): {e['detail']}" for e in errors)
        )
    return updated, post_sync


# ============================================================================
# Phase 2 — Compiler-Emitted ManimCE Skeleton & Low-Reasoning Slot Prompt
# ============================================================================

def _ordered_contract_objects(contract: dict[str, Any]) -> list[dict[str, Any]]:
    """Return ordered unique contract objects with their id, zone, kind, and first beat."""
    seen: set[str] = set()
    ordered: list[dict[str, Any]] = []
    p_enter = contract.get("persistent_enter") or {}
    for pid in contract.get("persistent") or []:
        if pid not in seen:
            seen.add(pid)
            zname = (p_enter.get(pid) or {}).get("zone", "timeline_zone")
            ordered.append({
                "id": pid,
                "zone": zname,
                "kind": "mobject",
                "persistent": True,
                "beat": (p_enter.get(pid) or {}).get("beat", "b1"),
            })
    for beat in contract.get("beats") or []:
        bid = beat["id"]
        zmap = beat.get("zone_bindings") or {}
        kmap = beat.get("object_kinds") or {}
        for oid in list(beat.get("enter") or []) + list(beat.get("transform_targets") or []):
            if oid not in seen:
                seen.add(oid)
                kind = kmap.get(oid) or ("card" if ("card" in oid or "badge" in oid) else "mobject")
                ordered.append({
                    "id": oid,
                    "zone": zmap.get(oid, "right_zone"),
                    "kind": kind,
                    "persistent": False,
                    "beat": bid,
                })
    return ordered


def _construct_method_lines(contract: dict[str, Any]) -> list[str]:
    """Generate the compiler-owned `construct(self)` method body."""
    lines = [
        "    def construct(self):",
        "        self._contract = CONTRACT",
        "        self._setup_contract_runtime()",
    ]
    persistent = list(contract.get("persistent") or [])
    p_enter = contract.get("persistent_enter") or {}
    p_exit = contract.get("persistent_exit") or {}

    for pid in persistent:
        zname = (p_enter.get(pid) or {}).get("zone", "timeline_zone")
        lines.append(f"        {pid} = self.build_{pid}()")
        lines.append(f'        self.place_in_zone({pid}, "{zname}")')
        lines.append(f'        self.bind("{pid}", {pid}, kind="mobject")')

    clock = 0.0
    beats = list(contract.get("beats") or [])
    for index, beat in enumerate(beats):
        bid = beat["id"]
        btitle = beat.get("title") or bid
        bdur = float(beat["duration"])
        b_start = round(clock, 3)
        b_end = round(clock + bdur, 3)
        clock = b_end
        hold = float(beat.get("visual_hold", 2.0))
        exit_dur = float(beat.get("exit_duration", 0.8))
        zmap = beat.get("zone_bindings") or {}
        kmap = beat.get("object_kinds") or {}
        cues = list(beat.get("cues") or [])
        cued_ids: set[str] = set()

        lines.append("")
        lines.append(f'        # ---- Beat {index + 1}: {bid} ({b_start}s .. {b_end}s) ----')
        lines.append(f'        self.beat("{bid}", {btitle!r})')

        if index == 0 and persistent:
            for pid in persistent:
                if any((c.get("target") or c.get("id")) == pid for c in cues):
                    lines.append(f'        self.cue("{pid}", {pid})')
                    cued_ids.add(pid)
                lines.append(f"        self.play(FadeIn({pid}), run_time=0.6)")

        for oid in beat.get("enter") or []:
            zname = zmap.get(oid, "right_zone")
            kind = kmap.get(oid) or ("card" if ("card" in oid or "badge" in oid) else "mobject")
            lines.append(f"        {oid} = self.build_{oid}()")
            lines.append(f'        self.place_in_zone({oid}, "{zname}")')
            lines.append(f'        self.bind("{oid}", {oid}, kind="{kind}")')
            if any((c.get("target") or c.get("id")) == oid for c in cues):
                lines.append(f'        self.cue("{oid}", {oid})')
                cued_ids.add(oid)
            lines.append(f"        self.play(FadeIn({oid}), run_time=0.8)")

        for tr in beat.get("transforms") or []:
            src = tr["source"]
            dst = tr["target"]
            ttype = tr.get("type", "CompositeCardTransform")
            zname = zmap.get(dst, "left_zone")
            kind = kmap.get(dst) or ("card" if ("card" in dst or "badge" in dst) else "mobject")
            lines.append(f"        {dst} = self.build_{dst}()")
            lines.append(f'        self.place_in_zone({dst}, "{zname}")')
            lines.append(f'        self.bind("{dst}", {dst}, kind="{kind}")')
            if any((c.get("target") or c.get("id")) == dst for c in cues):
                lines.append(f'        self.cue("{dst}", {dst})')
                cued_ids.add(dst)
            if ttype == "CompositeCardTransform":
                lines.append(f"        self.play(CompositeCardTransform({src}, {dst}), run_time=1.2)")
            elif ttype == "ReplacementTransform":
                lines.append(f"        self.play(ReplacementTransform({src}, {dst}), run_time=1.2)")
            else:
                lines.append(f"        self.play({ttype}({src}, {dst}), run_time=1.2)")

        for cue in cues:
            target = cue.get("target") or cue.get("id")
            if target not in cued_ids:
                lines.append(f'        self.cue("{target}", {target})')
                cued_ids.add(target)

        active_args = list(
            dict.fromkeys(
                list(beat.get("carried_in") or [])
                + list(beat.get("enter") or [])
                + list(beat.get("transform_targets") or [])
            )
        )
        arg_str = ", ".join(active_args)

        # Check if any persistent object exits in this beat
        exiting_persistent = [
            (pid, float((p_exit.get(pid) or {}).get("at", b_end - exit_dur)))
            for pid in persistent
            if (p_exit.get(pid) or {}).get("beat") == bid
        ]
        exit_clock = exiting_persistent[0][1] if exiting_persistent else round(b_end - exit_dur, 3)
        exit_run_time = round(b_end - exit_clock, 3)
        anim_budget = round(max(1.5, exit_clock - b_start - hold - 2.4), 3)

        lines.append(f"        with self._animation_budget({anim_budget}):")
        lines.append(f"            self.animate_{bid}({arg_str})")
        lines.append(f"        self._hold_until({exit_clock}, min_hold={hold})")

        fade_outs = [f"FadeOut({oid})" for oid in (beat.get("exit") or [])]
        for pid, _at in exiting_persistent:
            fade_outs.append(f"FadeOut({pid})")
        if fade_outs:
            lines.append(f"        self.play({', '.join(fade_outs)}, run_time={exit_run_time})")

    lines.append("")
    lines.append("        self.reset_scene()")
    return lines


def _default_builder_stub(obj: dict[str, Any], contract: dict[str, Any]) -> list[str]:
    oid = obj["id"]
    zname = obj["zone"]
    kind = obj["kind"]
    zbox = _normalize_zone_bounds(contract["zones"][zname])
    zw = round(zbox[1] - zbox[0] - 0.4, 2)
    zh = round(zbox[3] - zbox[2] - 0.4, 2)
    label_floor, title_floor = _min_font_floors(contract)
    title_text = oid.replace("_", " ").title()

    if kind == "card":
        w = round(min(4.8, zw), 2)
        h = round(min(1.8, zh), 2)
        return [
            f"    def build_{oid}(self) -> CardParts:",
            f'        """Slot: {zname} (max {zw}x{zh}). Return CardParts(frame, text, extras) with font_size >= {int(label_floor)}."""',
            f'        frame = RoundedRectangle(width={w}, height={h}, corner_radius=0.18, color="#8BD0DF", stroke_width=2.5)',
            '        frame.set_fill("#0E222D", opacity=0.88)',
            f'        heading = Text({title_text!r}, font_size={int(max(26, label_floor))}, color="#EDCA82")',
            f'        sub = Text("Key historical detail", font_size={int(label_floor)}, color="#E6ECEB")',
            "        text = VGroup(heading, sub).arrange(DOWN, buff=0.16).move_to(frame.get_center())",
            '        accent = Dot(radius=0.07, color="#EDCA82").next_to(frame.get_left(), RIGHT, buff=0.22)',
            "        extras = VGroup(accent)",
            "        return CardParts(frame=frame, text=text, extras=extras)",
        ]
    if obj.get("persistent"):
        w = round(min(11.6, zw), 2)
        return [
            f"    def build_{oid}(self) -> VGroup:",
            f'        """Persistent anchor in slot {zname} (max {zw}x{zh}). Return VGroup with font_size >= {int(label_floor)}."""',
            f'        bar = Line(LEFT * {round(w / 2, 2)}, RIGHT * {round(w / 2, 2)}, color="#7899A5", stroke_width=3)',
            f'        t_start = Text("1861", font_size={int(label_floor)}, color="#EDCA82").next_to(bar.get_left(), UP, buff=0.08)',
            f'        t_end = Text("1882", font_size={int(label_floor)}, color="#8BD0DF").next_to(bar.get_right(), UP, buff=0.08)',
            '        marker = Triangle(color="#EDCA82", fill_opacity=1.0).scale(0.12).move_to(bar.get_center())',
            "        return VGroup(bar, t_start, t_end, marker)",
        ]
    w = round(min(4.6, zw), 2)
    h = round(min(2.0, zh), 2)
    return [
        f"    def build_{oid}(self) -> VGroup:",
        f'        """Diagram in slot {zname} (max {zw}x{zh}). Return VGroup with font_size >= {int(label_floor)}."""',
        f'        outline = RoundedRectangle(width={w}, height={h}, corner_radius=0.2, color="#9DCEB1", stroke_width=2.2)',
        '        outline.set_fill("#0B1B24", opacity=0.75)',
        '        node_a = Circle(radius=0.24, color="#8BD0DF", stroke_width=2.5).shift(LEFT * 1.1)',
        '        node_b = Circle(radius=0.24, color="#EDCA82", stroke_width=2.5).shift(RIGHT * 1.1)',
        '        link = Arrow(node_a.get_right(), node_b.get_left(), buff=0.08, color="#EDCA82", stroke_width=2.5)',
        f'        caption = Text({title_text!r}, font_size={int(label_floor)}, color="#E6ECEB").next_to(outline.get_top(), DOWN, buff=0.18)',
        "        inner = VGroup(node_a, node_b, link).move_to(outline.get_center() + DOWN * 0.15)",
        "        return VGroup(outline, inner, caption)",
    ]


def _default_animate_stub(beat: dict[str, Any], persistent: list[str]) -> list[str]:
    bid = beat["id"]
    active_args = list(
        dict.fromkeys(
            list(beat.get("carried_in") or [])
            + list(beat.get("enter") or [])
            + list(beat.get("transform_targets") or [])
        )
    )
    arg_str = ", ".join(["self"] + active_args)
    first_target = (
        (beat.get("transform_targets") or [])
        or (beat.get("enter") or [])
        or (beat.get("carried_in") or [])
    )[0]
    return [
        f"    def animate_{bid}({arg_str}) -> None:",
        f'        """Internal beat animation for {bid}: {beat.get("title", bid)}."""',
        f"        self.play(Indicate({first_target}, scale_factor=1.04, color=\"#EDCA82\"), run_time=1.4)",
    ]


def emit_manim_skeleton(contract: dict[str, Any]) -> str:
    """Emit the complete compiler-owned ManimCE skeleton for `contract`."""
    errors = validate_scene_contract(contract)
    if errors:
        raise PlanError(
            "Cannot emit skeleton for invalid contract: "
            + "; ".join(f"{e['code']}: {e['detail']}" for e in errors[:5])
        )
    contract_json = repr(contract)
    objects = _ordered_contract_objects(contract)
    persistent = list(contract.get("persistent") or [])

    lines = [
        "from manim import *",
        "from dataclasses import dataclass, field",
        "import numpy as np",
        "",
        f"CONTRACT = {contract_json}",
        "",
        "",
        "class GenScene(MovingCameraScene):",
        "    CONTRACT = CONTRACT",
        "",
    ]

    for obj in objects:
        lines.extend(_default_builder_stub(obj, contract))
        lines.append("")

    for beat in contract.get("beats") or []:
        lines.extend(_default_animate_stub(beat, persistent))
        lines.append("")

    lines.extend(_construct_method_lines(contract))
    return "\n".join(lines) + "\n"


def low_reasoning_contract_prompt(contract: dict[str, Any], story: dict[str, Any] | None = None) -> str:
    """Build the bounded slot-filling prompt for low-reasoning Muse Spark."""
    skeleton = emit_manim_skeleton(contract)
    label_floor, title_floor = _min_font_floors(contract)
    objects = _ordered_contract_objects(contract)
    slot_lines = []
    for obj in objects:
        zname = obj["zone"]
        zbox = _normalize_zone_bounds(contract["zones"][zname])
        zw = round(zbox[1] - zbox[0] - 0.4, 2)
        zh = round(zbox[3] - zbox[2] - 0.4, 2)
        ret = "CardParts(frame=RoundedRectangle(...), text=VGroup(...), extras=VGroup(...))" if obj["kind"] == "card" else "VGroup(...)"
        slot_lines.append(
            f"- build_{obj['id']}(self) -> {ret} in slot '{zname}' "
            f"(max width={zw}, max height={zh}, font_size >= {int(label_floor)})"
        )
    beat_lines = []
    for beat in contract.get("beats") or []:
        beat_lines.append(
            f"- animate_{beat['id']}: {beat.get('title')} — {beat.get('narration', '')}"
        )
    return "\n".join([
        "Here is the scene skeleton and the exact objects for this beat. "
        "Fill in the geometry, labels and internal animation inside the declared zones. "
        "Do not add or remove lifecycle objects.",
        "",
        "For each builder below, return a CardParts/VGroup inside the named slot.",
        "Do not add or remove lifecycle calls.",
        "Do not call self.cue, self.bind, FadeIn, FadeOut, or CompositeCardTransform.",
        "Only fill build_* and animate_* bodies.",
        "",
        f"Typography rules: label font_size >= {int(label_floor)}, title font_size >= {int(title_floor)}. "
        "Never shrink text below min_font_size.",
        "",
        "Declared builder slots:",
        *slot_lines,
        "",
        "Declared beat animations:",
        *beat_lines,
        "",
        "Return Python code containing the GenScene class (or the build_* and animate_* methods).",
        "",
        "SCENE SKELETON:",
        skeleton,
    ])


FORBIDDEN_IN_BUILD = {
    "play", "wait", "beat", "cue", "bind", "add", "remove", "clear",
    "FadeIn", "FadeOut", "CompositeCardTransform", "composite_card_transform",
}
FORBIDDEN_IN_ANIMATE = {
    "beat", "cue", "bind", "add", "remove", "clear",
    "FadeIn", "FadeOut", "CompositeCardTransform", "composite_card_transform",
}


def _clean_model_slots(raw: str) -> str:
    """Extract Python code from markdown fences and normalize top-level indentation."""
    text = (raw or "").strip()
    fenced = re.findall(r"```(?:python)?\s*\n(.*?)```", text, flags=re.S)
    if fenced:
        text = "\n\n".join(fenced).strip()
    else:
        text = re.sub(r"^```(?:python)?\s*", "", text)
        text = re.sub(r"```\s*$", "", text).strip()
    lines = text.splitlines()
    start_idx = 0
    for idx, line in enumerate(lines):
        if re.match(r"^\s*(?:from\s+\S+|import\s+\S+|class\s+\w+|def\s+\w+|@\w+)", line):
            start_idx = idx
            break
    text = textwrap.dedent("\n".join(lines[start_idx:])).strip()
    return text


def validate_filled_ast(source: str, contract: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate that model-filled code does not invent objects or call lifecycle primitives inside builders/animators."""
    findings: list[dict[str, Any]] = []
    cleaned = _clean_model_slots(source)
    try:
        tree = ast.parse(cleaned)
    except SyntaxError as exc:
        return [{"code": "syntax-error", "field": "source", "detail": str(exc)}]

    objects = _ordered_contract_objects(contract)
    allowed_builders = {f"build_{obj['id']}": obj for obj in objects}
    allowed_animators = {f"animate_{b['id']}": b for b in (contract.get("beats") or [])}
    allowed_methods = set(allowed_builders) | set(allowed_animators) | {"construct"}
    label_floor, _title_floor = _min_font_floors(contract)

    functions: list[ast.FunctionDef] = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "GenScene":
            functions.extend(item for item in node.body if isinstance(item, ast.FunctionDef))
        elif isinstance(node, ast.FunctionDef):
            functions.append(node)

    for fn in functions:
        if fn.name not in allowed_methods:
            findings.append({
                "code": "undeclared-object-method",
                "field": fn.name,
                "detail": f"Model invented undeclared method '{fn.name}' not in contract",
            })
            continue
        if fn.name == "construct":
            continue

        is_builder = fn.name in allowed_builders
        obj_meta = allowed_builders.get(fn.name) or {}
        zone_name = obj_meta.get("zone", "")
        forbidden = FORBIDDEN_IN_BUILD if is_builder else FORBIDDEN_IN_ANIMATE

        for sub in ast.walk(fn):
            if not isinstance(sub, ast.Call):
                continue
            call_name = None
            if isinstance(sub.func, ast.Name):
                call_name = sub.func.id
            elif isinstance(sub.func, ast.Attribute):
                call_name = sub.func.attr
            if call_name in forbidden:
                findings.append({
                    "code": "forbidden-lifecycle-call",
                    "field": fn.name,
                    "zone": zone_name,
                    "detail": f"Forbidden call '{call_name}()' inside '{fn.name}'",
                })
            if call_name == "Text":
                for kw in sub.keywords:
                    if kw.arg == "font_size":
                        try:
                            val = float(ast.literal_eval(kw.value))
                            if val < label_floor:
                                findings.append({
                                    "code": "font-size-violation",
                                    "field": obj_meta.get("id", fn.name),
                                    "zone": zone_name,
                                    "detail": (
                                        f"Text font_size={val} in '{fn.name}' (zone '{zone_name}') "
                                        f"is below min_font_size={label_floor}"
                                    ),
                                })
                        except Exception:
                            pass

    return findings


def extract_slot_methods(model_code: str, contract: dict[str, Any] | None = None) -> dict[str, str]:
    """Parse `build_*` and `animate_*` methods from `model_code` into `{method_name: unparsed_def}`."""
    cleaned = _clean_model_slots(model_code)
    if not cleaned:
        return {}
    allowed: set[str] | None = None
    if contract is not None:
        objs = _ordered_contract_objects(contract)
        allowed = {f"build_{o['id']}" for o in objs} | {
            f"animate_{b['id']}" for b in (contract.get("beats") or [])
        }
    extracted: dict[str, str] = {}
    try:
        tree = ast.parse(cleaned)
        for node in tree.body:
            if isinstance(node, ast.ClassDef) and node.name == "GenScene":
                for item in node.body:
                    if isinstance(item, ast.FunctionDef) and (
                        item.name.startswith("build_") or item.name.startswith("animate_")
                    ):
                        if allowed is None or item.name in allowed:
                            extracted[item.name] = ast.unparse(item)
            elif isinstance(node, ast.FunctionDef) and (
                node.name.startswith("build_") or node.name.startswith("animate_")
            ):
                if allowed is None or node.name in allowed:
                    extracted[node.name] = ast.unparse(node)
        return extracted
    except SyntaxError:
        # Resilient per-function extraction when one block is truncated
        blocks = re.split(r"(?m)^(?=\s*def\s+(?:build_|animate_)\w+\s*\()", cleaned)
        for blk in blocks:
            blk_dedented = textwrap.dedent(blk).strip()
            if not blk_dedented.startswith("def "):
                continue
            try:
                sub_tree = ast.parse(blk_dedented)
                for node in sub_tree.body:
                    if isinstance(node, ast.FunctionDef) and (
                        node.name.startswith("build_") or node.name.startswith("animate_")
                    ):
                        if allowed is None or node.name in allowed:
                            extracted[node.name] = ast.unparse(node)
            except SyntaxError:
                continue
        return extracted


def merge_slot_methods(
    existing_code: str,
    patch_code: str,
    contract: dict[str, Any] | None = None,
) -> str:
    """Merge surgically repaired or parallel-Act `build_*` / `animate_*` methods into `existing_code`."""
    merged: dict[str, str] = {}
    try:
        merged.update(extract_slot_methods(existing_code, contract=contract))
    except SyntaxError:
        pass
    try:
        merged.update(extract_slot_methods(patch_code, contract=contract))
    except SyntaxError:
        return patch_code
    if not merged:
        return patch_code
    return "\n\n".join(merged.values()) + "\n"


def chunk_contract_by_act(contract: dict[str, Any], chunk_size: int = 5) -> list[dict[str, Any]]:
    """Split a contract into Act chunks of `chunk_size` beats, assigning each object to the first Act that builds it."""
    beats = list(contract.get("beats") or [])
    all_objects = _ordered_contract_objects(contract)
    obj_by_id = {o["id"]: o for o in all_objects}
    seen_objects: set[str] = set()
    chunks: list[dict[str, Any]] = []

    for idx in range(0, len(beats), max(1, chunk_size)):
        act_beats = beats[idx: idx + max(1, chunk_size)]
        act_objs: list[dict[str, Any]] = []
        if idx == 0:
            for pid in contract.get("persistent") or []:
                if pid in obj_by_id and pid not in seen_objects:
                    seen_objects.add(pid)
                    act_objs.append(obj_by_id[pid])
        for b in act_beats:
            for oid in list(b.get("enter") or []) + list(b.get("transform_targets") or []):
                if oid in obj_by_id and oid not in seen_objects:
                    seen_objects.add(oid)
                    act_objs.append(obj_by_id[oid])
        chunks.append({
            "act_index": (idx // max(1, chunk_size)) + 1,
            "beats": act_beats,
            "objects": act_objs,
        })
    return chunks


def act_chunk_prompt(
    contract: dict[str, Any],
    chunk: dict[str, Any],
    story: dict[str, Any] | None = None,
) -> str:
    """Build a bounded slot-filling prompt for one 5-beat Act chunk of a multi-Act contract."""
    label_floor, title_floor = _min_font_floors(contract)
    slot_lines = []
    stub_lines = []
    for obj in chunk["objects"]:
        zname = obj["zone"]
        zbox = _normalize_zone_bounds(contract["zones"][zname])
        zw = round(zbox[1] - zbox[0] - 0.4, 2)
        zh = round(zbox[3] - zbox[2] - 0.4, 2)
        ret = (
            "CardParts(frame=RoundedRectangle(...), text=VGroup(...), extras=VGroup(...))"
            if obj["kind"] == "card"
            else "VGroup(...)"
        )
        slot_lines.append(
            f"- build_{obj['id']}(self) -> {ret} in slot '{zname}' "
            f"(max width={zw}, max height={zh}, font_size >= {int(label_floor)})"
        )
        stub_lines.extend(_default_builder_stub(obj, contract))
        stub_lines.append("")

    persistent = list(contract.get("persistent") or [])
    beat_lines = []
    for beat in chunk["beats"]:
        bid = beat["id"]
        beat_lines.append(
            f"- animate_{bid} ({beat.get('title', bid)}): {beat.get('narration', '')}"
        )
        stub_lines.extend(_default_animate_stub(beat, persistent))
        stub_lines.append("")

    return "\n".join([
        f"Act {chunk['act_index']} of '{contract.get('title', 'Lesson')}' — fill ONLY the declared builder and animator slots for this Act.",
        "Write 3Blue1Brown-style explanatory geometry and multi-step kinematic animations.",
        "For each builder below, construct rich multi-part geometric diagrams (axes, curves, bars, nodes, edges, tokens, logic gates) inside the named slot.",
        "Do not add or remove lifecycle calls. Do not define helper methods outside build_* and animate_*.",
        "Do not call self.cue, self.bind, FadeIn, FadeOut, or CompositeCardTransform.",
        "Use Text(..., font_size=24) or higher (never Tex or MathTex). Keep labels concise so total width stays strictly inside max width.",
        "In animate_b*, choreograph 3 to 5 distinct stages of continuous 3b1b motion (e.g., LaggedStart, Create, GrowArrow, sub-part .animate.move_to / .animate.shift / .animate.set_color, Rotate, Transform, Flash, Indicate) across ~5-6 seconds total.",
        f"Typography rules: label font_size >= {int(label_floor)}, title font_size >= {int(title_floor)}. Never scale/shrink text below min_font_size.",
        "Keep every object well within its slot max width and max height so it never overflows or collides.",
        "",
        "Declared builder slots for this Act:",
        *slot_lines,
        "",
        "Declared beat animators for this Act:",
        *beat_lines,
        "",
        "SLOTS TO FILL (return ONLY these def build_* and def animate_* functions):",
        "\n".join(textwrap.dedent("\n".join(stub_lines)).splitlines()),
    ])


def surgical_repair_prompt(
    contract: dict[str, Any],
    current_code: str,
    audit: list[dict[str, Any]],
) -> str:
    """Build a surgical slot-repair prompt targeting ONLY the failing `build_<field>` / `animate_<beat>` methods."""
    label_floor, title_floor = _min_font_floors(contract)
    objects = _ordered_contract_objects(contract)
    obj_by_id = {o["id"]: o for o in objects}
    beats_by_id = {b["id"]: b for b in (contract.get("beats") or [])}
    current_methods: dict[str, str] = {}
    try:
        current_methods = extract_slot_methods(current_code, contract=contract)
    except SyntaxError:
        pass

    target_methods: list[str] = []
    for item in audit:
        field_val = str(item.get("field") or "")
        beat_val = str(item.get("beat") or "")
        for token in [t.strip() for t in field_val.split(",") if t.strip()]:
            if token.startswith("build_") or token.startswith("animate_"):
                if token in obj_by_id or token[6:] in obj_by_id or token[8:] in beats_by_id:
                    if token not in target_methods:
                        target_methods.append(token)
            elif token in obj_by_id:
                mname = f"build_{token}"
                if mname not in target_methods:
                    target_methods.append(mname)
        if item.get("code") == "static-beat" and beat_val in beats_by_id:
            mname = f"animate_{beat_val}"
            if mname not in target_methods:
                target_methods.append(mname)

    if not target_methods:
        # Fallback if syntax error or global error: ask for all methods in current_code
        return (
            "Your previous code failed the Scene Direction Contract audit:\n"
            + "\n".join(
                f"- {a.get('code')} (field={a.get('field')}, zone={a.get('zone')}): {a.get('detail')}"
                for a in audit[:8]
            )
            + "\n\nReturn ONLY valid `def build_*` and `def animate_*` methods from the contract. "
              "Do not define helper methods or lifecycle calls:\n\n"
            + current_code
        )

    slot_specs = []
    failing_sources = []
    for mname in target_methods:
        if mname.startswith("build_"):
            oid = mname[len("build_"):]
            obj = obj_by_id.get(oid)
            if obj:
                zname = obj["zone"]
                zbox = _normalize_zone_bounds(contract["zones"][zname])
                zw = round(zbox[1] - zbox[0] - 0.4, 2)
                zh = round(zbox[3] - zbox[2] - 0.4, 2)
                ret = "CardParts(frame=RoundedRectangle(...), text=VGroup(...), extras=VGroup(...))" if obj["kind"] == "card" else "VGroup(...)"
                slot_specs.append(
                    f"- {mname}(self) -> {ret} in slot '{zname}' (max width={zw}, max height={zh}, font_size >= {int(label_floor)})"
                )
        if mname in current_methods:
            failing_sources.append(current_methods[mname])

    audit_lines = [
        f"- {a.get('code')} (field={a.get('field')}, zone={a.get('zone')}): {a.get('detail')}"
        for a in audit[:8]
    ]
    return "\n".join([
        "SURGICAL SLOT REPAIR — Rewrite ONLY the failing method(s) listed below.",
        "Do NOT return the rest of the scene; our compiler will splice your repaired method(s) directly into the scene.",
        "",
        "Audit failures to fix:",
        *audit_lines,
        "",
        "Target slot constraints:",
        *slot_specs,
        f"- Keep all Text font_size >= {int(label_floor)} (titles >= {int(title_floor)}) and never call .scale() on text.",
        "- Keep total width and height strictly inside the slot max width/height so place_in_zone does not fail or shrink text.",
        "",
        "Current failing method(s) to replace:",
        "\n\n".join(failing_sources),
    ])


def assemble_contract_scene(model_code: str, contract: dict[str, Any]) -> str:
    """Splice validated `build_*` and `animate_*` methods from `model_code` into the compiler-owned skeleton.

    `construct(self)` is ALWAYS emitted by the compiler, guaranteeing that the model
    cannot add, omit, or leak any lifecycle object.
    """
    cleaned = _clean_model_slots(model_code)

    ast_findings = validate_filled_ast(cleaned, contract)
    if ast_findings:
        raise PlanError(
            "Model code violated Scene Direction Contract AST rules: "
            + "; ".join(f"{f['code']} ({f.get('field', '')}): {f['detail']}" for f in ast_findings)
        )

    tree = ast.parse(cleaned)
    extracted: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "GenScene":
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and (
                    item.name.startswith("build_") or item.name.startswith("animate_")
                ):
                    extracted[item.name] = textwrap.indent(ast.unparse(item), "    ")
        elif isinstance(node, ast.FunctionDef) and (
            node.name.startswith("build_") or node.name.startswith("animate_")
        ):
            extracted[node.name] = textwrap.indent(ast.unparse(node), "    ")

    objects = _ordered_contract_objects(contract)
    persistent = list(contract.get("persistent") or [])
    contract_json = repr(contract)

    lines = [
        "from manim import *",
        "from dataclasses import dataclass, field",
        "import numpy as np",
        "",
        f"CONTRACT = {contract_json}",
        "",
        "",
        "class GenScene(MovingCameraScene):",
        "    CONTRACT = CONTRACT",
        "",
    ]

    for obj in objects:
        bname = f"build_{obj['id']}"
        if bname in extracted:
            lines.append(extracted[bname])
        else:
            lines.extend(_default_builder_stub(obj, contract))
        lines.append("")

    for beat in contract.get("beats") or []:
        aname = f"animate_{beat['id']}"
        if aname in extracted:
            lines.append(extracted[aname])
        else:
            lines.extend(_default_animate_stub(beat, persistent))
        lines.append("")

    lines.extend(_construct_method_lines(contract))
    return "\n".join(lines) + "\n"


# ============================================================================
# Phase 3 — Compile-time Zone, Typography, AABB, Bind, and Leak Audit
# ============================================================================

def _object_bbox_2d(mob: Any) -> list[float] | None:
    try:
        if hasattr(mob, "refresh_bounding_box"):
            mob.refresh_bounding_box(recurse_down=True)
        bb = mob.get_bounding_box()
        lo, hi = bb[0], bb[2]
        return [float(lo[0]), float(lo[1]), float(hi[0]), float(hi[1])]
    except Exception:
        return None


def _is_deliberately_nested(mob_a: Any, mob_b: Any) -> bool:
    try:
        fam_a = {id(x) for x in mob_a.get_family()}
        fam_b = {id(x) for x in mob_b.get_family()}
        return id(mob_a) in fam_b or id(mob_b) in fam_a
    except Exception:
        return False


def _is_visible_in_scene(scene: Any, mob: Any) -> bool:
    tops = [m for m in getattr(scene, "mobjects", []) if m is not getattr(scene, "select_group", None)]
    if not scene._in_graph(mob, tops):
        return False
    opacities = []
    for part in mob.get_family():
        if hasattr(part, "family_members_with_points"):
            for sub in part.family_members_with_points():
                try:
                    opacities.append(max(float(sub.get_fill_opacity()), float(sub.get_stroke_opacity())))
                except Exception:
                    opacities.append(float(getattr(sub, "opacity", 1.0)))
    if opacities and max(opacities) <= 0.05:
        return False
    return True


def audit_contract_scene(scene: Any, contract: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Run deterministic Phase 3 zone, typography, AABB, bind, and leak checks on a compiled scene."""
    contract = contract or getattr(scene, "_contract", None) or getattr(scene, "CONTRACT", None)
    if not isinstance(contract, dict):
        return []

    findings: list[dict[str, Any]] = []
    zones = {
        zname: _normalize_zone_bounds(zspec)
        for zname, zspec in (contract.get("zones") or {}).items()
    }
    label_floor, title_floor = _min_font_floors(contract)
    focal_cap = int(contract.get("focal_cap") or 3)
    bound_objects: dict[str, Any] = getattr(scene, "bound_objects", {}) or {}
    bound_cards: dict[str, Any] = getattr(scene, "bound_cards", {}) or {}
    bound_kinds: dict[str, str] = getattr(scene, "bound_kinds", {}) or {}

    expected_objects = _ordered_contract_objects(contract)
    zone_by_obj = {obj["id"]: obj["zone"] for obj in expected_objects}

    scene_beats = {b["id"]: (i, b) for i, b in enumerate(getattr(scene, "beats", []) or [])}
    beats_list = list(getattr(scene, "beats", []) or [])
    duration = float(getattr(scene, "duration", 0.0))
    beat_specs_by_id = {b["id"]: b for b in (contract.get("beats") or [])}

    # 1. Bind validation & CardParts protocol check (sampled during each card's active beat)
    for obj in expected_objects:
        oid = obj["id"]
        zname = obj["zone"]
        kind = obj["kind"]
        if oid not in bound_objects:
            findings.append({
                "code": "missing-bind",
                "beat": obj["beat"],
                "field": oid,
                "zone": zname,
                "time": 0.0,
                "detail": f"Contract object '{oid}' in zone '{zname}' was not bound via self.bind()",
            })
            continue
        if kind == "card" or bound_kinds.get(oid) == "card":
            if obj["beat"] in scene_beats:
                idx, sb = scene_beats[obj["beat"]]
                b_start = float(sb["time"])
                b_end = float(beats_list[idx + 1]["time"]) if idx + 1 < len(beats_list) else duration
                exit_dur = float((beat_specs_by_id.get(obj["beat"]) or {}).get("exit_duration", 0.8))
                active_span = max(0.2, (b_end - exit_dur) - b_start)
                card_t = min(b_start + active_span * 0.55, max(b_start + 0.2, b_end - exit_dur - 0.2))
                scene.evaluate(card_t, [], None)
            card_obj = bound_cards.get(oid)
            try:
                validate_card_parts(card_obj, object_id=oid, zone=zname)
            except ValueError as exc:
                findings.append({
                    "code": "invalid-card-parts",
                    "beat": obj["beat"],
                    "field": oid,
                    "zone": zname,
                    "time": 0.0,
                    "detail": str(exc),
                })

    # 2. Per-beat zone containment, centering, typography, AABB, and focal cap checks
    persistent = list(contract.get("persistent") or [])
    p_enter = contract.get("persistent_enter") or {}

    for beat_spec in contract.get("beats") or []:
        bid = beat_spec["id"]
        zmap = dict(beat_spec.get("zone_bindings") or {})
        for pid in persistent:
            zmap.setdefault(pid, (p_enter.get(pid) or {}).get("zone", "timeline_zone"))

        if bid in scene_beats:
            idx, sb = scene_beats[bid]
            b_start = float(sb["time"])
            b_end = float(beats_list[idx + 1]["time"]) if idx + 1 < len(beats_list) else duration
        else:
            b_start, b_end = 0.0, duration

        exit_dur = float(beat_spec.get("exit_duration", 0.8))
        # Sample in the settled middle of the beat (after enter/transform, before exit)
        active_span = max(0.2, (b_end - exit_dur) - b_start)
        sample_t = min(b_start + active_span * 0.55, max(b_start + 0.2, b_end - exit_dur - 0.2))
        scene.evaluate(sample_t, [], None)

        active_focal = list(
            dict.fromkeys(
                list(beat_spec.get("carried_in") or [])
                + list(beat_spec.get("enter") or [])
                + list(beat_spec.get("transform_targets") or [])
            )
        )
        if len(active_focal) > focal_cap:
            findings.append({
                "code": "focal-cap-breach",
                "beat": bid,
                "field": "focal_cap",
                "zone": "",
                "time": round(sample_t, 2),
                "detail": f"Beat '{bid}' has {len(active_focal)} active focal objects > focal_cap={focal_cap}",
            })

        active_all = list(dict.fromkeys(active_focal + persistent))
        active_boxes: list[tuple[str, str, Any, list[float]]] = []

        for oid in active_all:
            mob = bound_objects.get(oid)
            zname = zmap.get(oid, zone_by_obj.get(oid, ""))
            if mob is None:
                continue
            box = _object_bbox_2d(mob)
            if box is None:
                continue
            active_boxes.append((oid, zname, mob, box))

            # Dual-axis zone containment & centering
            if zname in zones:
                zx1, zx2, zy1, zy2 = zones[zname]
                x1, y1, x2, y2 = box
                if x1 < zx1 - 0.05 or x2 > zx2 + 0.05 or y1 < zy1 - 0.05 or y2 > zy2 + 0.05:
                    findings.append({
                        "code": "zone-overflow",
                        "beat": bid,
                        "field": oid,
                        "zone": zname,
                        "time": round(sample_t, 2),
                        "detail": (
                            f"Object '{oid}' bbox [{x1:.2f}, {y1:.2f}, {x2:.2f}, {y2:.2f}] "
                            f"overflows zone '{zname}' x=[{zx1:.2f}, {zx2:.2f}], y=[{zy1:.2f}, {zy2:.2f}]"
                        ),
                    })
                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                zcx, zcy = (zx1 + zx2) / 2.0, (zy1 + zy2) / 2.0
                zw, zh = zx2 - zx1, zy2 - zy1
                if abs(cx - zcx) > zw * 0.28 + 0.1 or abs(cy - zcy) > zh * 0.28 + 0.1:
                    findings.append({
                        "code": "zone-centering",
                        "beat": bid,
                        "field": oid,
                        "zone": zname,
                        "time": round(sample_t, 2),
                        "detail": (
                            f"Object '{oid}' center ({cx:.2f}, {cy:.2f}) is not centered "
                            f"in zone '{zname}' ({zcx:.2f}, {zcy:.2f})"
                        ),
                    })

            # Typography floor & no-silent-shrink check on all Text members
            for part in mob.get_family():
                txt = getattr(part, "text", None)
                if not isinstance(txt, str) or not txt.strip():
                    continue
                authored_fs = float(getattr(part, "_ce_font_size", 48.0))
                is_title = bool(getattr(part, "_is_title", False)) or ("title" in str(oid).lower())
                req_floor = title_floor if is_title else label_floor
                if authored_fs < req_floor - 1e-3:
                    findings.append({
                        "code": "font-size-violation",
                        "beat": bid,
                        "field": oid,
                        "zone": zname,
                        "time": round(sample_t, 2),
                        "detail": (
                            f"Text {txt!r} in '{oid}' (zone '{zname}') has font_size={authored_fs:.1f} "
                            f"< minimum {req_floor:.1f}"
                        ),
                    })
                init_h = float(getattr(part, "_initial_height", 0.0) or 0.0)
                if init_h > 1e-4:
                    try:
                        curr_h = float(part.get_height())
                        eff_fs = authored_fs * (curr_h / init_h)
                        if eff_fs < req_floor - 0.5:
                            findings.append({
                                "code": "silent-shrink",
                                "beat": bid,
                                "field": oid,
                                "zone": zname,
                                "time": round(sample_t, 2),
                                "detail": (
                                    f"Text {txt!r} in '{oid}' (zone '{zname}') was silently shrunk "
                                    f"to effective font_size={eff_fs:.1f} < minimum {req_floor:.1f}"
                                ),
                            })
                    except Exception:
                        pass

        # Pairwise AABB check for simultaneously active top-level contract objects
        for i_a, (id_a, za, mob_a, box_a) in enumerate(active_boxes):
            for id_b, zb, mob_b, box_b in active_boxes[i_a + 1:]:
                if _is_deliberately_nested(mob_a, mob_b):
                    continue
                metrics = aabb_metrics(box_a, box_b)
                if metrics["collides"]:
                    findings.append({
                        "code": "aabb-collision",
                        "beat": bid,
                        "field": f"{id_a},{id_b}",
                        "zone": f"{za},{zb}",
                        "time": round(sample_t, 2),
                        "detail": (
                            f"Active objects '{id_a}' (zone '{za}') and '{id_b}' (zone '{zb}') "
                            f"collide or violate {AABB_MIN_BUFF} buff "
                            f"(gap_x={metrics['gap_x']:.2f}, gap_y={metrics['gap_y']:.2f}, "
                            f"intersection={metrics['intersection']:.2f})"
                        ),
                    })

    # 3. End-of-scene audit: zero focal leaks and zero persistent leaks
    if duration > 0:
        scene.evaluate(duration, [], None)
        for obj in expected_objects:
            oid = obj["id"]
            zname = obj["zone"]
            mob = bound_objects.get(oid)
            if mob is not None and _is_visible_in_scene(scene, mob):
                leak_code = "persistent-leak" if obj.get("persistent") else "focal-leak"
                findings.append({
                    "code": leak_code,
                    "beat": "end",
                    "field": oid,
                    "zone": zname,
                    "time": round(duration, 2),
                    "detail": f"Object '{oid}' (zone '{zname}') leaked at end of scene (t={duration:.2f}s)",
                })
        leftover_tops = [
            m for m in getattr(scene, "mobjects", [])
            if m is not getattr(scene, "select_group", None)
        ]
        if leftover_tops and not any(f["code"] in {"focal-leak", "persistent-leak"} for f in findings):
            findings.append({
                "code": "focal-leak",
                "beat": "end",
                "field": "scene.mobjects",
                "zone": "",
                "time": round(duration, 2),
                "detail": f"Scene ended with {len(leftover_tops)} leftover mobject(s) on canvas",
            })

    return findings


def rizal_act1_slot_fill(reasoning_effort: str = "low") -> str:
    """Return the model-owned build_* and animate_* slot fill for Rizal Act I."""
    if reasoning_effort == "high":
        return '''
def build_timeline_anchor(self) -> VGroup:
    bar = Line(LEFT * 5.2, RIGHT * 5.2, stroke_width=3).set_color("#8bd0df")
    ticks = VGroup(*[
        Line(UP * 0.08, DOWN * 0.08, stroke_width=2).move_to(bar.point_from_proportion(p)).set_color("#8bd0df")
        for p in (0.0, 0.35, 0.68, 1.0)
    ])
    tag = Text("1861 · Calamba  →  1872 · Gomburza  →  Ateneo", font_size=24).set_color("#d5e6ef")
    tag.next_to(bar, UP, buff=0.04)
    return VGroup(bar, ticks, tag)

def build_luzon_locator(self) -> VGroup:
    island = RoundedRectangle(width=4.4, height=4.0, corner_radius=0.35).set_stroke("#58c4dd", 3).set_fill("#102534", opacity=0.7)
    laguna = Circle(radius=0.45).set_stroke("#83c167", 2.5).set_fill("#1b3b2b", opacity=0.8).move_to(island.get_center() + DOWN * 0.25 + RIGHT * 0.2)
    pin = Dot(laguna.get_center() + DOWN * 0.18, radius=0.11).set_color("#f7d154")
    lbl = Text("Calamba, Laguna", font_size=26).set_color("#f7d154").next_to(laguna, UP, buff=0.22)
    region = Text("Southern Luzon", font_size=24).set_color("#9bb8c9").next_to(island.get_bottom(), UP, buff=0.25)
    return VGroup(island, laguna, pin, lbl, region)

def build_calamba_card(self) -> CardParts:
    frame = RoundedRectangle(width=5.2, height=3.8, corner_radius=0.22).set_stroke("#f7d154", 3).set_fill("#182232", opacity=0.9)
    h1 = Text("Dominican Hacienda", font_size=28).set_color("#f7d154")
    h2 = Text("Mercado Family Lease", font_size=25).set_color("#ffffff")
    h3 = Text("Sugar & Rice Tenantry", font_size=24).set_color("#a8c5d6")
    text = VGroup(h1, h2, h3).arrange(DOWN, buff=0.28).move_to(frame.get_center())
    accent = Line(frame.get_left() + RIGHT * 0.4, frame.get_right() + LEFT * 0.4).set_color("#f7d154").move_to(frame.get_top() + DOWN * 0.42)
    return CardParts(frame=frame, text=text, extras=VGroup(accent))

def build_gomburza_triad(self) -> VGroup:
    panel = RoundedRectangle(width=5.2, height=1.65, corner_radius=0.18).set_stroke("#fc6255", 2.5).set_fill("#26151c", opacity=0.88)
    title = Text("1872 · Gomburza Martyrdom", font_size=26).set_color("#fc6255").move_to(panel.get_top() + DOWN * 0.38)
    names = Text("Gomez · Burgos · Zamora", font_size=24).set_color("#f2d7d5").move_to(panel.get_bottom() + UP * 0.42)
    return VGroup(panel, title, names)

def build_paciano_link(self) -> CardParts:
    frame = RoundedRectangle(width=5.2, height=1.65, corner_radius=0.18).set_stroke("#f7d154", 2.5).set_fill("#1c2430", opacity=0.88)
    top = Text("Paciano Mercado → Casa Burgos", font_size=25).set_color("#f7d154")
    bot = Text("Brings 1872 warning home", font_size=24).set_color("#d5e6ef")
    text = VGroup(top, bot).arrange(DOWN, buff=0.18).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def build_mercado_badge(self) -> CardParts:
    frame = RoundedRectangle(width=4.8, height=3.6, corner_radius=0.22).set_stroke("#fc6255", 3).set_fill("#241822", opacity=0.9)
    t1 = Text("MERCADO", font_size=30).set_color("#fc6255")
    t2 = Text("Flagged by 1872 inquiry", font_size=24).set_color("#f5d6d6")
    text = VGroup(t1, t2).arrange(DOWN, buff=0.3).move_to(frame.get_center())
    warn = Circle(radius=0.14).set_color("#fc6255").move_to(frame.get_top() + DOWN * 0.45)
    return CardParts(frame=frame, text=text, extras=VGroup(warn))

def build_rizal_badge(self) -> CardParts:
    frame = RoundedRectangle(width=5.0, height=3.6, corner_radius=0.22).set_stroke("#83c167", 3).set_fill("#142822", opacity=0.9)
    t1 = Text("RIZAL (Ricial)", font_size=30).set_color("#83c167")
    t2 = Text("Unflagged Ateneo enrollment", font_size=24).set_color("#d8f3dc")
    text = VGroup(t1, t2).arrange(DOWN, buff=0.3).move_to(frame.get_center())
    crest = RegularPolygon(n=6).scale(0.18).set_color("#83c167").move_to(frame.get_top() + DOWN * 0.45)
    return CardParts(frame=frame, text=text, extras=VGroup(crest))

def build_med_branch(self) -> CardParts:
    frame = RoundedRectangle(width=5.2, height=1.65, corner_radius=0.18).set_stroke("#58c4dd", 2.5).set_fill("#122634", opacity=0.9)
    t1 = Text("Ophthalmology Branch", font_size=26).set_color("#58c4dd")
    t2 = Text("Cure Teodora Alonso's sight", font_size=24).set_color("#d9eef7")
    text = VGroup(t1, t2).arrange(DOWN, buff=0.18).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def build_poetry_branch(self) -> CardParts:
    frame = RoundedRectangle(width=5.2, height=1.65, corner_radius=0.18).set_stroke("#f7d154", 2.5).set_fill("#262214", opacity=0.9)
    t1 = Text("Letters & Civic Reform", font_size=26).set_color("#f7d154")
    t2 = Text("Answer colonial abuse in print", font_size=24).set_color("#f7ecd0")
    text = VGroup(t1, t2).arrange(DOWN, buff=0.18).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def animate_b1(self, luzon_locator, calamba_card):
    self.play(Indicate(luzon_locator, scale_factor=1.04), run_time=1.2)
    self.play(Indicate(calamba_card.frame, scale_factor=1.03), run_time=1.2)

def animate_b2(self, luzon_locator, gomburza_triad, paciano_link):
    self.play(Indicate(gomburza_triad, scale_factor=1.04), run_time=1.3)
    self.play(Indicate(paciano_link.frame, scale_factor=1.04), run_time=1.3)

def animate_b3(self, mercado_badge, rizal_badge):
    self.play(Indicate(rizal_badge.frame, scale_factor=1.04), run_time=1.4)

def animate_b4(self, rizal_badge, med_branch, poetry_branch):
    self.play(Indicate(med_branch.frame, scale_factor=1.04), run_time=1.2)
    self.play(Indicate(poetry_branch.frame, scale_factor=1.04), run_time=1.2)
'''.strip()
    # Low-reasoning fill: simpler geometry inside the exact same compiler-owned contract slots
    return '''
def build_timeline_anchor(self) -> VGroup:
    bar = Line(LEFT * 5.0, RIGHT * 5.0).set_color("#8bd0df")
    lbl = Text("1861 Calamba  →  1872 Gomburza  →  Ateneo", font_size=24).next_to(bar, UP, buff=0.04)
    return VGroup(bar, lbl)

def build_luzon_locator(self) -> VGroup:
    box = RoundedRectangle(width=4.2, height=3.8, corner_radius=0.25).set_stroke("#58c4dd", 2)
    dot = Dot(ORIGIN, radius=0.1).set_color("#f7d154")
    lbl = Text("Calamba, Luzon", font_size=25).next_to(dot, UP, buff=0.25)
    return VGroup(box, dot, lbl)

def build_calamba_card(self) -> CardParts:
    frame = RoundedRectangle(width=5.0, height=3.5, corner_radius=0.2).set_stroke("#f7d154", 2)
    t1 = Text("Calamba Hacienda", font_size=27)
    t2 = Text("Mercado Leasehold", font_size=24)
    text = VGroup(t1, t2).arrange(DOWN, buff=0.25).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def build_gomburza_triad(self) -> VGroup:
    box = RoundedRectangle(width=5.0, height=1.6, corner_radius=0.15).set_stroke("#fc6255", 2)
    lbl = Text("1872 Gomburza Execution", font_size=25).move_to(box.get_center())
    return VGroup(box, lbl)

def build_paciano_link(self) -> CardParts:
    frame = RoundedRectangle(width=5.0, height=1.6, corner_radius=0.15).set_stroke("#f7d154", 2)
    lbl = Text("Paciano Link to Burgos", font_size=25).move_to(frame.get_center())
    return CardParts(frame=frame, text=VGroup(lbl), extras=VGroup())

def build_mercado_badge(self) -> CardParts:
    frame = RoundedRectangle(width=4.6, height=3.4, corner_radius=0.2).set_stroke("#fc6255", 2)
    t1 = Text("Mercado Name", font_size=28)
    t2 = Text("Watched in 1872", font_size=24)
    text = VGroup(t1, t2).arrange(DOWN, buff=0.25).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def build_rizal_badge(self) -> CardParts:
    frame = RoundedRectangle(width=4.8, height=3.4, corner_radius=0.2).set_stroke("#83c167", 2)
    t1 = Text("Rizal Surname", font_size=28)
    t2 = Text("Ateneo Protection", font_size=24)
    text = VGroup(t1, t2).arrange(DOWN, buff=0.25).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def build_med_branch(self) -> CardParts:
    frame = RoundedRectangle(width=5.0, height=1.6, corner_radius=0.15).set_stroke("#58c4dd", 2)
    lbl = Text("Medicine: Mother's Sight", font_size=25).move_to(frame.get_center())
    return CardParts(frame=frame, text=VGroup(lbl), extras=VGroup())

def build_poetry_branch(self) -> CardParts:
    frame = RoundedRectangle(width=5.0, height=1.6, corner_radius=0.15).set_stroke("#f7d154", 2)
    lbl = Text("Poetry: Reform Witness", font_size=25).move_to(frame.get_center())
    return CardParts(frame=frame, text=VGroup(lbl), extras=VGroup())

def animate_b1(self, luzon_locator, calamba_card):
    self.play(Indicate(luzon_locator, scale_factor=1.03), run_time=1.0)

def animate_b2(self, luzon_locator, gomburza_triad, paciano_link):
    self.play(Indicate(gomburza_triad, scale_factor=1.03), run_time=1.0)

def animate_b3(self, mercado_badge, rizal_badge):
    self.play(Indicate(rizal_badge.frame, scale_factor=1.03), run_time=1.0)

def animate_b4(self, rizal_badge, med_branch, poetry_branch):
    self.play(Indicate(med_branch.frame, scale_factor=1.03), run_time=1.0)
'''.strip()


def ev_slot_fill(reasoning_effort: str = "low") -> str:
    """Return the model-owned build_* and animate_* slot fill for the EV native contract."""
    if reasoning_effort == "high":
        return '''
def build_drivetrain_hud(self) -> VGroup:
    rail = Line(LEFT * 5.2, RIGHT * 5.2, stroke_width=3).set_color("#58c4dd")
    lbl = Text("High-Voltage DC Energy Bus (400V)", font_size=24).set_color("#d5e6ef").next_to(rail, UP, buff=0.04)
    return VGroup(rail, lbl)

def build_dc_inverter_card(self) -> CardParts:
    frame = RoundedRectangle(width=4.6, height=3.6, corner_radius=0.22).set_stroke("#58c4dd", 3).set_fill("#122433", opacity=0.9)
    t1 = Text("DC → AC Inverter", font_size=28).set_color("#58c4dd")
    t2 = Text("350–800 V Current Feed", font_size=24).set_color("#d5e6ef")
    text = VGroup(t1, t2).arrange(DOWN, buff=0.28).move_to(frame.get_center())
    bar = Line(LEFT * 1.6, RIGHT * 1.6).set_color("#58c4dd").move_to(frame.get_top() + DOWN * 0.45)
    return CardParts(frame=frame, text=text, extras=VGroup(bar))

def build_cell_diagram(self) -> VGroup:
    shell = RoundedRectangle(width=4.8, height=3.8, corner_radius=0.22).set_stroke("#83c167", 3).set_fill("#13261d", opacity=0.88)
    title = Text("Li-Ion Cell Stack", font_size=27).set_color("#83c167").move_to(shell.get_top() + DOWN * 0.45)
    ions = VGroup(*[Circle(radius=0.16).set_color("#f7d154") for _ in range(4)]).arrange(RIGHT, buff=0.28).move_to(shell.get_center())
    sub = Text("Anode → Cathode Discharge", font_size=24).set_color("#d8f3dc").move_to(shell.get_bottom() + UP * 0.45)
    return VGroup(shell, title, ions, sub)

def build_stator_rotor(self) -> VGroup:
    panel = RoundedRectangle(width=5.0, height=1.65, corner_radius=0.18).set_stroke("#83c167", 2.5).set_fill("#14261f", opacity=0.9)
    t1 = Text("Stator & Rotor Field", font_size=26).set_color("#83c167").move_to(panel.get_top() + DOWN * 0.42)
    t2 = Text("Rotating AC Field Pulls Rotor", font_size=24).set_color("#d8f3dc").move_to(panel.get_bottom() + UP * 0.42)
    return VGroup(panel, t1, t2)

def build_wheel_torque_card(self) -> CardParts:
    frame = RoundedRectangle(width=5.0, height=1.65, corner_radius=0.18).set_stroke("#f7d154", 3).set_fill("#262113", opacity=0.9)
    t1 = Text("Reduction Gear & Axle", font_size=26).set_color("#f7d154")
    t2 = Text("Instant Wheel Torque", font_size=24).set_color("#f7ecd0")
    text = VGroup(t1, t2).arrange(DOWN, buff=0.18).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def animate_battery_flow(self, dc_inverter_card, cell_diagram):
    self.play(Indicate(cell_diagram, scale_factor=1.04), run_time=1.1)
    self.play(Indicate(dc_inverter_card.frame, scale_factor=1.03), run_time=1.1)

def animate_motor_drive(self, dc_inverter_card, stator_rotor, wheel_torque_card):
    self.play(Indicate(stator_rotor, scale_factor=1.04), run_time=1.1)
    self.play(Indicate(wheel_torque_card.frame, scale_factor=1.04), run_time=1.1)
'''.strip()
    return '''
def build_drivetrain_hud(self) -> VGroup:
    rail = Line(LEFT * 5.0, RIGHT * 5.0).set_color("#58c4dd")
    lbl = Text("HV Energy Bus", font_size=24).next_to(rail, UP, buff=0.04)
    return VGroup(rail, lbl)

def build_dc_inverter_card(self) -> CardParts:
    frame = RoundedRectangle(width=4.4, height=3.4, corner_radius=0.2).set_stroke("#58c4dd", 2)
    t1 = Text("DC-AC Inverter", font_size=27)
    t2 = Text("High Voltage Feed", font_size=24)
    text = VGroup(t1, t2).arrange(DOWN, buff=0.25).move_to(frame.get_center())
    return CardParts(frame=frame, text=text, extras=VGroup())

def build_cell_diagram(self) -> VGroup:
    box = RoundedRectangle(width=4.6, height=3.6, corner_radius=0.2).set_stroke("#83c167", 2)
    lbl = Text("Battery Cell Stack", font_size=26).move_to(box.get_center())
    return VGroup(box, lbl)

def build_stator_rotor(self) -> VGroup:
    box = RoundedRectangle(width=4.8, height=1.6, corner_radius=0.16).set_stroke("#83c167", 2)
    lbl = Text("Stator Rotor Field", font_size=25).move_to(box.get_center())
    return VGroup(box, lbl)

def build_wheel_torque_card(self) -> CardParts:
    frame = RoundedRectangle(width=4.8, height=1.6, corner_radius=0.16).set_stroke("#f7d154", 2)
    t1 = Text("Wheel Torque Output", font_size=25).move_to(frame.get_center())
    return CardParts(frame=frame, text=VGroup(t1), extras=VGroup())

def animate_battery_flow(self, dc_inverter_card, cell_diagram):
    self.play(Indicate(cell_diagram, scale_factor=1.03), run_time=1.0)

def animate_motor_drive(self, dc_inverter_card, stator_rotor, wheel_torque_card):
    self.play(Indicate(stator_rotor, scale_factor=1.03), run_time=1.0)
'''.strip()


P_VS_NP_ASCII_BLUEPRINT = """\
# SCENE DIRECTION BLUEPRINT: P vs NP — Verification, Reductions & The Frontier of Computation
# RENDERER: manimgl | DURATION: 240.0s | FOCAL_CAP: 3 | MIN_FONT_SIZE: label=24, title=32
# PERSISTENT: complexity_timeline (zone=timeline_zone, enter=0.0s@b1, exit=238.5s@b20)
# ZONES:
#   timeline_zone: x=[-6.6, 6.6], y=[-3.65, -3.15]
#   left_zone:     x=[-6.6, -0.7], y=[-2.8, 2.6]
#   right_zone:    x=[0.4, 6.6],   y=[-2.8, 2.6]
#   right_top:     x=[0.4, 6.6],   y=[0.2, 2.6]
#   right_bottom:  x=[0.4, 6.6],   y=[-2.8, -0.2]

[BEAT b1 | 0.0s..12.0s | hold=2.0s | max_words=28] "1. What Makes a Problem Easy? Polynomial Growth O(n^k)"
  carried_in: []
  enter: poly_curve@left_zone(mobject), sorting_card@right_zone(card)
  transforms: []
  cues: complexity_timeline@0.4s, poly_curve@1.2s, sorting_card@2.2s
  exit: [sorting_card]
  carried_out: [poly_curve]
  narration: "A problem is tractable when its running time grows as a polynomial in input size n, like sorting or shortest paths."

[BEAT b2 | 12.0s..24.0s | hold=2.0s | max_words=28] "2. The Combinatorial Wall: Exponential Growth 2^n"
  carried_in: [poly_curve]
  enter: exp_wall@right_top(mobject), clock_table_card@right_bottom(card)
  transforms: []
  cues: exp_wall@13.2s, clock_table_card@14.4s
  exit: [poly_curve, exp_wall, clock_table_card]
  carried_out: []
  narration: "When a problem requires checking 2 to the n possibilities, even n equals 100 outlives the age of the universe."

[BEAT b3 | 24.0s..36.0s | hold=2.0s | max_words=28] "3. Framing Complexity: Optimization to Decision Problems"
  carried_in: []
  enter: optimization_card@right_zone(card)
  transform_targets: decision_card@left_zone(card)
  transforms: CompositeCardTransform(optimization_card -> decision_card, text_different=true, at=26.4s)
  cues: optimization_card@25.0s, decision_card@27.0s
  exit: [optimization_card]
  carried_out: [decision_card]
  narration: "Complexity theory converts optimization into yes-or-no decision problems: does a route of length at most K exist?"

[BEAT b4 | 36.0s..48.0s | hold=2.0s | max_words=28] "4. Class P: Solvable from Scratch in Polynomial Time"
  carried_in: [decision_card]
  enter: p_region_diagram@right_top(mobject), shortest_path_card@right_bottom(card)
  transforms: []
  cues: p_region_diagram@37.2s, shortest_path_card@38.4s
  exit: [decision_card, p_region_diagram, shortest_path_card]
  carried_out: []
  narration: "Class P contains every decision problem that a deterministic algorithm can solve from scratch in polynomial time."

[BEAT b5 | 48.0s..60.0s | hold=2.0s | max_words=28] "5. Why Brute Force Stalls on Search Spaces"
  carried_in: []
  enter: search_tree@left_zone(mobject), subset_sum_card@right_zone(card)
  transforms: []
  cues: search_tree@49.2s, subset_sum_card@50.4s
  exit: [search_tree, subset_sum_card]
  carried_out: []
  narration: "For problems like Subset Sum, branching choices double at every step, creating an exponential forest of candidates."

[BEAT b6 | 60.0s..72.0s | hold=2.0s | max_words=28] "6. The Core Asymmetry: Finding vs Checking"
  carried_in: []
  enter: solver_maze@left_zone(mobject), verifier_check_card@right_zone(card)
  transforms: []
  cues: solver_maze@61.2s, verifier_check_card@62.4s
  exit: [verifier_check_card]
  carried_out: [solver_maze]
  narration: "Finding a needle in an exponential haystack seems hard, yet checking a proposed solution takes only moments."

[BEAT b7 | 72.0s..84.0s | hold=2.0s | max_words=28] "7. The Witness (Certificate) Protocol"
  carried_in: [solver_maze]
  enter: witness_badge@right_top(card), poly_checker_box@right_bottom(mobject)
  transforms: []
  cues: witness_badge@73.2s, poly_checker_box@74.4s
  exit: [solver_maze, witness_badge, poly_checker_box]
  carried_out: []
  narration: "A short proof string w, called a witness or certificate, lets a deterministic verifier confirm YES in polynomial time."

[BEAT b8 | 84.0s..96.0s | hold=2.0s | max_words=28] "8. Defining Class NP: Nondeterministic Polynomial Time"
  carried_in: []
  enter: myth_np_card@right_zone(card)
  transform_targets: true_np_card@left_zone(card)
  transforms: CompositeCardTransform(myth_np_card -> true_np_card, text_different=true, at=86.4s)
  cues: myth_np_card@85.0s, true_np_card@87.0s
  exit: [myth_np_card]
  carried_out: [true_np_card]
  narration: "NP does not mean non-polynomial; it means Nondeterministic Polynomial—problems whose YES answers have fast-checkable witnesses."

[BEAT b9 | 96.0s..108.0s | hold=2.0s | max_words=28] "9. Why P Is Inside NP (P subseteq NP)"
  carried_in: [true_np_card]
  enter: p_inside_np_venn@right_top(mobject), trivial_witness_card@right_bottom(card)
  transforms: []
  cues: p_inside_np_venn@97.2s, trivial_witness_card@98.4s
  exit: [true_np_card, p_inside_np_venn, trivial_witness_card]
  carried_out: []
  narration: "Every problem in P lies inside NP: solving a problem fast from scratch immediately verifies the answer with an empty witness."

[BEAT b10 | 108.0s..120.0s | hold=2.0s | max_words=28] "10. Classic NP Puzzles: Sudoku, Clique, and Factoring"
  carried_in: []
  enter: np_gallery_grid@left_zone(mobject), certificate_table_card@right_zone(card)
  transforms: []
  cues: np_gallery_grid@109.2s, certificate_table_card@110.4s
  exit: [np_gallery_grid, certificate_table_card]
  carried_out: []
  narration: "Completed grids, vertex cliques, and prime factors are hard to discover blindly, but instant to verify once handed to you."

[BEAT b11 | 120.0s..132.0s | hold=2.0s | max_words=28] "11. Polynomial-Time Reductions (A <=_p B)"
  carried_in: []
  enter: reduction_pipeline@left_zone(mobject), translator_card@right_zone(card)
  transforms: []
  cues: reduction_pipeline@121.2s, translator_card@122.4s
  exit: [translator_card]
  carried_out: [reduction_pipeline]
  narration: "A reduction A <=_p B transforms any instance of problem A into an instance of B in polynomial time, preserving YES and NO."

[BEAT b12 | 132.0s..144.0s | hold=2.0s | max_words=28] "12. How Hardness Flows Across Reductions"
  carried_in: [reduction_pipeline]
  enter: hardness_flow@right_top(mobject), contrapositive_card@right_bottom(card)
  transforms: []
  cues: hardness_flow@133.2s, contrapositive_card@134.4s
  exit: [reduction_pipeline, hardness_flow, contrapositive_card]
  carried_out: []
  narration: "If B is easy then A is easy; by contrapositive, if A is intractable, B must be at least as hard."

[BEAT b13 | 144.0s..156.0s | hold=2.0s | max_words=28] "13. Boolean Satisfiability (SAT) & The Cook-Levin Theorem"
  carried_in: []
  enter: circuit_sat_card@right_zone(card)
  transform_targets: cook_levin_badge@left_zone(card)
  transforms: CompositeCardTransform(circuit_sat_card -> cook_levin_badge, text_different=true, at=146.4s)
  cues: circuit_sat_card@145.0s, cook_levin_badge@147.0s
  exit: [circuit_sat_card]
  carried_out: [cook_levin_badge]
  narration: "In 1971 Cook and Levin proved that every NP verifier computation can be wired into a single Boolean SAT formula."

[BEAT b14 | 156.0s..168.0s | hold=2.0s | max_words=28] "14. NP-Hard vs NP-Complete: The Domino Crown"
  carried_in: [cook_levin_badge]
  enter: np_complete_crown@right_top(mobject), domino_collapse_card@right_bottom(card)
  transforms: []
  cues: np_complete_crown@157.2s, domino_collapse_card@158.4s
  exit: [cook_levin_badge, np_complete_crown, domino_collapse_card]
  carried_out: []
  narration: "NP-Complete problems sit at the peak of NP: a polynomial algorithm for any one of them solves all of NP."

[BEAT b15 | 168.0s..180.0s | hold=2.0s | max_words=28] "15. Karp's 21 Problems: 3-SAT, Clique, TSP, Coloring"
  carried_in: []
  enter: karp_reduction_web@left_zone(mobject), universal_bottleneck_card@right_zone(card)
  transforms: []
  cues: karp_reduction_web@169.2s, universal_bottleneck_card@170.4s
  exit: [karp_reduction_web, universal_bottleneck_card]
  carried_out: []
  narration: "Karp chained SAT reductions across 21 classic problems—routing, scheduling, packing, and coloring—revealing one shared bottleneck."

[BEAT b16 | 180.0s..192.0s | hold=2.0s | max_words=28] "16. World 1: What If P = NP?"
  carried_in: []
  enter: merged_p_np_diagram@left_zone(mobject), instant_discovery_card@right_zone(card)
  transforms: []
  cues: merged_p_np_diagram@181.2s, instant_discovery_card@182.4s
  exit: [instant_discovery_card]
  carried_out: [merged_p_np_diagram]
  narration: "If P equals NP, anything easy to check becomes easy to find: automated theorem proving, optimal logistics, and protein design."

[BEAT b17 | 192.0s..204.0s | hold=2.0s | max_words=28] "17. The Dark Side of P = NP: Cryptography Collapses"
  carried_in: [merged_p_np_diagram]
  enter: broken_padlock_diagram@right_top(mobject), public_key_risk_card@right_bottom(card)
  transforms: []
  cues: broken_padlock_diagram@193.2s, public_key_risk_card@194.4s
  exit: [merged_p_np_diagram, broken_padlock_diagram, public_key_risk_card]
  carried_out: []
  narration: "Modern cryptography relies on one-way asymmetry; if P equals NP, inverting hashes and breaking keys becomes routine."

[BEAT b18 | 204.0s..216.0s | hold=2.0s | max_words=28] "18. World 2: Why Consensus Favors P != NP"
  carried_in: []
  enter: conjecture_p_eq_np_card@right_zone(card)
  transform_targets: consensus_p_neq_np_card@left_zone(card)
  transforms: CompositeCardTransform(conjecture_p_eq_np_card -> consensus_p_neq_np_card, text_different=true, at=206.4s)
  cues: conjecture_p_eq_np_card@205.0s, consensus_p_neq_np_card@207.0s
  exit: [conjecture_p_eq_np_card]
  carried_out: [consensus_p_neq_np_card]
  narration: "Decades of failed attacks on thousands of NP-complete problems lead most theorists to conclude that verification is strictly easier than search."

[BEAT b19 | 216.0s..228.0s | hold=2.0s | max_words=28] "19. Three Proof Barriers & Practical Coping"
  carried_in: [consensus_p_neq_np_card]
  enter: three_barriers_wall@right_top(mobject), coping_strategies_card@right_bottom(card)
  transforms: []
  cues: three_barriers_wall@217.2s, coping_strategies_card@218.4s
  exit: [consensus_p_neq_np_card, three_barriers_wall, coping_strategies_card]
  carried_out: []
  narration: "Relativization, natural proofs, and algebrization block standard proof techniques, so engineers use approximation, SAT solvers, and heuristics."

[BEAT b20 | 228.0s..240.0s | hold=2.0s | max_words=28] "20. Synthesis: The Map of Computational Complexity"
  carried_in: []
  enter: complexity_atlas@left_zone(mobject), millennium_takeaway_card@right_zone(card)
  transforms: []
  cues: complexity_atlas@229.2s, millennium_takeaway_card@230.4s
  exit: [complexity_atlas, millennium_takeaway_card]
  carried_out: []
  narration: "P versus NP asks whether creativity can be automated: does fast verification always guarantee fast discovery from scratch?"
"""


def p_vs_np_20beat_contract() -> dict[str, Any]:
    """Return the validated 20-beat Scene Direction Contract for P vs NP (240.0s, 4 Acts x 5 beats)."""
    return ascii_to_scene_contract(P_VS_NP_ASCII_BLUEPRINT)


