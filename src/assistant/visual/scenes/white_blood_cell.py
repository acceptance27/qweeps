from manim import *
import numpy as np

# "How a white blood cell decides what is a threat" — one seamless clip.
#
# A neutrophil tests two candidates: a bacterium carrying PAMPs and a self cell
# carrying MHC-I. Only the PAMP match triggers the cascade, the engulfment and
# the cytokine call for help. Written against ManimCE; also renders on ManimGL
# through api/gl_compile.py + manimgl_compat.py.


class GenScene(MovingCameraScene):
    def construct(self):
        self.camera.frame.set(width=14.22)

        title = Text("How a white blood cell decides what is a threat", font_size=28)
        title.to_edge(UP, buff=0.32)
        self.play(FadeIn(title, shift=DOWN * 0.2), run_time=0.8)

        # ------------------------------------------------------- neutrophil
        center = LEFT * 2.2 + DOWN * 0.2
        body = Circle(radius=1.25, color="#BBDDF0", fill_color="#CFE6F5", fill_opacity=0.16)
        body.set_stroke("#AED6F1", 3)
        body.move_to(center)
        nucleus = Circle(radius=0.55, color=PURPLE, fill_color="#7D3C98", fill_opacity=0.75)
        nucleus.set_stroke(PURPLE_A, 2)
        nucleus.move_to(center + LEFT * 0.1 + DOWN * 0.05)

        halo = Circle(radius=1.4, color="#AED6F1", fill_color="#AED6F1", fill_opacity=0.12)
        halo.set_stroke(width=0).move_to(center)
        state = {"r": 1.35}

        def breathe(mob, dt, state=state):
            state["r"] += 0.18 * dt
            if state["r"] > 1.5:
                state["r"] = 1.35
            mob.set_width(2 * state["r"])
            mob.set_opacity(max(0.06, 0.18 * (1 - (state["r"] - 1.35) / 0.15)))

        halo.add_updater(breathe)

        receptors = VGroup()
        for angle in [0.1, 0.9, 1.8, 2.7, 3.7, 5.3]:
            base = center + np.array([np.cos(angle) * 1.25, np.sin(angle) * 1.25, 0])
            tip = base + np.array([np.cos(angle) * 0.22, np.sin(angle) * 0.22, 0])
            stem = Line(base, tip, color="#AED6F1").set_stroke("#AED6F1", 3)
            arm_a = Line(tip, tip + np.array([np.cos(angle - 0.55) * 0.16,
                                              np.sin(angle - 0.55) * 0.16, 0]))
            arm_b = Line(tip, tip + np.array([np.cos(angle + 0.55) * 0.16,
                                              np.sin(angle + 0.55) * 0.16, 0]))
            arm_a.set_stroke("#AED6F1", 3)
            arm_b.set_stroke("#AED6F1", 3)
            receptors.add(VGroup(stem, arm_a, arm_b))

        cell = VGroup(body, nucleus)
        cell_label = Text("neutrophil", font_size=16, color="#AED6F1")
        cell_label.next_to(body, DOWN, buff=0.42)

        self.play(GrowFromCenter(body), FadeIn(nucleus), FadeIn(halo), run_time=0.8)
        self.play(LaggedStart(*[GrowFromCenter(r) for r in receptors], lag_ratio=0.08),
                  FadeIn(cell_label), run_time=1.0)
        self.play(Indicate(receptors[0], color="#AED6F1", scale_factor=1.3), run_time=0.8)

        # ------------------------------------------------------- candidates
        bacterium = VGroup(
            Ellipse(width=0.85, height=0.42, color="#83C167", fill_color="#83C167", fill_opacity=0.9),
        )
        spikes = VGroup()
        for k in range(10):
            a = k / 10 * TAU
            p = np.array([0.42 * np.cos(a), 0.2 * np.sin(a), 0])
            q = np.array([0.52 * np.cos(a), 0.28 * np.sin(a), 0])
            spikes.add(Line(p, q).set_stroke("#FC6255", 3))
        bacterium.add(spikes)
        bacterium.move_to(RIGHT * 5.6 + DOWN * 0.1)
        bacterium_label = Text("bacterium · PAMP spikes", font_size=15, color="#FC6255")
        bacterium_label.next_to(bacterium, UP, buff=0.2)
        bacterium_label.add_updater(lambda mob: mob.next_to(bacterium, UP, buff=0.2))

        self_cell = VGroup(
            Circle(radius=0.42, color="#83C167", fill_color="#83C167", fill_opacity=0.35),
        )
        self_markers = VGroup()
        for k in range(5):
            a = k / 5 * TAU
            p = np.array([0.42 * np.cos(a), 0.42 * np.sin(a), 0])
            q = np.array([0.56 * np.cos(a), 0.56 * np.sin(a), 0])
            self_markers.add(Line(p, q).set_stroke("#83C167", 3))
        self_cell.add(self_markers)
        self_cell.move_to(RIGHT * 5.6 + UP * 2.15)
        self_label = Text("self cell · MHC-I", font_size=15, color="#83C167")
        self_label.next_to(self_cell, UP, buff=0.18)
        self_label.add_updater(lambda mob: mob.next_to(self_cell, UP, buff=0.18))

        self.play(FadeIn(bacterium), FadeIn(bacterium_label), run_time=0.6)
        self.play(FadeIn(self_cell), FadeIn(self_label), run_time=0.6)

        # both approach; the self cell simply passes by
        self.play(
            bacterium.animate.move_to(RIGHT * 1.1 + DOWN * 0.1),
            self_cell.animate.move_to(LEFT * 4.6 + UP * 2.15),
            run_time=3.4,
            rate_func=linear,
        )
        self_label.clear_updaters()
        self.play(FadeOut(self_label, shift=LEFT * 0.3), FadeOut(self_cell), run_time=0.8)

        # ---------------------------------------------------- recognition
        contact = np.array([-0.55, 0.05, 0])
        self.play(bacterium.animate.move_to(contact + RIGHT * 0.62),
                  run_time=1.2, rate_func=linear)

        receptor = receptors[0]
        self.play(receptor.animate.shift(RIGHT * 0.12 + UP * 0.02), run_time=0.4)
        match = Text("PAMP match", font_size=17, color=YELLOW)
        match.move_to(contact + RIGHT * 0.35 + UP * 1.0)
        self.play(FadeIn(match, scale=0.7), run_time=0.5)
        self.play(Flash(contact, color=YELLOW, flash_radius=0.35, num_lines=10), run_time=0.6)

        # ------------------------------------------------- signal cascade
        signal_path = Line(contact, center, color=YELLOW).set_stroke(YELLOW, 2)
        signal_path.set_opacity(0.35)
        self.play(Create(signal_path), run_time=0.6)

        pulses = VGroup(*[Dot(contact, radius=0.07, color=YELLOW) for _ in range(3)])
        self.add(pulses)
        self.play(
            LaggedStart(*[
                MoveAlongPath(p, signal_path.copy()) for p in pulses
            ], lag_ratio=0.35),
            run_time=1.6,
            rate_func=linear,
        )
        self.play(nucleus.animate.set_fill("#B9A0F7", 0.95), run_time=0.4)
        self.play(Indicate(nucleus, color=PURPLE_A, scale_factor=1.2), run_time=0.7)
        self.play(FadeOut(signal_path), FadeOut(pulses), run_time=0.4)

        # ---------------------------------------------------- engulfment
        pseudopod_a = Arc(radius=0.88, start_angle=-1.35, angle=1.35, color="#AED6F1")
        pseudopod_b = Arc(radius=0.88, start_angle=1.35, angle=1.35, color="#AED6F1")
        pseudopod_a.set_stroke("#AED6F1", 4).move_to(contact + RIGHT * 0.3)
        pseudopod_b.set_stroke("#AED6F1", 4).move_to(contact + RIGHT * 0.3)
        self.play(Create(pseudopod_a), Create(pseudopod_b), run_time=0.6)
        bacterium_label.clear_updaters()
        self.play(
            bacterium.animate.move_to(center + RIGHT * 0.05).scale(0.85),
            bacterium_label.animate.set_opacity(0),
            match.animate.set_opacity(0),
            run_time=1.4,
        )
        self.play(FadeOut(pseudopod_a), FadeOut(pseudopod_b), run_time=0.4)

        vesicle = Circle(radius=0.62, color="#AED6F1", fill_color="#AED6F1", fill_opacity=0.08)
        vesicle.set_stroke("#AED6F1", 2).move_to(center + RIGHT * 0.05)
        digest = Text("digested", font_size=16, color="#83C167")
        digest.next_to(vesicle, DOWN, buff=0.16)
        self.play(GrowFromCenter(vesicle), run_time=0.5)
        self.play(Flash(center + RIGHT * 0.05, color=YELLOW, flash_radius=0.5, num_lines=12),
                  run_time=0.6)
        self.play(FadeOut(bacterium), FadeIn(digest), run_time=0.6)
        self.play(FadeOut(vesicle), FadeOut(digest), run_time=0.4)

        # ---------------------------------------------------- amplification
        cytokines = VGroup(*[
            Dot(center + np.array([np.cos(a) * 1.2, np.sin(a) * 1.2, 0]),
                radius=0.08, color=GOLD)
            for a in [0.2, 1.1, 2.2, 3.6, 4.7]
        ])
        recruit = Text("cytokines recruit more cells", font_size=17, color="#FFD166")
        recruit.move_to(RIGHT * 3.4 + UP * 2.5)
        helper_one = Circle(radius=0.5, color="#AED6F1", fill_color="#CFE6F5", fill_opacity=0.18)
        helper_one.set_stroke("#AED6F1", 2).move_to(RIGHT * 5.4 + DOWN * 1.9)
        helper_two = Circle(radius=0.42, color="#AED6F1", fill_color="#CFE6F5", fill_opacity=0.18)
        helper_two.set_stroke("#AED6F1", 2).move_to(RIGHT * 5.0 + UP * 1.6)

        self.play(LaggedStart(*[FadeIn(c, scale=0.4) for c in cytokines], lag_ratio=0.1),
                  run_time=0.7)
        self.play(
            *[c.animate.shift((c.get_center() - center) * 1.35) for c in cytokines],
            FadeIn(recruit),
            FadeIn(helper_one), FadeIn(helper_two),
            run_time=1.6,
            rate_func=linear,
        )
        self.play(
            helper_one.animate.move_to(RIGHT * 3.2 + DOWN * 1.9),
            helper_two.animate.move_to(RIGHT * 3.0 + UP * 1.7),
            *[FadeOut(c) for c in cytokines],
            run_time=1.4,
            rate_func=linear,
        )

        # -------------------------------------------------------- closing
        rule = Text("PAMP match  →  attack        self marker  →  ignore",
                    font_size=19, color=GREY_A)
        rule.move_to(DOWN * 3.35)
        self.play(FadeIn(rule, shift=UP * 0.1), run_time=0.7)
        self.play(Indicate(cell, color="#AED6F1", scale_factor=1.05), run_time=1.0)
        self.wait(2.0)
