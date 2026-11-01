"""Native ManimGL scene for the full WBC lesson.

`RecordedScene` turns a play-based `construct()` into a seekable track list:
each `play(...)` is recorded with its start time and run time, and `evaluate(t)`
replays the tracks at any playhead. That means the authored animation keeps its
motion, while the native worker can seek and publish hit boxes.
"""
from __future__ import annotations

import numpy as np
from manimlib import *
from manimlib.animation.animation import prepare_animation

INK = "#E7EBF0"
MUTED = "#8090A0"
BLUE = "#8bd0df"
GOLD = "#edca82"
GREEN = "#9dceb1"
CORAL = "#eda994"
PURPLE = "#c4b0e2"


def words(text, size=22, color=INK):
    m = Text(str(text), font="Sans", font_size=size)
    m.set_color(color)
    if m.get_width() > 12:
        m.set_width(12)
    return m


class RecordedScene(Scene):
    """A Scene whose play()/wait() calls become a seekable track list."""

    lesson_id = "wbc"
    chapter_starts = (0.0, 4.4, 10.4, 12.5, 24.4)

    def __init__(self):
        super().__init__(
            camera_config={"resolution": (1280, 720), "fps": 30,
                           "background_color": "#071117", "max_allowable_norm": 1000},
            file_writer_config={"write_to_movie": False},
        )
        self.clock = 0.0
        self.tracks = []
        self.roles = {}
        self.previous_time = -1
        self.last_alphas = {}
        self.settings = None

    # recording -------------------------------------------------------
    def play(self, *animations, run_time=1.0, **kwargs):
        for value in animations:
            anim = prepare_animation(value)
            anim.set_run_time(run_time)
            anim.begin()
            anim.interpolate(1)
            anim.finish()
            self.add(anim.mobject)
            self.tracks.append((self.clock, run_time, anim, self.last_alpha_override(value)))
        self.clock += run_time

    def last_alpha_override(self, value):
        return None

    def wait(self, run_time=1.0):
        self.clock += run_time

    # build ------------------------------------------------------------
    def build(self, settings=None):
        self.settings = settings if settings is not None else {}
        self.clear()
        self.tracks = []
        self.roles = {}
        self.last_alphas = {}
        self.previous_time = -1
        self.clock = 0.0
        self.frame.move_to(ORIGIN).set_width(14.22)
        self.header = words("QWEEPS · NATIVE MANIMGL", 16, BLUE).to_corner(UL, buff=0.3).fix_in_frame()
        self.chapter_label = words("Contact is not yet a decision", 24).move_to(UP * 3.2).fix_in_frame()
        self.select_group = VGroup()
        self.add(self.header, self.chapter_label, self.select_group)
        self.construct()
        self.duration = self.clock

    def register(self, key, mob):
        self.roles.setdefault(key, []).append((mob, 0))

    # replay -----------------------------------------------------------
    def evaluate(self, t, selected, camera):
        if t < self.previous_time:
            self.last_alphas.clear()
        seen = set()
        for start, length, anim, _ in sorted(self.tracks, key=lambda row: row[0]):
            root = id(anim.mobject)
            alpha = float(np.clip((t - start) / length, 0, 1)) if t >= start else (0 if root not in seen else None)
            if alpha is not None and (anim.mobject is self.frame or self.last_alphas.get(id(anim)) != alpha):
                anim.interpolate(alpha)
                self.last_alphas[id(anim)] = alpha
            seen.add(root)
        chapter = self.chapter_at(t)
        title = self.chapter_titles[chapter]
        if getattr(self, "_active_chapter", None) != chapter:
            self.chapter_label.become(words(title, 24).move_to(UP * 3.2).fix_in_frame())
            self._active_chapter = chapter
        if camera:
            self.frame.shift([camera.get("x", 0), camera.get("y", 0), 0])
            self.frame.set_width(self.frame.get_width() / max(.3, min(3, camera.get("zoom", 1))))
        highlights = []
        for key in selected:
            for mob, _phase in self.roles.get(key, []):
                highlights.append(SurroundingRectangle(mob, buff=.12).set_stroke("#FFFF00", 2).set_fill(opacity=0))
        if highlights or self.select_group.submobjects:
            self.remove(self.select_group)
            self.select_group = VGroup(*highlights)
            if highlights:
                self.add(self.select_group)
        self.previous_time = t

    def chapter_at(self, t):
        starts = self.chapter_starts
        index = 0
        for i, start in enumerate(starts):
            if t >= start:
                index = i
        return min(index, len(self.chapter_titles) - 1)

    def metadata(self, t):
        center = self.frame.get_center()
        width = self.frame.get_width()
        height = self.frame.get_height()
        bounds = []
        for key, items in self.roles.items():
            for mob, _phase in items:
                if mob.get_width() < .003:
                    continue
                lo = mob.get_bounding_box()[0]
                hi = mob.get_bounding_box()[2]
                if hi[0] < center[0] - width / 2 or lo[0] > center[0] + width / 2:
                    continue
                if hi[1] < center[1] - height / 2 or lo[1] > center[1] + height / 2:
                    continue
                bounds.append({
                    "id": key,
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


class WbcFullScene(RecordedScene):
    chapter_titles = ("Contact is not yet a decision", "Two candidates at once",
                      "Inside a PAMP spike", "From match to response", "The decision rule")

    def construct(self):
        # ------------------------------------------------ chapter 1: contact
        self.wait(0.8)
        center = LEFT * 2.2 + DOWN * 0.2
        body = Circle(radius=1.25).set_stroke(BLUE, 3).set_fill("#10222c", 0.55).move_to(center)
        nucleus = Circle(radius=0.55).set_stroke(PURPLE, 2).set_fill("#7D3C98", 0.85).move_to(center + LEFT * .1 + DOWN * .05)
        receptors = VGroup()
        for angle in [0.1, 0.9, 1.8, 2.7, 3.7, 5.3]:
            base = center + np.array([np.cos(angle) * 1.25, np.sin(angle) * 1.25, 0])
            tip = base + np.array([np.cos(angle) * 0.22, np.sin(angle) * 0.22, 0])
            receptors.add(Line(base, tip).set_stroke(BLUE, 3))
            receptors.add(Line(tip, tip + np.array([np.cos(angle - .55) * .16, np.sin(angle - .55) * .16, 0])).set_stroke(BLUE, 3))
            receptors.add(Line(tip, tip + np.array([np.cos(angle + .55) * .16, np.sin(angle + .55) * .16, 0])).set_stroke(BLUE, 3))
        cell_label = words("neutrophil", 17, BLUE).next_to(body, DOWN, buff=0.35)

        self.add(body, nucleus, receptors, cell_label)
        self.register("neutrophil", VGroup(body, nucleus))
        self.register("receptors", receptors)

        self.play(ShowCreation(body), FadeIn(nucleus), run_time=0.8)
        self.play(*[ShowCreation(r) for r in receptors], FadeIn(cell_label), run_time=1.0)
        self.play(Indicate(receptors, color=BLUE), run_time=0.8)
        self.wait(0.4)

        # --------------------------------------------- chapter 2: candidates
        bacterium = VGroup(Ellipse(width=0.85, height=0.42).set_stroke(GREEN, 2).set_fill(GREEN, 0.9))
        spikes = VGroup()
        for k in range(10):
            a = k / 10 * TAU
            p = np.array([0.42 * np.cos(a), 0.2 * np.sin(a), 0])
            q = np.array([0.52 * np.cos(a), 0.28 * np.sin(a), 0])
            spikes.add(Line(p, q).set_stroke(CORAL, 3))
        bacterium.add(spikes)
        bacterium.move_to(RIGHT * 5.6 + DOWN * 0.1)
        bacterium_label = words("bacterium · PAMPs", 16, CORAL).next_to(bacterium, UP, buff=0.2)

        self_cell = VGroup(Circle(radius=0.42).set_stroke(GREEN, 3).set_fill(GREEN, 0.28))
        markers = VGroup()
        for k in range(6):
            a = k / 6 * TAU
            p = np.array([0.42 * np.cos(a), 0.42 * np.sin(a), 0])
            q = np.array([0.56 * np.cos(a), 0.56 * np.sin(a), 0])
            markers.add(Line(p, q).set_stroke(GREEN, 3))
        self_cell.add(markers)
        self_cell.move_to(RIGHT * 5.6 + UP * 2.15)
        self_label = words("self cell · MHC-I", 16, GREEN).next_to(self_cell, UP, buff=0.18)

        bacterium_group = VGroup(bacterium, bacterium_label)
        self_cell_group = VGroup(self_cell, self_label)
        self.add(bacterium_group, self_cell_group)
        self.register("bacterium", bacterium)
        self.register("pamp", spikes)
        self.register("self_cell", self_cell)

        self.play(FadeIn(bacterium), FadeIn(bacterium_label), run_time=0.6)
        self.play(FadeIn(self_cell), FadeIn(self_label), run_time=0.6)
        self.play(bacterium_group.animate.move_to(RIGHT * 1.1 + DOWN * 0.1),
                  self_cell_group.animate.move_to(LEFT * 4.6 + UP * 2.15),
                  run_time=3.4, rate_func=linear)
        self.play(FadeOut(self_cell_group), run_time=0.8)

        contact = np.array([-0.55, 0.05, 0])
        self.play(bacterium_group.animate.move_to(contact + RIGHT * 0.62), run_time=1.2, rate_func=linear)

        # ------------------------------------------------ chapter 3: PAMP
        receptor = receptors[0]
        self.play(receptor.animate.shift(RIGHT * 0.12 + UP * 0.02), run_time=0.4)
        match = words("PAMP match", 17, GOLD).move_to(contact + RIGHT * 0.35 + UP * 1.0)
        self.add(match)
        self.play(FadeIn(match), run_time=0.5)
        self.register("receptor", receptor)
        self.play(Flash(contact, color=GOLD, flash_radius=0.35, num_lines=10), run_time=0.6)
        self.wait(0.6)

        # ------------------------------------------- chapter 4: response
        signal = Line(contact, center).set_stroke(GOLD, 2).set_opacity(0.35)
        self.add(signal)
        self.play(ShowCreation(signal), run_time=0.6)
        pulses = VGroup(*[Dot(contact, radius=0.07).set_color(GOLD) for _ in range(3)])
        self.add(pulses)
        self.play(*[MoveAlongPath(p, signal.copy()) for p in pulses], run_time=1.6, rate_func=linear)
        self.play(nucleus.animate.set_fill("#B9A0F7", 0.95), run_time=0.4)
        self.play(Indicate(nucleus, color=PURPLE), run_time=0.7)
        self.play(FadeOut(signal), FadeOut(pulses), run_time=0.4)

        pseudo_a = Arc(radius=0.88, start_angle=-1.35, angle=1.35).set_stroke(BLUE, 4).move_to(contact + RIGHT * 0.3)
        pseudo_b = Arc(radius=0.88, start_angle=1.35, angle=1.35).set_stroke(BLUE, 4).move_to(contact + RIGHT * 0.3)
        self.add(pseudo_a, pseudo_b)
        self.play(ShowCreation(pseudo_a), ShowCreation(pseudo_b), run_time=0.6)
        self.play(bacterium_group.animate.move_to(center + RIGHT * 0.05).scale(0.85),
                  bacterium_label.animate.set_opacity(0), match.animate.set_opacity(0), run_time=1.4)
        self.play(FadeOut(pseudo_a), FadeOut(pseudo_b), run_time=0.4)

        vesicle = Circle(radius=0.62).set_stroke(BLUE, 2).set_fill(BLUE, 0.08).move_to(center + RIGHT * 0.05)
        digest = words("digested", 16, GREEN).next_to(vesicle, DOWN, buff=0.16)
        self.add(vesicle, digest)
        self.play(GrowFromCenter(vesicle), run_time=0.5)
        self.play(Flash(center + RIGHT * 0.05, color=GOLD, flash_radius=0.5, num_lines=12), run_time=0.6)
        self.play(FadeOut(bacterium), FadeIn(digest), run_time=0.6)
        self.play(FadeOut(vesicle), FadeOut(digest), run_time=0.4)

        cytokines = VGroup(*[Dot(center + np.array([np.cos(a) * 1.2, np.sin(a) * 1.2, 0]), radius=0.08).set_color(GOLD)
                             for a in [0.2, 1.1, 2.2, 3.6, 4.7]])
        recruit = words("cytokines recruit more cells", 17, GOLD).move_to(RIGHT * 3.4 + UP * 2.5)
        helper_one = Circle(radius=0.5).set_stroke(BLUE, 2).set_fill(BLUE, 0.12).move_to(RIGHT * 5.4 + DOWN * 1.9)
        helper_two = Circle(radius=0.42).set_stroke(BLUE, 2).set_fill(BLUE, 0.12).move_to(RIGHT * 5.0 + UP * 1.6)
        self.add(cytokines, recruit, helper_one, helper_two)
        self.play(*[FadeIn(c) for c in cytokines], run_time=0.7)
        self.play(*[c.animate.shift((c.get_center() - center) * 1.35) for c in cytokines],
                  FadeIn(recruit), FadeIn(helper_one), FadeIn(helper_two), run_time=1.6, rate_func=linear)
        self.play(helper_one.animate.move_to(RIGHT * 3.2 + DOWN * 1.9),
                  helper_two.animate.move_to(RIGHT * 3.0 + UP * 1.7),
                  *[FadeOut(c) for c in cytokines], run_time=1.4, rate_func=linear)

        # ------------------------------------------------ chapter 5: rule
        rule = words("PAMP match → attack        self marker → ignore", 19, MUTED).move_to(DOWN * 3.35)
        self.add(rule)
        self.play(FadeIn(rule), run_time=0.7)
        self.play(Indicate(body, color=BLUE), run_time=1.0)
        self.wait(2.0)
