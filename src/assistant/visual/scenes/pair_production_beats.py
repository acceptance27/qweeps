from manim import *
import numpy as np

# Per-beat clips for "How massless energy becomes mass".
# Each class is independently renderable and carries its own start/end fade, so
# the lesson player can seek, replay or re-render a single beat.
#
#   PairPhoton   -> beat 1, light approaches the nucleus
#   PairCreation -> beat 2, the pair appears
#   PairLedger   -> beat 3, the energy/mass ledger


def build_nucleus(center=RIGHT * 3.4 + DOWN * 0.05):
    nucleus = Circle(radius=0.85, color=ORANGE, fill_color=ORANGE, fill_opacity=0.12)
    nucleus.set_stroke(ORANGE, 3)
    core = Dot(nucleus.get_center(), radius=0.17, color=ORANGE)
    group = VGroup(nucleus, core).move_to(center)
    label = Text("nucleus", font_size=17, color=ORANGE)
    label.next_to(group, DOWN, buff=0.22)
    rings = VGroup(*[
        Circle(radius=0.95, color=ORANGE).set_stroke(ORANGE, 2, opacity=0.4)
        for _ in range(3)
    ])
    for index, ring in enumerate(rings):
        ring.move_to(group)
        state = {"r": 0.95 + 0.25 * index}

        def ripple(mob, dt, state=state):
            state["r"] += 0.55 * dt
            if state["r"] > 2.4:
                state["r"] = 0.95
            mob.set_width(2 * state["r"])
            mob.set_stroke(opacity=max(0.0, 0.45 * (1 - (state["r"] - 0.95) / 1.45)))

        ring.add_updater(ripple)
    return group, label, rings


def build_photon():
    samples = np.linspace(-1.2, 1.2, 100)
    wave = VMobject()
    wave.set_points_smoothly([np.array([x, 0.16 * np.sin(7 * x), 0]) for x in samples])
    wave.set_stroke(YELLOW, 4)
    head = Triangle(color=YELLOW, fill_color=YELLOW, fill_opacity=1)
    head.scale(0.13).rotate(-90 * DEGREES).move_to(wave.get_end())
    return VGroup(wave, head).move_to(LEFT * 5.6 + UP * 0.05)


def build_track(impact, sign, length=3.0, height=1.85):
    t = np.linspace(0, 1, 140)
    xs = impact[0] + length * t
    ys = impact[1] + sign * height * np.sin(np.pi * t)
    path = VMobject()
    path.set_points_smoothly([np.array([x, y, 0]) for x, y in zip(xs, ys)])
    return path


class PairPhoton(MovingCameraScene):
    """Beat 1: the photon travels and is absorbed."""

    def construct(self):
        self.camera.frame.set(width=14.22)
        title = Text("How massless energy becomes mass", font_size=30).to_edge(UP, buff=0.32)
        subtitle = Text("pair production: a photon near a heavy nucleus", font_size=17,
                        color=GREY_A).next_to(title, DOWN, buff=0.1)
        self.play(FadeIn(title, shift=DOWN * 0.2), run_time=0.6)
        self.play(FadeIn(subtitle), run_time=0.4)

        nucleus, nuc_label, rings = build_nucleus()
        self.play(GrowFromCenter(nucleus), FadeIn(nuc_label), run_time=0.7)
        self.play(LaggedStart(*[GrowFromCenter(ring) for ring in rings], lag_ratio=0.15),
                  run_time=0.8)

        photon = build_photon()
        glow = Dot(photon.get_center(), radius=0.34, color=YELLOW, fill_opacity=0.22)
        glow.set_stroke(width=0)
        photon_label = Text("photon   m = 0", font_size=18, color=YELLOW)
        photon_label.next_to(photon, UP, buff=0.3)
        energy = Text("E = hf", font_size=22, color=YELLOW).next_to(photon_label, UP, buff=0.16)

        glow.add_updater(lambda mob: mob.move_to(photon.get_center()))
        photon_label.add_updater(lambda mob: mob.next_to(photon, UP, buff=0.3))
        energy.add_updater(lambda mob: mob.next_to(photon_label, UP, buff=0.16))

        self.play(FadeIn(photon), FadeIn(glow), FadeIn(photon_label), run_time=0.6)
        self.play(FadeIn(energy), run_time=0.4)
        self.play(photon.animate.shift(RIGHT * 6.75), run_time=3.2, rate_func=linear)

        impact = np.array([2.45, 0.05, 0])
        glow.clear_updaters()
        photon_label.clear_updaters()
        energy.clear_updaters()
        self.play(Flash(impact, color=YELLOW, flash_radius=0.7, line_length=0.38,
                        num_lines=16), run_time=0.5)
        self.play(FadeOut(photon, scale=0.3), FadeOut(glow, scale=0.3),
                  FadeOut(photon_label), FadeOut(energy), run_time=0.3)
        self.play(FadeOut(VGroup(title, subtitle, nucleus, nuc_label, rings)), run_time=0.6)
        self.wait(0.6)


class PairCreation(MovingCameraScene):
    """Beat 2: impact and the emerging pair."""

    def construct(self):
        self.camera.frame.set(width=14.22)
        caption = Text("at the nucleus, energy becomes a particle pair", font_size=20,
                       color=GREY_A).to_edge(UP, buff=0.35)
        self.play(FadeIn(caption), run_time=0.5)

        nucleus, nuc_label, rings = build_nucleus()
        self.play(GrowFromCenter(nucleus), FadeIn(nuc_label), run_time=0.6)
        self.play(LaggedStart(*[GrowFromCenter(ring) for ring in rings], lag_ratio=0.15),
                  run_time=0.7)

        impact = np.array([2.45, 0.05, 0])
        self.play(Flash(impact, color=YELLOW, flash_radius=0.7, line_length=0.38,
                        num_lines=16), run_time=0.5)
        self.play(self.camera.frame.animate.set(width=9.4).move_to(impact + RIGHT * 1.0),
                  run_time=1.0)

        electron = Dot(impact, radius=0.15, color=BLUE)
        positron = Dot(impact, radius=0.15, color=RED)
        electron_glow = Dot(impact, radius=0.34, color=BLUE, fill_opacity=0.2).set_stroke(width=0)
        positron_glow = Dot(impact, radius=0.34, color=RED, fill_opacity=0.2).set_stroke(width=0)
        electron_glow.add_updater(lambda mob: mob.move_to(electron.get_center()))
        positron_glow.add_updater(lambda mob: mob.move_to(positron.get_center()))
        e_trail = TracedPath(electron.get_center, stroke_color=BLUE_B, stroke_width=5)
        p_trail = TracedPath(positron.get_center, stroke_color=RED_B, stroke_width=5)

        e_label = Text("e⁻", font_size=26, color=BLUE)
        p_label = Text("e⁺", font_size=26, color=RED)
        e_label.add_updater(lambda mob: mob.next_to(electron, UP, buff=0.22))
        p_label.add_updater(lambda mob: mob.next_to(positron, DOWN, buff=0.22))

        self.add(e_trail, p_trail, electron_glow, positron_glow, electron, positron,
                 e_label, p_label)
        self.play(FadeIn(electron, scale=0.4), FadeIn(positron, scale=0.4), run_time=0.4)
        self.play(MoveAlongPath(electron, build_track(impact, +1)),
                  MoveAlongPath(positron, build_track(impact, -1)),
                  run_time=3.4, rate_func=linear)
        # Trail geometry grows every frame; freeze it before the fade so the
        # transform targets keep the same point count.
        e_trail.clear_updaters()
        p_trail.clear_updaters()
        electron_glow.clear_updaters()
        positron_glow.clear_updaters()
        e_label.clear_updaters()
        p_label.clear_updaters()
        self.play(FadeOut(VGroup(caption, nucleus, nuc_label, rings, electron, positron,
                                 electron_glow, positron_glow, e_trail, p_trail,
                                 e_label, p_label)), run_time=0.5)
        self.wait(0.4)


class PairLedger(MovingCameraScene):
    """Beat 3: the ledger, with the pair still moving."""

    def construct(self):
        self.camera.frame.set(width=9.4).move_to(RIGHT * 3.45)
        caption = Text("the pair carries the photon's energy as mass", font_size=20,
                       color=GREY_A).to_edge(UP, buff=0.35)
        self.play(FadeIn(caption), run_time=0.5)

        nucleus, nuc_label, rings = build_nucleus()
        self.play(FadeIn(nucleus, scale=0.9), FadeIn(nuc_label), run_time=0.5)

        impact = np.array([2.45, 0.05, 0])
        electron = Dot(impact, radius=0.15, color=BLUE)
        positron = Dot(impact, radius=0.15, color=RED)
        electron_glow = Dot(impact, radius=0.34, color=BLUE, fill_opacity=0.2).set_stroke(width=0)
        positron_glow = Dot(impact, radius=0.34, color=RED, fill_opacity=0.2).set_stroke(width=0)
        electron_glow.add_updater(lambda mob: mob.move_to(electron.get_center()))
        positron_glow.add_updater(lambda mob: mob.move_to(positron.get_center()))
        e_trail = TracedPath(electron.get_center, stroke_color=BLUE_B, stroke_width=5)
        p_trail = TracedPath(positron.get_center, stroke_color=RED_B, stroke_width=5)
        e_label = Text("e⁻", font_size=26, color=BLUE)
        p_label = Text("e⁺", font_size=26, color=RED)
        e_label.add_updater(lambda mob: mob.next_to(electron, UP, buff=0.22))
        p_label.add_updater(lambda mob: mob.next_to(positron, DOWN, buff=0.22))

        self.add(e_trail, p_trail, electron_glow, positron_glow, electron, positron,
                 e_label, p_label)
        self.play(MoveAlongPath(electron, build_track(impact, +1)),
                  MoveAlongPath(positron, build_track(impact, -1)),
                  run_time=2.6, rate_func=linear)
        self.play(self.camera.frame.animate.set(width=14.22).move_to(ORIGIN), run_time=1.0)

        equation = Text("E = mc²", font_size=58, color=YELLOW).move_to(DOWN * 2.6)
        ledger = Text("photon energy in  →  two particles, 0.511 MeV/c² each",
                      font_size=18, color=GREY_A).next_to(equation, DOWN, buff=0.2)
        self.play(Write(equation), run_time=0.8)
        self.play(FadeIn(ledger, shift=UP * 0.1), run_time=0.5)
        self.play(Indicate(electron, color=BLUE, scale_factor=1.3),
                  Indicate(positron, color=RED, scale_factor=1.3), run_time=1.0)
        self.wait(1.2)
