"""Native ManimGL scene for the ALU (Arithmetic Logic Unit) visual lesson.

Demonstrates how control lines select between competing parallel arithmetic
and logic operations while operands remain constant on shared distribution busses.
"""
from bisect import bisect_right
import json
from pathlib import Path
import numpy as np
from manimlib import *
from .native_live import ProductionScene, words, INK, MUTED, BLUE, GOLD, PURPLE, GREEN, RED

ALU_MANIFEST_PATH = Path(__file__).resolve().parents[3] / "visual-studio/public/lessons/alu.json"

ALU_DEFAULTS = {
    "a": 1,
    "b": 0,
    "opcode": "ADD"
}

def stroke(m, color=INK, width=2, fill=0):
    return m.set_stroke(color, width).set_fill(color, fill)

def path(points, color=INK, width=2):
    return stroke(VMobject().set_points_as_corners([np.array(p, float) for p in points]), color, width)

def curved_path(points, color=INK, width=2):
    return stroke(VMobject().set_points_smoothly([np.array(p, float) for p in points]), color, width)

class ALUScene(ProductionScene):
    def __init__(self, manifest=None):
        if manifest is None:
            if ALU_MANIFEST_PATH.exists():
                manifest = json.loads(ALU_MANIFEST_PATH.read_text())
            else:
                manifest = {"duration": 82.69, "chapters": []}
        self.manifest = manifest
        self.lesson_id = "alu"
        self.duration = manifest.get("duration", 82.69)
        self.chapter_titles = [c["title"] for c in manifest.get("chapters", [])]
        if not self.chapter_titles:
            self.chapter_titles = [
                "Operands & Distribution Bus",
                "Parallel Arithmetic & Logic Units",
                "The Control Opcode",
                "Multiplexer Routing to Result Bus",
                "Switching the Operation (ADD → AND)"
            ]
        self.starts = [c.get("start", i * 16.0) for i, c in enumerate(manifest.get("chapters", []))]
        if not self.starts:
            self.starts = [0.0, 18.2, 34.88, 50.92, 67.29]

        super(ProductionScene, self).__init__(
            camera_config={
                "resolution": (1280, 720),
                "fps": 30,
                "background_color": "#05070B",
                "max_allowable_norm": 1000
            },
            file_writer_config={"write_to_movie": False}
        )
        self.report = {}
        self.svg_path = ""
        self.settings = None
        self.tracks = []
        self.roles = {}
        self.previous_time = -1
        self.last_alphas = {}
        self.header = words("QWEEPS · NATIVE MANIMGL", 18, BLUE).to_corner(UL, buff=0.3).fix_in_frame()
        self.chapter_label = words(self.chapter_titles[0], 26).move_to(UP * 3.25).fix_in_frame()
        self.select_group = VGroup()
        self.active_chapter = 0
        self.build(ALU_DEFAULTS)

    def chapter_at(self, t):
        if not self.starts:
            return 0
        idx = bisect_right(self.starts, t) - 1
        return min(len(self.chapter_titles) - 1, max(0, idx))

    def validate_settings(self, raw):
        if not isinstance(raw, dict):
            return dict(ALU_DEFAULTS)
        a = 1 if int(raw.get("a", 1)) != 0 else 0
        b = 1 if int(raw.get("b", 0)) != 0 else 0
        op = str(raw.get("opcode", "ADD")).upper()
        if op not in ("ADD", "AND", "OR", "XOR"):
            op = "ADD"
        return {"a": a, "b": b, "opcode": op}

    def cue(self, ch_idx, cue_idx):
        chapters = self.manifest.get("chapters", [])
        if ch_idx < len(chapters):
            ch = chapters[ch_idx]
            cues = ch.get("cues", [])
            if cue_idx < len(cues):
                return ch.get("start", 0.0) + cues[cue_idx].get("at", 0.0)
        return self.starts[min(ch_idx, len(self.starts) - 1)] + cue_idx * 4.0

    def show(self, mobject, start, duration=1.0):
        self.add(mobject)
        self.track(start, duration, ShowCreation(mobject))

    def caption(self, text, center, start, size=20, color=INK):
        label = words(text, size, color).move_to(center)
        self.add(label)
        self.track(start, 0.8, Write(label))
        return label

    def build(self, raw):
        s = self.validate_settings(raw)
        self.settings = s
        self.tracks = []
        self.roles = {}
        self.last_alphas = {}
        self.previous_time = -1
        self.clear()
        self.frame.move_to(ORIGIN).set_width(15)
        self.add(self.header, self.chapter_label, self.select_group)

        # Build geometry for all 5 chapters
        self.build_operands_chapter(s)
        self.build_competing_units_chapter(s)
        self.build_control_opcode_chapter(s)
        self.build_multiplexer_routing_chapter(s)
        self.build_operation_switch_chapter(s)

        self.tracks.sort(key=lambda row: row[0])
        self.evaluate(0, [], None)

    def build_operands_chapter(self, s):
        t0 = self.cue(0, 0)
        t1 = self.cue(0, 1)
        t2 = self.cue(0, 2)

        # Reg A Box & Value
        reg_a_box = stroke(RoundedRectangle(width=2.0, height=1.1, corner_radius=0.1).move_to([-5.2, 1.6, 0]), BLUE, 2.5, 0.12)
        reg_a_title = words("REG A", 17, MUTED).move_to([-5.2, 1.9, 0])
        reg_a_val = words(f"Bit: {s['a']}", 24, BLUE).move_to([-5.2, 1.45, 0])
        reg_a = VGroup(reg_a_box, reg_a_title, reg_a_val)
        self.show(reg_a, t0, 1.2)
        self.register("register_a", reg_a, 0)

        # Reg B Box & Value
        reg_b_box = stroke(RoundedRectangle(width=2.0, height=1.1, corner_radius=0.1).move_to([-5.2, -1.6, 0]), BLUE, 2.5, 0.12)
        reg_b_title = words("REG B", 17, MUTED).move_to([-5.2, -1.3, 0])
        reg_b_val = words(f"Bit: {s['b']}", 24, BLUE).move_to([-5.2, -1.75, 0])
        reg_b = VGroup(reg_b_box, reg_b_title, reg_b_val)
        self.show(reg_b, t0 + 0.4, 1.2)
        self.register("register_b", reg_b, 0)

        # Bus A (Trunk at x = -3.5, branching to all 4 unit inputs at y = [2.4, 0.9, -0.6, -2.1])
        bus_a_main = path([[-4.2, 1.6, 0], [-3.5, 1.6, 0]], BLUE, 2.8)
        bus_a_trunk = path([[-3.5, 2.4, 0], [-3.5, -2.1, 0]], BLUE, 2.8)
        bus_a_taps = VGroup(*[
            path([[-3.5, y, 0], [-2.3, y, 0]], BLUE, 2.2)
            for y in [2.4, 0.9, -0.6, -2.1]
        ])
        bus_a = VGroup(bus_a_main, bus_a_trunk, bus_a_taps)
        self.show(bus_a, t1, 2.0)
        self.register("bus_a", bus_a, 0)

        # Bus B (Trunk at x = -3.1, branching to all 4 unit inputs at y = [2.1, 0.6, -0.9, -2.4])
        bus_b_main = path([[-4.2, -1.6, 0], [-3.1, -1.6, 0]], BLUE, 2.8)
        bus_b_trunk = path([[-3.1, 2.1, 0], [-3.1, -2.4, 0]], BLUE, 2.8)
        bus_b_taps = VGroup(*[
            path([[-3.1, y, 0], [-2.3, y, 0]], BLUE, 2.2)
            for y in [2.1, 0.6, -0.9, -2.4]
        ])
        bus_b = VGroup(bus_b_main, bus_b_trunk, bus_b_taps)
        self.show(bus_b, t1 + 0.6, 2.0)
        self.register("bus_b", bus_b, 0)

        self.caption("Shared operand busses feed all units simultaneously", [-3.8, 2.8, 0], t2, 19, MUTED)

    def build_competing_units_chapter(self, s):
        t0 = self.cue(1, 0)
        t1 = self.cue(1, 1)
        t2 = self.cue(1, 2)

        # 4 Functional units: AND, OR, ADD, XOR
        # Inputs: A and B. Calculate values:
        v_and = s['a'] & s['b']
        v_or = s['a'] | s['b']
        v_add = (s['a'] + s['b']) & 1
        v_xor = s['a'] ^ s['b']

        y_positions = [2.25, 0.75, -0.75, -2.25]
        unit_configs = [
            ("unit_and", "AND", v_and, y_positions[0], BLUE),
            ("unit_or", "OR", v_or, y_positions[1], BLUE),
            ("unit_add", "ADD (+)", v_add, y_positions[2], GOLD),
            ("unit_xor", "XOR", v_xor, y_positions[3], BLUE),
        ]

        unit_mobjects = []
        candidate_wires = []

        for idx, (tag, name, val, y, color) in enumerate(unit_configs):
            box = stroke(RoundedRectangle(width=2.0, height=0.9, corner_radius=0.08).move_to([-1.3, y, 0]), color, 2, 0.1)
            label = words(name, 19, INK).move_to([-1.7, y, 0])
            out_tag = words(f"= {val}", 20, color).move_to([-0.8, y, 0])
            unit_grp = VGroup(box, label, out_tag)
            self.show(unit_grp, t0 + idx * 0.35, 1.0)
            self.register(tag, unit_grp, 1)
            unit_mobjects.append(unit_grp)

            # Wire from unit output to MUX input at x = 1.3
            mux_in_y = 1.35 - idx * 0.9
            wire = path([[-0.3, y, 0], [0.6, y, 0], [0.6, mux_in_y, 0], [1.3, mux_in_y, 0]], MUTED, 2.2)
            val_dot = words(str(val), 17, color).move_to([0.9, mux_in_y + 0.22, 0])
            cand = VGroup(wire, val_dot)
            self.show(cand, t1 + idx * 0.3, 1.2)
            candidate_wires.append(cand)

        self.register("candidates", VGroup(*candidate_wires), 1)
        self.caption("All units compute in parallel · 4 competing candidate results", [0.0, -3.1, 0], t2, 19, MUTED)

    def build_control_opcode_chapter(self, s):
        t0 = self.cue(2, 0)
        t1 = self.cue(2, 1)
        t2 = self.cue(2, 2)

        # Multiplexer Body (Trapezoid centered at x = 2.0)
        # Left edge from y = 1.9 to -1.9 (x=1.3)
        # Right edge from y = 0.95 to -0.95 (x=2.7)
        mux_poly = stroke(Polygon([1.3, 2.0, 0], [2.7, 1.1, 0], [2.7, -1.1, 0], [1.3, -2.0, 0]), MUTED, 2.5, 0.08)
        mux_text = words("4:1 MUX", 20, INK).move_to([2.0, 0.0, 0])
        mux_grp = VGroup(mux_poly, mux_text)
        self.show(mux_grp, t0, 1.2)
        self.register("mux_body", mux_grp, 2)

        # Opcode Register: at [2.0, 2.9, 0]
        op_box = stroke(RoundedRectangle(width=2.2, height=0.8, corner_radius=0.08).move_to([2.0, 2.9, 0]), GOLD, 2.2, 0.15)
        op_lbl = words("OPCODE: 00 (ADD)", 17, GOLD).move_to([2.0, 2.9, 0])
        op_reg = VGroup(op_box, op_lbl)
        self.show(op_reg, t0 + 0.5, 1.0)
        self.register("opcode_reg", op_reg, 2)

        # Control Select Bus entering top of MUX
        ctrl_wire = path([[2.0, 2.5, 0], [2.0, 1.55, 0]], GOLD, 3.0)
        ctrl_arrow = stroke(Arrow([2.0, 2.5, 0], [2.0, 1.55, 0], buff=0), GOLD, 3.0)
        ctrl_grp = VGroup(ctrl_wire, ctrl_arrow)
        self.show(ctrl_grp, t1, 1.0)
        self.register("control_bus", ctrl_grp, 2)

        self.caption("Opcode routes to MUX select line, NOT to operand registers", [2.0, 3.55, 0], t2, 18, GOLD)

    def build_multiplexer_routing_chapter(self, s):
        t0 = self.cue(3, 0)
        t1 = self.cue(3, 1)
        t2 = self.cue(3, 2)

        # Active internal routing inside MUX for ADD (unit 2, y=-0.45 to center 0)
        active_mux_path = path([[1.3, -0.45, 0], [2.0, -0.45, 0], [2.7, 0.0, 0]], GOLD, 3.5)
        self.show(active_mux_path, t0, 1.2)
        self.register("active_add_path", active_mux_path, 3)

        # Output bus from MUX output to Result Register
        out_bus = stroke(Arrow([2.7, 0.0, 0], [4.4, 0.0, 0], buff=0), GREEN, 3.5)
        self.show(out_bus, t1, 1.2)
        self.register("output_bus", out_bus, 3)

        # Result Register at [5.4, 0.0, 0]
        res_box = stroke(RoundedRectangle(width=2.0, height=1.2, corner_radius=0.1).move_to([5.4, 0.0, 0]), GREEN, 2.5, 0.15)
        res_title = words("RESULT REG", 17, MUTED).move_to([5.4, 0.35, 0])
        res_val = words("Output: 1", 24, GREEN).move_to([5.4, -0.15, 0])
        res_grp = VGroup(res_box, res_title, res_val)
        self.show(res_grp, t1 + 0.5, 1.2)
        self.register("result_reg", res_grp, 3)

        self.caption("Selected ADD candidate (1) passes to destination bus", [4.2, 1.5, 0], t2, 19, GREEN)

    def build_operation_switch_chapter(self, s):
        t0 = self.cue(4, 0)
        t1 = self.cue(4, 1)
        t2 = self.cue(4, 2)

        # New Opcode Box overlay: OPCODE: 01 (AND)
        new_op_box = stroke(RoundedRectangle(width=2.2, height=0.8, corner_radius=0.08).move_to([2.0, 2.9, 0]), BLUE, 2.5, 0.95)
        new_op_lbl = words("OPCODE: 01 (AND)", 17, BLUE).move_to([2.0, 2.9, 0])
        new_op_reg = VGroup(new_op_box, new_op_lbl)
        self.show(new_op_reg, t0, 0.8)
        self.register("opcode_and", new_op_reg, 4)

        # Switched path inside MUX: AND input is at y = 1.35
        switched_mux_path = path([[1.3, 1.35, 0], [2.0, 1.35, 0], [2.7, 0.0, 0]], BLUE, 3.5)
        self.show(switched_mux_path, t1, 1.0)
        self.register("switched_and_path", switched_mux_path, 4)

        # Updated Result register overlay: Output: 0
        new_res_box = stroke(RoundedRectangle(width=2.0, height=1.2, corner_radius=0.1).move_to([5.4, 0.0, 0]), BLUE, 2.5, 0.95)
        new_res_title = words("RESULT REG", 17, MUTED).move_to([5.4, 0.35, 0])
        new_res_val = words("Output: 0", 24, BLUE).move_to([5.4, -0.15, 0])
        new_res_grp = VGroup(new_res_box, new_res_title, new_res_val)
        self.show(new_res_grp, t1 + 0.6, 1.0)
        self.register("switched_result", new_res_grp, 4)

        self.caption("Operands A=1, B=0 unchanged · MUX re-steered to AND (0)", [0.0, -3.1, 0], t2, 20, GOLD)
