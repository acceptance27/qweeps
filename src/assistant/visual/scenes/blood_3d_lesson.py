from manim import *
import numpy as np

# Detailed 3D "How blood is made", authored for ManimCE and rendered through
# api/gl_compile.py + manimgl_compat.py on ManimGL.
#
# Composition is deliberately camera-safe: the camera only rotates, objects move
# into and out of the centre. Chapters:
#   1. trabecular bone lattice + marrow pocket (orbit)
#   2. marrow cleared -> stem-cell cluster
#   3. division -> three lineages
#   4. exit through the sinusoid
#   5. closing numbers

STRUT = "#D9C7A7"


def ball(radius, color, opacity=1.0, resolution=(18, 18)):
    mesh = Sphere(radius=radius, resolution=resolution)
    mesh.set_fill(color, opacity)
    mesh.set_stroke(width=0)
    return mesh


def rod(radius, height, color, opacity=1.0, resolution=(10, 6)):
    mesh = Cylinder(radius=radius, height=height, resolution=resolution)
    mesh.set_fill(color, opacity)
    mesh.set_stroke(width=0)
    return mesh


def strut_between(p1, p2, radius=0.055, color=STRUT):
    p1, p2 = np.array(p1, dtype=float), np.array(p2, dtype=float)
    delta = p2 - p1
    length = float(np.linalg.norm(delta))
    piece = rod(radius, length, color)
    piece.move_to((p1 + p2) / 2)
    axis = np.cross(OUT, delta / length)
    if np.linalg.norm(axis) > 1e-6:
        piece.rotate(np.arccos(np.clip(delta[2] / length, -1, 1)), axis=axis)
    return piece


class GenScene(ThreeDScene):
    def construct(self):
        self.set_camera_orientation(phi=66 * DEGREES, theta=-54 * DEGREES)

        # ------------------------------------------------- 1. bone lattice
        rng = np.random.default_rng(5)
        grid = {}
        for ix in range(-2, 3):
            for iy in range(-2, 3):
                for iz in range(-1, 2):
                    point = np.array([ix * 1.25, iy * 0.95, iz * 0.85])
                    if np.linalg.norm(point) < 1.55:
                        continue          # keep the marrow pocket clear
                    grid[(ix, iy, iz)] = point + np.array(
                        [rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), rng.uniform(-0.04, 0.04)]
                    )

        struts = Group()
        for (ix, iy, iz), point in grid.items():
            for step in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
                neighbour = grid.get((ix + step[0], iy + step[1], iz + step[2]))
                if neighbour is not None:
                    struts.add(strut_between(point, neighbour))

        marrow = ball(1.05, "#6E2B2B", opacity=0.35, resolution=(22, 22))

        header = Text("How blood is made: inside the marrow", font_size=31)
        subtitle = Text("beige trabeculae frame the red marrow space", font_size=16, color=GREY_A)
        self.add_fixed_in_frame_mobjects(header, subtitle)
        header.to_corner(UL, buff=0.32)
        subtitle.next_to(header, DOWN, aligned_edge=LEFT, buff=0.1)

        self.play(LaggedStart(*[GrowFromCenter(s) for s in struts], lag_ratio=0.015), run_time=3.2)
        self.play(FadeIn(marrow, scale=0.7), FadeIn(header, shift=DOWN * 0.15),
                  FadeIn(subtitle), run_time=1.0)

        self.begin_ambient_camera_rotation(rate=0.11)
        self.wait(5.5)
        self.stop_ambient_camera_rotation()

        # ------------------------------------------ 2. clear marrow, HSCs
        self.play(FadeOut(struts, shift=OUT * 0.4), FadeOut(marrow, scale=1.4),
                  FadeOut(subtitle), run_time=1.3)

        niche_label = Text("haematopoietic stem cells (HSC)", font_size=20, color="#D2B4DE")
        self.add_fixed_in_frame_mobjects(niche_label)
        niche_label.move_to(DOWN * 3.35)

        spots = [LEFT * 0.72 + UP * 0.45, RIGHT * 0.62 + UP * 0.3,
                 LEFT * 0.12 + DOWN * 0.45, RIGHT * 0.85 + DOWN * 0.2,
                 LEFT * 0.95 + DOWN * 0.1]
        hsc = Group(*[ball(0.22, "#9B59B6") for _ in spots])
        for group, spot in zip(hsc, spots):
            group.move_to(spot)

        self.play(LaggedStart(*[GrowFromCenter(g) for g in hsc], lag_ratio=0.14),
                  FadeIn(niche_label), run_time=1.6)
        self.play(hsc.animate.scale(1.13), run_time=0.35)
        self.play(hsc.animate.scale(1 / 1.13), run_time=0.35)

        mother = hsc[0]
        daughter_a = ball(0.22, "#9B59B6").move_to(mother.get_center() + LEFT * 0.2)
        daughter_b = ball(0.22, "#9B59B6").move_to(mother.get_center() + RIGHT * 0.2)
        self.play(ReplacementTransform(mother, daughter_a), run_time=0.5)
        self.add(daughter_b)
        self.play(daughter_b.animate.shift(RIGHT * 0.55 + DOWN * 0.2), run_time=0.9)
        self.wait(0.6)

        # ---------------------------------------------- 3. three lineages
        self.play(FadeOut(Group(*hsc[1:]), shift=OUT * 0.3),
                  FadeOut(niche_label), run_time=0.8)

        rbc = ball(0.5, "#E74C3C", resolution=(24, 24))
        rbc.stretch(0.3, 2).move_to(LEFT * 2.3 + DOWN * 0.1)
        haem = Group(*[
            ball(0.07, "#922B21", resolution=(8, 8)).move_to(
                rbc.get_center() + np.array([np.cos(i * 2.1) * 0.3,
                                             np.sin(i * 2.9) * 0.3,
                                             0.07 * np.sin(i * 1.7)]))
            for i in range(9)
        ])

        lobes = Group(*[
            ball(0.13, "#7D3C98", resolution=(12, 12)).move_to(
                np.array([np.cos(a) * 0.22, np.sin(a) * 0.22, 0.36]))
            for a in [0.4, 2.5, 4.5]
        ])
        wbc = Group(ball(0.48, "#CFE6F5", opacity=0.92, resolution=(24, 24)), lobes)
        wbc.move_to(DOWN * 0.1)

        plts = Group()
        for i in range(4):
            plate = ball(0.16, "#F1C40F", resolution=(16, 16))
            plate.stretch(0.28, 2)
            plate.move_to(np.array([2.3 + 0.42 * (i % 2), -0.3 + 0.44 * (i // 2), 0.06 * i]))
            plts.add(plate)

        legend = Group(
            Group(ball(0.07, "#E74C3C", resolution=(8, 8)),
                  Text("red cell: oxygen", font_size=17, color="#E74C3C")),
            Group(ball(0.07, "#AED6F1", resolution=(8, 8)),
                  Text("white cell: immunity", font_size=17, color="#AED6F1")),
            Group(ball(0.07, "#F1C40F", resolution=(8, 8)),
                  Text("platelets: clotting", font_size=17, color="#F1C40F")),
        )
        for entry in legend:
            entry.arrange(RIGHT, buff=0.14)
        legend.arrange(DOWN, buff=0.22, aligned_edge=LEFT).move_to(
            np.array([-5.0, -2.3, 0]))
        self.add_fixed_in_frame_mobjects(legend)

        cell_labels = Group(
            Text("red blood cell", font_size=18, color="#E74C3C").move_to(np.array([-2.3, -1.3, 0])),
            Text("white blood cell", font_size=18, color="#AED6F1").move_to(np.array([0.0, -1.3, 0])),
            Text("platelet", font_size=18, color="#F1C40F").move_to(np.array([2.3, -1.3, 0])),
        )
        self.add_fixed_in_frame_mobjects(cell_labels)

        self.play(FadeIn(rbc, scale=0.5), FadeIn(haem),
                  FadeIn(wbc, scale=0.5),
                  LaggedStart(*[GrowFromCenter(p) for p in plts], lag_ratio=0.12), run_time=1.5)
        self.play(FadeIn(cell_labels, shift=UP * 0.1), FadeIn(legend, shift=RIGHT * 0.15), run_time=0.7)

        self.play(
            Rotate(rbc, angle=TAU, axis=OUT, run_time=6.0, rate_func=linear),
            Rotate(wbc, angle=TAU, axis=OUT, run_time=6.0, rate_func=linear),
            Rotate(plts, angle=TAU, axis=UP, run_time=6.0, rate_func=linear),
        )

        # ----------------------------------------------------- 4. release
        self.play(FadeOut(legend), FadeOut(cell_labels), run_time=0.8)

        release = Text("mature cells enter the circulation", font_size=20, color=GREY_A)
        self.add_fixed_in_frame_mobjects(release)
        release.move_to(UP * 2.9)
        self.play(FadeIn(release), run_time=0.5)

        self.play(
            rbc.animate.shift(OUT * 1.9),
            wbc.animate.shift(OUT * 1.9),
            plts.animate.shift(OUT * 1.9),
            FadeOut(Group(daughter_a, daughter_b)),
            run_time=1.6,
        )
        self.play(FadeOut(Group(rbc, wbc, plts, haem, release)), run_time=0.8)

        # ------------------------------------------------------ 5. closing
        self.play(FadeOut(header), run_time=0.8)

        line1 = Text("Blood is built cell by cell, in 3D", font_size=31)
        line2 = Text("2-3 million red cells every second", font_size=20, color=RED_A)
        line3 = Text("one HSC can supply the body for a lifetime", font_size=17, color=GREY_A)
        self.add_fixed_in_frame_mobjects(line1, line2, line3)
        line1.move_to(UP * 0.5)
        line2.next_to(line1, DOWN, buff=0.3)
        line3.next_to(line2, DOWN, buff=0.18)

        self.play(FadeIn(line1, shift=UP * 0.15), run_time=0.9)
        self.play(FadeIn(line2), FadeIn(line3), run_time=0.9)
        self.wait(3.0)
