from assistant.visual.native_author import assemble, choose_native_beats, clean_code, condense_narration, native_beats_for, _repair_prompt
from assistant.visual.native_timing import native_map, choose_baked_frame
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


def test_continuous_mode_uses_every_beat_in_one_native_run():
    assert native_beats_for(story(), "continuous") == ["resting", "sum", "threshold", "propagate"]
    assert native_beats_for(story(), "per_beat") == choose_native_beats(story())


def test_continuous_mode_fills_gaps_but_leaves_layout_before_and_after():
    data = {"beats": [
        {"id": "intro", "layout": "comparison", "teaching": "comparison"},
        {"id": "a", "layout": "diagram", "teaching": "mechanism"},
        {"id": "b", "layout": "comparison", "teaching": "comparison"},
        {"id": "c", "layout": "process", "teaching": "mechanism"},
        {"id": "recall", "layout": "loci", "teaching": "recall"},
    ]}
    assert native_beats_for(data, "continuous") == ["a", "b", "c"]


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


def test_condense_narration_keeps_bridge_and_targets_layout_time():
    class BridgeDroppingLLM:
        def compose(self, instruction, system="", max_tokens=None, reasoning_effort=None):
            return '{"chapters":[{"id":"resting","narration":"Resting charge waits."}]}'

    data = lesson()
    data["chapters"][0]["narration"] = "long " * 40
    data["chapters"][0]["continuity"] = {"from": None, "bridge": "Bridge sentence."}
    result = condense_narration(BridgeDroppingLLM(), data, manifest(), ["resting"])
    assert result["chapters"][0]["narration"].startswith("Bridge sentence.")
    assert result["chapters"][0]["targetDuration"] <= 14
    assert result["chapters"][1]["targetDuration"] <= 14


def test_native_repair_prompt_carries_audit_findings_and_source():
    text = _repair_prompt("original prompt", "class GenScene: pass",
                          [{"code": "label-collision", "time": 2.1,
                            "detail": "'A' overlaps 'B'"}])
    assert "original prompt" in text
    assert "label-collision" in text and "'A' overlaps 'B'" in text
    assert "class GenScene: pass" in text


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


def test_clean_code_hides_a_title_defined_after_the_first_beat():
    source = '''from manim import *
class GenScene(Scene):
    def construct(self):
        self.beat("b1", "One")
        title = Text("A later title")
        self.play(FadeIn(title), run_time=1.0)
'''
    cleaned = clean_code(source)
    assert cleaned.index("title = Text") < cleaned.index("title.set_opacity(0)")
    assert cleaned.index("title.set_opacity(0)") < cleaned.index("self.play(FadeIn(title)")


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


def test_baked_frames_before_the_first_updater_frame_are_not_restored():
    times = [8.9, 9.0, 9.1]
    # Seeking into an earlier fade must not restore the fully-built future.
    assert choose_baked_frame(times, 2.1) is None
    assert choose_baked_frame(times, 8.9) == 0
    assert choose_baked_frame(times, 8.96) == 1
    assert choose_baked_frame(times, 9.5) == 2


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


def test_native_retry_reuses_code_but_recompiles_and_invalidates_changed_prompt(tmp_path, monkeypatch):
    from unittest.mock import Mock
    from assistant.visual import native_author

    llm = Mock(provider='test', model='test-model', visual_model=None)
    llm.compose.return_value = 'class GenScene:\n    pass\n'
    compiled = {'duration': 40, 'beats': [
        {'id': beat['id'], 'start': index * 10, 'end': (index + 1) * 10}
        for index, beat in enumerate(story()['beats'])], 'audit': []}
    compiler = Mock(return_value=compiled)
    monkeypatch.setattr(native_author, 'compile_source', compiler)
    monkeypatch.setenv('QWEEPS_NATIVE_SCENES', str(tmp_path / 'registry'))

    first = native_author.generate_scene(llm, story(), 'python', tmp_path)
    second = native_author.generate_scene(llm, story(), 'python', tmp_path)
    assert first['sceneId'] == second['sceneId']
    assert llm.compose.call_count == 1
    assert compiler.call_count == 2  # Reusing code never skips the current audit.

    changed = {**story(), 'representation': 'A different visual encoding'}
    native_author.generate_scene(llm, changed, 'python', tmp_path)
    assert llm.compose.call_count == 2
    native_author.generate_scene(llm, story(), 'python', tmp_path, reuse=False)
    assert llm.compose.call_count == 3

    from assistant.visual.plan import PlanError
    compiler.side_effect = [PlanError('runtime changed'), compiled]
    native_author.generate_scene(llm, story(), 'python', tmp_path)
    assert llm.compose.call_count == 4  # An unusable checkpoint falls back to fresh code.


def test_failed_native_scene_is_not_checkpointed(tmp_path, monkeypatch):
    import pytest
    from unittest.mock import Mock
    from assistant.visual import native_author
    from assistant.visual.plan import PlanError

    llm = Mock(provider='test', model='test-model', visual_model=None)
    llm.compose.return_value = 'class GenScene:\n    pass\n'
    monkeypatch.setattr(native_author, 'compile_source', Mock(side_effect=PlanError('bad geometry')))
    with pytest.raises(PlanError, match='bad geometry'):
        native_author.generate_scene(llm, story(), 'python', tmp_path)
    assert not list(tmp_path.glob('native-source-*.py'))


def test_lesson_native_prompt_gives_each_inference_reading_time_and_visual_evidence():
    from assistant.visual.native_author import build_prompt, minimum_native_seconds
    from assistant.visual.manim_code_prompt import lesson_manim_code_generation_prompt
    data = story()
    data['beats'][0].update(presentation={'visualEvidence': 'A sum changes the actual vector'},
                            narration='Explain the visible relationship. ' * 12)
    text = build_prompt(data)
    assert 'A sum changes the actual vector' in text
    assert '30-55 seconds' not in text
    assert '30 to 50 seconds' not in lesson_manim_code_generation_prompt()
    assert minimum_native_seconds(data['beats'][0]) > 8
    assert 'minimum duration:' in text


def test_too_fast_native_scene_cannot_pass_or_be_checkpointed(tmp_path, monkeypatch):
    import pytest
    from unittest.mock import Mock
    from assistant.visual import native_author
    from assistant.visual.plan import PlanError
    llm = Mock(provider='test', model='test', visual_model=None)
    llm.compose.return_value = 'class GenScene:\n    pass\n'
    compiled = {'duration': 12, 'audit': [], 'beats': [
        {'id': b['id'], 'start': i * 3, 'end': (i + 1) * 3}
        for i, b in enumerate(story()['beats'])]}
    monkeypatch.setattr(native_author, 'compile_source', Mock(return_value=compiled))
    with pytest.raises(PlanError, match='too fast to teach'):
        native_author.generate_scene(llm, story(), 'python', tmp_path)
    assert not list(tmp_path.glob('native-source-*.py'))


def test_native_cues_must_cover_real_stages_in_order_with_a_result_hold():
    from assistant.visual.native_author import native_cue_contract, native_cue_findings
    beat = story()['beats'][0]
    data = {**story(), 'beats': [beat], 'nativeCuePlan': {beat['id']: native_cue_contract(beat)}}
    compiled = {'beats': [{'id': beat['id'], 'start': 0, 'end': 12}], 'cues': [
        {'id': f"{beat['id']}-setup", 'time': 0},
        {'id': f"{beat['id']}-operation", 'time': 3},
        {'id': f"{beat['id']}-result", 'time': 9}]}
    assert native_cue_findings(data, compiled) == []
    compiled['cues'].pop()
    assert any(f['code'] == 'native-cue-coverage' for f in native_cue_findings(data, compiled))
    compiled['cues'].append({'id': f"{beat['id']}-result", 'time': 3.1})
    assert any(f['code'] == 'native-cue-order' for f in native_cue_findings(data, compiled))


def test_native_assembly_keeps_the_construction_before_a_late_cue():
    data = manifest()
    data['cues'] = [{'id': 'important-result', 'time': 7}]
    result = assemble(lesson(), story(), data, ['resting'])
    assert result['chapters'][0]['nativeOffset'] == 2
    assert result['chapters'][0]['nativeDuration'] == 6


def test_native_effort_is_scoped_to_codegen_and_high_is_reserved_for_repairs(tmp_path, monkeypatch):
    from unittest.mock import Mock
    from assistant.visual import native_author
    llm = Mock(provider='test', model='test-model', visual_model=None)
    llm.compose.return_value = 'class GenScene:\n    pass\n'
    compiled = {'duration': 40, 'beats': [
        {'id': b['id'], 'start': i * 10, 'end': (i + 1) * 10}
        for i, b in enumerate(story()['beats'])], 'audit': []}
    bad = {**compiled, 'audit': [{'code': 'label-collision', 'detail': 'labels overlap'}]}
    monkeypatch.setattr(native_author, 'compile_source', Mock(side_effect=[bad, compiled]))
    monkeypatch.setenv('QWEEPS_NATIVE_SCENES', str(tmp_path / 'registry'))
    native_author.generate_scene(llm, story(), 'python', tmp_path, reasoning_effort='medium')
    assert [c.kwargs['reasoning_effort'] for c in llm.compose.call_args_list] == ['medium', 'high']


def test_native_audit_allows_repeated_quantities_in_separate_cards(monkeypatch):
    from types import SimpleNamespace
    from assistant.visual import native_audit
    scene = SimpleNamespace(duration=10, beats=[])
    monkeypatch.setattr(native_audit, '_sample_times', lambda scene: [])
    separate = [(1, 'score 0', [-4, 2.4, -2, 2.8]), (2, 'score 0', [2, 2.4, 4, 2.8])]
    monkeypatch.setattr(native_audit, '_visible_texts', lambda *a: separate)
    assert not native_audit.audit_scene(scene)
    overlap = [(1, 'Title', [-2, 2.4, 2, 2.8]), (2, 'Title', [-2, 2.4, 2, 2.8])]
    monkeypatch.setattr(native_audit, '_visible_texts', lambda *a: overlap)
    assert any(f['code'] == 'duplicate-title' for f in native_audit.audit_scene(scene))


def test_new_native_lessons_reserve_the_actual_player_caption_region(monkeypatch):
    from types import SimpleNamespace
    from assistant.visual import native_audit
    scene = SimpleNamespace(duration=10, beats=[], cues=[{'id':'a-setup'}, {'id':'a-result'}])
    monkeypatch.setattr(native_audit, '_sample_times', lambda scene: [1])
    monkeypatch.setattr(native_audit, '_visible_texts', lambda *a: [(1, 'Required label', [-1, -3.2, 1, -2.8])])
    assert any(f['code'] == 'subtitle-overlap' for f in native_audit.audit_scene(scene))
    scene.cues=[]
    assert not any(f['code'] == 'subtitle-overlap' for f in native_audit.audit_scene(scene)), 'saved legacy scenes retain their previous rendering contract'
