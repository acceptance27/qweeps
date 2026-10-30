import {rizalLesson} from '../learning/rizal';
import {aluLesson} from '../learning/alu';
import { productionChapters, productionDuration } from '../learning/production';
export type SceneId =
  | 'jose_rizal'
  | 'alu'
  | 'manim_production'
  | 'astar_heuristic'
  | 'chapter2_pdf'
  | 'neural_net'
  | 'fourier'
  | 'linear_transform'
  | 'riemann_calculus';

export interface SceneBeat {
  id: string;
  startTime: number;
  endTime: number;
  mobjectCall: string;
  title: string;
  description: string;
  cameraState: string;
  valueTrackerState: string;
}

export interface ManimSceneSpec {
  id: SceneId;
  title: string;
  subtitle: string;
  manimClass: string;
  duration: number;
  formulaLatex: string;
  beats: SceneBeat[];
  pythonCode: string;
  aiStudioPrompt: string;
}

export const MANIM_SCENES: Record<SceneId, ManimSceneSpec> = {
  alu: {
    id: 'alu',
    title: aluLesson.title,
    subtitle: aluLesson.question,
    manimClass: 'class ALUScene(ProductionScene):',
    duration: aluLesson.duration,
    formulaLatex: 'ALU: Operands \\to [AND, OR, ADD, XOR] \\to MUX(opcode) \\to Result',
    beats: aluLesson.chapters.map((c: any) => ({
      id: c.id,
      startTime: c.start,
      endTime: c.end,
      title: c.title,
      description: c.narration,
      mobjectCall: c.visual_test,
      cameraState: 'Persistent circuit blackboard',
      valueTrackerState: 'Operands A=1, B=0 fixed; opcode steers the multiplexer'
    })),
    pythonCode: '# Native authored scene: src/assistant/visual/alu_live.py',
    aiStudioPrompt: 'Explain how control lines route inputs through logic gates and adders while operands remain constant.'
  },
  jose_rizal: {
    id:'jose_rizal',title:rizalLesson.title,subtitle:rizalLesson.question,
    manimClass:'class RizalScene(Scene):',duration:rizalLesson.duration,formulaLatex:'History: evidence, chronology and interpretation',
    beats:rizalLesson.chapters.map(c=>({id:c.id,startTime:c.start,endTime:c.end,title:c.title,description:c.narration,mobjectCall:c.visual_test,cameraState:'Persistent native spatial history',valueTrackerState:'Documented dates stay fixed; focus changes the view'})),
    pythonCode:'# Native authored scene: src/assistant/visual/rizal_live.py',aiStudioPrompt:'Use the supplied sourced historical evidence and paused selection. Distinguish influence from leadership, and illustrations from measurements.'
  },
  manim_production: {
    id: 'manim_production', title: 'Making an animation: time, tokens and tradeoffs',
    subtitle: 'An interactive measurement of this Manim project', manimClass: 'class QweepsProduction(MovingCameraScene):',
    duration: productionDuration, formulaLatex: 'cost = fresh input + cached input + output',
    beats: productionChapters.map((title,i)=>({id:`production_${i}`,startTime:i*20,endTime:(i+1)*20,title,
      description:'Explore the recorded production data and the explicitly labeled cost scenario.',
      mobjectCall:'Transform the same recorded observations into the representation needed for this question.',
      cameraState:'Persistent blackboard; user-selected evidence and experiment retained',valueTrackerState:'Recorded scope and what-if controls'})),
    pythonCode:`# Export the current measurement and experiment using the Manim source button.
# The native source uses the same numeric report, with no model-generated executable code.`,
    aiStudioPrompt:'Use the current recorded production data, selected evidence and scenario. Separate measured records, detection bounds and hypothetical cost. Do not invent an invoice or thinking-time breakdown.'
  },
  astar_heuristic: {
    id: 'astar_heuristic',
    title: 'Algorithm: A* Pathfinding & Heuristics',
    subtitle: 'MovingCameraScene + 3B1B Pacing: Euclidean vs Manhattan Admissibility, Dynamic Frontier, and f(n) = g(n) + h(n)',
    manimClass: 'class AStarHeuristicExplainer(MovingCameraScene):',
    duration: 25.0,
    formulaLatex: 'f(n) = g(n) + h(n) \\;\\longrightarrow\\; h(n) = \\sqrt{\\Delta x^2 + \\Delta y^2} \\le h^*(n)',
    beats: [
      {
        id: 'arena_setup',
        startTime: 0.0,
        endTime: 5.0,
        mobjectCall: 'Create(NumberPlane) + FadeIn(start_node: S, goal_node: G)',
        title: 'Beat 1: The Arena & Discrete Grid (Start S & Goal G)',
        description: 'Constructs the Manim coordinate grid with Start node S (in Manim GREEN_C) and Goal node G (in Manim RED_C). Pauses 1.5s for visual registration.',
        cameraState: 'frame.center=(-0.20, 0.50), width=14.22',
        valueTrackerState: 'Start=(−4.0, −1.5), Goal=(+3.5, +2.0)',
      },
      {
        id: 'dijkstra_blindness',
        startTime: 5.0,
        endTime: 9.5,
        mobjectCall: 'Create(dijkstra_wave: BLUE_E) + Indicate(g_cost_only)',
        title: "Beat 2: Dijkstra's Blind Expansion (g(n) Alone)",
        description: 'Visualizes uniform-cost expansion expanding equally in all directions without directional awareness of the goal. Pauses 1.5s.',
        cameraState: 'frame.center=(-0.20, 0.50), width=14.22',
        valueTrackerState: 'Expansion radius=2.5, g(n) uniform cost',
      },
      {
        id: 'heuristic_vector',
        startTime: 9.5,
        endTime: 15.0,
        mobjectCall: 'Create(h_arrow: YELLOW_C) + Create(dx_dy_triangle: DashedLine)',
        title: 'Beat 3: The Heuristic Vector h(n) = √(Δx² + Δy²)',
        description: 'Draws candidate node A (BLUE_C) and projects the Euclidean distance vector arrow directly toward the goal G, showing delta x and delta y dashed components.',
        cameraState: 'frame.center=(-0.20, 0.50), width=14.22',
        valueTrackerState: 'dx=7.5, dy=3.5, h(A)=√(7.5² + 3.5²)=8.28',
      },
      {
        id: 'frontier_evaluation',
        startTime: 15.0,
        endTime: 20.0,
        mobjectCall: 'FadeIn(candidate_B: YELLOW_D) + Write(f_score_table)',
        title: 'Beat 4: Evaluating the Frontier: f(n) = g(n) + h(n)',
        description: 'Compares Candidate Node A (f = 6.47, lowest cost, prioritized) vs Candidate Node B (f = 8.08, moving away, held back). Highlights optimal choice.',
        cameraState: 'frame.center=(-0.20, 0.50), width=14.22',
        valueTrackerState: 'Node A f=6.47 [PRIORITIZED], Node B f=8.08 [HELD]',
      },
      {
        id: 'admissibility_branch',
        startTime: 20.0,
        endTime: 25.0,
        mobjectCall: 'Transform(h_arrow, manhattan_staircase: ORANGE) + Indicate(admissibility_rule)',
        title: 'Beat 5: Admissibility & Manhattan vs Euclidean Branch',
        description: 'Visualizes 4-connected Manhattan grid path (|Δx| + |Δy| = 11.0) vs straight-line Euclidean hypotenuse (8.28). Explains why h(n) <= h*(n) guarantees optimality.',
        cameraState: 'frame.center=(-0.20, 0.50), width=14.22',
        valueTrackerState: 'Manhattan=11.0, Euclidean=8.28 <= True Shortest Path',
      },
    ],
    pythonCode: `from manim import *

class AStarHeuristicExplainer(MovingCameraScene):
    def construct(self):
        # Beat 1: Grid Arena setup
        grid = NumberPlane(x_range=[-7, 7, 1], y_range=[-4, 4, 1], background_line_style={"stroke_color": GREY_E, "stroke_width": 1})
        start_node = Dot(point=[-4.0, -1.5, 0], radius=0.28, color=GREEN_C)
        start_label = Text("S", font="sans-serif", color=BLACK).scale(0.5).move_to(start_node)
        goal_node = Dot(point=[3.5, 2.0, 0], radius=0.28, color=RED_C)
        goal_label = Text("G", font="sans-serif", color=BLACK).scale(0.5).move_to(goal_node)
        self.play(Create(grid), FadeIn(VGroup(start_node, start_label)), FadeIn(VGroup(goal_node, goal_label)))
        self.wait(1.5)

        # Beat 2: Dijkstra's Blind Wave
        wave = Circle(radius=2.5, color=BLUE_E, stroke_width=2).move_to(start_node)
        self.play(Create(wave))
        self.wait(1.5)
        self.play(FadeOut(wave))

        # Beat 3: Heuristic Vector h(n)
        node_a = Dot(point=[-1.0, 0.0, 0], radius=0.25, color=BLUE_C)
        h_arrow = Arrow(node_a.get_center(), goal_node.get_center(), buff=0.3, color=YELLOW_C, stroke_width=3)
        self.play(FadeIn(node_a), Create(h_arrow))
        self.wait(1.5)

        # Beat 4: Frontier Evaluation
        node_b = Dot(point=[-3.0, 1.0, 0], radius=0.25, color=YELLOW_D)
        self.play(FadeIn(node_b))
        self.wait(1.5)`,
    aiStudioPrompt: `Create an interactive 3Blue1Brown MovingCameraScene for A* Pathfinding Heuristics:
1. Pure #000000 canvas with crisp NumberPlane grid lines.
2. Start node S (GREEN_C) and Goal G (RED_C).
3. Dijkstra's blind uniform-cost expansion wave (BLUE_E).
4. Euclidean heuristic arrow h(n) in YELLOW_C connecting candidate frontier node A (BLUE_C) directly to Goal G.
5. Contrast with sub-optimal candidate B (YELLOW_D), calculating f(n) = g(n) + h(n).
6. Branch into 4-connected Manhattan distance vs 8-way Euclidean admissibility rule h(n) <= h*(n).`,
  },
  chapter2_pdf: {
    id: 'chapter2_pdf',
    title: 'PDF Explainer: Ch. 2 Entrepreneurs & Competencies',
    subtitle: 'Full 4-Lesson MovingCameraScene adapting your 53-page PDF into 3Blue1Brown vector geometry, matrices, and curves',
    manimClass: 'class Chapter2EntrepreneurshipScene(MovingCameraScene):',
    duration: 30.0,
    formulaLatex: 'E = f(\\text{Resources}, \\vec{F}_{\\text{drive}}, \\text{Risk}_{\\text{calc}}) \\;\\longrightarrow\\; \\text{Growth} = \\text{Responsibility}',
    beats: [
      {
        id: 'ch2_perspectives',
        startTime: 0.0,
        endTime: 5.2,
        mobjectCall: 'Write(title) + Create(triad_graph: Economist, Psychologist, Management)',
        title: 'Lesson 1A: 3 Perspectives on Entrepreneurs (Pages 1–6)',
        description: 'Writes Chapter 2 header and constructs a 3-vector triad converging on the Entrepreneur node: Economist (resources + innovation → new order), Psychologist (inner drive & autonomy), and Management (opportunity, planning & calculated risk).',
        cameraState: 'frame.center=(-2.60, +0.20), width=13.50',
        valueTrackerState: 'Lesson 1 (Slides 1–6): 3 Perspectives Triad',
      },
      {
        id: 'ch2_past_today',
        startTime: 5.2,
        endTime: 10.5,
        mobjectCall: 'self.camera.frame.animate.move_to(RIGHT * 2.8) + ReplacementTransform(past_col, today_col)',
        title: 'Lesson 1B: Past vs. 21st Century Era Matrix (Pages 7–9)',
        description: 'Camera pans right to the 8-dimension comparison table. Vector arrows transform from Past (Older, Male-dominated, Rigid, Directing, "I can do it") to Today (Younger, Mixed ownership, Flexible, Empowering, "We can do it").',
        cameraState: 'frame.center=(+2.85, +0.20), width=13.80',
        valueTrackerState: 'Lesson 1 (Slides 7–9): 8 Era Shift Dimensions',
      },
      {
        id: 'ch2_characteristics',
        startTime: 10.5,
        endTime: 16.2,
        mobjectCall: 'self.camera.frame.animate.move_to(DOWN * 5.2 + LEFT * 2.5) + Create(radar_10_traits) + Create(risk_curve)',
        title: 'Lesson 1C: 10 Personal Characteristics & Calculated Risk (Pages 10–27)',
        description: 'Camera pans down to the 10-Trait Competency Radar (Calculated Risk-Taking, Commitment, Feedback Seeking, Perseverance, Drive, Self-Confidence, Opportunity, Innovativeness, Responsibility, Tolerance for Failure) and plots the Odds-in-Favor curve.',
        cameraState: 'frame.center=(-2.50, -5.20), width=13.80',
        valueTrackerState: 'Lesson 1 (Slides 10–27): 10 Traits & P(Success)',
      },
      {
        id: 'ch2_how_think',
        startTime: 16.2,
        endTime: 20.8,
        mobjectCall: 'self.camera.frame.animate.move_to(DOWN * 5.2 + RIGHT * 2.9) + ShowPassingFlash(decision_loop)',
        title: 'Lesson 2: How Entrepreneurs Think (Pages 28–31)',
        description: 'Constructs the 3-step cognitive loop: (1) Actuate Self-Assessment → (2) Generate Multiple Decision Models (M₁, M₂, M₃) → (3) Learn from Failure feedback trajectory converging on the target.',
        cameraState: 'frame.center=(+2.90, -5.20), width=13.60',
        valueTrackerState: 'Lesson 2 (Slides 28–31): 3-Step Cognitive Loop',
      },
      {
        id: 'ch2_emotional_portfolio',
        startTime: 20.8,
        endTime: 25.4,
        mobjectCall: 'self.camera.frame.animate.move_to(DOWN * 10.5 + LEFT * 2.5) + Create(camuffo_2x2_matrix)',
        title: 'Lesson 3: Emotional Competencies Portfolio (Pages 32–41)',
        description: 'Plots the Camuffo, Gerli & Gubitta (2012) Emotional Competency 2×2 Matrix: Self-Awareness (Reality vs. Lion Mirror), Self-Management (7-step execution cycle), Social Awareness, and Relationship Management.',
        cameraState: 'frame.center=(-2.50, -10.50), width=13.80',
        valueTrackerState: 'Lesson 3 (Slides 32–41): Camuffo et al. (2012)',
      },
      {
        id: 'ch2_decision_styles',
        startTime: 25.4,
        endTime: 30.0,
        mobjectCall: 'self.camera.frame.animate.move_to(DOWN * 10.5 + RIGHT * 2.9) + Indicate(responsibility_maxim)',
        title: 'Lesson 4: 8 Decision-Making Styles & Growth Maxim (Pages 42–51)',
        description: 'Maps the 8 Decision-Making Mechanisms (Rational, Intuition, Affect Infusion, Attributional, Counterfactual, Over-Confidence trap, Knowing vs. Creative Style) and Indicates the closing maxim: "Your Growth Is Your Responsibility."',
        cameraState: 'frame.center=(+2.90, -10.50), width=13.80',
        valueTrackerState: 'Lesson 4 (Slides 42–51): 8 Styles + Final Maxim',
      },
    ],
    pythonCode: `from manim import *
import numpy as np

# Complete ManimCE script for Chapter 2: Entrepreneurs & Entrepreneurial Competencies
# Follows browser-use/manim-video skill rules:
# - Pure #000000 canvas, zero neon shadowBlur, official Manim palette
# - Spatial 2x3 grid of concept zones navigated smoothly via MovingCameraScene

class Chapter2EntrepreneurshipScene(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"
        self.camera.frame.save_state()

        # =====================================================================
        # BEAT 1 (Lesson 1A, Slides 1-6): 3 Perspectives Triad at (-2.6, +0.2)
        # =====================================================================
        header = Tex(r"Chapter 2: Entrepreneurs \\& Competencies", font_size=34, color=WHITE)
        header.move_to( np.array([-2.6, 2.8, 0]) )
        center_node = Circle(radius=0.55, color=WHITE, fill_color=BLACK, fill_opacity=1, stroke_width=2.5)
        center_node.move_to(np.array([-2.6, 0.0, 0]))
        center_lbl = Tex(r"Entrepreneur\\\\$E$", font_size=24, color=WHITE).move_to(center_node)

        perspectives = [
            ("Economist", r"Resources + Innovation $\\to$ New Order", BLUE_C, np.array([-5.2, 1.3, 0])),
            ("Psychologist", r"Inner Drive $\\vec{F}$ \\& Autonomy", YELLOW_C, np.array([-5.2, -1.3, 0])),
            ("Management", r"Opportunity $\\to$ Plan $\\to$ Risk", TEAL_C, np.array([-0.1, 0.0, 0])),
        ]
        triad_group = VGroup(header, center_node, center_lbl)
        for title_str, sub_str, col, pos in perspectives:
            box = RoundedRectangle(width=2.5, height=1.0, corner_radius=0.08, color=col, stroke_width=2.0).move_to(pos)
            txt = Tex(f"\\textbf{{{title_str}}}\\\\\\footnotesize {sub_str}", font_size=22, color=col).move_to(pos)
            arr = Arrow(box.get_center(), center_node.get_center(), buff=0.65, color=col, stroke_width=2.0)
            triad_group.add(box, txt, arr)

        self.camera.frame.move_to(np.array([-2.6, 0.2, 0]))
        self.play(Write(header), Create(center_node), Write(center_lbl), run_time=1.5)
        self.play(LaggedStartMap(FadeIn, triad_group[3:], lag_ratio=0.15), run_time=3.0, rate_func=smooth)

        # =====================================================================
        # BEAT 2 (Lesson 1B, Slides 7-9): Past vs. Today Matrix at (+2.85, +0.2)
        # =====================================================================
        matrix_origin = np.array([2.85, 0.2, 0])
        era_title = Tex(r"21st Century Shift: Past $\\longrightarrow$ Today", font_size=32, color=YELLOW_C)
        era_title.move_to(matrix_origin + UP * 2.6)
        we_box = SurroundingRectangle(era_title, color=GREEN_C, buff=0.15, stroke_width=2.2)

        self.play(
            self.camera.frame.animate.move_to(matrix_origin),
            Write(era_title),
            Create(we_box),
            run_time=2.5,
            rate_func=smooth,
        )
        self.wait(2.2)

        # =====================================================================
        # BEAT 3 (Lesson 1C, Slides 10-27): 10 Personal Characteristics & Risk Curve
        # =====================================================================
        traits_origin = np.array([-2.5, -5.2, 0])
        ax = Axes(x_range=[0, 8, 2], y_range=[0, 100, 25], x_length=4.5, y_length=3.0).move_to(traits_origin + RIGHT * 1.2)
        calc_curve = ax.plot(lambda x: 92 / (1 + np.exp(-0.85 * (x - 3.0))), color=GREEN_C, stroke_width=3.0)
        blind_curve = ax.plot(lambda x: 70 * np.exp(-0.45 * x) + 10, color=RED_C, stroke_width=2.2)

        self.play(
            self.camera.frame.animate.move_to(traits_origin),
            Create(ax),
            Create(calc_curve),
            Create(blind_curve),
            run_time=3.0,
            rate_func=smooth,
        )
        self.wait(2.2)

        # =====================================================================
        # BEAT 4 (Lesson 2, Slides 28-31): How Entrepreneurs Think Loop
        # =====================================================================
        think_origin = np.array([2.9, -5.2, 0])
        self.play(self.camera.frame.animate.move_to(think_origin), run_time=2.2, rate_func=smooth)
        self.wait(2.2)

        # =====================================================================
        # BEAT 5 (Lesson 3, Slides 32-41): Camuffo et al. (2012) Emotional 2x2
        # =====================================================================
        emo_origin = np.array([-2.5, -10.5, 0])
        self.play(self.camera.frame.animate.move_to(emo_origin), run_time=2.2, rate_func=smooth)
        self.wait(2.2)

        # =====================================================================
        # BEAT 6 (Lesson 4, Slides 42-51): 8 Decision Styles & Responsibility Maxim
        # =====================================================================
        dec_origin = np.array([2.9, -10.5, 0])
        maxim = Tex(r'"Your Growth Is Your Responsibility."', font_size=36, color=GREEN_C).move_to(dec_origin + DOWN * 2.1)
        self.play(self.camera.frame.animate.move_to(dec_origin), Write(maxim), run_time=2.2, rate_func=smooth)
        self.play(Indicate(maxim, color=YELLOW_C, scale_factor=1.18), run_time=1.8)`,
    aiStudioPrompt: `Convert the 53-page PDF "Chapter 2: Entrepreneurs and Entrepreneurial Competencies" into a single 3Blue1Brown Manim MovingCameraScene arranged on a 2x3 spatial canvas in Manim coordinates:
- Zone 1 (-2.6, +0.2): Lesson 1A — 3 Perspectives Triad (Economist in BLUE_C, Psychologist in YELLOW_C, Management in TEAL_C converging on Entrepreneur E).
- Zone 2 (+2.85, +0.2): Lesson 1B — 21st Century Shift Matrix transforming 8 dimensions from Past (RED_C) to Today (GREEN_C), highlighting "I can do it" -> "We can do it".
- Zone 3 (-2.5, -5.2): Lesson 1C — 10 Personal Characteristics Radar Polygon & Calculated Risk-Taking vs. Unnecessary Risk probability curve (Elon Musk, Socorro Ramos, Thomas Edison, Bill Gates).
- Zone 4 (+2.9, -5.2): Lesson 2 — How Entrepreneurs Think 3-stage state machine: (1) Self-Assessment -> (2) Multiple Decision Models (M1, M2, M3) -> (3) Learn from Failure feedback loop.
- Zone 5 (-2.5, -10.5): Lesson 3 — Camuffo, Gerli & Gubitta (2012) Emotional Competencies 2x2 Quadrant (Self-Awareness, Self-Management, Social Awareness, Relationship Management).
- Zone 6 (+2.9, -10.5): Lesson 4 — 8 Decision-Making Styles (Rational, Intuition, Affect Infusion, Attributional, Counterfactual, Over-Confidence, Knowing, Creative) ending with Indicate() on "Your Growth Is Your Responsibility."`,
  },

  neural_net: {
    id: 'neural_net',
    title: 'Math 01: Neural Net & Loss Curve',
    subtitle: 'browser-use/manim-video pipeline: MovingCameraScene + ValueTracker + always_redraw + c2p() coordinate mapping',
    manimClass: 'class NeuralNetExplainer(MovingCameraScene):',
    duration: 24.0,
    formulaLatex: 'L(\\mathbf{w}) = \\frac{1}{N}\\sum_{i=1}^{N} \\left(\\hat{y}_i - y_i\\right)^2 \\;\\longrightarrow\\; \\text{Accuracy } 97.4\\%',
    beats: [
      {
        id: 'write_header',
        startTime: 0.0,
        endTime: 3.2,
        mobjectCall: 'Write(question) → Transform(question, header)',
        title: 'Write Question & Transform to Header',
        description: 'LaTeX serif question writes onto pure #000000 canvas, then smoothly scales and translates to UL safe-zone header (buff=0.45) with a crisp rule.',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'sample_tracker=0, epoch_tracker=0.0',
      },
      {
        id: 'create_net',
        startTime: 3.2,
        endTime: 6.8,
        mobjectCall: 'LaggedStartMap(Create, layers) + Create(edges, lag_ratio=0.01)',
        title: 'Create Neural Network (Blue/Red by Weight Sign)',
        description: '4-layer MLP constructs inside left safe zone; synaptic edges colored Manim BLUE_C (#58C4DD) for positive weights and RED_C (#FC6255) for negative weights.',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'sample_tracker=1, w_recolor=0.00',
      },
      {
        id: 'fly_pixels',
        startTime: 6.8,
        endTime: 10.2,
        mobjectCall: 'sample_tracker.animate.set_value(128) + LaggedStart(*pixel_flights)',
        title: 'Pixel Matrices Fly In & ValueTracker Counter Climbs',
        description: '28×28 grayscale pixel grids fly along bezier arcs into input neurons while DecimalNumber bound via add_updater to sample_tracker climbs to 128.',
        cameraState: 'frame.center=(-0.45, -0.10), width=13.65',
        valueTrackerState: 'sample_tracker: 1 → 128',
      },
      {
        id: 'forward_flash',
        startTime: 10.2,
        endTime: 13.6,
        mobjectCall: 'ShowPassingFlash(edges, time_width=0.35) + SurroundingRectangle(wrong_label, color=RED_C)',
        title: 'Forward Pass Flash & Red SurroundingRectangle on "dog?"',
        description: 'Signal pulses propagate layer-by-layer via ShowPassingFlash. Output predicts "dog? (0.74)" instead of "cat", framed by a sharp Manim SurroundingRectangle and curly Brace.',
        cameraState: 'frame.center=(+0.35, -0.15), width=13.50',
        valueTrackerState: 'y_hat=[0.18, 0.74, 0.08], loss=0.82',
      },
      {
        id: 'camera_pan_loss',
        startTime: 13.6,
        endTime: 18.4,
        mobjectCall: 'self.camera.frame.animate.move_to(RIGHT * 2.75) + epoch_tracker.animate.set_value(9.0)',
        title: 'Camera Pans to Loss Curve; Dot Descends via axes.c2p()',
        description: 'MovingCameraScene pans smoothly right (rate_func=smooth) to ticked Axes. A YELLOW_C always_redraw dot tracks axes.c2p(t, L(t)) with tangent vector -∇L while edges re-color.',
        cameraState: 'frame.center=(+2.75, -0.12), width=16.10',
        valueTrackerState: 'epoch_tracker: 0.5 → 9.0, L(w): 0.84 → 0.11',
      },
      {
        id: 'transform_accuracy',
        startTime: 18.4,
        endTime: 21.5,
        mobjectCall: 'ReplacementTransform(loss_label, acc_label) + Transform(loss_curve, acc_curve)',
        title: 'Axes Relabel to Accuracy & Curve Climbs',
        description: 'Y-axis label transforms from Loss L(w) to Validation Accuracy (%). The descending curve morphs into an ascending logistic learning curve.',
        cameraState: 'frame.center=(+3.35, -0.08), width=15.10',
        valueTrackerState: 'mode="accuracy", A(t): 18.0% → 97.4%',
      },
      {
        id: 'indicate_97',
        startTime: 21.5,
        endTime: 24.0,
        mobjectCall: 'ReplacementTransform(counter, acc_tex) + Indicate(acc_tex, color=YELLOW_C, scale_factor=1.22)',
        title: 'Number Transforms into 97.4% & Indicates',
        description: 'Final readout reaches 97.4% in Manim GREEN_C (#83C167) and executes a classic Manim Indicate() scale-and-yellow-highlight pulse.',
        cameraState: 'frame.center=(+2.35, -0.08), width=16.30',
        valueTrackerState: 'accuracy_final=97.4% (Indicate active)',
      },
    ],
    pythonCode: `from manim import *
import numpy as np

class NeuralNetExplainer(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"
        self.camera.frame.save_state()

        question = Tex(r"How does a neural network learn to see?", font_size=46, color=WHITE)
        self.play(Write(question), run_time=1.7)

        header = question.copy().scale(0.62).to_corner(UL, buff=0.45)
        rule = Line(header.get_left(), header.get_right(), color=GREY_C, stroke_width=1.5).next_to(header, DOWN, buff=0.12)
        self.play(Transform(question, header), Create(rule), run_time=1.4, rate_func=smooth)

        layer_sizes = [6, 5, 4, 3]
        layers = VGroup(*[
            VGroup(*[
                Circle(radius=0.19, color=WHITE, fill_color=BLACK, fill_opacity=1.0, stroke_width=2.2)
                for _ in range(n)
            ]).arrange(DOWN, buff=0.34)
            for n in layer_sizes
        ]).arrange(RIGHT, buff=1.35).move_to(LEFT * 1.65 + DOWN * 0.35)

        edges = VGroup()
        for l_idx, (l1, l2) in enumerate(zip(layers[:-1], layers[1:])):
            for i, n1 in enumerate(l1):
                for j, n2 in enumerate(l2):
                    sign = 1 if (l_idx * 7 + i * 3 + j * 2) % 3 != 0 else -1
                    edge = Line(n1.get_center(), n2.get_center(), color=BLUE_C if sign > 0 else RED_C, stroke_width=1.65, stroke_opacity=0.65)
                    edges.add(edge)

        self.play(LaggedStartMap(Create, layers, lag_ratio=0.15), Create(edges, lag_ratio=0.01), run_time=3.2, rate_func=smooth)`,
    aiStudioPrompt: `Follow the browser-use/manim-video skill pipeline to render a 3Blue1Brown MovingCameraScene neural network animation on #000000 with zero neon glow.`,
  },

  fourier: {
    id: 'fourier',
    title: 'Math 02: Fourier Epicycles',
    subtitle: 'Rotating phasor vectors tip-to-tail with smooth MovingCameraScene zoom into high-frequency harmonic circles',
    manimClass: 'class FourierEpicyclesScene(MovingCameraScene):',
    duration: 18.0,
    formulaLatex: 'f(t) = \\sum_{n=-N}^{N} c_n e^{i 2\\pi n t}, \\quad c_n = \\int_0^1 f(t)e^{-i 2\\pi n t}\\,dt',
    beats: [
      {
        id: 'fourier_axes',
        startTime: 0.0,
        endTime: 3.5,
        mobjectCall: 'Create(ComplexPlane) + Write(formula)',
        title: 'Create Complex Plane & Fourier Series Formula',
        description: 'Draws subtle ComplexPlane grid with Re/Im axes and writes the complex exponential sum formula in the top safe zone.',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'phase_tracker=0.00 rad, N_harmonics=6',
      },
      {
        id: 'fourier_vectors',
        startTime: 3.5,
        endTime: 8.5,
        mobjectCall: 'Create(circles) + always_redraw(tip_to_tail_vectors)',
        title: 'Construct Tip-to-Tail Rotating Phasors',
        description: 'Harmonic circles (BLUE_C) and rotating tip-to-tail vectors (WHITE/YELLOW_C) begin tracing the square-wave approximation via TracedPath.',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'phase_tracker: 0.0 → 5.75 rad',
      },
      {
        id: 'fourier_zoom',
        startTime: 8.5,
        endTime: 13.5,
        mobjectCall: 'self.camera.frame.animate.scale(0.55).move_to(epicycle_center)',
        title: 'Camera Zooms into Outer Epicycles',
        description: 'MovingCameraScene smoothly zooms into the rotating cluster to inspect higher-order odd harmonics (n = 3, 5, 7, 9, 11).',
        cameraState: 'frame.center=(-2.60, -0.25), width=8.25',
        valueTrackerState: 'phase_tracker: 5.75 → 11.50 rad',
      },
      {
        id: 'fourier_restore',
        startTime: 13.5,
        endTime: 18.0,
        mobjectCall: 'Restore(self.camera.frame) + Indicate(waveform)',
        title: 'Restore(self.camera.frame) & Converged Waveform',
        description: 'Camera smoothly restores to saved state, connecting the tip with a horizontal dashed projection line to the time-domain wave.',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'phase_tracker: 11.50 → 16.50 rad',
      },
    ],
    pythonCode: `from manim import *
import numpy as np

class FourierEpicyclesScene(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"
        self.camera.frame.save_state()`,
    aiStudioPrompt: `Render a Manim MovingCameraScene of Fourier Series epicycles on pure #000000 canvas following browser-use/manim-video rules.`,
  },

  linear_transform: {
    id: 'linear_transform',
    title: 'Math 03: Linear Transform',
    subtitle: '2D NumberPlane grid warp with i-hat (GREEN_C), j-hat (RED_C), unit determinant area (YELLOW_C), and invariant eigen-spans',
    manimClass: 'class EigenvectorScene(LinearTransformationScene):',
    duration: 18.0,
    formulaLatex: 'A\\vec{v} = \\lambda\\vec{v}, \\quad A = \\begin{bmatrix} 1.6 & 0.6 \\\\ 0.6 & 1.6 \\end{bmatrix}, \\quad \\det(A) = 2.20',
    beats: [
      {
        id: 'grid_init',
        startTime: 0.0,
        endTime: 4.0,
        mobjectCall: 'Create(background_plane) + Create(foreground_plane) + GrowArrow(i_hat, j_hat)',
        title: 'Construct Dual NumberPlanes & Basis Vectors î, ĵ',
        description: 'Faint static reference grid (#2A2A2A) plus active BLUE_C grid (#58C4DD) with unit basis arrows î (GREEN_C) and ĵ (RED_C).',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'matrix_interp=0.00 (Identity I₂)',
      },
      {
        id: 'eigenspan_draw',
        startTime: 4.0,
        endTime: 8.0,
        mobjectCall: 'Create(eigen_lines) + FadeIn(unit_square, color=YELLOW_C)',
        title: 'Highlight Unit Determinant Square & Eigenvector Spans',
        description: 'Draws the translucent YELLOW_C unit area square (Area = 1.00) and diagonal eigenvector span lines v₁ = [1, 1]ᵀ and v₂ = [-1, 1]ᵀ.',
        cameraState: 'frame.center=(0.0, 0.0), width=14.22',
        valueTrackerState: 'det(I)=1.00, λ₁=1.0, λ₂=1.0',
      },
      {
        id: 'apply_matrix',
        startTime: 8.0,
        endTime: 13.5,
        mobjectCall: 'self.apply_matrix([[1.6, 0.6], [0.6, 1.6]], run_time=4.0, rate_func=smooth)',
        title: 'Apply Linear Transformation Matrix A',
        description: 'Entire active NumberPlane smoothly shears and scales; off-span vectors rotate, while vectors on the TEAL_C eigen-lines stay strictly on their span.',
        cameraState: 'frame.center=(+0.35, +0.15), width=16.10',
        valueTrackerState: 'matrix_interp: 0.0 → 1.0, det(A): 1.00 → 2.20',
      },
      {
        id: 'indicate_det',
        startTime: 13.5,
        endTime: 18.0,
        mobjectCall: 'SurroundingRectangle(matrix_tex) + Indicate(det_label)',
        title: 'Verify Eigenvalue Stretch (λ₁ = 2.2, λ₂ = 1.0)',
        description: 'SurroundingRectangle frames the transformed parallelogram area det(A) = 2.20 with crisp LaTeX annotations.',
        cameraState: 'frame.center=(+0.35, +0.15), width=16.10',
        valueTrackerState: 'det(A)=2.20, λ₁=2.20, λ₂=1.00',
      },
    ],
    pythonCode: `from manim import *

class EigenvectorScene(LinearTransformationScene):
    def construct(self):
        self.camera.background_color = "#000000"`,
    aiStudioPrompt: `Render a 3Blue1Brown LinearTransformationScene on #000000.`,
  },

  riemann_calculus: {
    id: 'riemann_calculus',
    title: 'Math 04: Riemann Calculus',
    subtitle: 'Refining dx rectangles under f(x) with curly Brace annotations and camera pan to the accumulation curve F(x)',
    manimClass: 'class RiemannIntegralScene(MovingCameraScene):',
    duration: 18.0,
    formulaLatex: '\\lim_{\\Delta x \\to 0} \\sum_{i=1}^{n} f(x_i)\\,\\Delta x = \\int_{a}^{b} f(x)\\,dx = F(b) - F(a)',
    beats: [
      {
        id: 'riemann_axes',
        startTime: 0.0,
        endTime: 4.0,
        mobjectCall: 'Create(axes) + Create(graph, color=BLUE_C)',
        title: 'Plot Function Curve f(x) on Ticked Coordinate Axes',
        description: 'Draws crisp orthogonal axes with numbered ticks and plots f(x) in Manim BLUE_C.',
        cameraState: 'frame.center=(-1.20, -0.10), width=13.90',
        valueTrackerState: 'N_partitions=0, dx=0.68',
      },
      {
        id: 'riemann_coarse',
        startTime: 4.0,
        endTime: 9.0,
        mobjectCall: 'Create(rects_n6) + GrowFromCenter(brace_dx)',
        title: 'Coarse Riemann Rectangles (N = 6) & Δx Brace',
        description: 'Constructs translucent BLUE_D/GREEN_C rectangles via axes.get_riemann_rectangles() and a curly underbrace labeling width Δx.',
        cameraState: 'frame.center=(-1.65, -0.10), width=12.70',
        valueTrackerState: 'N=6, dx=0.683, Area≈9.312',
      },
      {
        id: 'riemann_refine',
        startTime: 9.0,
        endTime: 14.0,
        mobjectCall: 'ReplacementTransform(rects_n6, rects_n16) → ReplacementTransform(rects_n16, rects_n96)',
        title: 'Refine Partitions (N = 6 → 16 → 96) as Δx → dx',
        description: 'Rectangles smoothly subdivide and converge to the exact area under the curve while the Riemann sum readout converges.',
        cameraState: 'frame.center=(-1.00, -0.10), width=14.50',
        valueTrackerState: 'N: 6 → 16 → 96, Area→9.413',
      },
      {
        id: 'riemann_ftc',
        startTime: 14.0,
        endTime: 18.0,
        mobjectCall: 'self.camera.frame.animate.move_to(RIGHT * 1.65) + Create(antiderivative_curve)',
        title: 'Camera Pans to Antiderivative F(x) & Highlights FTC',
        description: 'Camera pans right to reveal the accumulation curve F(x) whose slope dF/dx equals the height f(x).',
        cameraState: 'frame.center=(+1.65, -0.10), width=16.10',
        valueTrackerState: 'F(b) - F(a) = 9.420 (Exact FTC)',
      },
    ],
    pythonCode: `from manim import *

class RiemannIntegralScene(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"`,
    aiStudioPrompt: `Render a Manim MovingCameraScene for Riemann integration on #000000.`,
  },
};
