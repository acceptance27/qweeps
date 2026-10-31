import json
from unittest.mock import Mock

import pytest

from assistant.visual.plan import PlanError, generate_reply
from assistant.visual.v3_pipeline import teach_v3


def storyboard():
    return {
        "learning_goal": "g", "driving_question": "How does it work?",
        "learner_start": "l", "concrete_example": "e", "representation": "r",
        "references": ["pdf_explainer"],
        "visual_design": {"family": "mechanism", "why": "w", "encodings": ["e"],
                          "misreading": "m", "safeguard": "s"},
        "beats": [
            {"id": "b1", "question": "What is the first step?", "insight": "The first step is visible", "before": "b",
             "change": "c", "after": "a", "reasoning": "r", "retain": [],
             "camera": "static", "narration": "n1", "visual_test": "v1"},
            {"id": "b2", "question": "What changes next?", "insight": "The second step changes it", "before": "b",
             "change": "c", "after": "a", "reasoning": "r", "retain": ["a"],
             "camera": "static", "narration": "n2", "visual_test": "v2"},
        ],
    }


def planner_response():
    return {**storyboard(),
            "roleTable": {"input_token": "slot_0", "sampled_output": "slot_4"},
            "answer": "A direct answer."}


def contract_response():
    return {"beats": [
        {"beatId": "b1", "retain": [], "mutate": [],
         "enter": [{"id": "a", "kind": "box", "role": "input_token"}], "exit": []},
        {"beatId": "b2", "retain": ["a"], "mutate": [],
         "enter": [{"id": "out", "kind": "text", "role": "sampled_output", "cue": "sample"}],
         "exit": []},
    ]}


def beat(index):
    elements = [{"id": "a", "kind": "box", "label": "A", "x": -2, "y": 0,
                 "semanticRole": "input_token", "revealAt": 0}]
    if index:
        elements.append({"id": "out", "kind": "text", "label": "B", "x": 2, "y": 0,
                         "semanticRole": "sampled_output", "revealAt": "after:el.a.end+0.3"})
    return {"beats": [{"title": f"B{index}", "narration": f"n{index + 1}",
                       "duration": 6, "elements": elements}]}


def approval():
    return {"approved": True, "blockers": [], "advisories": []}


def model_with(*responses):
    model = Mock(spec=["compose"])
    model.compose.side_effect = [json.dumps(r) if not isinstance(r, str) else r for r in responses]
    return model


def test_v3_pipeline_compiles_per_beat_and_reviews():
    model = model_with(planner_response(), contract_response(), beat(0), beat(1), approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    assert result["answer"] == "A direct answer."
    assert len(result["scene"]["beats"]) == 2
    assert result["scene"]["teaching"]["review"]["approved"]
    assert result["scene"]["beats"][1]["elements"][0]["id"] == "a"
    assert result["scene"]["beats"][1]["visualStart"] == 6
    assert model.compose.call_count == 5


def test_v3_pipeline_stops_when_the_judge_finds_blockers():
    blocked = {"approved": False,
               "blockers": [{"beat": "b2", "problem": "result before cue"}],
               "advisories": []}
    model = model_with(planner_response(), contract_response(), beat(0), beat(1), blocked)
    with pytest.raises(PlanError, match="external judge found blockers"):
        teach_v3(model, "How?", {}, [], "lesson")


def test_v3_pipeline_is_opt_in_via_environment(monkeypatch):
    monkeypatch.setenv("QWEEPS_V3", "1")
    model = model_with(planner_response(), contract_response(), beat(0), beat(1), approval())
    reply = generate_reply(model, "How?", {}, [], "lesson")
    assert reply["scene"]["beats"][0]["id"] == "beat_0"
    assert reply["answer"] == "A direct answer."


def test_synthetic_cues_cover_contract_and_underscore_references():
    from assistant.visual.v3_pipeline import _synthetic_cues

    entry = {"enter": [{"id": "out", "role": "sampled_output", "cue": "sample"}]}
    beat = {"duration": 6, "elements": [{"id": "tok", "revealAt": "with:cue_other"}]}
    cues = _synthetic_cues(entry, beat)
    assert set(cues) == {"sample", "other"}
    assert all(value >= 0.4 for value in cues.values())
    assert cues["sample"] < cues["other"]


def test_v3_pipeline_resolves_an_underscore_cue_reference():
    beat_with_cue = {"beats": [{"title": "B0", "narration": "n1", "duration": 6,
                                "elements": [{"id": "a", "kind": "box", "label": "A",
                                              "x": -2, "y": 0,
                                              "semanticRole": "input_token", "revealAt": 0}]}]}
    cue_beat = {"beats": [{"title": "B1", "narration": "n2", "duration": 6,
                           "elements": [
                               {"id": "a", "kind": "box", "label": "A", "x": -2, "y": 0,
                                "semanticRole": "input_token", "revealAt": 0},
                               {"id": "out", "kind": "text", "label": "B", "x": 2, "y": 0,
                                "semanticRole": "sampled_output",
                                "revealAt": "with:cue_sample"}]}]}
    model = model_with(planner_response(), contract_response(), beat_with_cue, cue_beat, approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    out = next(e for e in result["scene"]["beats"][1]["elements"] if e["id"] == "out")
    assert out["revealAt"] >= 0.4


def test_retained_elements_cannot_move_without_a_mutation():
    moved = {"beats": [{"title": "B1", "narration": "n2", "duration": 6,
                        "elements": [
                            {"id": "a", "kind": "box", "label": "A", "x": 2, "y": 0,
                             "semanticRole": "input_token", "revealAt": 0},
                            {"id": "out", "kind": "text", "label": "B", "x": 4, "y": 0,
                             "semanticRole": "sampled_output", "revealAt": "after:el.a.end+0.3"}]}]}
    model = model_with(planner_response(), contract_response(), beat(0), moved, approval())
    with pytest.raises(PlanError, match="moved without a declared mutation"):
        teach_v3(model, "How?", {}, [], "lesson")


def test_effect_element_with_an_absolute_start_is_anchored_to_its_contract_cue():
    anchored = {"beats": [{"title": "B1", "narration": "n2", "duration": 6,
                           "elements": [
                               {"id": "a", "kind": "box", "label": "A", "x": -2, "y": 0,
                                "semanticRole": "input_token", "revealAt": 0},
                               {"id": "out", "kind": "text", "label": "B", "x": 2, "y": 0,
                                "semanticRole": "sampled_output", "revealAt": 1.5}]}]}
    model = model_with(planner_response(), contract_response(), beat(0), anchored, approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    out = next(e for e in result["scene"]["beats"][1]["elements"] if e["id"] == "out")
    assert out["revealAt"] >= 0.4


def test_missing_retained_elements_are_injected_from_the_boundary():
    only_out = {"beats": [{"title": "B1", "narration": "n2", "duration": 6,
                           "elements": [
                               {"id": "out", "kind": "text", "label": "B", "x": 2, "y": 0,
                                "semanticRole": "sampled_output",
                                "revealAt": "with:cue_sample"}]}]}
    model = model_with(planner_response(), contract_response(), beat(0), only_out, approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    ids = {e["id"] for e in result["scene"]["beats"][1]["elements"]}
    assert "a" in ids


def test_synthetic_cues_cover_bare_with_anchors_that_are_not_elements():
    from assistant.visual.v3_pipeline import _synthetic_cues

    beat = {"duration": 6, "elements": [
        {"id": "a", "revealAt": 0},
        {"id": "b", "revealAt": "with:neuron_shell"}]}
    cues = _synthetic_cues({}, beat)
    assert "neuron_shell" in cues


def test_a_slot_value_in_the_timing_field_is_repaired():
    from assistant.visual.v3_pipeline import _repair_malformed_timing

    beat = {"elements": [{"id": "a", "revealAt": "slot_1"}]}
    _repair_malformed_timing(beat, {}, {})
    assert beat["elements"][0]["revealAt"] == 0.0
    effect = {"elements": [{"id": "out", "semanticRole": "sampled_output", "revealAt": "slot_1"}]}
    cues = {}
    _repair_malformed_timing(effect, {}, cues)
    assert effect["elements"][0]["revealAt"].startswith("with:cue.")
    assert cues


def test_a_beat_that_fails_compile_is_retried_with_the_error():
    too_many = {"beats": [{"title": "B0", "narration": "n1", "duration": 6,
                           "elements": [{"id": f"n{i}", "kind": "text", "label": str(i),
                                         "x": 0, "y": 0} for i in range(21)]}]}
    model = model_with(planner_response(), contract_response(), too_many, beat(0), beat(1), approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    assert len(result["scene"]["beats"]) == 2
    assert model.compose.call_count == 6


def test_undeclared_roles_get_a_free_palette_slot():
    from assistant.visual.v3_pipeline import _repair_roles

    table = {"input_token": "slot_0"}
    beat = {"elements": [{"id": "n", "semanticRole": "neuron"}]}
    _repair_roles(beat, table)
    assert table["neuron"] == "slot_1"
    assert beat["elements"][0]["semanticRole"] == "neuron"


def test_invalid_role_is_dropped_when_the_palette_is_full():
    from assistant.visual.v3_pipeline import _repair_roles

    table = {f"r{i}": f"slot_{i}" for i in range(8)}
    beat = {"elements": [{"id": "n", "semanticRole": "neuron"}]}
    _repair_roles(beat, table)
    assert "semanticRole" not in beat["elements"][0]


def test_retained_ids_can_be_recovered_from_the_lesson_registry():
    from assistant.visual.v3_pipeline import _inject_retained

    known = {"attention_weight": {"id": "attention_weight", "kind": "text",
                                  "label": "attention", "x": 1, "y": 1,
                                  "width": 1, "height": 0.4, "semanticRole": "attention_weight"}}
    beat = {"elements": []}
    _inject_retained(beat, ["attention_weight"], {}, known)
    assert beat["elements"][0]["id"] == "attention_weight"
    assert beat["elements"][0]["x"] == 1


def test_retained_connectors_keep_their_endpoints_when_injected():
    from assistant.visual.v3_pipeline import _inject_retained

    known = {"wire": {"id": "wire", "kind": "arrow", "from": "a", "to": "b",
                      "x": 0, "y": 0, "width": 1, "height": 0.1}}
    beat = {"elements": [{"id": "a", "kind": "box", "label": "a"},
                         {"id": "b", "kind": "box", "label": "b"}]}
    _inject_retained(beat, ["wire"], {}, known)
    wire = next(e for e in beat["elements"] if e["id"] == "wire")
    assert wire["from"] == "a" and wire["to"] == "b"


def test_contract_elements_omitted_by_the_director_are_retried():
    incomplete = {"beats": [{"title": "B0", "narration": "n1", "duration": 6,
                             "elements": [{"id": "b", "kind": "text", "label": "B",
                                           "x": 2, "y": 0}]}]}
    model = model_with(planner_response(), contract_response(), incomplete, beat(0), beat(1), approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    ids = {e["id"] for e in result["scene"]["beats"][0]["elements"]}
    assert "a" in ids
    assert model.compose.call_count == 6


def test_missing_contract_elements_get_a_placeholder_from_the_registry():
    from assistant.visual.v3_pipeline import _inject_retained

    beat = {"elements": []}
    _inject_retained(beat, ["ghost"], {}, {}, {"ghost": {"kind": "box", "role": "input_token"}})
    assert beat["elements"][0]["id"] == "ghost"
    assert beat["elements"][0]["semanticRole"] == "input_token"


def test_retained_dropped_path_gets_a_safe_placeholder():
    from assistant.visual.v3_pipeline import _inject_retained

    known = {"curve": {"id": "curve", "kind": "path", "label": "ReLU",
                       "x": 1, "y": 1, "width": 3, "height": 1}}
    beat = {"elements": []}
    _inject_retained(beat, ["curve"], {}, known)
    assert beat["elements"][0]["kind"] == "box"


def test_a_broken_retained_connector_is_replaced_not_duplicated():
    from assistant.visual.v3_pipeline import _inject_retained

    beat = {"elements": [{"id": "axis", "kind": "line", "label": "0", "x": 0, "y": 0,
                          "width": 2, "height": 0.1}]}
    _inject_retained(beat, ["axis"], {}, {})
    matches = [e for e in beat["elements"] if e["id"] == "axis"]
    assert len(matches) == 1 and matches[0]["kind"] == "box"


def test_first_duplicate_governs_retention_repair_like_dedupe():
    from assistant.visual.v3_pipeline import _inject_retained

    beat = {"elements": [
        {"id": "curve", "kind": "path", "label": "sigmoid", "x": 6, "y": 3, "width": 1, "height": 1},
        {"id": "curve", "kind": "box", "label": "placeholder", "x": 0, "y": 0, "width": 2, "height": 1}]}
    _inject_retained(beat, ["curve"], {}, {})
    matches = [e for e in beat["elements"] if e["id"] == "curve"]
    assert len(matches) == 1 and matches[0]["kind"] == "box"


def test_a_failed_lesson_resumes_at_the_failing_beat(tmp_path, monkeypatch):
    monkeypatch.setenv("QWEEPS_CAPTURE_DIR", str(tmp_path / "captures"))
    checkpoint = tmp_path / "lesson.json"
    broken = {"beats": [{"title": "B1", "narration": "n2", "duration": 6, "elements": []}]}
    first = model_with(planner_response(), contract_response(), beat(0), broken, broken)
    with pytest.raises(PlanError):
        teach_v3(first, "How?", {}, [], "lesson", checkpoint=str(checkpoint))
    assert checkpoint.exists()
    assert first.compose.call_count == 5

    second = model_with(beat(1), approval())
    result = teach_v3(second, "How?", {}, [], "lesson", checkpoint=str(checkpoint))
    assert second.compose.call_count == 2          # no planner, no contract, no beat 0
    assert len(result["scene"]["beats"]) == 2
    assert not checkpoint.exists()


def test_svg_text_and_style_nodes_are_stripped_before_compiling():
    from assistant.visual.v3_pipeline import _repair_svgs

    beat = {"elements": [{"id": "ill", "kind": "svg",
                          "svg": '<svg viewBox="0 0 10 10"><style>.x{}</style>'
                                 '<text x="1" y="1">label</text><rect width="1" height="1"/></svg>'}]}
    _repair_svgs(beat)
    svg = beat["elements"][0]["svg"]
    assert "<text" not in svg and "<style" not in svg and "<rect" in svg


def test_effect_role_with_a_numeric_string_start_is_anchored():
    from assistant.visual.v3_pipeline import _enforce_effect_anchors

    beat = {"elements": [{"id": "out", "semanticRole": "sampled_output", "revealAt": "2.5"}]}
    cues = _enforce_effect_anchors(beat, {}, {"sample": 1.0})
    assert beat["elements"][0]["revealAt"].startswith("with:cue.")
    assert cues


def test_svg_without_markup_degrades_to_a_box():
    from assistant.visual.v3_pipeline import _repair_svgs

    beat = {"elements": [{"id": "ill", "kind": "svg", "label": "illustration"}]}
    _repair_svgs(beat)
    assert beat["elements"][0]["kind"] == "box"


def test_injected_effect_elements_are_anchored_after_retention():
    from assistant.visual.v3_pipeline import _enforce_effect_anchors, _inject_retained

    known = {"out": {"id": "out", "kind": "text", "semanticRole": "sampled_output",
                     "label": "B", "x": 1, "y": 0, "width": 1, "height": 0.4}}
    beat = {"elements": [{"id": "a", "kind": "box", "label": "A"}]}
    _inject_retained(beat, ["out"], {}, known)
    cues = _enforce_effect_anchors(beat, {}, {"sample": 1.0})
    injected = next(e for e in beat["elements"] if e["id"] == "out")
    assert injected["revealAt"].startswith("with:cue.")
    assert "sample" in cues


def dsl_planner_response():
    plan = storyboard()
    plan["beats"] = plan["beats"][:1]
    plan["beats"][0]["narration"] = "[cue:draw] Draw the input box for this beat."
    return {**plan, "roleTable": {"input_token": "slot_0"}, "answer": "A direct answer."}


def dsl_contract_response():
    return {"beats": [{"beatId": "b1", "retain": [], "mutate": [],
                       "enter": [{"id": "a", "kind": "box", "role": "input_token"}],
                       "exit": []}]}


DSL_BEAT = """beat 1
@cue:draw
show a zone=center_mid
"""


def test_dsl_mode_runs_a_beat_through_the_line_frontend(monkeypatch):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    model = model_with(dsl_planner_response(), dsl_contract_response(), DSL_BEAT, approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    assert len(result["scene"]["beats"]) == 1
    element = result["scene"]["beats"][0]["elements"][0]
    assert element["id"] == "a" and element["semanticRole"] == "input_token"
    assert model.compose.call_count == 4


def test_dsl_mode_reports_an_unknown_cue(monkeypatch, tmp_path):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    monkeypatch.setenv("QWEEPS_CAPTURE_DIR", str(tmp_path))
    bad = "beat 1\n@cue:ghost\nshow a zone=center_mid\n"
    model = model_with(dsl_planner_response(), dsl_contract_response(), bad, bad)
    with pytest.raises(PlanError):
        teach_v3(model, "How?", {}, [], "lesson")


def blocked_judge():
    return {"approved": False, "blockers": [
        {"beat": "beat 1", "problem": "The weight arrow is missing.",
         "revision": "Add an arrow labelled w1 from x to n."}],
        "advisories": []}


def test_dsl_revises_only_the_flagged_beat_and_rejudges_once(monkeypatch):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    revised = "beat 1\n@cue:draw\nshow a zone=center_mid\nlink w1 from=a to=a\n"
    model = model_with(dsl_planner_response(), dsl_contract_response(), DSL_BEAT,
                       blocked_judge(), revised, approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    assert result["scene"]["teaching"]["review"]["approved"] is True
    assert model.compose.call_count == 6
    prompts = [call.args[0] for call in model.compose.call_args_list]
    assert "JUDGE FINDINGS" in prompts[4] and "weight arrow" in prompts[4]
    assert "JUDGE FINDINGS" not in prompts[2]


def test_dsl_reports_blockers_when_revision_still_fails(monkeypatch):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    model = model_with(dsl_planner_response(), dsl_contract_response(), DSL_BEAT,
                       blocked_judge(), DSL_BEAT, blocked_judge())
    with pytest.raises(PlanError, match="The external judge found blockers"):
        teach_v3(model, "How?", {}, [], "lesson")


def test_dsl_revision_maps_a_judge_beat_title_back_to_its_beat(monkeypatch):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    title = dsl_planner_response()["beats"][0]["question"]
    blocked = {"approved": False, "blockers": [
        {"beat": title, "problem": "The weight arrow is missing.",
         "revision": "Add an arrow."}], "advisories": []}
    revised = "beat 1\n@cue:draw\nshow a zone=center_mid\nlink w1 from=a to=a\n"
    model = model_with(dsl_planner_response(), dsl_contract_response(), DSL_BEAT,
                       blocked, revised, approval())
    teach_v3(model, "How?", {}, [], "lesson")
    prompts = [call.args[0] for call in model.compose.call_args_list]
    assert "JUDGE FINDINGS" in prompts[4] and "weight arrow" in prompts[4]


def test_dsl_resumes_from_saved_raws_without_calling_the_director(monkeypatch, tmp_path):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    checkpoint = tmp_path / "lesson.json"
    checkpoint.write_text(json.dumps({
        "question": "How?", "mode": "lesson",
        "storyboard": dsl_planner_response(),
        "contract": dsl_contract_response(),
        "roleTable": {"input_token": "slot_0"},
        "answer": "A direct answer.",
        "dslRaws": {"0": DSL_BEAT},
        "cursor": 8.0, "boundary": None,
    }))
    model = model_with(approval())
    result = teach_v3(model, "How?", {}, [], "lesson", checkpoint=str(checkpoint))
    assert len(result["scene"]["beats"]) == 1
    assert model.compose.call_count == 1
    assert not checkpoint.exists()


def test_dsl_rebuild_reauthors_a_saved_beat_that_no_longer_fits(monkeypatch):
    from assistant.visual.dsl_prompt import ensure_cues
    from assistant.visual.v3_pipeline import _dsl_build

    storyboard = dsl_planner_response()
    second = dict(storyboard["beats"][0])
    second.update({"id": "b2", "question": "What next?",
                   "narration": "[cue:next] Show the second thing."})
    storyboard = {**storyboard, "beats": [storyboard["beats"][0], second]}
    contract = {"beats": [dsl_contract_response()["beats"][0],
                          {"beatId": "b2", "retain": [], "mutate": [], "exit": [],
                           "enter": [{"id": "a", "kind": "box", "role": "input_token"}]}]}
    contract["beats"][1]["enter"] = []
    registry_all = {"a": {"kind": "box", "role": "input_token", "label": ""}}
    narrations, cue_maps = {}, {}
    for index, beat in enumerate(storyboard["beats"]):
        narrations[index], cue_maps[index] = ensure_cues(beat["narration"])
    stale = {0: DSL_BEAT, 1: "beat 2\n@cue:next\nshow a dock=inside:gone\n"}
    fixed = "beat 2\n@cue:next\nshow a zone=center_mid\n"
    model = model_with(fixed)
    scene, raws = _dsl_build(model, storyboard, contract, registry_all,
                             {"input_token": "slot_0"}, narrations, cue_maps, base=stale)
    assert len(scene["beats"]) == 2
    assert raws[1] == fixed
    assert model.compose.call_count == 1


def test_retaining_a_chart_keeps_its_geometry():
    from assistant.visual.v3_pipeline import _inject_retained
    beat = {"elements": []}
    previous = {"curve": {"id": "curve", "kind": "svg", "x": 2, "y": 0, "width": 2,
                          "height": 1, "bars": [{"label": "1", "value": 0.5}],
                          "chartType": "line", "svg": "<svg viewBox='0 0 100 60'></svg>"}}
    _inject_retained(beat, ["curve"], previous, previous)
    element = beat["elements"][0]
    assert element["kind"] == "svg"
    assert element["bars"] == [{"label": "1", "value": 0.5}]
    assert element["chartType"] == "line"
    assert element["svg"].startswith("<svg")


def test_retention_merges_geometry_from_known_over_position_only_state():
    from assistant.visual.v3_pipeline import _inject_retained
    beat = {"elements": []}
    state = {"curve": {"id": "curve", "kind": "svg", "x": 2, "y": 0, "width": 2, "height": 1}}
    known = {"curve": {"id": "curve", "kind": "svg", "x": 2, "y": 0, "width": 2, "height": 1,
                       "bars": [{"label": "1", "value": 0.5}], "chartType": "line",
                       "svg": "<svg viewBox='0 0 100 60'></svg>"}}
    _inject_retained(beat, ["curve"], state, known)
    assert beat["elements"][0]["bars"] == [{"label": "1", "value": 0.5}]


def test_dsl_retries_a_director_that_answers_with_a_plan(monkeypatch):
    monkeypatch.setenv("QWEEPS_DSL", "1")
    prose = ("You're in Plan mode. Proposed plan: retain the canvas, then show a curve.")
    model = model_with(dsl_planner_response(), dsl_contract_response(), prose,
                       DSL_BEAT, approval())
    result = teach_v3(model, "How?", {}, [], "lesson")
    assert len(result["scene"]["beats"]) == 1
    retry = model.compose.call_args_list[3].args[0]
    assert "no DSL" in retry and "beat <id>" in retry


def test_dsl_boundary_state_carries_chart_geometry(monkeypatch):
    from assistant.visual.dsl_prompt import ensure_cues
    from assistant.visual.v3_pipeline import _dsl_build

    storyboard = dsl_planner_response()
    second = dict(storyboard["beats"][0])
    second.update({"id": "b2", "question": "Show it again.",
                   "narration": "[cue:again] Show the curve again."})
    storyboard = {**storyboard, "beats": [storyboard["beats"][0], second]}
    contract = {"beats": [dsl_contract_response()["beats"][0],
                          {"beatId": "b2", "retain": ["a"], "mutate": [], "exit": [], "enter": []}]}
    registry_all = {"a": {"kind": "svg", "role": "curve", "label": ""}}
    narrations, cue_maps = {}, {}
    for index, beat in enumerate(storyboard["beats"]):
        narrations[index], cue_maps[index] = ensure_cues(beat["narration"])
    raws = {0: "beat 1\n@cue:draw\nchart a type=line data=[0:0.2, 1:0.8] zone=center_mid\n",
            1: "beat 2\nretain a\n@cue:again\nshow a zone=center_mid\n"}
    model = model_with()
    scene, _ = _dsl_build(model, storyboard, contract, registry_all,
                          {"curve": "slot_0"}, narrations, cue_maps, base=raws)
    curve = next(e for e in scene["beats"][1]["elements"] if e["id"] == "a")
    assert curve["kind"] == "svg" and curve["svg"].startswith("<svg")
    assert model.compose.call_count == 0


def test_transient_provider_timeout_is_retried_once():
    from assistant.visual.pedagogy import _call_model
    calls = []

    class Flaky:
        def compose(self, prompt, system=None):
            calls.append(prompt)
            if len(calls) == 1:
                raise TimeoutError("OpenCode did not finish within 600 seconds.")
            return "ok"

    assert _call_model(Flaky(), "s", "p", 100) == "ok"
    assert len(calls) == 2


def test_an_explicit_dsl_exit_is_not_resurrected_by_the_contract_retain():
    from assistant.visual.dsl_prompt import ensure_cues
    from assistant.visual.v3_pipeline import _dsl_build

    storyboard = dsl_planner_response()
    base = storyboard["beats"][0]
    first = dict(base, id="b1", question="First", narration="[cue:a] Show a.")
    second = dict(base, id="b2", question="Second", narration="[cue:b] Drop a.")
    storyboard = {**storyboard, "beats": [first, second]}
    contract = {"beats": [
        {"beatId": "b1", "retain": [], "mutate": [], "exit": [],
         "enter": [{"id": "a", "kind": "box", "role": "input_token"}]},
        {"beatId": "b2", "retain": ["a"], "mutate": [], "exit": ["a"], "enter": []}]}
    registry_all = {"a": {"kind": "box", "role": "input_token", "label": ""}}
    narrations, cue_maps = {}, {}
    for index, beat in enumerate(storyboard["beats"]):
        narrations[index], cue_maps[index] = ensure_cues(beat["narration"])
    raws = {0: "beat 1\n@cue:a\nshow a zone=center_mid\n",
            1: "beat 2\nexit a\n@cue:b\nshow b zone=center_mid\n"}
    model = model_with("beat 2\n@cue:b\nshow b zone=center_mid\n")
    scene, _ = _dsl_build(model, storyboard, contract, registry_all,
                          {"input_token": "slot_0"}, narrations, cue_maps, base=raws)
    ids = {element["id"] for element in scene["beats"][1]["elements"]}
    assert "a" not in ids


def test_only_ids_in_the_dsl_retain_header_are_reinjected(monkeypatch):
    from assistant.visual.dsl_prompt import ensure_cues
    from assistant.visual.v3_pipeline import _dsl_build

    storyboard = dsl_planner_response()
    base = storyboard["beats"][0]
    first = dict(base, id="b1", question="First", narration="[cue:a] Show a and b.")
    second = dict(base, id="b2", question="Second", narration="[cue:b] Keep a only.")
    storyboard = {**storyboard, "beats": [first, second]}
    contract = {"beats": [
        {"beatId": "b1", "retain": [], "mutate": [], "exit": [],
         "enter": [{"id": "a", "kind": "box", "role": "input_token"},
                   {"id": "b", "kind": "box", "role": "input_token"}]},
        {"beatId": "b2", "retain": ["a", "b"], "mutate": [], "exit": [], "enter": []}]}
    registry_all = {"a": {"kind": "box", "role": "input_token", "label": ""},
                    "b": {"kind": "box", "role": "input_token", "label": ""}}
    narrations, cue_maps = {}, {}
    for index, beat in enumerate(storyboard["beats"]):
        narrations[index], cue_maps[index] = ensure_cues(beat["narration"])
    raws = {0: "beat 1\n@cue:a\nshow a zone=left_mid\nshow b zone=right_mid\n",
            1: "beat 2\nretain a\n@cue:b\nfocus a\n"}
    model = model_with()
    scene, _ = _dsl_build(model, storyboard, contract, registry_all,
                          {"input_token": "slot_0"}, narrations, cue_maps, base=raws)
    ids = {element["id"] for element in scene["beats"][1]["elements"]}
    assert ids == {"a"}
