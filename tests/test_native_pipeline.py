from assistant.visual.native_author import assemble, choose_native_beats, clean_code, condense_narration


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


def test_clean_code_crossfades_text_and_hides_scene_title():
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
    assert "Transform(caption_rest, cap_dep)" not in cleaned
    assert "caption_rest.animate.set_opacity(0)" in cleaned
    assert "cap_dep.animate.set_opacity(1)" in cleaned
    assert "caption_rest = cap_dep" in cleaned
    assert "title.set_opacity(0)" in cleaned
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


def test_clean_code_does_not_break_replacement_transform():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        a = Text("one")
        b = Text("two")
        self.play(ReplacementTransform(a, b), run_time=1.0)
'''
    cleaned = clean_code(source)
    assert "ReplacementTransform(a, b)" in cleaned
    assert "Replacement" not in cleaned.replace("ReplacementTransform", "")
