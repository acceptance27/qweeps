from manim import *
import numpy as np

class GenScene(Scene):
    def construct(self):
        title = Text("How a Neuron Fires", font_size=34, color=WHITE).move_to([0, 3.25, 0])
        subtitle = Text("Inside negative, outside positive — until a signal flips it", font_size=19, color=GREY_B).move_to([0, 2.82, 0])
        self.play(FadeIn(title, shift=DOWN), FadeIn(subtitle, shift=UP), run_time=1.2)
        self.wait(0.5)

        self.beat("resting", "Resting potential")

        soma = Circle(radius=0.75, color=TEAL, stroke_width=6).move_to([-5.0, 0.7, 0])
        dend_a = Line([-5.6, 0.95, 0], [-6.3, 1.45, 0], color=TEAL, stroke_width=4)
        dend_b = Line([-5.65, 0.45, 0], [-6.3, -0.05, 0], color=TEAL, stroke_width=4)
        axon_top = Line([-4.3, 1.15, 0], [4.3, 1.15, 0], color=TEAL, stroke_width=6)
        axon_bottom = Line([-4.3, 0.25, 0], [4.3, 0.25, 0], color=TEAL, stroke_width=6)
        inner_bg = Rectangle(width=8.6, height=0.88, fill_color=BLUE_E, fill_opacity=0.18, stroke_width=0).move_to([0, 0.7, 0])
        term_branch = Line([4.3, 0.7, 0], [5.3, 0.7, 0], color=TEAL, stroke_width=4)
        term_bulb = Circle(radius=0.2, color=TEAL, stroke_width=4).move_to([5.55, 0.7, 0])
        neuron_group = VGroup(soma, dend_a, dend_b, axon_top, axon_bottom, inner_bg, term_branch, term_bulb)

        membrane_label = Text("membrane", font_size=18, color=TEAL).move_to([0.6, 1.78, 0])
        membrane_leader = Line([0.6, 1.62, 0], [0.6, 1.15, 0], color=TEAL, stroke_width=2)
        outside_pos = Text("+ +  outside positive", font_size=16, color=RED).move_to([3.1, 1.78, 0])
        inside_neg = Text("- -  inside negative", font_size=16, color=BLUE).move_to([3.1, 0.7, 0])

        k1 = Text("K+", font_size=22, color=GREEN).move_to([-3.4, 0.7, 0])
        k2 = Text("K+", font_size=22, color=GREEN).move_to([-2.6, 0.7, 0])
        k_group = VGroup(k1, k2)
        k_info = Text("K+ high inside", font_size=15, color=GREEN).move_to([-3.0, -0.18, 0])
        na1 = Text("Na+", font_size=22, color=ORANGE).move_to([-3.4, 1.62, 0])
        na2 = Text("Na+", font_size=22, color=ORANGE).move_to([-2.6, 1.62, 0])
        na_group = VGroup(na1, na2)
        na_info = Text("Na+ high outside", font_size=15, color=ORANGE).move_to([-3.0, 2.05, 0])

        leak_gate = Rectangle(width=0.16, height=0.34, color=GREY_B, stroke_width=3, fill_opacity=0.4, fill_color=GREY_B).move_to([-1.0, 1.15, 0])
        leak_label = Text("leak channel", font_size=15, color=GREY_B).move_to([-1.0, 1.68, 0])

        caption = Text("Rest: -70 mV, K+ in, Na+ out, leaks hold the gradient", font_size=18, color=WHITE).move_to([0, -3.0, 0])

        self.play(Create(neuron_group), run_time=1.5)
        self.play(LaggedStart(FadeIn(k_group, shift=DOWN), FadeIn(na_group, shift=UP), FadeIn(inside_neg), FadeIn(outside_pos), lag_ratio=0.3), run_time=1.5)
        self.play(FadeIn(k_info), FadeIn(na_info), Create(leak_gate), FadeIn(leak_label), run_time=1.2)
        self.play(FadeIn(membrane_label), Create(membrane_leader), FadeIn(caption), run_time=1.0)

        self.beat("threshold", "Threshold")

        hillock_dot = Dot(point=[-4.0, 0.7, 0], radius=0.09, color=YELLOW)
        hillock_label = Text("axon hillock", font_size=16, color=YELLOW).move_to([-4.0, -0.18, 0])
        hillock_leader = Line([-4.0, 0.02, 0], [-4.0, 0.25, 0], color=YELLOW, stroke_width=2)
        na_gate1 = Rectangle(width=0.18, height=0.36, color=BLUE, stroke_width=4).move_to([-3.85, 1.15, 0])
        na_gate2 = Rectangle(width=0.18, height=0.36, color=BLUE, stroke_width=4).move_to([-3.3, 1.15, 0])
        k_gate1 = Rectangle(width=0.18, height=0.36, color=PURPLE, stroke_width=4).move_to([0.6, 0.25, 0])
        chan_label = Text("voltage-gated Na+ / K+ gates", font_size=15, color=WHITE).move_to([1.9, 1.72, 0])
        stim_arrow = Arrow(start=[-5.4, -0.7, 0], end=[-4.3, 0.05, 0], color=YELLOW, stroke_width=6, buff=0.05)
        stim_label = Text("stimulus", font_size=16, color=YELLOW).move_to([-5.55, -0.7, 0])

        caption2 = Text("Stimulus depolarises hillock toward threshold (-55 mV)", font_size=18, color=WHITE).move_to([0, -3.0, 0])
        self.play(ReplacementTransform(caption, caption2), run_time=0.8)
        self.play(GrowArrow(stim_arrow), FadeIn(stim_label), run_time=1.0)
        self.play(FadeIn(hillock_dot), FadeIn(hillock_label), Create(hillock_leader), run_time=1.0)
        self.play(Create(na_gate1), Create(na_gate2), Create(k_gate1), FadeIn(chan_label), run_time=1.2)
        self.play(Indicate(hillock_dot, scale_factor=1.6), Rotate(na_gate1, angle=0.5), Rotate(na_gate2, angle=0.5), run_time=1.2)

        self.beat("spike", "The spike")

        time_axis = Line([-5.5, -2.2, 0], [5.5, -2.2, 0], color=GREY_C, stroke_width=3)
        thresh_line = Line([-5.5, -1.4, 0], [5.5, -1.4, 0], color=GREY_C, stroke_width=2)
        thresh_label = Text("threshold", font_size=14, color=GREY_B).move_to([4.7, -1.15, 0])
        trace_label = Text("voltage vs time", font_size=15, color=WHITE).move_to([-4.3, -0.85, 0])
        rest_seg = Line([-5.5, -2.0, 0], [-2.2, -2.0, 0], color=YELLOW, stroke_width=5)
        caption3 = Text("Na+ in = rise, K+ out = fall", font_size=18, color=WHITE).move_to([0, -3.0, 0])

        self.play(ReplacementTransform(caption2, caption3), Create(time_axis), Create(thresh_line), FadeIn(thresh_label), FadeIn(trace_label), Create(rest_seg), run_time=1.5)

        rise_seg = Line([-2.2, -2.0, 0], [-1.1, -0.95, 0], color=YELLOW, stroke_width=5)
        spike_dot = Dot(point=[-1.1, -0.95, 0], radius=0.08, color=YELLOW)
        self.play(AnimationGroup(na_group.animate.shift(DOWN * 0.75), Create(rise_seg), GrowFromCenter(spike_dot), lag_ratio=0.4), run_time=1.6)

        fall_seg = Line([-1.1, -0.95, 0], [0.2, -2.0, 0], color=YELLOW, stroke_width=5)
        late_seg = Line([0.2, -2.0, 0], [5.5, -2.0, 0], color=YELLOW, stroke_width=3)
        full_spike = VGroup(rest_seg, rise_seg, fall_seg, late_seg)
        self.play(AnimationGroup(k_group.animate.shift(DOWN * 0.35 + RIGHT * 0.4), Create(fall_seg), Create(late_seg), lag_ratio=0.4), run_time=1.6)

        self.beat("propagation", "Down the axon")

        caption4 = Text("Spike regenerates itself down the axon to the terminals", font_size=18, color=WHITE).move_to([0, -3.0, 0])
        pulse = Ellipse(width=1.1, height=1.35, color=YELLOW, stroke_width=4).move_to([-3.6, 0.7, 0])
        self.play(ReplacementTransform(caption3, caption4), Create(pulse), run_time=0.8)
        self.play(pulse.animate.move_to([0.2, 0.7, 0]), run_time=1.2)
        self.play(pulse.animate.move_to([3.8, 0.7, 0]), Indicate(term_bulb, scale_factor=1.8), run_time=1.2)
        self.play(Flash(term_bulb, color=YELLOW, line_length=0.2), run_time=0.8)

        self.beat("reset", "Refractory reset")

        pump = Rectangle(width=0.42, height=0.42, color=RED, stroke_width=4, fill_color=RED_E, fill_opacity=0.5).move_to([1.5, 0.25, 0])
        pump_label = Text("Na+/K+ pump", font_size=15, color=RED).move_to([1.5, -0.22, 0])
        caption5 = Text("Pump restores gradients: 3 Na+ out, 2 K+ in", font_size=18, color=WHITE).move_to([0, -3.0, 0])
        self.play(ReplacementTransform(caption4, caption5), Create(pump), FadeIn(pump_label), run_time=1.0)
        self.play(AnimationGroup(na_group.animate.shift(UP * 0.75), k_group.animate.shift(UP * -0.35 + LEFT * 0.4), lag_ratio=0.3), run_time=1.4)

        box = SurroundingRectangle(VGroup(pump, pump_label), color=RED, buff=0.12, stroke_width=3)
        self.play(Create(box), Indicate(pump, scale_factor=1.4), run_time=1.0)
        self.wait(1.2)

        takeaway = Text("Rest at -70 mV again: Na+ out, K+ in — ready to fire", font_size=19, color=WHITE).move_to([0, 2.35, 0])
        takeaway_bg = RoundedRectangle(width=6.8, height=0.55, color=WHITE, stroke_width=2, fill_color=BLACK, fill_opacity=0.7).move_to([0, 2.35, 0])
        self.play(FadeIn(takeaway_bg), FadeIn(takeaway, shift=DOWN), FadeOut(pulse), FadeOut(stim_arrow), FadeOut(stim_label), run_time=1.2)
        self.wait(1.5)
