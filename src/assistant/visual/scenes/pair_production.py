from manim import *
import numpy as np

# Detailed pair-production scene: a massless photon converts into an
# electron/positron pair at a nucleus, with continuous motion, trails and a
# camera move. Written against ManimCE; the same file also runs on ManimGL
# through api/gl_compile.py + manimgl_compat.py.


class GenScene(MovingCameraScene):
    def construct(self):
        self.camera.frame.set(width=14.22)

        title = Text("How massless energy becomes mass", font_size=30).to_edge(UP, buff=0.32)
        subtitle = Text("pair production: a photon near a heavy nucleus", font_size=17,
                        color=GREY_A).next_to(title, DOWN, buff=0.1)
        self.play(FadeIn(title, shift=DOWN * 0.2), run_time=0.8)
        self.play(FadeIn(subtitle), run_time=0.5)

        # ---------------------------------------------------------- nucleus
        nucleus = Circle(radius=0.85, color=ORANGE, fill_color=ORANGE, fill_opacity=0.12)
        nucleus.set_stroke(ORANGE, 3)
        core = Dot(nucleus.get_center(), radius=0.17, color=ORANGE)
        nucleus_group = VGroup(nucleus, core).move_to(RIGHT * 3.4 + DOWN * 0.05)
        nuc_label = Text("nucleus", font_size=17, color=ORANGE)
        nuc_label.next_to(nucleus_group, DOWN, buff=0.22)

        rings = VGroup(*[
            Circle(radius=0.95 + 0.001 * i, color=ORANGE).set_stroke(ORANGE, 2, opacity=0.4)
            for i in range(3)
        ])
        for index, ring in enumerate(rings):
            ring.move_to(nucleus_group)
            state = {"r": 0.95 + 0.25 * index}

            def ripple(mob, dt, state=state):
                state["r"] += 0.55 * dt
                if state["r"] > 2.4:
                    state["r"] = 0.95
                mob.set_width(2 * state["r"])
                mob.set_stroke(opacity=max(0.0, 0.45 * (1 - (state["r"] - 0.95) / 1.45)))

            ring.add_updater(ripple)

        self.play(GrowFromCenter(nucleus_group), FadeIn(nuc_label), run_time=0.8)
        self.play(LaggedStart(*[GrowFromCenter(ring) for ring in rings], lag_ratio=0.15),
                  run_time=1.0)

        # ---------------------------------------------------------- photon
        samples = np.linspace(-1.2, 1.2, 100)
        wave = VMobject()
        wave.set_points_smoothly([np.array([x, 0.16 * np.sin(7 * x), 0]) for x in samples])
        wave.set_stroke(YELLOW, 4)
        head = Triangle(color=YELLOW, fill_color=YELLOW, fill_opacity=1)
        head.scale(0.13).rotate(-90 * DEGREES).move_to(wave.get_end())

        photon = VGroup(wave, head).move_to(LEFT * 5.6 + UP * 0.05)
        glow = Dot(photon.get_center(), radius=0.34, color=YELLOW, fill_opacity=0.22)
        glow.set_stroke(width=0)
        photon_label = Text("photon   m = 0", font_size=18, color=YELLOW)
        photon_label.next_to(photon, UP, buff=0.3)

        glow.add_updater(lambda mob: mob.move_to(photon.get_center()))
        photon_label.add_updater(lambda mob: mob.next_to(photon, UP, buff=0.3))

        self.play(FadeIn(photon), FadeIn(glow), FadeIn(photon_label), run_time=0.7)

        energy = Text("E = hf", font_size=22, color=YELLOW).next_to(photon_label, UP, buff=0.16)
        energy.add_updater(lambda mob: mob.next_to(photon_label, UP, buff=0.16))
        self.play(FadeIn(energy), run_time=0.4)

        # constant-speed travel: the wave is a moving object, not a pop-in
        self.play(photon.animate.shift(RIGHT * 6.75), run_time=3.4, rate_func=linear)

        # ---------------------------------------------------------- impact
        impact = np.array([2.45, 0.05, 0])
        glow.clear_updaters()
        photon_label.clear_updaters()
        energy.clear_updaters()

        self.play(Flash(impact, color=YELLOW, flash_radius=0.7, line_length=0.38,
                        num_lines=16), run_time=0.7)
        self.play(FadeOut(photon, scale=0.3), FadeOut(glow, scale=0.3),
                  FadeOut(photon_label), FadeOut(energy), run_time=0.3)

        # --------------------------------------------------- the pair forms
        self.play(self.camera.frame.animate.set(width=9.4).move_to(impact + RIGHT * 1.0),
                  run_time=1.2)

        def track(sign):
            t = np.linspace(0, 1, 140)
            xs = impact[0] + 3.0 * t
            ys = impact[1] + sign * 1.85 * np.sin(np.pi * t)
            path = VMobject()
            path.set_points_smoothly([np.array([x, y, 0]) for x, y in zip(xs, ys)])
            return path

        electron = Dot(impact, radius=0.15, color=BLUE)
        positron = Dot(impact, radius=0.15, color=RED)
        electron_glow = Dot(impact, radius=0.34, color=BLUE, fill_opacity=0.2).set_stroke(width=0)
        positron_glow = Dot(impact, radius=0.34, color=RED, fill_opacity=0.2).set_stroke(width=0)

        electron_glow.add_updater(lambda mob: mob.move_to(electron.get_center()))
        positron_glow.add_updater(lambda mob: mob.move_to(positron.get_center()))

        e_trail = TracedPath(electron.get_center, stroke_color=BLUE_B, stroke_width=5)
        p_trail = TracedPath(positron.get_center, stroke_color=RED_B, stroke_width=5)

        e_label = Text("e⁻", font_size=26, color=BLUE).move_to(impact + UP * 0.45)
        p_label = Text("e⁺", font_size=26, color=RED).move_to(impact + DOWN * 0.45)
        e_label.add_updater(lambda mob: mob.next_to(electron, UP, buff=0.22))
        p_label.add_updater(lambda mob: mob.next_to(positron, DOWN, buff=0.22))

        self.add(e_trail, p_trail, electron_glow, positron_glow, electron, positron,
                 e_label, p_label)
        self.play(FadeIn(electron, scale=0.4), FadeIn(positron, scale=0.4), run_time=0.5)

        self.play(
            MoveAlongPath(electron, track(+1)),
            MoveAlongPath(positron, track(-1)),
            run_time=6.0,
            rate_func=linear,
        )
        self.wait(0.6)

        # ------------------------------------------------------- the ledger
        self.play(self.camera.frame.animate.set(width=14.22).move_to(ORIGIN), run_time=1.3)

        equation = Text("E = mc²", font_size=58, color=YELLOW).move_to(DOWN * 2.6)
        ledger = Text("photon energy in  →  two particles, 0.511 MeV/c² each", font_size=18,
                      color=GREY_A).next_to(equation, DOWN, buff=0.2)
        self.play(Write(equation), run_time=1.0)
        self.play(FadeIn(ledger, shift=UP * 0.1), run_time=0.6)
        self.play(Indicate(electron, color=BLUE, scale_factor=1.3),
                  Indicate(positron, color=RED, scale_factor=1.3), run_time=1.2)
        self.wait(2.2)
