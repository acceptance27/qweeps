from assistant.visual.native_author import assemble, choose_native_beats, clean_code, condense_narration
from assistant.visual.native_timing import native_map
from assistant.visual.ce_text_metrics import collect_text_specs, metric_key
from assistant.visual.native_audit import _iou, _overlap


def story():
    return {
        "title": "How a neuron fires",
        "question": "How does a neuron fire?",
        "representation": "membrane, ions, voltage",
        "beats": [
            {"id": "resting", "title": "Rest", "question": "q1", "insight": "i1",
             "teaching": "construction", "layout": "diagram", "visibleOperation": "v1"},
            {"id": "sum", "title": "Sum", "question": "q2", "insight": "i2",
             "teaching": "mechanism", "layout": "diagram", "visibleOperation": "v2"},
            {"id": "threshold", "title": "Threshold", "question": "q3", "insight": "i3",
             "teaching": "comparison", "layout": "comparison", "visibleOperation": "v3"},
            {"id": "propagate", "title": "Propagate", "question": "q4", "insight": "i4",
             "teaching": "mechanism", "layout": "diagram", "visibleOperation": "v4"},
        ],
    }


def lesson():
    return {
        "title": "How a neuron fires", "duration": 60.0,
        "chapters": [
            {"id": "resting", "start": 0.0, "end": 15.0, "visual": {"layout": "diagram"}},
            {"id": "sum", "start": 15.0, "end": 30.0, "visual": {"layout": "diagram"}},
            {"id": "threshold", "start": 30.0, "end": 45.0, "visual": {"layout": "comparison"}},
            {"id": "propagate", "start": 45.0, "end": 60.0, "visual": {"layout": "diagram"}},
        ],
    }


def manifest():
    return {"sceneId": "gen_test", "duration": 30.0, "beats": [
        {"id": "resting", "start": 2.0, "end": 8.0, "title": "Rest"},
        {"id": "sum", "start": 8.0, "end": 14.0, "title": "Sum"},
        {"id": "threshold", "start": 14.0, "end": 20.0, "title": "Threshold"},
        {"id": "propagate", "start": 20.0, "end": 30.0, "title": "Propagate"},
    ]}


def test_choose_native_keeps_at_least_one_layout_beat():
    ids = choose_native_beats(story())
    assert 2 <= len(ids) < 4
    assert "resting" in ids and "sum" in ids
    assert "threshold" not in ids


def test_assemble_maps_native_windows_and_rebuilds_clock():
    result = assemble(lesson(), story(), manifest(), ["resting", "sum"])
    chapters = result["chapters"]
    assert result["duration"] == sum(c["end"] - c["start"] for c in chapters)
    assert (chapters[0]["start"], chapters[0]["end"]) == (0.0, 6.0)
    assert (chapters[1]["start"], chapters[1]["end"]) == (6.0, 12.0)
    assert chapters[0]["renderer"] == "manimgl"
    assert chapters[0]["nativeOffset"] == 2.0
    assert chapters[1]["nativeOffset"] == 8.0
    assert chapters[0]["nativeDuration"] == 6.0
    assert chapters[1]["nativeDuration"] == 6.0
    assert chapters[2].get("renderer") is None
    assert result["nativeScenes"]["gen_test"]["sceneId"] == "gen_test"


def test_clean_code_preserves_ce_transforms_and_hides_scene_title():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        title = Text("Title")
        caption_rest = Text("one")
        cap_dep = Text("two")
        self.play(Transform(caption_rest, cap_dep), run_time=1.0)
        self.beat("x", "X")
'''
    cleaned = clean_code(source)
    # The shim lowers transforms; the compiler must not rewrite the model's
    # CE animation into an opacity crossfade.
    assert "Transform(caption_rest, cap_dep)" in cleaned
    assert "set_opacity(0)" in cleaned and "title.set_opacity" in cleaned
    assert 'self.beat("x", "X")' in cleaned


class FakeLLM:
    def compose(self, instruction, system="", max_tokens=None, reasoning_effort=None):
        return '{"chapters":[{"id":"resting","narration":"Resting charge waits at -70 mV."}]}'


def test_condense_native_narration_fits_window():
    data = lesson()
    data["chapters"][0]["narration"] = "long " * 40
    data["chapters"][1]["narration"] = "sum " * 30
    result = condense_narration(FakeLLM(), data, manifest(), ["resting"])
    assert result["chapters"][0]["narration"] == "Resting charge waits at -70 mV."
    assert result["chapters"][1]["narration"] == "sum " * 30


def test_clean_code_keeps_replacement_transform_on_text():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        a = Text("one")
        b = Text("two")
        self.play(ReplacementTransform(a, b), run_time=1.0)
'''
    cleaned = clean_code(source)
    assert "ReplacementTransform(a, b)" in cleaned


def test_clean_code_keeps_replacement_transform_on_groups():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        a = VGroup(Circle(), Circle())
        b = VGroup(Square(), Square())
        self.play(ReplacementTransform(a, b), run_time=1.0)
'''
    cleaned = clean_code(source)
    assert "ReplacementTransform(a, b)" in cleaned


def test_native_map_combines_equal_audio_times():
    points = native_map(
        {"start": 10.0, "end": 20.0, "nativeOffset": 5.0, "nativeDuration": 6.0,
         "narrationCues": [{"target": "a", "start": 4.0},
                           {"target": "b", "start": 4.0},
                           {"target": "c", "start": 8.0}]},
        [{"id": "a", "time": 6.0}, {"id": "b", "time": 9.0}, {"id": "c", "time": 10.0}],
    )
    assert points[0] == {"at": 0.0, "scene": 5.0}
    assert points[1] == {"at": 4.0, "scene": 6.0}
    assert points[-1] == {"at": 10.0, "scene": 11.0}
    assert all(right["scene"] >= left["scene"] for left, right in zip(points, points[1:]))


def test_native_map_falls_back_to_linear():
    points = native_map({"start": 2.0, "end": 8.0, "nativeOffset": 4.0,
                         "nativeDuration": 3.0, "narrationCues": []}, [])
    assert points == [{"at": 0.0, "scene": 4.0}, {"at": 6.0, "scene": 7.0}]


def test_clean_code_keeps_group_transforms():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        g1 = VGroup(Rectangle(), Rectangle())
        g2 = VGroup(Rectangle(), Rectangle())
        self.play(Transform(g1, g2), run_time=1.0)
'''
    cleaned = clean_code(source)
    assert "Transform(g1, g2)" in cleaned
    assert "zip(g1, g2)" not in cleaned


def test_collect_text_specs_finds_static_text_boxes():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        a = Text("Neutrophil", font_size=20)
        b = Text("Bacterium")
        c = Text(dynamic_string)
'''
    specs = collect_text_specs(source)
    assert {(s["text"], s["font_size"]) for s in specs} == {
        ("Neutrophil", 20.0), ("Bacterium", 48.0)}
    assert metric_key("Neutrophil", 20) == metric_key("Neutrophil", 20.0)


def test_audit_overlap_distinguishes_a_collision_from_a_duplicate_box():
    a = [0.0, 0.0, 1.0, 1.0]
    same = [0.0, 0.0, 1.0, 1.0]
    moved = [0.5, 0.0, 1.5, 1.0]
    assert _overlap(a, same) == 1.0
    assert _iou(a, same) == 1.0
    assert _iou(a, moved) == 1 / 3
    assert _overlap(a, [2.0, 0.0, 3.0, 1.0]) == 0.0
