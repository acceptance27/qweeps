from manim import *
import numpy as np

class GenScene(Scene):
    def construct(self):
        top_title = Text("How Does a Neuron Fire?", font_size=30).to_edge(UP, buff=0.15)
        caption = Text("Follow a hot-mug touch down one axon", font_size=20).to_edge(DOWN, buff=0.3)

        self.play(AnimationGroup(FadeIn(top_title), FadeIn(caption)), run_time=1.2)
        self.wait(0.5)
        self.play(FadeOut(caption), run_time=0.5)
        caption = Text("Follow a hot-mug touch down one axon", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeIn(caption), run_time=0.5)

        # The lesson header carries the title; the scene's own copy would repeat it.
        self.remove(top_title)

        # beat resting-membrane — A charged battery at rest
        self.beat("resting-membrane", "A charged battery at rest")
        cap1 = Text("Rest: -70mV battery — Na+ out, K+ in", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap1), run_time=0.6)
        caption = cap1

        membrane_top = Line(start=[-5, 0.8, 0], end=[3, 0.8, 0], color=GREY_B, stroke_width=8)
        membrane_bot = Line(start=[-5, 0.0, 0], end=[3, 0.0, 0], color=GREY_B, stroke_width=8)
        membrane_group = VGroup(membrane_top, membrane_bot)
        membrane_label = Text("membrane", font_size=18, color=GREY_B).move_to([-5.9, 0.4, 0])
        self.play(Create(membrane_group), FadeIn(membrane_label), run_time=1.0)

        na_a = Dot(point=[-4, 1.4, 0], color=BLUE, radius=0.12)
        na_b = Dot(point=[-2.5, 1.4, 0], color=BLUE, radius=0.12)
        na_c = Dot(point=[-1, 1.4, 0], color=BLUE, radius=0.12)
        na_group = VGroup(na_a, na_b, na_c)
        na_label = Text("Na+ outside", font_size=18, color=BLUE).move_to([-3.2, 2.1, 0])
        k_a = Dot(point=[-4, -0.8, 0], color=ORANGE, radius=0.12)
        k_b = Dot(point=[-2.5, -0.8, 0], color=ORANGE, radius=0.12)
        k_c = Dot(point=[-1, -0.8, 0], color=ORANGE, radius=0.12)
        k_group = VGroup(k_a, k_b, k_c)
        k_label = Text("K+ inside", font_size=18, color=ORANGE).move_to([-3.2, -1.5, 0])
        self.play(LaggedStart(FadeIn(na_group), FadeIn(k_group), FadeIn(na_label), FadeIn(k_label), lag_ratio=0.25), run_time=1.2)

        meter_bg = Rectangle(width=0.5, height=2.2, stroke_color=YELLOW, stroke_width=3, fill_opacity=0).move_to([5.0, 0.3, 0])
        meter_fill = Rectangle(width=0.4, height=0.4, stroke_color=YELLOW, stroke_width=0, fill_color=YELLOW, fill_opacity=0.8).move_to([5.0, -0.6, 0])
        voltage_label = Text("-70mV rest", font_size=20, color=YELLOW).move_to([5.0, -1.4, 0])
        voltage_title = Text("voltage", font_size=18, color=YELLOW).move_to([5.0, 1.85, 0])
        pump = RoundedRectangle(width=0.6, height=0.9, corner_radius=0.15, stroke_color=WHITE, stroke_width=3, fill_opacity=0).move_to([1.5, 0.4, 0])
        pump_label = Text("pump + K+ leak", font_size=16, color=WHITE).move_to([1.5, -0.6, 0])
        self.play(Create(meter_bg), FadeIn(meter_fill), FadeIn(voltage_label), FadeIn(voltage_title), run_time=1.0)
        self.play(GrowFromCenter(pump), FadeIn(pump_label), run_time=0.8)
        self.wait(0.5)

        # beat summation-decision — Many whispers, one decision point
        self.beat("summation-decision", "Many whispers, one decision point")
        cap2 = Text("Whispers add at hillock: EPSP + IPSP sum", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap2), run_time=0.6)
        caption = cap2

        hillock_dot = Dot(point=[-2, 0.4, 0], color=WHITE, radius=0.16)
        hillock_label = Text("hillock decides", font_size=16, color=WHITE).move_to([-1.5, -2.05, 0])
        axon_label = Text("axon", font_size=18, color=GREY_B).move_to([1.0, -1.5, 0])
        arr_epsp1 = Arrow(start=[-5.5, 1.2, 0], end=[-2.4, 0.6, 0], color=GREEN, stroke_width=5)
        arr_ipsp = Arrow(start=[-5.5, -0.4, 0], end=[-2.4, 0.3, 0], color=RED, stroke_width=5)
        arr_epsp2 = Arrow(start=[-5.5, 0.4, 0], end=[-2.4, 0.45, 0], color=GREEN, stroke_width=5)
        epsp_label = Text("EPSP push", font_size=16, color=GREEN).move_to([-5.0, 1.65, 0])
        ipsp_label = Text("IPSP pull", font_size=16, color=RED).move_to([-5.0, -0.85, 0])
        self.play(AnimationGroup(GrowArrow(arr_epsp1), GrowArrow(arr_ipsp), GrowArrow(arr_epsp2), FadeIn(hillock_dot), FadeIn(hillock_label)), run_time=1.2)
        self.play(FadeIn(epsp_label), FadeIn(ipsp_label), FadeIn(axon_label), run_time=0.8)

        s1 = Dot(point=[-4.5, 0.9, 0], color=GREEN, radius=0.1)
        s2 = Dot(point=[-4.5, -0.2, 0], color=RED, radius=0.1)
        s3 = Dot(point=[-4.5, 0.4, 0], color=GREEN, radius=0.1)
        sig_group = VGroup(s1, s2, s3)
        self.play(FadeIn(sig_group), run_time=0.6)
        hillock_s = Dot(point=[-2.0, 0.4, 0], color=GREEN, radius=0.12)
        hillock_s2 = Dot(point=[-1.8, 0.4, 0], color=GREEN, radius=0.1)
        self.play(Transform(sig_group, VGroup(hillock_s, hillock_s2, hillock_s.copy())), run_time=1.0)
        summed_fill = Rectangle(width=0.4, height=0.7, stroke_color=YELLOW, stroke_width=0, fill_color=YELLOW, fill_opacity=0.8).move_to([5.0, -0.45, 0])
        summed_label = Text("-62mV summed", font_size=20, color=YELLOW).move_to([5.0, -1.4, 0])
        self.play(Transform(meter_fill, summed_fill), Transform(voltage_label, summed_label), run_time=1.0)
        self.play(FadeOut(arr_epsp1), FadeOut(arr_ipsp), FadeOut(arr_epsp2), FadeOut(epsp_label), FadeOut(ipsp_label), FadeOut(sig_group), run_time=0.6)

        # beat threshold-test — Threshold: fire or stay silent
        self.beat("threshold-test", "Threshold: fire or stay silent")
        cap3 = Text("Only past -55mV opens gates: all-or-none", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap3), run_time=0.6)
        caption = cap3

        thresh_segs = []
        for i in range(10):
            x0 = -5 + i * 0.8
            thresh_segs.append(Line(start=[x0, 1.0, 0], end=[x0 + 0.5, 1.0, 0], color=YELLOW, stroke_width=3))
        thresh_group = VGroup(*thresh_segs)
        thresh_label = Text("threshold -55mV", font_size=16, color=YELLOW).move_to([0.8, 1.45, 0])
        self.play(Create(thresh_group), FadeIn(thresh_label), run_time=1.0)

        small_push = Arrow(start=[-3.5, -0.2, 0], end=[-3.5, 0.5, 0], color=GREY_A, stroke_width=5)
        big_push = Arrow(start=[0.5, -0.2, 0], end=[0.5, 0.9, 0], color=WHITE, stroke_width=7)
        small_txt = Text("small fades", font_size=16, color=GREY_A).move_to([-3.5, -1.0, 0])
        big_txt = Text("big OPENS", font_size=16, color=WHITE).move_to([0.5, -1.0, 0])
        self.play(GrowArrow(small_push), GrowArrow(big_push), FadeIn(small_txt), FadeIn(big_txt), run_time=1.2)

        decay_dot = Dot(point=[-3.5, 0.6, 0], color=GREY_A, radius=0.12)
        open_dot = Dot(point=[0.5, 1.0, 0], color=YELLOW, radius=0.14)
        self.play(FadeIn(decay_dot), FadeIn(open_dot), run_time=0.6)
        decay_back = Dot(point=[-3.5, 0.2, 0], color=GREY_A, radius=0.1)
        self.play(Transform(decay_dot, decay_back), Indicate(open_dot), run_time=1.0)
        self.play(FadeOut(small_push), FadeOut(big_push), FadeOut(small_txt), FadeOut(big_txt), FadeOut(decay_dot), FadeOut(open_dot), FadeOut(hillock_dot), FadeOut(hillock_label), run_time=0.6)

        # beat upstroke-flood — The flood that is the spike
        self.beat("upstroke-flood", "The flood that is the spike")
        cap4 = Text("Na+ gates open: flood drives to +30mV", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap4), run_time=0.6)
        caption = cap4

        gate1_closed = Rectangle(width=0.35, height=0.8, stroke_color=BLUE, stroke_width=4, fill_opacity=0).move_to([-1.2, 0.4, 0])
        gate2_closed = Rectangle(width=0.35, height=0.8, stroke_color=BLUE, stroke_width=4, fill_opacity=0).move_to([0.2, 0.4, 0])
        gates_closed = VGroup(gate1_closed, gate2_closed)
        gate_label = Text("Na+ gates", font_size=16, color=BLUE).move_to([-0.5, -1.0, 0])
        self.play(FadeIn(gates_closed), FadeIn(gate_label), run_time=0.8)
        gate1_open = Rectangle(width=0.55, height=1.0, stroke_color=BLUE, stroke_width=5, fill_color=BLUE, fill_opacity=0.25).move_to([-1.2, 0.4, 0])
        gate2_open = Rectangle(width=0.55, height=1.0, stroke_color=BLUE, stroke_width=5, fill_color=BLUE, fill_opacity=0.25).move_to([0.2, 0.4, 0])
        gates_open = VGroup(gate1_open, gate2_open)
        self.play(ReplacementTransform(gates_closed, gates_open), run_time=1.0)

        in1 = Arrow(start=[-1.2, 1.6, 0], end=[-1.2, -0.3, 0], color=BLUE, stroke_width=6)
        in2 = Arrow(start=[0.2, 1.6, 0], end=[0.2, -0.3, 0], color=BLUE, stroke_width=6)
        inside_txt = Text("inside + now", font_size=16, color=BLUE).move_to([-0.5, -1.5, 0])
        self.play(AnimationGroup(GrowArrow(in1), GrowArrow(in2)), FadeIn(inside_txt), run_time=1.2)

        flood_fill = Rectangle(width=0.4, height=2.0, stroke_color=YELLOW, stroke_width=0, fill_color=YELLOW, fill_opacity=0.9).move_to([5.0, 0.2, 0])
        up_label = Text("+30mV peak", font_size=20, color=YELLOW).move_to([5.0, -1.4, 0])
        self.play(Transform(meter_fill, flood_fill), Transform(voltage_label, up_label), run_time=1.0)

        # beat spike-shape — How high, how fast, how brief
        self.beat("spike-shape", "How high, how fast, how brief")
        cap5 = Text("Spike ~1ms tall and fixed: bigger = more, not taller", font_size=18).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap5), run_time=0.6)
        caption = cap5
        self.play(FadeOut(membrane_group), FadeOut(na_group), FadeOut(k_group), FadeOut(na_label), FadeOut(k_label), FadeOut(membrane_label), FadeOut(pump), FadeOut(pump_label), FadeOut(gates_open), FadeOut(in1), FadeOut(in2), FadeOut(inside_txt), FadeOut(gate_label), FadeOut(axon_label), FadeOut(thresh_group), FadeOut(thresh_label), run_time=0.6)

        x_axis = Line(start=[-5, -1.8, 0], end=[3, -1.8, 0], color=WHITE, stroke_width=3)
        y_axis = Line(start=[-5, -1.8, 0], end=[-5, 1.5, 0], color=WHITE, stroke_width=3)
        axes_group = VGroup(x_axis, y_axis)
        time_label = Text("time ~1-2 ms", font_size=16, color=WHITE).move_to([-1, -2.25, 0])
        trace_title = Text("voltage trace", font_size=16, color=YELLOW).move_to([-3.5, 1.8, 0])
        t_segs2 = []
        for i in range(8):
            x0 = -5 + i * 1.0
            t_segs2.append(Line(start=[x0, 0.0, 0], end=[x0 + 0.6, 0.0, 0], color=YELLOW, stroke_width=3))
        thresh2 = VGroup(*t_segs2)
        thresh2_label = Text("threshold -55mV", font_size=16, color=YELLOW).move_to([1.5, 0.35, 0])
        self.play(Create(axes_group), FadeIn(time_label), FadeIn(trace_title), Create(thresh2), FadeIn(thresh2_label), run_time=1.0)

        b1 = Line(start=[-4.5, -1.5, 0], end=[-2.5, -1.5, 0], color=YELLOW, stroke_width=5)
        r1 = Line(start=[-2.5, -1.5, 0], end=[-1.5, 1.2, 0], color=YELLOW, stroke_width=5)
        f1 = Line(start=[-1.5, 1.2, 0], end=[-0.5, -1.5, 0], color=YELLOW, stroke_width=5)
        spike1 = VGroup(b1, r1, f1)
        peak_label = Text("+30mV", font_size=16, color=YELLOW).move_to([-1.5, 1.65, 0])
        self.play(LaggedStart(Create(b1), Create(r1), Create(f1), lag_ratio=0.3), FadeIn(peak_label), run_time=1.2)

        b2 = Line(start=[-0.5, -1.5, 0], end=[0.5, -1.5, 0], color=YELLOW, stroke_width=5)
        r2 = Line(start=[0.5, -1.5, 0], end=[1.2, 1.2, 0], color=YELLOW, stroke_width=5)
        f2 = Line(start=[1.2, 1.2, 0], end=[2.0, -1.5, 0], color=YELLOW, stroke_width=5)
        same_txt = Text("same height!", font_size=16, color=WHITE).move_to([1.0, -2.25, 0])
        self.play(LaggedStart(Create(b2), Create(r2), Create(f2), lag_ratio=0.3), FadeIn(same_txt), run_time=1.2)

        # beat propagation-wave — The wave that recharges itself
        self.beat("propagation-wave", "The wave that recharges itself")
        cap6 = Text("Each patch re-fires the next: no fading", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap6), run_time=0.6)
        caption = cap6
        self.play(FadeOut(axes_group), FadeOut(time_label), FadeOut(trace_title), FadeOut(thresh2), FadeOut(thresh2_label), FadeOut(spike1), FadeOut(peak_label), FadeOut(b2), FadeOut(r2), FadeOut(f2), FadeOut(same_txt), run_time=0.6)

        ax_top = Line(start=[-5, 0.8, 0], end=[3.5, 0.8, 0], color=GREY_B, stroke_width=8)
        ax_bot = Line(start=[-5, 0.0, 0], end=[3.5, 0.0, 0], color=GREY_B, stroke_width=8)
        axon_walls = VGroup(ax_top, ax_bot)
        axon_tag = Text("axon", font_size=18, color=GREY_B).move_to([-4.5, -0.6, 0])
        p1 = RoundedRectangle(width=1.6, height=1.2, corner_radius=0.2, stroke_color=GREY_A, stroke_width=3, fill_opacity=0).move_to([-3.5, 0.4, 0])
        p2 = RoundedRectangle(width=1.6, height=1.2, corner_radius=0.2, stroke_color=GREY_A, stroke_width=3, fill_opacity=0).move_to([-1.0, 0.4, 0])
        p3 = RoundedRectangle(width=1.6, height=1.2, corner_radius=0.2, stroke_color=GREY_A, stroke_width=3, fill_opacity=0).move_to([1.5, 0.4, 0])
        term = Circle(radius=0.4, stroke_color=WHITE, stroke_width=3, fill_opacity=0).move_to([4.2, 0.4, 0])
        term_label = Text("terminals", font_size=16, color=WHITE).move_to([4.2, -0.6, 0])
        self.play(Create(axon_walls), FadeIn(axon_tag), GrowFromCenter(p1), GrowFromCenter(p2), GrowFromCenter(p3), GrowFromCenter(term), FadeIn(term_label), run_time=1.2)

        glow = Ellipse(width=1.8, height=1.4, stroke_color=YELLOW, stroke_width=4, fill_color=YELLOW, fill_opacity=0.3).move_to([-3.5, 0.4, 0])
        glow_label = Text("firing", font_size=16, color=YELLOW).move_to([-3.5, 1.5, 0])
        self.play(FadeIn(glow), FadeIn(glow_label), run_time=0.6)
        glow2 = Ellipse(width=1.8, height=1.4, stroke_color=YELLOW, stroke_width=4, fill_color=YELLOW, fill_opacity=0.3).move_to([-1.0, 0.4, 0])
        glow3 = Ellipse(width=1.8, height=1.4, stroke_color=YELLOW, stroke_width=4, fill_color=YELLOW, fill_opacity=0.3).move_to([1.5, 0.4, 0])
        glowT = Ellipse(width=1.2, height=1.0, stroke_color=YELLOW, stroke_width=4, fill_color=YELLOW, fill_opacity=0.4).move_to([4.2, 0.4, 0])
        self.play(Transform(glow, glow2), run_time=0.8)
        self.play(Transform(glow, glow3), run_time=0.8)
        self.play(Transform(glow, glowT), Flash(term, color=YELLOW), run_time=0.8)
        self.wait(0.5)

        # beat reset-release — Reset and hand-off
        self.beat("reset-release", "Reset and hand-off")
        cap7 = Text("K+ out resets; Ca2+ hands signal on", font_size=20).to_edge(DOWN, buff=0.3)
        self.play(FadeOut(caption), FadeIn(cap7), run_time=0.6)
        caption = cap7

        kout1 = Arrow(start=[1.5, 0.4, 0], end=[1.5, -1.3, 0], color=ORANGE, stroke_width=6)
        kout2 = Arrow(start=[-1.0, 0.4, 0], end=[-1.0, -1.3, 0], color=ORANGE, stroke_width=6)
        kout_label = Text("K+ out resets", font_size=16, color=ORANGE).move_to([-0.2, -1.8, 0])
        pump2 = RoundedRectangle(width=0.6, height=0.9, corner_radius=0.15, stroke_color=WHITE, stroke_width=3, fill_opacity=0.15).move_to([0.2, 0.4, 0])
        pump2_label = Text("pump restores", font_size=16, color=WHITE).move_to([0.2, -0.9, 0])
        self.play(AnimationGroup(GrowArrow(kout1), GrowArrow(kout2)), FadeIn(kout_label), run_time=1.0)
        self.play(GrowFromCenter(pump2), FadeIn(pump2_label), run_time=0.8)

        ves1 = Circle(radius=0.18, stroke_color=WHITE, stroke_width=3, fill_opacity=0.2).move_to([3.8, 0.8, 0])
        ves2 = Circle(radius=0.18, stroke_color=WHITE, stroke_width=3, fill_opacity=0.2).move_to([4.4, 0.8, 0])
        ca = Dot(point=[4.0, 1.4, 0], color=GREEN, radius=0.12)
        ca_label = Text("Ca2+ in", font_size=16, color=GREEN).move_to([4.0, 1.85, 0])
        next_cell = RoundedRectangle(width=1.2, height=1.6, corner_radius=0.3, stroke_color=GREY_A, stroke_width=3, fill_opacity=0).move_to([5.8, 0.1, 0])
        self.play(FadeIn(ves1), FadeIn(ves2), FadeIn(ca), FadeIn(ca_label), run_time=1.0)
        release_arrow = Arrow(start=[4.1, 0.4, 0], end=[5.2, 0.2, 0], color=WHITE, stroke_width=5)
        next_label = Text("next cell", font_size=16, color=GREY_A).move_to([5.8, -1.1, 0])
        self.play(GrowArrow(release_arrow), GrowFromCenter(next_cell), FadeIn(next_label), run_time=1.0)

        rest_fill = Rectangle(width=0.4, height=0.4, stroke_color=YELLOW, stroke_width=0, fill_color=YELLOW, fill_opacity=0.8).move_to([5.0, -0.6, 0])
        rest_label = Text("-70mV reset", font_size=20, color=YELLOW).move_to([5.0, -1.4, 0])
        self.play(Transform(meter_fill, rest_fill), Transform(voltage_label, rest_label), FadeOut(glow), FadeOut(glow_label), run_time=1.0)

        box = SurroundingRectangle(VGroup(next_cell, release_arrow), color=YELLOW, buff=0.15)
        self.play(Create(box), Indicate(next_cell), run_time=1.0)
        self.wait(1.0)

        takeaway = Text("-70 -> -55 -> +30 in ~1ms: all-or-none", font_size=20, color=WHITE).move_to([0, -2.6, 0])
        self.play(FadeOut(caption), FadeIn(takeaway), run_time=0.8)
        caption = takeaway
        self.wait(1.5)
