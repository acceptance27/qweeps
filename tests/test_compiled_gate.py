import pytest

from assistant.visual.contract import boundary_snapshot, director_prompt, validate_state_contract
from assistant.visual.gate import check_scene
from assistant.visual.geometry import intersection_ratio, occlusions, project, screen_box
from assistant.visual.plan import PlanError
from assistant.visual.trusted_svg import validate_compiled_svg


def test_trusted_svg_accepts_compiler_structure_and_rejects_execution():
    good = ('<svg viewBox="0 0 100 60"><defs><linearGradient id="g"/></defs>'
            '<rect x="0" y="0" width="10" height="10"/></svg>')
    assert validate_compiled_svg(good) == good
    for bad in ('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
                '<svg viewBox="0 0 1 1"><rect onclick="x"/></svg>',
                '<svg viewBox="0 0 1 1"><image href="http://x"/></svg>'):
        with pytest.raises(PlanError):
            validate_compiled_svg(bad)


def test_camera_projection_and_screen_boxes():
    assert project(0, 0, {"x": 0, "y": 0, "zoom": 1}) == (720.0, 400.0)
    box = screen_box({"x": 0, "y": 0, "width": 2, "height": 1}, {"x": 0, "y": 0, "zoom": 1})
    assert box[0] < 720 < box[2] and box[1] < 400 < box[3]


def test_overlap_ratio_and_exemptions():
    a = {"id": "a", "kind": "text", "x": 0, "y": 0, "width": 2, "height": 0.5}
    b = {"id": "b", "kind": "text", "x": 0, "y": 0, "width": 2, "height": 0.5}
    camera = {"x": 0, "y": 0, "zoom": 1}
    assert intersection_ratio(screen_box(a, camera), screen_box(b, camera)) == 1.0
    assert occlusions([a, b], camera)
    child = {**b, "parentId": "a"}
    assert not occlusions([a, child], camera)


def test_gate_reports_overlap_and_missing_evidence():
    scene = {"beats": [{"id": "b1", "camera": {"x": 0, "y": 0, "zoom": 1},
                        "elements": [
                            {"id": "a", "kind": "text", "label": "same", "x": 0, "y": 0,
                             "width": 2, "height": 0.5},
                            {"id": "b", "kind": "text", "label": "same", "x": 0, "y": 0,
                             "width": 2, "height": 0.5}],
                        "teaching": {"evidence": ["ghost"]}}]}
    result = check_scene(scene)
    classes = {b["errorClass"] for b in result["blockers"]}
    assert "TEXT_OCCLUSION" in classes and "MISSING_EVIDENCE" in classes
    assert result["approved"] is False


def test_gate_reports_label_overflow():
    scene = {"beats": [{"id": "b1", "elements": [
        {"id": "t", "kind": "text", "label": "a very long label that cannot fit",
         "x": 0, "y": 0, "width": 1, "height": 0.5}]}]}
    result = check_scene(scene)
    assert [b["errorClass"] for b in result["blockers"]] == ["LABEL_OVERFLOW"]


def test_state_contract_requires_effect_cues_and_part_parents():
    beats = [{"id": "b1"}, {"id": "b2"}]
    good = [{"beatId": "b1", "retain": [], "mutate": [],
             "enter": [{"id": "tok", "role": "input_token"}], "exit": []},
            {"beatId": "b2", "retain": ["tok"], "mutate": [],
             "enter": [{"id": "out", "role": "sampled_output", "cue": "sample"}], "exit": []}]
    assert validate_state_contract(good, beats) == []
    missing_cue = list(good)
    missing_cue[1] = {**good[1], "enter": [{"id": "out", "role": "sampled_output"}]}
    assert any("needs a cue anchor" in p for p in validate_state_contract(missing_cue, beats))
    part = [{"beatId": "b1", "retain": [], "mutate": [],
             "enter": [{"id": "un", "role": "part"}], "exit": []}, good[1]]
    assert any("needs a derivedFrom" in p for p in validate_state_contract(part, beats))


def test_director_prompt_is_lean_and_contains_contract():
    contract = {"beatId": "b2", "retain": ["tok"], "mutate": [], "enter": [], "exit": []}
    boundary = {"beat": 1, "camera": {"x": 0, "y": 0, "zoom": 1}, "elements": [{"id": "tok"}]}
    prompt = director_prompt(contract, boundary)
    assert len(prompt) < 8000
    assert "stateContract" not in prompt and "b2" in prompt and "tok" in prompt


def test_generated_labels_are_exempt_from_their_parent_chart():
    scene = {"beats": [{"id": "b0", "camera": {"x": 0, "y": 0, "zoom": 1}, "elements": [
        {"id": "chart", "kind": "svg", "x": 0, "y": 0, "width": 4, "height": 2},
        {"id": "b0__gen__chart__l0", "kind": "text", "label": "t",
         "x": 0, "y": 0, "width": 1, "height": 0.5}]}]}
    assert check_scene(scene)["approved"]


def test_label_inside_a_background_field_is_advisory_not_blocking():
    scene = {"beats": [{"id": "b1", "camera": {"x": 0, "y": 0, "zoom": 1}, "elements": [
        {"id": "field", "kind": "box", "x": 0, "y": 0, "width": 6, "height": 3},
        {"id": "label", "kind": "text", "label": "h(n)", "x": 0, "y": 0,
         "width": 1, "height": 0.4}]}]}
    result = check_scene(scene)
    assert result["approved"]
    assert result["advisories"][0]["errorClass"] == "TEXT_ON_FIELD"


def test_partial_text_overlap_is_advisory_full_overlap_blocks():
    partial = {"beats": [{"id": "b1", "camera": {"x": 0, "y": 0, "zoom": 1}, "elements": [
        {"id": "a", "kind": "text", "label": "A", "x": 0, "y": 0, "width": 2, "height": 0.5},
        {"id": "b", "kind": "text", "label": "B", "x": 1.5, "y": 0, "width": 2, "height": 0.5}]}]}
    result = check_scene(partial)
    assert result["approved"]
    assert any(a["errorClass"] == "TEXT_OCCLUSION" for a in result["advisories"])

    full = {"beats": [{"id": "b1", "camera": {"x": 0, "y": 0, "zoom": 1}, "elements": [
        {"id": "a", "kind": "text", "label": "A", "x": 0, "y": 0, "width": 2, "height": 0.5},
        {"id": "b", "kind": "text", "label": "B", "x": 0, "y": 0, "width": 2, "height": 0.5}]}]}
    assert not check_scene(full)["approved"]
