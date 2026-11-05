"""RecordedScene: ManimCE-authored scenes as seekable ManimGL timelines.

Single forward pass: play()/wait() step the clock at a fixed dt, interpolate
the active animations, run updaters, and snapshot ManimGL's raw `mob.data`
buffer for any mobject carrying an updater or trail. evaluate(t) replays the
animation tracks and restores the nearest baked snapshot.

CE names that ManimGL lacks are aliased here, and CE's ignored `color=` kwargs
are re-applied so a compiled CE file keeps its palette.
"""
from __future__ import annotations

import re

import numpy as np
from manimlib import *
from manimlib.animation.animation import prepare_animation

from .native_timing import choose_baked_frame
from .scene_contract import (
    CONTRACT_ZONES,
    CardParts,
    CompositeCardTransform,
    _min_font_floors,
    _normalize_zone_bounds,
    composite_card_transform,
    validate_card_parts,
)
from contextlib import contextmanager

# ManimCE's YELLOW is a softer gold (#F7D96F); ManimGL's is pure yellow.
# Override the shared palette constants so compiled CE sources keep CE colors.
YELLOW = "#F7D96F"
YELLOW_C = "#F7D96F"
# The rest of the shared palette already matches ManimCE except BLUE_E.
BLUE_E = "#236B8E"

# ManimCE aliases that ManimGL does not export.  Generated CE code may use any
# of these names; define them so `from manim import *` keeps working.
_CE_COLOR_ALIASES = {
    "DARKER_GRAY": "#222222", "DARKER_GREY": "#222222",
    "DARK_BLUE": "#236B8E",
    "DARK_GRAY": "#444444", "DARK_GREY": "#444444",
    "GRAY": "#888888", "GRAY_A": "#DDDDDD", "GRAY_B": "#BBBBBB",
    "GRAY_BROWN": "#736357", "GRAY_C": "#888888", "GRAY_D": "#444444",
    "GRAY_E": "#222222",
    "LIGHTER_GRAY": "#DDDDDD", "LIGHTER_GREY": "#DDDDDD",
    "LIGHT_GRAY": "#BBBBBB", "LIGHT_GREY": "#BBBBBB",
    "LOGO_BLACK": "#343434", "LOGO_BLUE": "#525893", "LOGO_GREEN": "#87C2A5",
    "LOGO_RED": "#E07A5F", "LOGO_WHITE": "#ECE7E2",
    "PURE_BLUE": "#0000FF", "PURE_CYAN": "#00FFFF", "PURE_GREEN": "#00FF00",
    "PURE_MAGENTA": "#FF00FF", "PURE_RED": "#FF0000", "PURE_YELLOW": "#FFFF00",
    # Common generated-scene spellings that ManimCE authors use informally.
    "BG": "#071117", "BG_COLOR": "#071117", "BACKGROUND": "#071117",
    "CYAN": "#00FFFF", "AQUA": "#00FFFF", "MAGENTA": "#FF00FF",
    "LIME": "#00FF00", "NAVY": "#000080", "SKYBLUE": "#87CEEB",
}
globals().update(_CE_COLOR_ALIASES)


def _ce_point(value):
    """ManimCE accepts list points; ManimGL's curved geometry subtracts them."""
    if isinstance(value, (list, tuple)):
        return np.asarray(value, dtype=float)
    return value


def _ce_curved_geometry(factory):
    def wrapped(*args, **kwargs):
        args = tuple(_ce_point(value) for value in args[:2]) + args[2:]
        for key in ("start_point", "end_point", "start", "end"):
            if key in kwargs:
                kwargs[key] = _ce_point(kwargs[key])
        return factory(*args, **kwargs)
    return wrapped


for _name in ("CurvedArrow", "CurvedDoubleArrow", "ArcBetweenPoints"):
    _factory = globals().get(_name)
    if _factory is not None:
        globals()[_name] = _ce_curved_geometry(_factory)


class ManimColor(str):
    """Minimal ManimCE color wrapper accepted anywhere ManimGL wants a hex."""

    @classmethod
    def from_hex(cls, value, *args, **kwargs):
        return cls(str(value))

    @classmethod
    def from_rgb(cls, red, green, blue, *args, **kwargs):
        return cls(f"#{int(red):02X}{int(green):02X}{int(blue):02X}")

    @classmethod
    def from_rgba(cls, red, green, blue, alpha=255, *args, **kwargs):
        return cls(f"#{int(red):02X}{int(green):02X}{int(blue):02X}")

    @classmethod
    def parse(cls, value, *args, **kwargs):
        return cls(str(value))

    def to_hex(self, *args, **kwargs):
        return str(self)

import inspect


_orig_add_updater = Mobject.add_updater


def _tolerant_add_updater(self, func, **kwargs):
    try:
        params = len(inspect.signature(func).parameters)
    except (TypeError, ValueError):
        params = 2
    result = _orig_add_updater(self, (lambda mob, dt: func(mob)) if params <= 1 else func, **kwargs)
    # manimlib caches has_updaters(); invalidate it or the updater is skipped.
    self._has_updaters_in_family = None
    return result


Mobject.add_updater = _tolerant_add_updater


# ManimCE names the grid extents `rows`/`cols`; ManimGL uses n_rows/n_cols.
_orig_arrange_in_grid = Mobject.arrange_in_grid


def _ce_arrange_in_grid(self, rows=None, cols=None, **kwargs):
    if rows is not None:
        kwargs.setdefault("n_rows", rows)
    if cols is not None:
        kwargs.setdefault("n_cols", cols)
    return _orig_arrange_in_grid(self, **kwargs)


Mobject.arrange_in_grid = _ce_arrange_in_grid


if "ParametricCurve" in globals():
    _orig_param_init = ParametricCurve.__init__

    def _ce_param_init(self, *args, **kwargs):
        tr = kwargs.get("t_range")
        if isinstance(tr, (list, tuple)) and len(tr) == 2:
            step = max(0.01, abs(float(tr[1]) - float(tr[0])) / 100.0)
            kwargs["t_range"] = [float(tr[0]), float(tr[1]), step]
        elif len(args) >= 2 and isinstance(args[1], (list, tuple)) and len(args[1]) == 2:
            tr = args[1]
            step = max(0.01, abs(float(tr[1]) - float(tr[0])) / 100.0)
            args = (args[0], [float(tr[0]), float(tr[1]), step], *args[2:])
        _orig_param_init(self, *args, **kwargs)

    ParametricCurve.__init__ = _ce_param_init
    ParametricFunction = ParametricCurve


FPS = 30
DT = 1.0 / FPS

_VMobject_base = VMobject


# ------------------------------------------------------- CE animation adapters
# ManimCE animation constructors accept any number of mobjects:
#   FadeIn(a, b), Create(a, b), Indicate(a, b), GrowArrow(a, b)
# ManimGL's constructors take exactly one and quietly treat the second as a
# different positional parameter (a shift vector, a point, etc.). Wrap the
# constructors so ordinary CE code keeps its meaning: multiple mobjects become
# an AnimationGroup of per-mobject animations.
def _unwrap_card_arg(cls_name, arg):
    if isinstance(arg, CardParts):
        if cls_name in {"FadeIn", "FadeOut", "ShowCreation", "Create", "Uncreate", "Write", "DrawBorderThenFill"}:
            parts = [arg.frame, arg.text]
            if getattr(arg.extras, "submobjects", None):
                parts.append(arg.extras)
            return parts
        return [arg.as_group()]
    return [arg]


def _variadic_animation(cls):
    cls_name = getattr(cls, "__name__", "animation")

    def factory(*args, **kwargs):
        expanded = []
        for arg in args:
            expanded.extend(_unwrap_card_arg(cls_name, arg))
        if len(expanded) > 1 and all(isinstance(arg, Mobject) for arg in expanded):
            return AnimationGroup(*[cls(arg, **kwargs) for arg in expanded])
        return cls(*expanded, **kwargs)

    factory.__name__ = cls_name
    factory.__qualname__ = factory.__name__
    factory._ce_animation = cls
    return factory


for _name in ("FadeIn", "FadeOut", "ShowCreation", "Uncreate", "Write",
              "DrawBorderThenFill", "Indicate", "GrowFromCenter", "GrowArrow",
              "Unwrite", "Wiggle", "Circumscribe"):
    if _name in globals():
        globals()[_name] = _variadic_animation(globals()[_name])

Create = ShowCreation
Unwrite = Uncreate
Wiggle = Indicate
Circumscribe = Indicate


class VectorBrace(VMobject):
    """Pure-vector curly brace that does not invoke external LaTeX."""

    def __init__(self, mobject, direction=DOWN, buff=0.2, stroke_width=3.0, **kwargs):
        super().__init__(stroke_width=stroke_width, **kwargs)
        direction = np.array(direction, dtype=float)
        norm_dir = direction / (np.linalg.norm(direction) or 1.0)
        self.brace_direction = norm_dir

        angle = -math.atan2(norm_dir[1], norm_dir[0]) - math.pi / 2

        pts = mobject.get_all_points()
        if len(pts) == 0:
            c = mobject.get_center()
            pts = np.array([c - 0.5, c + 0.5])

        cos_a, sin_a = math.cos(-angle), math.sin(-angle)
        rot_x = pts[:, 0] * cos_a - pts[:, 1] * sin_a
        width = max(rot_x) - min(rot_x)
        w = max(width, 0.4) / 2.0
        d = min(0.35, max(0.15, w * 0.25))

        qw = min(w * 0.4, 0.3)
        p0 = np.array([-w, 0, 0])
        p1 = np.array([-w + qw, -d * 0.5, 0])
        p2 = np.array([-qw, -d * 0.5, 0])
        p3 = np.array([0, -d, 0])
        p4 = np.array([qw, -d * 0.5, 0])
        p5 = np.array([w - qw, -d * 0.5, 0])
        p6 = np.array([w, 0, 0])

        self.set_points_smoothly([p0, p1, p2, p3, p4, p5, p6])
        self.rotate(angle, about_point=ORIGIN)
        self.next_to(mobject, norm_dir, buff=buff)

    def get_tip(self):
        center = self.get_center()
        half_dim = (self.get_height() / 2) if abs(self.brace_direction[1]) > 0.5 else (self.get_width() / 2)
        return center + self.brace_direction * half_dim

    def get_direction(self):
        return self.brace_direction

    def put_at_tip(self, mob, buff=0.15):
        mob.next_to(self.get_tip(), self.brace_direction, buff=buff)
        return self

    def get_text(self, text, **kwargs):
        buff = kwargs.pop("buff", 0.15)
        text_mob = Text(text, **kwargs)
        self.put_at_tip(text_mob, buff=buff)
        return text_mob

    def get_tex(self, *tex, **kwargs):
        buff = kwargs.pop("buff", 0.15)
        text_mob = Text(" ".join(tex), **kwargs)
        self.put_at_tip(text_mob, buff=buff)
        return text_mob


Brace = VectorBrace


_NativeArrow = Arrow


class Arrow(_NativeArrow):
    """Preserve CE's explicit tip length on the native filled-arrow geometry."""

    def __init__(self, *args, tip_length=None, **kwargs):
        self.ce_tip_length = None if tip_length is None else float(tip_length)
        super().__init__(*args, **kwargs)

    def get_key_dimensions(self, length):
        width, tip_width, tip_length = super().get_key_dimensions(length)
        if self.ce_tip_length is not None:
            tip_length = min(self.ce_tip_length, max(0, length) * self.max_tip_length_to_length_ratio)
        return width, tip_width, tip_length


class DoubleArrow(VMobject):
    """Bidirectional arrow with tips at both endpoints, matching ManimCE."""

    def __init__(
        self,
        start=LEFT,
        end=RIGHT,
        buff=0.0,
        color=WHITE,
        stroke_width=4.0,
        tip_length=0.25,
        tip_width=0.2,
        **kwargs,
    ):
        color = kwargs.pop("color", color)
        fill_color = kwargs.pop("fill_color", color)
        fill_opacity = kwargs.pop("fill_opacity", 1.0)
        stroke_width = kwargs.pop("stroke_width", stroke_width)
        buff = kwargs.pop("buff", buff)
        tip_length = kwargs.pop("tip_length", tip_length)
        tip_width = kwargs.pop("tip_width", tip_width)
        super().__init__(color=color, stroke_width=stroke_width, **kwargs)

        temp_line = Line(start, end)
        s = np.array(temp_line.get_start(), dtype=float)
        e = np.array(temp_line.get_end(), dtype=float)
        vect = e - s
        length = np.linalg.norm(vect)
        unit = vect / (length if length > 1e-6 else 1.0)
        if buff > 0:
            s = s + unit * buff
            e = e - unit * buff

        self.start_point = s
        self.end_point = e

        stem = Line(s, e, color=color, stroke_width=stroke_width)
        angle_end = math.atan2(unit[1], unit[0])
        tip_end = ArrowTip(angle=angle_end, length=tip_length, width=tip_width,
                           fill_color=fill_color, fill_opacity=fill_opacity)
        tip_end.shift(e - tip_end.get_tip_point())

        angle_start = math.atan2(-unit[1], -unit[0])
        tip_start = ArrowTip(angle=angle_start, length=tip_length, width=tip_width,
                             fill_color=fill_color, fill_opacity=fill_opacity)
        tip_start.shift(s - tip_start.get_tip_point())

        self.add(stem, tip_start, tip_end)

    def get_start(self):
        return self.start_point

    def get_end(self):
        return self.end_point


class Paragraph(VGroup):
    """Multi-line text block, matching ManimCE."""

    def __init__(self, *text_lines, font_size=32, buff=0.2, **kwargs):
        super().__init__(**kwargs)
        lines = []
        for line in text_lines:
            if isinstance(line, str):
                for sub in line.split("\n"):
                    lines.append(Text(sub, font_size=font_size, **kwargs))
            elif isinstance(line, Mobject):
                lines.append(line)
        if lines:
            self.add(*lines)
            self.arrange(DOWN, buff=buff, aligned_edge=LEFT)


class LabeledDot(VMobject):
    """Dot with centered text label, matching ManimCE."""

    def __init__(self, label, radius=0.3, point=ORIGIN, color=WHITE, **kwargs):
        super().__init__(**kwargs)
        dot_color = kwargs.pop("dot_color", color)
        dot = Dot(point=point, radius=radius, color=dot_color, **kwargs)
        if isinstance(label, str):
            text = Text(label, font_size=int(radius * 50))
            text.move_to(dot.get_center())
        elif isinstance(label, Mobject):
            text = label
            text.move_to(dot.get_center())
        else:
            text = VMobject()
        self.dot = dot
        self.label = text
        self.add(dot, text)


class LabeledLine(VMobject):
    """Line with text label, matching ManimCE."""

    def __init__(self, start=LEFT, end=RIGHT, label="label", buff=0.2, **kwargs):
        super().__init__(**kwargs)
        line = Line(start, end, **kwargs)
        text = Text(label, font_size=24) if isinstance(label, str) else label
        text.next_to(line.get_center(), UP, buff=buff)
        self.line = line
        self.label = text
        self.add(line, text)


class LabeledArrow(VMobject):
    """Arrow with text label, matching ManimCE."""

    def __init__(self, start=LEFT, end=RIGHT, label="label", buff=0.2, **kwargs):
        super().__init__(**kwargs)
        arrow = Arrow(start, end, **kwargs)
        text = Text(label, font_size=24) if isinstance(label, str) else label
        text.next_to(arrow.get_center(), UP, buff=buff)
        self.arrow = arrow
        self.label = text
        self.add(arrow, text)


class BraceBetweenPoints(VectorBrace):
    """Curly brace between two arbitrary points, matching ManimCE."""

    def __init__(self, point_1, point_2, direction=UP, **kwargs):
        line = Line(point_1, point_2)
        super().__init__(line, direction=direction, **kwargs)


class ArcBrace(VectorBrace):
    """Curly brace along an arc, matching ManimCE."""

    def __init__(self, arc, direction=UP, **kwargs):
        super().__init__(arc, direction=direction, **kwargs)


class Angle(VMobject):
    """Angle arc between two intersecting lines, matching ManimCE."""

    def __init__(self, line1, line2, radius=0.5, **kwargs):
        super().__init__(**kwargs)
        p1 = line1.get_start()
        vertex = line1.get_end()
        p2 = line2.get_end()
        v1 = p1 - vertex
        v2 = p2 - vertex
        a1 = math.atan2(v1[1], v1[0])
        a2 = math.atan2(v2[1], v2[0])
        arc = Arc(start_angle=a1, angle=(a2 - a1) % (2 * math.pi),
                  radius=radius, arc_center=vertex, **kwargs)
        self.add(arc)


class RightAngle(Angle):
    """Right angle indicator, matching ManimCE."""

    def __init__(self, line1, line2, length=0.3, **kwargs):
        super().__init__(line1, line2, radius=length, **kwargs)


class Table(VGroup):
    """2D Grid table of text or mobjects, matching ManimCE."""

    def __init__(self, table_entries, **kwargs):
        super().__init__()
        rows = []
        for row in table_entries:
            row_group = VGroup()
            for cell in row:
                cell_mob = cell if isinstance(cell, Mobject) else Text(str(cell), font_size=24)
                row_group.add(cell_mob)
            row_group.arrange(RIGHT, buff=0.5)
            rows.append(row_group)
        if rows:
            self.add(*rows)
            self.arrange(DOWN, buff=0.3, aligned_edge=LEFT)


MathTable = Table
IntegerTable = Table
DecimalTable = Table
MobjectTable = Table


class VDict(VGroup):
    """Key-value dictionary container for VMobjects, matching ManimCE."""

    def __init__(self, mapping=None, **kwargs):
        super().__init__()
        self._dict = {}
        if mapping:
            for k, v in mapping.items():
                self[k] = v

    def __setitem__(self, key, value):
        self._dict[key] = value
        self.add(value)

    def __getitem__(self, key):
        return self._dict[key]


class Variable(VGroup):
    """Tracked numerical variable with label, matching ManimCE."""

    def __init__(self, var, label="x", num_decimal_places=2, **kwargs):
        super().__init__()
        label_mob = Text(f"{label} = ", font_size=28)
        val_mob = DecimalNumber(var, num_decimal_places=num_decimal_places, font_size=28)
        val_mob.next_to(label_mob, RIGHT)
        self.label = label_mob
        self.tracker = val_mob
        self.add(label_mob, val_mob)


# ManimCE arrow tip aliases
ArrowTriangleFilledTip = ArrowTip
ArrowTriangleTip = ArrowTip
ArrowCircleFilledTip = ArrowTip
ArrowCircleTip = ArrowTip
ArrowSquareFilledTip = ArrowTip
ArrowSquareTip = ArrowTip
StealthTip = ArrowTip

# ManimCE animation aliases
AddTextLetterByLetter = Write
RemoveTextLetterByLetter = Uncreate
TypeWithCursor = Write
UntypeWithCursor = Uncreate
SpinInFromNothing = GrowFromCenter
SpiralIn = GrowFromCenter
Blink = Indicate
ClockwiseTransform = Transform
CounterclockwiseTransform = Transform
ShowPassingFlashWithThinningStrokeWidth = Flash

# ManimCE typography & layout constants
DEFAULT_FONT_SIZE = 48
LIGHT = "LIGHT"
MEDIUM = "MEDIUM"
SEMIBOLD = "SEMIBOLD"
BOLD = "BOLD"
THIN = "THIN"
ULTRABOLD = "ULTRABOLD"

import shutil as _shutil

if not _shutil.which("latex"):
    class SafeTex(VMobject):
        """Fallback for Tex/MathTex when LaTeX is not installed on the system."""

        def __init__(self, *tex_strings, **kwargs):
            raw = " ".join(str(s) for s in tex_strings)
            cleaned = re.sub(r"\\[a-zA-Z]+", " ", raw)
            cleaned = cleaned.replace("$", "").replace("{", "").replace("}", "").strip()
            super().__init__(**kwargs)
            self._text_mobj = Text(cleaned or " ", **kwargs)
            self.add(self._text_mobj)

    Tex = SafeTex
    MathTex = SafeTex
else:
    MathTex = Tex


# AnimationGroup and its subclasses also call prepare_animation internally.
# Convert a bare CE mobject to a draw animation there as well.
_orig_animation_group_init = AnimationGroup.__init__


def _ce_animation_group_init(self, *args, **kwargs):
    def fix(value):
        if isinstance(value, Mobject):
            return Create(value)
        if isinstance(value, (list, tuple)):
            return type(value)(fix(item) for item in value)
        return value

    _orig_animation_group_init(self, *(fix(arg) for arg in args), **kwargs)


AnimationGroup.__init__ = _ce_animation_group_init


# ------------------------------------------------------------ CE text metrics
# Measured by the compiler in a real ManimCE environment and keyed by
# (text, font_size, font, weight, slant).  Pango/font differences otherwise
# make the same `Text(...)` occupy a different box in ManimGL; stretch the
# native text box to the CE box so coordinates, spacing and collisions match.
TEXT_METRICS: dict = {}


def _metric_key(text, font_size, font, weight, slant):
    return "|".join((str(text), str(float(font_size)), str(font or ""),
                     str(weight or ""), str(slant or "")))


def _apply_text_metric(obj, text, font_size, font, weight, slant):
    metric = TEXT_METRICS.get(_metric_key(text, font_size, font, weight, slant))
    if not metric:
        return obj
    width, height = metric
    try:
        if width > 0 and obj.get_width() > 0:
            obj.stretch_to_fit_width(width)
        if height > 0 and obj.get_height() > 0:
            obj.stretch_to_fit_height(height)
    except (AttributeError, ValueError):
        pass
    return obj


def _ce_text_factory(*args, **kwargs):
    text = args[0] if args else kwargs.get("text", "")
    font_size = kwargs.get("font_size", 48)
    font = kwargs.get("font")
    weight = kwargs.get("weight")
    slant = kwargs.get("slant")
    # An explicit height/width already defines the box; do not override it.
    explicit = kwargs.get("height") is not None or kwargs.get("width") is not None
    color = kwargs.pop("color", None)
    obj = _Text_base(*args, **kwargs)
    obj._ce_font_size = float(font_size) if isinstance(font_size, (int, float)) else 48.0
    if color is not None:
        obj.set_color(color)
    if not explicit:
        _apply_text_metric(obj, text, font_size, font, weight, slant)
    try:
        obj._initial_height = float(obj.get_height())
    except Exception:
        obj._initial_height = 0.0
    return obj


_Text_base = globals().get("Text")
if _Text_base is not None:
    Text = _ce_text_factory


# ------------------------------------------------------ CE transform adapters
# ManimGL's Transform already calls align_data_and_family, but make the
# equivalence explicit: align a copy of the target before the animation begins
# so group/submobject mismatches morph instead of popping.  A replacement
# between different Text strings matches glyphs instead of interpolating two
# unrelated point forests; everything else keeps the real transform.
_RealTransform = Transform
_RealReplacementTransform = ReplacementTransform


class CETransform(_RealTransform):
    def begin(self):
        if self.target_mobject is not None and not self.mobject.is_aligned_with(self.target_mobject):
            # Align a local copy: never replace target_mobject, because
            # ReplacementTransform adds that exact object to the scene and a
            # later animation may still use the original variable.
            target_copy = self.target_mobject.copy()
            self.mobject.align_data_and_family(target_copy)
        super().begin()


class CEReplacementTransform(_RealReplacementTransform):
    def begin(self):
        if self.target_mobject is not None and not self.mobject.is_aligned_with(self.target_mobject):
            target_copy = self.target_mobject.copy()
            self.mobject.align_data_and_family(target_copy)
        super().begin()


def _is_text_mobject(mobj):
    return _Text_base is not None and isinstance(mobj, _Text_base)


def CEReplacementTransformFactory(mobject, target_mobject=None, **kwargs):
    if (_is_text_mobject(mobject) and _is_text_mobject(target_mobject)
            and getattr(mobject, "text", None) != getattr(target_mobject, "text", None)):
        return TransformMatchingShapes(mobject, target_mobject, **kwargs)
    return CEReplacementTransform(mobject, target_mobject, **kwargs)


Transform = CETransform
ReplacementTransform = CEReplacementTransformFactory


class Circumscribe(AnimationGroup):
    """CE's Circumscribe: draw a box around a mobject, then fade it out."""

    def __init__(self, mobject, color=YELLOW, buff=0.1, fade_out=True,
                 time_width=0.3, **kwargs):
        target = mobject.as_group() if isinstance(mobject, CardParts) else mobject
        box = SurroundingRectangle(target, color=color, buff=buff)
        animations = [Create(box)]
        if fade_out:
            animations.append(FadeOut(box))
        super().__init__(*animations, lag_ratio=0.5, **kwargs)


# ManimCE calls a number line's extent `length`; ManimGL calls it `width`.
_RealNumberLine = NumberLine


def _ce_number_line(*args, **kwargs):
    if "length" in kwargs:
        kwargs.setdefault("width", kwargs.pop("length"))
    if "stroke_color" in kwargs:
        kwargs.setdefault("color", kwargs.pop("stroke_color"))
    if "label_size" in kwargs:
        size = kwargs.pop("label_size")
        config = dict(kwargs.get("decimal_number_config") or {})
        config.setdefault("font_size", size)
        kwargs["decimal_number_config"] = config
    if "font_size" in kwargs:
        size = kwargs.pop("font_size")
        config = dict(kwargs.get("decimal_number_config") or {})
        config.setdefault("font_size", size)
        kwargs["decimal_number_config"] = config
    if "label_direction" in kwargs:
        kwargs.setdefault("line_to_number_direction", kwargs.pop("label_direction"))
    if "label_buff" in kwargs:
        kwargs.setdefault("line_to_number_buff", kwargs.pop("label_buff"))
    return _RealNumberLine(*args, **kwargs)


NumberLine = _ce_number_line


# ManimCE's Cross may be constructed with no source mobject; ManimGL requires
# one.  Build the two strokes directly when no mobject is supplied.
_RealCross = Cross


def _ce_cross(mobject=None, stroke_color=None, stroke_width=6.0,
              scale_factor=1.0, **kwargs):
    color = kwargs.pop("color", None) or stroke_color or "#FC6255"
    cross = VGroup(
        Line(UP + LEFT, DOWN + RIGHT, color=color, stroke_width=stroke_width),
        Line(UP + RIGHT, DOWN + LEFT, color=color, stroke_width=stroke_width),
    )
    if mobject is not None:
        cross.replace(mobject, stretch=True)
    cross.scale(scale_factor)
    return cross


Cross = _ce_cross


def _ce_star(n=5, outer_radius=1.0, inner_radius=0.5, density=2,
             start_angle=PI / 2, **kwargs):
    points = []
    for index in range(2 * n):
        radius = outer_radius if index % 2 == 0 else inner_radius
        angle = start_angle + index * PI / n
        points.append([radius * np.cos(angle), radius * np.sin(angle), 0])
    return Polygon(*points, **kwargs)


Star = _ce_star


# ManimCE uses x_length/y_length for Axes and NumberPlane; ManimGL uses
# width/height.  Add the missing CE Axes helpers used by math scenes.
_RealAxes = Axes


def _ce_axes_plot(self, function, x_range=None, **kwargs):
    return self.get_graph(function, x_range=x_range, **kwargs)


def _ce_lines_to_point(self, point, color=WHITE, dash_length=0.1,
                       stroke_width=2):
    origin = self.get_origin()
    vertical = DashedLine([point[0], origin[1], 0], point, color=color,
                          dash_length=dash_length, stroke_width=stroke_width)
    horizontal = DashedLine([origin[0], point[1], 0], point, color=color,
                            dash_length=dash_length, stroke_width=stroke_width)
    return VGroup(vertical, horizontal)


def _ce_secant_slope_group(self, x, graph, dx=1.0, dx_line_color=YELLOW,
                           df_line_color=GREEN, secant_line_color=RED,
                           secant_line_length=6):
    function = getattr(graph, "underlying_function", None) or getattr(graph, "function")
    p1 = self.c2p(x, function(x))
    p2 = self.c2p(x + dx, function(x + dx))
    corner = np.array([p2[0], p1[1], 0])
    dx_line = Line(p1, corner, color=dx_line_color)
    df_line = Line(corner, p2, color=df_line_color)
    secant = Line(p1, p2, color=secant_line_color)
    secant.set_length(secant_line_length).move_to((p1 + p2) / 2)
    group = VGroup(dx_line, df_line, secant)
    group.dx_line = dx_line
    group.df_line = df_line
    group.secant_line = secant
    return group


_RealAxes.plot = _ce_axes_plot
_RealAxes.get_lines_to_point = _ce_lines_to_point
_RealAxes.get_secant_slope_group = _ce_secant_slope_group
_RealAxes_get_axis_labels = _RealAxes.get_axis_labels


def _ce_axis_labels(self, x_label=None, y_label=None, **kwargs):
    if x_label is not None:
        kwargs.setdefault("x_label_tex", x_label)
    if y_label is not None:
        kwargs.setdefault("y_label_tex", y_label)
    return _RealAxes_get_axis_labels(self, **kwargs)


_RealAxes.get_axis_labels = _ce_axis_labels


def _normalize_axis_config(config):
    if not isinstance(config, dict):
        return config
    config = dict(config)
    tip = dict(config.get("tip_config") or {})
    for ce_name, native_name in [('tip_width', 'width'), ('tip_height', 'length'), ('tip_length', 'length')]:
        if ce_name in config:
            tip.setdefault(native_name, config.pop(ce_name))
    if tip:
        config['tip_config'] = tip
    size = config.pop("font_size", None)
    if size is not None:
        numbers = dict(config.get("decimal_number_config") or {})
        numbers.setdefault("font_size", size)
        config["decimal_number_config"] = numbers
    return config


def _ce_axes(*args, **kwargs):
    if "x_length" in kwargs:
        kwargs.setdefault("width", kwargs.pop("x_length"))
    if "y_length" in kwargs:
        kwargs.setdefault("height", kwargs.pop("y_length"))
    tips = kwargs.pop("tips", None)
    if tips:
        axis_config = dict(kwargs.get("axis_config") or {})
        axis_config.setdefault("include_tip", True)
        kwargs["axis_config"] = axis_config
    for key in ("axis_config", "x_axis_config", "y_axis_config"):
        if key in kwargs:
            kwargs[key] = _normalize_axis_config(kwargs[key])
    return _RealAxes(*args, **kwargs)


Axes = _ce_axes

_RealNumberPlane = NumberPlane


def _ce_number_plane(*args, **kwargs):
    if "x_length" in kwargs:
        kwargs.setdefault("width", kwargs.pop("x_length"))
    if "y_length" in kwargs:
        kwargs.setdefault("height", kwargs.pop("y_length"))
    return _RealNumberPlane(*args, **kwargs)


NumberPlane = _ce_number_plane


# ------------------------------------------------------------ CE color kwargs
def _wrap_color(cls):
    class Wrapped(cls):
        def __init__(self, *args, **kwargs):
            color = kwargs.pop("color", None)
            super().__init__(*args, **kwargs)
            if color is not None:
                self.set_color(color)

    Wrapped.__name__ = getattr(cls, "__name__", "wrapped")
    Wrapped.__qualname__ = Wrapped.__name__
    return Wrapped


for _name in ("Circle", "Ellipse", "Dot", "Tex", "Line", "Arrow", "Triangle",
              "Rectangle", "RoundedRectangle", "Square", "Polygon", "Arc", "VMobject"):
    if _name in globals():
        globals()[_name] = _wrap_color(globals()[_name])


# ManimCE 3D primitives are VMobjects; manimlib's Surface is not.
from manimlib.mobject.types.surface import Surface as _Surface


def _surface_fill(self, color=None, opacity=None, **kwargs):
    if color is not None:
        self.set_color(color)
    if opacity is not None:
        self.set_opacity(opacity)
    return self


def _surface_stroke(self, *args, **kwargs):
    return self


def _group_set_opacity(self, opacity, recurse=True):
    for mob in self.get_family():
        if mob is self:
            continue
        try:
            mob.set_opacity(opacity, recurse=False)
        except Exception:
            pass
    return self


_Group_cls = globals().get("Group")
if _Group_cls is not None:
    _orig_group_opacity = _Group_cls.set_opacity
    _Group_cls.set_opacity = _group_set_opacity

_Surface.set_fill = _surface_fill
_Surface.set_stroke = _surface_stroke


def _wrap_3d(cls):
    def factory(*args, **kwargs):
        color = kwargs.pop("color", None) or kwargs.pop("fill_color", None)
        kwargs.pop("shade_in_3d", None)
        obj = cls(*args, **kwargs)
        if color is not None:
            obj.set_color(color)
        return obj
    factory.__name__ = getattr(cls, "__name__", "wrapped3d")
    return factory


for _name in ("Sphere", "Cylinder", "Cone", "Torus", "Cube", "Prism"):
    if _name in globals():
        globals()[_name] = _wrap_3d(globals()[_name])


class RecordedScene(Scene):
    lesson_id = "wbc"
    chapter_starts = (0.0, 4.6, 10.4, 15.2, 23.4)
    chapter_titles = ("Contact is not yet a decision", "Two candidates at once",
                      "Inside a PAMP spike", "From match to response", "The decision rule")

    def __init__(self):
        super().__init__(
            camera_config={"resolution": (1280, 720), "fps": FPS,
                           "background_color": "#071117", "max_allowable_norm": 1000},
            file_writer_config={"write_to_movie": False},
        )
        self.clock = 0.0
        self.duration = 0.0
        self.tracks = []            # (start, run_time, animation)
        self.baked = {}             # id(mob) -> (mob, [(t, data.copy())])
        self.updaters_seen = {}     # id(top) -> (mob, seen)
        self.updater_stop = {}      # id(top) -> clock its updaters were cleared
        self.role_reveal = {}       # id(role mob) -> first clock it is animated
        self.role_hide = {}         # id(role mob) -> fade-out clock
        self.frame_baked = []       # (t, camera frame state)
        self.scene_baked = []       # (t, tuple(top-level mobjects))
        self.checkpoints = []       # (t, graph, {id: (mob, family data)}, frame) at play starts
        self.beats = []             # {"id","title","time"} markers from the CE source
        self.cues = []              # {"id","time"} sub-beat anchors for narration sync
        self.roles = {}
        self.bound_objects = {}
        self.bound_cards = {}
        self.bound_kinds = {}
        self._active_budget_deadline = None
        self.settings = None
        self.build()

    # ------------------------------------------------------------- recording
    def _setup_contract_runtime(self):
        contract = getattr(self, "_contract", None) or getattr(self, "CONTRACT", None)
        if isinstance(contract, dict):
            self._contract = contract

    def beat(self, name, title=None):
        """Marker the generated CE source calls at a teaching-beat boundary."""
        self.beats.append({"id": str(name), "title": str(title or name), "time": round(self.clock, 3)})

    def cue(self, name, mobject=None):
        """Marker for a semantic object the narration can anchor to."""
        if mobject is not None:
            self.bind(str(name), mobject)
        self.cues.append({"id": str(name), "time": round(self.clock, 3)})

    def bind(self, object_id, mobject, kind=None, zone=None):
        """Bind a contract object ID to its runtime Mobject or CardParts."""
        oid = str(object_id)
        contract = getattr(self, "_contract", None) or getattr(self, "CONTRACT", None) or {}
        zone = str(zone or "")
        if not zone:
            for beat in contract.get("beats") or []:
                zmap = beat.get("zone_bindings") or {}
                if oid in zmap:
                    zone = zmap[oid]
                    break
        if not zone and oid in (contract.get("persistent_enter") or {}):
            zone = (contract["persistent_enter"][oid] or {}).get("zone", "")

        is_card = kind == "card" or isinstance(mobject, CardParts)
        if not is_card and kind is None:
            for beat in contract.get("beats") or []:
                if (beat.get("object_kinds") or {}).get(oid) == "card":
                    is_card = True
                    break

        if is_card:
            validate_card_parts(mobject, object_id=oid, zone=zone)
            grp = mobject.as_group()
            self.bound_cards[oid] = mobject
            self.bound_kinds[oid] = "card"
            self.bound_objects[oid] = grp
            self.roles[oid] = [grp]
            return mobject

        if not isinstance(mobject, Mobject):
            raise ValueError(f"Contract object '{oid}' must be a Mobject, got {type(mobject).__name__}")
        self.bound_kinds[oid] = kind or "mobject"
        self.bound_objects[oid] = mobject
        self.roles[oid] = [mobject]
        return mobject

    def zone_box(self, zone_name):
        contract = getattr(self, "_contract", None) or getattr(self, "CONTRACT", None) or {}
        zones = contract.get("zones") or CONTRACT_ZONES
        if zone_name not in zones:
            raise ValueError(f"Unknown contract zone '{zone_name}'")
        return _normalize_zone_bounds(zones[zone_name])

    def zone_center(self, zone_name):
        x1, x2, y1, y2 = self.zone_box(zone_name)
        return np.array([(x1 + x2) / 2.0, (y1 + y2) / 2.0, 0.0])

    def place_in_zone(self, mobject, zone_name, buff=0.35, fit=True):
        """Center `mobject` inside `zone_name`; only fit-scale if every Text stays >= min_font_size."""
        x1, x2, y1, y2 = self.zone_box(zone_name)
        max_w = max(0.2, (x2 - x1) - 0.1)
        max_h = max(0.2, (y2 - y1) - 0.1)
        target_center = self.zone_center(zone_name)
        mobject.move_to(target_center)
        if not fit:
            return mobject
        try:
            w = float(mobject.get_width())
            h = float(mobject.get_height())
        except Exception:
            return mobject
        if w <= max_w and h <= max_h:
            return mobject
        scale_factor = min(max_w / max(w, 1e-6), max_h / max(h, 1e-6))
        if scale_factor >= 1.0:
            return mobject

        contract = getattr(self, "_contract", None) or getattr(self, "CONTRACT", None) or {}
        label_floor, title_floor = _min_font_floors(contract)
        can_fit = True
        for part in mobject.get_family():
            txt = getattr(part, "text", None)
            if not isinstance(txt, str) or not txt.strip():
                continue
            authored = float(getattr(part, "_ce_font_size", 48.0))
            init_h = float(getattr(part, "_initial_height", 0.0) or 0.0)
            curr_h = float(part.get_height()) if init_h > 1e-4 else init_h
            eff = authored * (curr_h / init_h) if init_h > 1e-4 else authored
            req = title_floor if getattr(part, "_is_title", False) else label_floor
            if eff * scale_factor < req - 1e-3:
                can_fit = False
                break
        if can_fit:
            mobject.scale(scale_factor)
            mobject.move_to(target_center)
        return mobject

    @contextmanager
    def _animation_budget(self, budget_seconds: float):
        prev = self._active_budget_deadline
        self._active_budget_deadline = self.clock + max(0.4, float(budget_seconds))
        try:
            yield
        finally:
            self._active_budget_deadline = prev

    def _hold_until(self, target_clock: float, min_hold: float = 1.0):
        remaining = float(target_clock) - self.clock
        if remaining > 1e-3:
            self.wait(remaining)
        elif min_hold > 0 and remaining < -0.5:
            self.wait(min_hold)

    def reset_scene(self):
        """Explicit scene reset at the end of construct()."""
        for mob in list(self.mobjects):
            if mob is not self.select_group:
                self.remove(mob)
        self._snapshot()

    # ManimCE ThreeDScene API
    def set_camera_orientation(self, phi=70 * DEGREES, theta=-30 * DEGREES, zoom=1.0,
                               center=None, frame_center=None, **kwargs):
        self.frame.set_phi(phi)
        self.frame.set_theta(theta)
        if zoom:
            self.frame.set_height(8.0 / zoom)
        target = center if center is not None else frame_center
        if target is not None:
            self.frame.move_to(target)

    def begin_ambient_camera_rotation(self, rate=0.1, **kwargs):
        self.frame.add_ambient_rotation(rate if abs(rate) > 1e-4 else 1 * DEGREES)

    def stop_ambient_camera_rotation(self):
        self.frame.clear_updaters()

    def add_fixed_in_frame_mobjects(self, *mobjects):
        for mob in mobjects:
            mob.fix_in_frame()
            self.add(mob)

    def _frame_state(self):
        """Points plus uniforms define a CameraFrame completely."""
        return (
            self.frame.get_points().copy(),
            {key: (value.copy() if hasattr(value, "copy") else value)
             for key, value in self.frame.uniforms.items()},
        )

    def _restore_frame_state(self, state):
        points, uniforms = state
        self.frame.set_points(points.copy())
        for key, value in uniforms.items():
            if key in self.frame.uniforms:
                self.frame.uniforms[key] = value.copy() if hasattr(value, "copy") else value

    def _checkpoint(self):
        """Snapshot the state at the start of a play, for history-free seeking."""
        graph = tuple(m for m in self.mobjects if m is not self.select_group)
        data = {}
        for mob in graph:
            data[id(mob)] = (mob, [(part, part.data.copy()) for part in mob.get_family()])
        self.checkpoints.append((self.clock, graph, data, self._frame_state()))

    def _snapshot(self):
        # Exact scene graph, so a seek restores which mobjects exist at that
        # moment. Fade bookkeeping alone cannot: a later FadeOut(Group(...))
        # adds a wrapper that keeps already-hidden children alive.
        entry = (self.clock, tuple(m for m in self.mobjects if m is not self.select_group))
        if self.scene_baked and abs(self.scene_baked[-1][0] - self.clock) < 1e-9:
            self.scene_baked[-1] = entry
        else:
            self.scene_baked.append(entry)
        for mob in self.mobjects:
            if not getattr(mob, "has_updaters", lambda: False)():
                continue
            entry = self.baked.setdefault(id(mob), (mob, []))
            # A Text/SVG is a group whose points live in child paths, so a
            # top-level data copy is empty. Bake the whole family, and skip
            # ticks where nothing changed (labels are still most of the time).
            parts = list(mob.get_family())
            if entry[1]:
                previous = entry[1][-1][1]
                if (len(previous) == len(parts)
                        and all(np.array_equal(old, part.data)
                                for (_, old), part in zip(previous, parts))):
                    continue
            entry[1].append((self.clock, [(part, part.data.copy()) for part in parts]))
        if getattr(self.frame, "has_updaters", lambda: False)():
            self.frame_baked.append((self.clock, {
                "center": self.frame.get_center().copy(),
                "width": float(self.frame.get_width()),
                "phi": float(self.frame.get_phi()),
                "theta": float(self.frame.get_theta()),
                "gamma": float(self.frame.get_gamma()),
            }))

    def _run_updaters(self, dt):
        # Bypass manimlib's cached has_updaters() and updating_suspended flag:
        # both can be stale after manimlib animations. Run updaters on every
        # family member, not just top-level mobjects: `has_updaters()` recurses,
        # so a label whose updater lives on a child must run too.
        # The CameraFrame is not in self.mobjects (build() clears the scene),
        # so its ambient-rotation updater must be run explicitly.
        tops = list(self.mobjects)
        if not any(top is self.frame for top in tops):
            tops.append(self.frame)
        for top in tops:
            active = False
            for mob in top.get_family():
                updaters = list(getattr(mob, "updaters", []))
                if not updaters:
                    continue
                active = True
                for updater in updaters:
                    if "dt" in getattr(updater, "__code__", type("x", (), {"co_varnames": ()})).co_varnames:
                        updater(mob, dt=dt)
                    else:
                        updater(mob)
            if active:
                self.updaters_seen[id(top)] = (top, active)
                self.updater_stop.pop(id(top), None)
            elif id(top) in self.updaters_seen and id(top) not in self.updater_stop:
                self.updater_stop[id(top)] = self.clock

    def update_mobjects(self, dt=0):
        # Updaters are baked into keyframes. update_frame() calls this with
        # dt=0, which would re-run a stateful updater against the closure state
        # left at the end of build and overwrite the seek-time frame — e.g. a
        # breathing halo would render at one frozen opacity forever.
        pass

    def _step(self, dt, prepared=None, alpha=1.0):
        if prepared:
            for anim in prepared:
                anim.interpolate(alpha)
        self._run_updaters(dt)
        self.clock += dt
        self._snapshot()

    def play(self, *animations, run_time=1.0, **kwargs):
        deadline = getattr(self, "_active_budget_deadline", None)
        if deadline is not None:
            remaining = deadline - self.clock
            if remaining <= 1e-6:
                return
            run_time = min(float(run_time), remaining)
        # Some CE code writes `self.play(SomeMobject(...))` and expects it to
        # appear.  Real ManimCE rejects that, but the native pipeline can be
        # forgiving: draw the bare mobject rather than crashing the whole lesson.
        prepared = [
            prepare_animation(
                Create(a.as_group()) if isinstance(a, CardParts)
                else (Create(a) if isinstance(a, Mobject) else a)
            )
            for a in animations
        ]
        rate_func = kwargs.get("rate_func")

        def _leaf_animations(anim_obj):
            subs = getattr(anim_obj, "animations", None)
            if subs:
                out = []
                for sub in subs:
                    out.extend(_leaf_animations(sub))
                return out
            return [anim_obj]

        for anim in prepared:
            anim.set_run_time(run_time)
            if rate_func is not None:
                anim.rate_func = rate_func
            anim.begin()
            for leaf in _leaf_animations(anim):
                if leaf.mobject is not self.frame:
                    self.add(leaf.mobject)
        self._checkpoint()
        start = self.clock
        for anim in prepared:
            for leaf in _leaf_animations(anim):
                target = leaf.mobject
                for mobs in self.roles.values():
                    for role_mob in mobs:
                        family = role_mob.get_family()
                        if target is role_mob or target in family or role_mob in target.get_family():
                            previous = self.role_reveal.get(id(role_mob))
                            self.role_reveal[id(role_mob)] = start if previous is None else min(previous, start)
        steps = max(1, int(round(run_time * FPS)))
        for k in range(1, steps + 1):
            self._step(DT, prepared, k / steps)
        for anim in prepared:
            anim.finish()
            anim.clean_up_from_scene(self)
            self.tracks.append((start, run_time, anim))
        # Capture post-animation removals (FadeOut/replacement) at the same clock.
        self._snapshot()

    def wait(self, run_time=1.0):
        deadline = getattr(self, "_active_budget_deadline", None)
        if deadline is not None:
            remaining = deadline - self.clock
            if remaining <= 1e-6:
                return
            run_time = min(float(run_time), remaining)
        if run_time <= 1e-6:
            return
        steps = max(1, int(round(run_time * FPS)))
        for _ in range(steps):
            self._step(DT)

    def build(self, settings=None):
        self.settings = settings if settings is not None else {}
        self.clear()
        self.tracks = []
        self.baked = {}
        self.updaters_seen = {}
        self.updater_stop = {}
        self.role_reveal = {}
        self.role_hide = {}
        self.frame_baked = []
        self.scene_baked = []
        self.checkpoints = []
        self.beats = []
        self.cues = []
        self.roles = {}
        self.bound_objects = {}
        self.bound_cards = {}
        self.bound_kinds = {}
        self._active_budget_deadline = None
        self.clock = 0.0
        self.frame.move_to(ORIGIN).set_width(14.22)
        self.chrome = "chapter_titles" in type(self).__dict__
        self.select_group = VGroup()
        self.add(self.select_group)
        if self.chrome:
            self.header = Text("QWEEPS · NATIVE MANIMGL", font_size=16).set_color("#8bd0df")
            self.header.to_corner(UL, buff=0.3).fix_in_frame()
            self.chapter_label = Text(self.chapter_titles[0], font_size=24).move_to(UP * 3.2).fix_in_frame()
            self.add(self.header, self.chapter_label)
        self.construct()
        self.duration = self.clock
        # Roles are registered at the end of construct; derive their reveal time
        # from the recorded tracks so bounds only appear when the object does.
        for mobs in self.roles.values():
            for role_mob in mobs:
                starts = [
                    start for start, _length, anim in self.tracks
                    if anim.mobject is role_mob
                    or anim.mobject in role_mob.get_family()
                    or role_mob in anim.mobject.get_family()
                ]
                present = [
                    clock for clock, graph in self.scene_baked
                    if self._in_graph(role_mob, graph)
                ]
                reveal = min(starts) if starts else (min(present) if present else 0.0)
                if present:
                    reveal = min(reveal, min(present))
                self.role_reveal[id(role_mob)] = reveal

                # Opacity fades (2D VMobjects). Probing an animation mutates its
                # target, so snapshot the role's buffers and restore afterwards.
                saved = [(part, part.data.copy()) for part in role_mob.get_family()]
                hide = None
                for start, _length, anim in self.tracks:
                    target = anim.mobject
                    if not (target is role_mob or target in role_mob.get_family()
                            or role_mob in target.get_family()):
                        continue
                    try:
                        anim.interpolate(1)
                    except (ValueError, IndexError):
                        # Transform across different point counts; this probe is
                        # only an opacity heuristic and must not break the build.
                        continue
                    opacities = []
                    for part in role_mob.family_members_with_points():
                        try:
                            opacities.append(max(part.get_fill_opacity(), part.get_stroke_opacity()))
                        except AttributeError:
                            opacities.append(float(getattr(part, "opacity", 1)))
                    hide = start if (opacities and max(opacities) <= 0.05) else None
                for part, data in saved:
                    part.data = data
                # Scene-graph removal (3D surfaces ignore opacity).
                absent = None
                seen = False
                for clock, graph in self.scene_baked:
                    here = self._in_graph(role_mob, graph)
                    if here:
                        seen = True
                    elif seen:
                        absent = clock
                        break
                if absent is None:
                    absent = self.duration
                if hide is None:
                    hide = absent
                else:
                    hide = min(hide, absent)
                if hide < self.duration - 1e-6:
                    self.role_hide[id(role_mob)] = hide

    # ------------------------------------------------------------- replay
    def _in_graph(self, mob, graph):
        """True if `mob` or any of its family is present in the recorded scene."""
        family = {id(part) for part in mob.get_family()}
        for top in graph:
            if id(top) in family:
                return True
            if any(id(part) in family for part in top.get_family()):
                return True
        return False

    def _restore_scene(self, t):
        """Restore the exact top-level mobject set recorded at the nearest tick."""
        if not self.scene_baked:
            return
        times = [row[0] for row in self.scene_baked]
        index = min(range(len(times)), key=lambda i: abs(times[i] - t))
        self.mobjects = list(self.scene_baked[index][1])
        self.assemble_render_groups()

    def evaluate(self, t, selected, camera):
        # Restore the recorded state at the latest play boundary <= t, then
        # replay only the play after it. Lifecycle-initial data cannot be used:
        # Transforms change point counts, and forcing an old shape back before
        # interpolating a later transform raises a shape mismatch.
        checkpoint = None
        for row in self.checkpoints:
            if row[0] <= t + 1e-9:
                checkpoint = row
        if checkpoint is None and self.checkpoints:
            checkpoint = self.checkpoints[0]
        replay_from = 0.0
        if checkpoint is not None:
            replay_from = checkpoint[0]
            for mob, parts in checkpoint[2].values():
                for part, data in parts:
                    part.data = data.copy()
            # The CameraFrame is not part of the scene graph, so a camera
            # animation that started before this checkpoint would otherwise
            # never be replayed and the frame would freeze mid-zoom.
            self._restore_frame_state(checkpoint[3])
        for start, length, anim in self.tracks:
            if start < replay_from - 1e-9 or t < start:
                continue
            anim.interpolate(float(np.clip((t - start) / length, 0, 1)))
        self._restore_scene(t)
        # restore baked snapshots (nearest keyframe; lerp when shapes match)
        for mob, frames in self.baked.values():
            if not frames:
                continue
            if t > self.updater_stop.get(id(mob), float("inf")):
                continue  # updater was cleared: later animations own this mobject
            times = [row[0] for row in frames]
            pick = choose_baked_frame(times, t)
            if pick is None:
                continue
            chosen = frames[pick][1]
            for part, data in chosen:
                part.data = data.copy()
        # Surface.become() copies the target's (unset) bounding box; re-flag it
        # so bounds and hit-testing use the current geometry. Role groups may be
        # split out of the scene graph, so refresh them explicitly too.
        for mob in self.mobjects:
            try:
                mob.refresh_bounding_box(recurse_down=True)
            except Exception:
                pass
        for mobs in self.roles.values():
            for mob in mobs:
                try:
                    mob.refresh_bounding_box(recurse_down=True)
                except Exception:
                    pass
        if self.frame_baked:
            times = [row[0] for row in self.frame_baked]
            index = min(range(len(times)), key=lambda i: abs(times[i] - t))
            state = self.frame_baked[index][1]
            self.frame.set_phi(state["phi"])
            self.frame.set_theta(state["theta"])
            self.frame.set_gamma(state["gamma"])
            self.frame.move_to(state["center"])
            self.frame.set_width(state["width"])
        chapter = self.chapter_at(t)
        if self.chrome and getattr(self, "_active_chapter", None) != chapter:
            self.chapter_label.become(Text(self.chapter_titles[chapter], font_size=24).move_to(UP * 3.2).fix_in_frame())
            self._active_chapter = chapter
        if camera:
            self.frame.shift([camera.get("x", 0), camera.get("y", 0), 0])
            self.frame.set_width(self.frame.get_width() / max(.3, min(3, camera.get("zoom", 1))))
        highlights = []
        for key in selected:
            for mob in self.roles.get(key, []):
                if self.scene_baked and not self._in_graph(mob, self.mobjects):
                    continue
                if t + 1e-6 < self.role_reveal.get(id(mob), 0):
                    continue
                hide = self.role_hide.get(id(mob))
                if hide is not None and t >= hide - 1e-6:
                    continue
                highlights.append(SurroundingRectangle(mob, buff=.12).set_stroke("#FFFF00", 2).set_fill(opacity=0))
        if highlights or self.select_group.submobjects:
            self.remove(self.select_group)
            self.select_group = VGroup(*highlights)
            if highlights:
                self.add(self.select_group)

    def chapter_at(self, t):
        index = 0
        for i, start in enumerate(self.chapter_starts):
            if t >= start:
                index = i
        return min(index, len(self.chapter_titles) - 1)

    def autoregister(self, names):
        """Register a deliberate click map from the scene's own variables."""
        if getattr(self, "bound_objects", None):
            # Contract scenes bind roles strictly by contract IDs via self.bind(...)
            for oid, mob in self.bound_objects.items():
                if isinstance(mob, Mobject):
                    self.roles[oid] = [mob]
            return

        def add(key, mob):
            if isinstance(mob, Mobject):
                self.roles.setdefault(key, []).append(mob)

        add("neutrophil", names.get("body"))
        add("nucleus", names.get("nucleus"))
        receptors = names.get("receptors")
        if isinstance(receptors, VGroup):
            for index, part in enumerate(receptors.submobjects, 1):
                add(f"receptor-{index}", part)
        add("bacterium", names.get("bacterium"))
        add("pamp", names.get("spikes"))
        add("self_cell", names.get("self_cell"))
        add("cytokines", names.get("cytokines"))
        add("phagosome", names.get("vesicle"))
        add("signal", names.get("signal"))
        add("match", names.get("match"))
        add("digest", names.get("digest"))
        add("helper-1", names.get("helper_one"))
        add("helper-2", names.get("helper_two"))
        add("hsc", names.get("hsc"))
        add("daughter-a", names.get("daughter_a"))
        add("daughter-b", names.get("daughter_b"))
        for key in ("struts", "marrow", "rbc", "wbc", "plts", "backdrop", "vessel", "flow"):
            add(key, names.get(key))
        # Generated neuron scene
        add("membrane", names.get("membrane_group"))
        add("sodium", names.get("na_group"))
        add("potassium", names.get("k_group"))
        add("na-gates", names.get("gates_open") or names.get("gates_closed"))
        add("hillock", names.get("hillock_s") or names.get("hillock_s2"))
        add("voltage-meter", names.get("meter_fill"))
        add("terminal", names.get("term"))
        add("next-cell", names.get("next_cell"))
        add("pump", names.get("pump"))
        # Generated scenes use arbitrary variable names. Register semantic
        # objects by keyword so bounds and inspection still work. Labels and
        # captions are excluded; nested groups are fine.
        skip = ("label", "text", "tag", "caption", "title", "framing")
        for name, mob in names.items():
            if not isinstance(mob, Mobject):
                continue
            low = str(name).lower()
            if any(token in low for token in skip):
                continue
            key = None
            if "membrane" in low: key = "membrane"
            elif low.startswith("na_") or "sodium" in low: key = "sodium"
            elif low.startswith("k_") or "potassium" in low: key = "potassium"
            elif "thresh" in low: key = "threshold"
            elif "voltage" in low: key = "voltage"
            elif "axon" in low: key = "axon"
            elif "neuron" in low: key = "neuron"
            elif "terminal" in low: key = "terminal"
            elif "vesic" in low: key = "vesicle"
            elif "pump" in low: key = "pump"
            elif "hillock" in low: key = "hillock"
            if key and key not in self.roles:
                add(key, mob)
        # Generated scenes beyond the neuron/immune vocabulary still need
        # clickable objects. Register remaining named scene objects, excluding
        # labels, captions, helper groups and zero-height lines.
        registered = {id(part) for mobs in self.roles.values() for part in mobs}
        excluded = ("label", "text", "tag", "caption", "title", "framing",
                    "stage", "scene", "root", "hud", "frame", "background",
                    "curtain", "axis", "axes", "grid", "takeaway", "note")
        for name, mob in names.items():
            if not isinstance(mob, Mobject) or id(mob) in registered:
                continue
            low = str(name).lower()
            if low.startswith("_") or any(token in low for token in excluded):
                continue
            if low.endswith("_all") or low.endswith("_group"):
                continue
            if type(mob).__name__ in {"Text", "Tex", "MathTex", "DecimalNumber",
                                      "MarkupText", "SVGMobject"}:
                continue
            try:
                if mob.get_width() < .12 or mob.get_height() < .06:
                    continue
            except (AttributeError, ValueError):
                continue
            key = re.sub(r"[^a-z0-9]+", "-", low).strip("-")
            if not key:
                continue
            self.roles.setdefault(key, []).append(mob)
            registered.add(id(mob))

    def metadata(self, t):
        center = self.frame.get_center()
        width = self.frame.get_width()
        height = self.frame.get_height()
        bounds = []
        seen = set()
        for key, mobs in self.roles.items():
            for mob in mobs:
                if id(mob) in seen:
                    continue
                seen.add(id(mob))
                if self.scene_baked and not self._in_graph(mob, self.mobjects):
                    continue
                if mob.get_width() < .003:
                    continue
                if t + 1e-6 < self.role_reveal.get(id(mob), 0):
                    continue
                hide = self.role_hide.get(id(mob))
                if hide is not None and t >= hide - 1e-6:
                    continue
                lo = mob.get_bounding_box()[0]
                hi = mob.get_bounding_box()[2]
                if hi[0] < center[0] - width / 2 or lo[0] > center[0] + width / 2:
                    continue
                if hi[1] < center[1] - height / 2 or lo[1] > center[1] + height / 2:
                    continue
                bounds.append({
                    "id": key,
                    "role": key,
                    "dataRole": key,
                    "x1": float(((lo[0] - center[0]) / width + .5) * 1280),
                    "x2": float(((hi[0] - center[0]) / width + .5) * 1280),
                    "y1": float((.5 - (hi[1] - center[1]) / height) * 720),
                    "y2": float((.5 - (lo[1] - center[1]) / height) * 720),
                })
        return {"backend": "ManimGL/OpenGL", "lessonId": self.lesson_id, "time": t,
                "camera": {"x": float(center[0]), "y": float(center[1]), "width": float(width)},
                "bounds": bounds, "gpu": self.camera.ctx.info.get("GL_RENDERER", "OpenGL")}

    def validate_settings(self, raw):
        if raw not in ({}, None):
            raise ValueError("This lesson has no experiment controls")
        return {}


# ManimCE scene type aliases
MovingCameraScene = RecordedScene
VectorScene = RecordedScene
LinearTransformationScene = RecordedScene
ZoomedScene = RecordedScene
ThreeDScene = RecordedScene
SpecialThreeDScene = RecordedScene
