"""A* Pathfinding Visual Explainer Scene with 3B1B pacing and interactive inspection.

Demonstrates:
- Beat 1: Start (S) and Goal (G) nodes on a discrete grid.
- Beat 2: Dijkstra's blind uniform-cost expansion.
- Beat 3: Calculating the Heuristic h(n) = sqrt(dx^2 + dy^2) with dynamic vector.
- Beat 4: Evaluating the Frontier with f(n) = g(n) + h(n) and choosing the optimal node.
- Interactive mode:
  - Right-click drag to pan the canvas anywhere.
  - Left-click or drag-to-select candidate nodes to inspect f/g/h values.
  - Drag Node A to see live distance tracking and Euclidean recalculation.
  - Press 'B' to branch into the Manhattan vs Euclidean comparison sub-scene.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any

_SRC = str(Path(__file__).resolve().parents[3])
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from manimlib import *
from assistant.visual.scene import QweepsInteractiveScene
from assistant.visual.beats import Beat


class AStarHeuristicScene(QweepsInteractiveScene):
    """3B1B-style interactive explainer for A* pathfinding heuristics."""

    def construct(self) -> None:
        # Solid opaque background (prevents window transparency bleed)
        bg = FullScreenRectangle(fill_color="#0c0f17", fill_opacity=1.0, stroke_width=0)
        self.add(bg)

        # Palette
        GRID_COLOR = "#232838"
        START_COLOR = "#00FF88"     # Emerald glow
        GOAL_COLOR = "#FF3366"      # Ruby neon
        FRONTIER_A_COLOR = "#33BBFF"# Cyan candidate (optimal)
        FRONTIER_B_COLOR = "#FFAA00"# Amber candidate (sub-optimal)
        VECTOR_COLOR = "#FFE600"

        # -------------------------------------------------------------
        # BEAT 1: The Arena (Start and Goal Nodes on Grid)
        # -------------------------------------------------------------
        grid_lines = VGroup()
        for x in range(-6, 7):
            grid_lines.add(Line(np.array([x, -3.5, 0]), np.array([x, 3.5, 0]), stroke_color=GRID_COLOR, stroke_width=1.5))
        for y in range(-3, 4):
            grid_lines.add(Line(np.array([-6, y, 0]), np.array([6, y, 0]), stroke_color=GRID_COLOR, stroke_width=1.5))

        start_pos = np.array([-3.0, -1.0, 0.0])
        goal_pos = np.array([3.0, 2.0, 0.0])

        # Solid fills to cleanly occlude background grid lines
        start_circle = Circle(radius=0.35, fill_color="#0b2e1b", fill_opacity=1.0, stroke_color=START_COLOR, stroke_width=3.5)
        start_circle.move_to(start_pos)
        start_label = Text("S", font="sans-serif", color=START_COLOR).scale(0.6).move_to(start_pos)
        start_group = VGroup(start_circle, start_label)

        goal_circle = Circle(radius=0.35, fill_color="#3a0b16", fill_opacity=1.0, stroke_color=GOAL_COLOR, stroke_width=3.5)
        goal_circle.move_to(goal_pos)
        goal_label = Text("G", font="sans-serif", color=GOAL_COLOR).scale(0.6).move_to(goal_pos)
        goal_group = VGroup(goal_circle, goal_label)

        # Register interactive hooks
        self.register_interactive(
            start_group,
            {
                "id": "start_node",
                "label": "Start Node (S)",
                "description": "The search origin. g(S) = 0 because no distance has been traversed yet.",
                "why": "This is your starting point. All paths originate here with cost zero.",
            },
            draggable=False,
        )

        self.register_interactive(
            goal_group,
            {
                "id": "goal_node",
                "label": "Goal Node (G)",
                "description": "Target destination. The heuristic h(n) measures the estimated remaining cost to here.",
                "why": "The target. The search terminates when the lowest-cost open node reaches this location.",
            },
            draggable=False,
        )

        beat1 = Beat(
            name="arena_setup",
            narration="Imagine navigating a grid from a start point S to a target goal G. In standard search, exploring blindly wastes computation.",
            duration=1.2,
            absorption_pause=1.5,
        )

        def play_beat1() -> None:
            self.play(ShowCreation(grid_lines, lag_ratio=0.1), run_time=0.9)
            self.play(FadeIn(start_group, scale=0.5), FadeIn(goal_group, scale=0.5), run_time=0.7)

        self.play_beat(beat1, play_beat1)

        # -------------------------------------------------------------
        # BEAT 2: Dijkstra's Blind Uniform-Cost Expansion
        # -------------------------------------------------------------
        wave1 = Circle(radius=1.0, color="#1a3b5c", stroke_width=2, stroke_opacity=0.8).move_to(start_pos)
        wave2 = Circle(radius=2.0, color="#122840", stroke_width=2, stroke_opacity=0.6).move_to(start_pos)
        blind_label = Text("Dijkstra: Expands blindly in all directions", font="sans-serif", color="#8aa2bd").scale(0.45).to_corner(UL)

        beat2 = Beat(
            name="dijkstra_blindness",
            narration="Dijkstra only tracks g of n: the cost traveled so far. Because it cannot see where the goal is, it expands equally in every direction.",
            duration=1.2,
            absorption_pause=1.5,
        )

        def play_beat2() -> None:
            self.play(FadeIn(blind_label), run_time=0.5)
            self.play(ShowCreation(wave1), run_time=0.7)
            self.play(ShowCreation(wave2), run_time=0.7)
            self.play(FadeOut(wave1), FadeOut(wave2), FadeOut(blind_label), run_time=0.5)

        self.play_beat(beat2, play_beat2)

        # -------------------------------------------------------------
        # BEAT 3: The Heuristic Vector h(n)
        # -------------------------------------------------------------
        node_a_pos = np.array([-1.0, 0.0, 0.0])
        node_a_circle = Circle(radius=0.32, fill_color="#0a2538", fill_opacity=1.0, stroke_color=FRONTIER_A_COLOR, stroke_width=3)
        node_a_circle.move_to(node_a_pos)
        label_a = Text("A", font="sans-serif", color=FRONTIER_A_COLOR).scale(0.55).move_to(node_a_pos)
        group_a = VGroup(node_a_circle, label_a)

        # Dynamic arrow connecting Candidate A to Goal G
        heuristic_arrow = Arrow(
            node_a_circle.get_center(),
            goal_circle.get_center(),
            stroke_color=VECTOR_COLOR,
            stroke_width=3,
            buff=0.38,
        )

        dx_line = DashedLine(
            node_a_pos,
            np.array([goal_pos[0], node_a_pos[1], 0]),
            stroke_color=YELLOW_D,
            stroke_width=1.5,
        )
        dy_line = DashedLine(
            np.array([goal_pos[0], node_a_pos[1], 0]),
            goal_pos,
            stroke_color=YELLOW_D,
            stroke_width=1.5,
        )
        triangle_group = VGroup(dx_line, dy_line)

        h_formula = Text("h(n) = √(Δx² + Δy²)", font="sans-serif", color=VECTOR_COLOR).scale(0.55).to_corner(UR)

        beat3 = Beat(
            name="heuristic_calculation",
            narration="The heuristic h of n gives the search directional intuition. It estimates remaining distance to the goal using straight-line Euclidean distance: the hypotenuse of delta x and delta y.",
            duration=1.4,
            absorption_pause=1.5,
            branch_scenes={"node_a": "ManhattanVsEuclideanBranch"},
        )

        def play_beat3() -> None:
            self.play(FadeIn(group_a, scale=0.6), run_time=0.6)
            self.play(ShowCreation(triangle_group), ShowCreation(heuristic_arrow), run_time=0.9)
            self.play(FadeIn(h_formula), run_time=0.5)

        self.play_beat(beat3, play_beat3)

        # -------------------------------------------------------------
        # BEAT 4: Frontier Evaluation f(n) = g(n) + h(n)
        # -------------------------------------------------------------
        node_b_pos = np.array([-3.0, 1.0, 0.0])
        node_b_circle = Circle(radius=0.32, fill_color="#38240a", fill_opacity=1.0, stroke_color=FRONTIER_B_COLOR, stroke_width=3)
        node_b_circle.move_to(node_b_pos)
        label_b = Text("B", font="sans-serif", color=FRONTIER_B_COLOR).scale(0.55).move_to(node_b_pos)
        group_b = VGroup(node_b_circle, label_b)

        f_formula = Text("f(n) = g(n) + h(n)", font="sans-serif", color="#ffffff").scale(0.55).to_corner(UL)
        score_a = Text("Node A: g=2.0 + h=4.47 = f: 6.47 [PRIORITIZED]", font="sans-serif").scale(0.38).next_to(f_formula, DOWN, aligned_edge=LEFT)
        score_b = Text("Node B: g=2.0 + h=6.08 = f: 8.08 [HELD BACK]", font="sans-serif").scale(0.38).next_to(score_a, DOWN, aligned_edge=LEFT)
        score_a.set_color(FRONTIER_A_COLOR)
        score_b.set_color(FRONTIER_B_COLOR)

        scores_group = VGroup(f_formula, score_a, score_b)

        # Register interactive hooks
        self.register_interactive(
            group_a,
            {
                "id": "node_frontier_a",
                "label": "Candidate Node A (Frontier)",
                "cost": "g=2.0, h=4.47, f=6.47",
                "why": "Node A is prioritized because its Euclidean distance to goal is only 4.47 units. Its combined f-score of 6.47 beats all alternatives.",
                "branch_scene": "ManhattanVsEuclideanBranch",
            },
            draggable=True,
        )

        self.register_interactive(
            group_b,
            {
                "id": "node_frontier_b",
                "label": "Candidate Node B (Frontier)",
                "cost": "g=2.0, h=6.08, f=8.08",
                "why": "Node B is deprioritized because it moves away from the goal, resulting in a larger heuristic h=6.08 and total f-score of 8.08.",
                "branch_scene": "ManhattanVsEuclideanBranch",
            },
            draggable=True,
        )

        beat4 = Beat(
            name="frontier_decision",
            narration="A-star combines both: f of n equals g of n plus h of n. By always choosing the node with lowest f score, search stretches straight toward the goal like a magnet.",
            duration=1.4,
            absorption_pause=1.5,
        )

        def play_beat4() -> None:
            self.play(FadeIn(group_b, scale=0.6), run_time=0.6)
            self.play(FadeIn(scores_group), run_time=0.7)

        self.play_beat(beat4, play_beat4)

        # -------------------------------------------------------------
        # Live Updaters: Real-Time Arrow and Distance Recalculation
        # -------------------------------------------------------------
        h_readout = Text("h = 4.47", font="sans-serif", color=VECTOR_COLOR).scale(0.36)
        h_readout.move_to((group_a.get_center() + goal_group.get_center()) / 2.0 + np.array([0, 0.35, 0]))
        self.add(h_readout)

        def update_tracking(mob: Mobject) -> None:
            start_p = group_a.get_center()
            end_p = goal_group.get_center()
            heuristic_arrow.put_start_and_end_on(start_p, end_p)
            dx = float(end_p[0] - start_p[0])
            dy = float(end_p[1] - start_p[1])
            dist = math.sqrt(dx * dx + dy * dy)
            mid = (start_p + end_p) / 2.0 + np.array([0, 0.35, 0])
            h_readout.become(Text(f"h = {dist:.2f}", font="sans-serif", color=VECTOR_COLOR).scale(0.36).move_to(mid))

        group_a.add_updater(update_tracking)

        # -------------------------------------------------------------
        # Branch Sub-Scene: Manhattan vs Euclidean Heuristics
        # -------------------------------------------------------------
        branch_group = VGroup()
        is_branch_active = [False]

        def toggle_branch() -> None:
            if not is_branch_active[0]:
                is_branch_active[0] = True
                pt_a = group_a.get_center()
                pt_corner = np.array([goal_pos[0], pt_a[1], 0.0])
                manhattan_leg1 = Line(pt_a, pt_corner, stroke_color="#FF8800", stroke_width=4.0)
                manhattan_leg2 = Line(pt_corner, goal_pos, stroke_color="#FF8800", stroke_width=4.0)
                manhattan_path = VGroup(manhattan_leg1, manhattan_leg2)

                branch_title = Text("Branch: Manhattan vs Euclidean Admissibility", font="sans-serif", color="#FFFFFF").scale(0.48).to_edge(UP, buff=0.3)
                manhattan_text = Text("Manhattan: |Δx| + |Δy| = 6.0 (Exact on 4-way grid)", font="sans-serif", color="#FF8800").scale(0.36).next_to(branch_title, DOWN, buff=0.15)
                euclidean_text = Text("Euclidean: √(Δx² + Δy²) = 4.47 (Admissible lower bound!)", font="sans-serif", color="#33BBFF").scale(0.36).next_to(manhattan_text, DOWN, buff=0.15)
                sub_info = VGroup(branch_title, manhattan_text, euclidean_text)
                branch_group.add(manhattan_path, sub_info)

                beat_branch = Beat(
                    name="manhattan_vs_euclidean",
                    narration="Branching into Heuristic Comparison: On a 4-connected grid without diagonals, Manhattan distance is exact. But with 8-way movement, Euclidean distance provides an admissible lower bound that guarantees finding the optimal path.",
                    absorption_pause=1.5,
                )
                self.play_beat(beat_branch, lambda: self.play(ShowCreation(manhattan_path), FadeIn(sub_info), run_time=0.9))
            else:
                is_branch_active[0] = False
                self.play(FadeOut(branch_group), run_time=0.6)
                branch_group.submobjects.clear()

        self.register_branch("default", toggle_branch)
        self.register_branch("ManhattanVsEuclideanBranch", toggle_branch)
        self.register_branch("node_frontier_a", toggle_branch)
        self.register_branch("node_frontier_b", toggle_branch)

        # -------------------------------------------------------------
        # Pinned Minimalist HUD Legend
        # -------------------------------------------------------------
        legend = Text(
            "[Left-Drag: Move/Box-Select Node]  [Right-Drag: Pan Canvas]  [← / →: Step Beats]  [B: Branch]  [Esc: Exit]",
            font="sans-serif",
            color="#A0AAB8",
        ).scale(0.30).to_edge(DOWN, buff=0.25).set_opacity(0.7)
        legend.fix_in_frame()
        self.add(legend)
