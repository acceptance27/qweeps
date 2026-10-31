"""Observable gates in the reference-guided lesson harness; no provider access."""
import copy
import json
from unittest.mock import Mock

import pytest

from assistant.visual.pedagogy import VISUAL_CHECKS, teach_visual, teaching_material, validate_direction, validate_storyboard, validate_review
from assistant.visual.plan import PlanError, generate_reply, validate_plan


def test_runtime_loads_the_maintained_skill_and_observed_failure_guidance():
    material = teaching_material()
    assert "# QWEEPS visual teaching" in material
    assert "A Rizal draft used arbitrary polygon maps" in material
    assert "A Rizal draft used arbitrary polygon maps" in teaching_material('reviewer')
    assert "# QWEEPS visual teaching" in teaching_material('planner')
    assert len(teaching_material('planner')) < len(material)


@pytest.fixture
def storyboard():
    return {
        "learning_goal": "Understand how an operation control selects an ALU result",
        "driving_question": "Why can the same input bits give different ALU outputs?",
        "learner_start": "Knows AND and one-bit addition",
        "concrete_example": "a=1, b=0, carry-in=0; switch operation from AND to ADD",
        "representation": "Keep a circuit visible and follow the selected connection",
        "references": ["math_01", "astar_heuristics"], "assumptions": ["Illustrative one-bit circuit"],
        "visual_design": {"family": "mechanism", "why": "Show an unchanged input reaching two operations and one selected path",
                          "encodings": ["Blue is input; dimmed wire is not selected; a moving cue is a bit"],
                          "misreading": "Changing control changes input values",
                          "safeguard": "Input bits remain visible while the selected wire changes"},
        "beats": [
            {"id": "alternatives", "question": "What does each operation compute?",
             "insight": "The same input bits can produce two different candidate results",
             "before": "Only the concrete input bits are known",
             "change": "Construct both candidate operations from the same inputs",
             "after": "AND is zero and addition is one; both remain available",
             "reasoning": "The different outputs follow the two operations, while inputs are held constant",
             "retain": [], "camera": "Show both alternatives together",
             "narration": "The same bits reach both operations. They compute different candidate results.",
             "visual_test": "Which candidate gives zero and which gives one on these unchanged inputs?"},
            {"id": "selection", "question": "What determines which candidate reaches the result?",
             "insight": "The operation control selects a connection rather than changing the input bits",
             "before": "The alternatives are already visible",
             "change": "Dim AND and trace the selected addition connection",
             "after": "The addition result reaches the output through the selected connection",
             "reasoning": "Keeping the same inputs and alternatives isolates the effect of control",
             "retain": ["and", "add"], "camera": "Stay on the circuit to preserve the comparison",
             "narration": "Changing the operation selects addition. The inputs and other candidate stay available.",
             "interaction": "Switch the operation while holding inputs fixed",
             "visual_test": "Which connection carries the result after the control switches?"},
        ]}


@pytest.fixture
def direction(storyboard):
    elements = [
        {"id": "and", "kind": "box", "label": "AND = 0", "x": -2, "y": 1},
        {"id": "add", "kind": "box", "label": "ADD = 1", "x": 2, "y": 1},
        {"id": "wire", "kind": "arrow", "from": "and", "to": "add", "revealAt": 2},
    ]
    second = copy.deepcopy(elements)
    second[0]["opacity"] = .2
    second[2]["emphasizeAt"] = 4
    return {"answer": "The operation control chooses which candidate result is used.",
            "scene": {"title": "ALU selection", "summary": "Hold inputs fixed, vary control", "sources": [],
                      "beats": [{"title": b["question"], "duration": 10, "narration": b["narration"], "elements": e}
                                for b, e in zip(storyboard["beats"], [elements, second])]},
            "evidence": [{"beat": "alternatives", "objects": ["and", "add"]},
                         {"beat": "selection", "objects": ["wire", "add"]}]}


@pytest.fixture
def approval(storyboard):
    return {"approved": True, "findings": [], "evidence": [
        {"beat": "alternatives", "observation": "Two candidate operations are constructed",
         "inference": "Both results exist before selection",
         "caption_free_answer": "AND=0 and ADD=1 coexist in separate branches",
         "misreading_guard": "Both branches receive the same retained input"},
        {"beat": "selection", "observation": "One candidate dims and the selected connection has a moving cue",
         "inference": "Control changes which candidate is used while the alternatives persist",
         "caption_free_answer": "The ADD connection has the cue and the other dims",
         "misreading_guard": "The unselected operation remains present"}],
        "visual_checks": [{"check": c, "passed": True, "observation": detail} for c, detail in [
            ("relation_visible", "Both candidate values coexist before one path is selected"),
            ("encodings", "The dim wire is the unselected operation; the moving cue follows the selected wire"),
            ("continuity", "The same two operation objects persist"),
            ("reading_load", "Two short operation labels and one connection fit in the camera"),
            ("timing", "The wire reveals before its emphasis at four seconds")]]}


def model_with(*responses):
    model = Mock(spec=["compose"])
    model.compose.side_effect = [json.dumps(r) if not isinstance(r, str) else r for r in responses]
    return model


def request_body(call):
    return json.loads(call.args[0].split("\n\nReturn ONLY one JSON object")[0])


def test_visual_lessons_go_through_storyboard_direction_and_review(storyboard, direction, approval):
    model = model_with(storyboard, direction, approval)
    context = {"selection": ["result"], "time": 12.5, "camera": {"x": 1}, "sourceContext": "mode selects output"}
    reply = generate_reply(model, "Explain ALU selection", context, [{"role": "user", "content": "Earlier question"}], "lesson")
    assert model.compose.call_count == 3
    calls = [request_body(call) for call in model.compose.call_args_list]
    assert all(call["context"] == context for call in calls)
    assert calls[1]["storyboard"]["beats"][1]["insight"] == storyboard["beats"][1]["insight"]
    assert calls[2]["scene"]["beats"][1]["teaching"]["evidence"] == ["wire", "add"]
    assert reply["scene"]["teaching"]["review"]["approved"]
    assert validate_plan(reply["scene"])["teaching"] == reply["scene"]["teaching"]


def test_rephrased_repeated_node_values_are_not_new_storyboard_beats(storyboard):
    storyboard["beats"][0]["insight"] = "We expand cell 1 with cost 4 and estimate 7"
    storyboard["beats"][1]["insight"] = "We expand cell 2 with cost 5 and estimate 6"
    with pytest.raises(PlanError, match="repeat"):
        validate_storyboard(storyboard)


def test_a_missing_visual_anchor_or_invented_evidence_cannot_pass(storyboard, direction):
    direction["evidence"][1]["objects"] = ["nonexistent_signal"]
    with pytest.raises(PlanError, match="missing visual evidence"):
        validate_direction(direction, storyboard)
    direction["evidence"][1]["objects"] = ["wire"]
    direction["scene"]["beats"][1]["elements"][0]["id"] = "replacement_and"
    direction["scene"]["beats"][1]["elements"][2]["from"] = "replacement_and"
    with pytest.raises(PlanError, match="lost its planned visual anchors"):
        validate_direction(direction, storyboard)


def test_relabelled_beats_with_an_unchanged_scene_do_not_pass(storyboard, direction):
    direction["scene"]["beats"][1]["elements"] = copy.deepcopy(direction["scene"]["beats"][0]["elements"])
    with pytest.raises(PlanError, match="changes only narration"):
        validate_direction(direction, storyboard)


def test_review_feedback_drives_one_concrete_revision(storyboard, direction, approval):
    rejection = {"approved": False, "findings": [{"beat": "selection", "problem": "The output is asserted rather than traced",
                                                  "revision": "Trace the selected connection into the output"}], "evidence": [],
                 "visual_checks": [{"check": c, "passed": False, "observation": "Selected output is asserted without a traced path"} for c in VISUAL_CHECKS]}
    model = model_with(storyboard, direction, rejection, direction, approval)
    result = teach_visual(model, "Why this output?", {"selection": ["result"]}, [], "branch")
    assert result["scene"]["teaching"]["review"]["approved"]
    request = request_body(model.compose.call_args_list[3])
    assert "Trace the selected connection" in json.dumps(request["review_findings"])
    assert request["mode"] == "branch"


def test_rendered_review_rejects_and_feedback_drives_revision(storyboard, direction, approval):
    model = model_with(storyboard,direction,approval,direction,approval)
    reviewer=Mock(side_effect=[{'approved':False,'findings':[{'beat':'selection','problem':'Overlapping labels','revision':'Separate the labels'}]},
                               {'approved':True,'findings':[], 'observations':[{'beat':b['id'],'visible':'An object changes','inference':'The relationship is visible'} for b in storyboard['beats']]}])
    result=teach_visual(model,'Teach selection',{},[],'lesson',rendered_review=reviewer)
    assert reviewer.call_count==2
    assert 'Separate the labels' in json.dumps(request_body(model.compose.call_args_list[3])['review_findings'])
    assert validate_plan(result['scene'])['teaching']['frameReview']['approved']


def test_two_failed_reviews_never_return_an_unapproved_lesson(storyboard, direction):
    rejection = {"approved": False, "findings": [{"beat": "lesson", "problem": "Same claim repeated in every beat",
                                                  "revision": "Give each beat a new inference"}], "evidence": [],
                 "visual_checks": [{"check": c, "passed": False, "observation": "Same claimed inference repeats"} for c in VISUAL_CHECKS]}
    model = model_with(storyboard, direction, rejection, direction, rejection)
    with pytest.raises(PlanError, match="after two revisions"):
        teach_visual(model, "Teach selection", {}, [], "lesson")
    assert model.compose.call_count == 5


def test_a_plain_answer_does_not_pay_for_or_replace_a_lesson():
    model = model_with({"answer": "The selected node has the smallest f score.", "scene": None})
    result = generate_reply(model, "Why that node?", {"selection": ["A"]}, [])
    assert result["scene"] is None
    assert model.compose.call_count == 1


def test_question_that_needs_a_visual_cannot_bypass_teaching_review(storyboard, direction, approval):
    model = model_with({"answer": "A visual comparison will help.", "scene": direction["scene"]}, storyboard, direction, approval)
    reply = generate_reply(model, "Can you show why?", {"time": 4}, [])
    assert reply["scene"]["teaching"]["method"] == "qweeps-visual-teaching"
    assert request_body(model.compose.call_args_list[1])["mode"] == "branch"


def test_saved_plan_cannot_claim_review_for_a_different_storyboard(storyboard, direction, approval):
    model = model_with(storyboard, direction, approval)
    scene = teach_visual(model, "Teach selection", {}, [], "lesson")["scene"]
    scene["beats"][0]["teaching"]["planBeat"] = "unrelated"
    with pytest.raises(PlanError, match="no longer matches"):
        validate_plan(scene)


def test_new_plans_require_a_visual_grammar_but_legacy_storyboards_still_load(storyboard):
    legacy = copy.deepcopy(storyboard)
    del legacy["visual_design"]
    assert "visual_design" not in validate_storyboard(legacy)
    with pytest.raises(PlanError, match="visual_design"):
        validate_storyboard(legacy, require_visual_design=True)
    assert validate_storyboard(storyboard, require_visual_design=True)["visual_design"]["family"] == "mechanism"


def test_a_paragraph_asserting_the_answer_is_not_visual_evidence(storyboard, direction):
    for beat in direction["scene"]["beats"]:
        beat["elements"].append({"id": "paragraph", "kind": "text", "label": "The control selects the result", "y": -2})
    direction["evidence"][0]["objects"] = ["paragraph"]
    with pytest.raises(PlanError, match="text-only evidence"):
        validate_direction(direction, storyboard)


def test_a_new_heading_and_camera_cannot_substitute_for_changed_evidence(storyboard, direction):
    second = direction["scene"]["beats"][1]
    second["elements"] = copy.deepcopy(direction["scene"]["beats"][0]["elements"])
    second["elements"].append({"id": "new_heading", "kind": "text", "label": "Now we understand control", "y": -2})
    second["camera"] = {"x": 1, "y": 0, "zoom": 1.2}
    with pytest.raises(PlanError, match="changes no cited visual evidence"):
        validate_direction(direction, storyboard)


def test_visual_review_cannot_approve_without_caption_free_reading_or_failed_checks(storyboard, approval):
    del approval["evidence"][0]["caption_free_answer"]
    with pytest.raises(PlanError, match="caption_free_answer"):
        validate_review(approval, storyboard)
    approval["evidence"][0]["caption_free_answer"] = "The two candidate results are visible together"
    approval["visual_checks"][0]["passed"] = False
    with pytest.raises(PlanError, match="failed visual check"):
        validate_review(approval, storyboard)


def test_visual_design_and_review_survive_save_and_reload(storyboard, direction, approval):
    scene = teach_visual(model_with(storyboard, direction, approval), "Teach control", {}, [], "lesson")["scene"]
    restored = validate_plan(json.loads(json.dumps(scene)))
    assert restored["teaching"]["version"] == 2
    assert restored["teaching"]["storyboard"]["visual_design"] == storyboard["visual_design"]
    assert restored["teaching"]["review"]["evidence"][0]["caption_free_answer"]


def test_a_saved_version_one_lesson_remains_readable(storyboard, direction, approval):
    legacy = copy.deepcopy(storyboard)
    del legacy["visual_design"]
    for beat in legacy["beats"]:
        del beat["visual_test"]
    old_scene = validate_direction(direction, legacy)["scene"]
    old_scene["teaching"] = {"method": "qweeps-visual-teaching", "version": 1,
                             "storyboard": legacy, "review": approval}
    restored = validate_plan(old_scene)
    assert restored["teaching"]["version"] == 1
    assert "visual_design" not in restored["teaching"]["storyboard"]


def test_symbolic_derivation_can_use_notation_itself_as_evidence(storyboard, direction):
    storyboard["visual_design"]["family"] = "symbolic"
    storyboard["visual_design"]["why"] = "Align corresponding symbolic terms while simplifying an expression"
    for i,beat in enumerate(direction["scene"]["beats"]):
        for e in beat["elements"]:
            e["kind"] = "text"
        beat["elements"][1]["label"] = "1 + 0 = 1" if i == 0 else "1 + 0 = 1 (selected)"
    assert validate_direction(direction, storyboard)["scene"]["beats"]


def test_retiming_an_unchanged_object_is_not_a_new_explanatory_transformation(storyboard, direction):
    direction["scene"]["beats"][1]["elements"] = copy.deepcopy(direction["scene"]["beats"][0]["elements"])
    direction["scene"]["beats"][1]["elements"][2]["revealAt"] = 3
    with pytest.raises(PlanError, match="changes only narration|changes no cited visual evidence"):
        validate_direction(direction, storyboard)
